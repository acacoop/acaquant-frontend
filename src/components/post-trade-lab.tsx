"use client";

import { useMemo, useState } from "react";
import { bsPrice, type ResolvedLeg } from "@/lib/estrategias";

// Laboratorio post-trade: dada una posición (un contrato o una estrategia
// entera) con su costo de entrada, proyecta el P&L a futuro repreciando con
// Black-Scholes en una matriz precio × tiempo (theta decay + direccionalidad),
// un escenario de vol (shock de IV) y los niveles clave. Sirve para "ya entré,
// ¿qué me pasa los próximos días?".

const PCTS = [0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1, -0.15, -0.2];

function fmtMoney(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}k`;
  return `${s}$${a.toFixed(0)}`;
}

function diasAlVto(vence: string): number {
  // vence "YYYYMMDD"
  if (vence?.length === 8) {
    const y = +vence.slice(0, 4);
    const m = +vence.slice(4, 6) - 1;
    const d = +vence.slice(6, 8);
    const diff = (new Date(y, m, d).getTime() - Date.now()) / 86400_000;
    return Math.max(1, Math.round(diff));
  }
  return 0;
}

export function PostTradeLab({
  legs,
  spot,
  tasa,
  entrySugerido,
  vence,
  singleLeg = false,
}: {
  legs: ResolvedLeg[];
  spot: number;
  tasa: number;
  // Prima neta sugerida por unidad de estructura (lo que se prefilla en el
  // campo de entrada). El usuario lo edita con su fill real.
  entrySugerido: number;
  vence?: string;
  // Si es un único contrato, habilita el toggle BUY/SELL (qué lado tomaste).
  singleLeg?: boolean;
}) {
  const [entry, setEntry] = useState(entrySugerido ? entrySugerido.toFixed(2) : "");
  const [nUnidades, setNUnidades] = useState("1");
  const [lado, setLado] = useState<"buy" | "sell">(legs[0]?.side ?? "buy");
  const [dVol, setDVol] = useState(0); // shock de IV en puntos (ej. +5)

  // Tiempo a vencimiento (años). Preferimos el `T` estimado de los legs; si no
  // hay, lo derivamos de `vence`.
  const Tmax = useMemo(() => {
    const ts = legs.map((l) => l.T).filter((t): t is number => t != null && t > 0);
    if (ts.length) return Math.max(...ts);
    if (vence) return diasAlVto(vence) / 365;
    return null;
  }, [legs, vence]);
  const daysRem = Tmax ? Math.round(Tmax * 365) : 0;

  const n = Math.max(1, parseInt(nUnidades, 10) || 1);
  const entryCost = (parseFloat(entry) || 0) * n * 100;

  // Columnas = días transcurridos desde hoy (última = vto).
  const cols = useMemo(() => {
    const base = [0, 1, 3, 7, 14].filter((d) => d < daysRem);
    return [...new Set([...base, daysRem])];
  }, [daysRem]);

  const posValue = useMemo(
    () =>
      (S: number, tYears: number, ivShockPts = 0) => {
        let v = 0;
        for (const leg of legs) {
          const side = singleLeg ? lado : leg.side;
          const sgn = side === "buy" ? 1 : -1;
          const iv = Math.max(0.01, leg.iv + ivShockPts / 100);
          v += sgn * leg.qty * bsPrice(S, leg.K, tYears, tasa, iv, leg.tipo) * 100;
        }
        return v * n;
      },
    [legs, singleLeg, lado, tasa, n],
  );

  const matriz = useMemo(() => {
    if (!Tmax) return [];
    return PCTS.map((pct) => {
      const S = spot * (1 + pct);
      const cells = cols.map((d) => posValue(S, Math.max(Tmax - d / 365, 0)) - entryCost);
      return { pct, S, cells };
    });
  }, [Tmax, cols, spot, posValue, entryCost]);

  const maxAbs = useMemo(() => {
    let m = 1;
    for (const r of matriz) for (const c of r.cells) m = Math.max(m, Math.abs(c));
    return m;
  }, [matriz]);

  // Métricas clave (a spot actual).
  const metricas = useMemo(() => {
    if (!Tmax) return null;
    const hoy = posValue(spot, Tmax) - entryCost;
    const mañana = posValue(spot, Math.max(Tmax - 1 / 365, 0)) - entryCost;
    const thetaDia = mañana - hoy; // sangrado diario a spot quieto
    const volUp = posValue(spot, Tmax, +5) - entryCost;
    const volDn = posValue(spot, Tmax, -5) - entryCost;
    // Breakeven hoy: spot donde el valor de la posición = costo de entrada.
    let be: number | null = null;
    let prev = posValue(spot * 0.5, Tmax) - entryCost;
    for (let p = 0.5; p <= 1.6; p += 0.005) {
      const S = spot * p;
      const pl = posValue(S, Tmax) - entryCost;
      if (prev < 0 !== pl < 0 && pl !== prev) {
        be = S;
        break;
      }
      prev = pl;
    }
    return { hoy, thetaDia, volUp, volDn, be };
  }, [Tmax, spot, posValue, entryCost]);

  function cellColor(pl: number): string {
    const i = Math.min(1, Math.abs(pl) / maxAbs);
    const a = 0.12 + i * 0.5;
    return pl >= 0 ? `rgba(0,204,102,${a})` : `rgba(255,68,68,${a})`;
  }

  if (!Tmax || !legs.length) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin datos suficientes (falta tiempo a vencimiento o IV) para el laboratorio.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-y-auto text-[10px]">
      {/* Controles: entrada + unidades (+ lado si es 1 contrato) */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--t-border)] shrink-0 flex-wrap">
        <label className="flex items-center gap-1 text-[var(--t-text-dim)]">
          ENTRADA
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="prima"
            className="w-16 bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 tabular-nums text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-[var(--t-text-dim)]">
          ×
          <input
            value={nUnidades}
            onChange={(e) => setNUnidades(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-12 bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 tabular-nums text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
          />
        </label>
        {singleLeg && (
          <div className="flex">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setLado(s)}
                className={`px-1.5 py-0.5 text-[9px] font-bold border ${
                  lado === s
                    ? s === "buy"
                      ? "bg-[#4ade80] text-black border-[#4ade80]"
                      : "bg-[#f87171] text-black border-[#f87171]"
                    : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)]"
                }`}
              >
                {s === "buy" ? "LONG" : "SHORT"}
              </button>
            ))}
          </div>
        )}
        <span className="text-[var(--t-text-muted)] ml-auto">
          costo {fmtMoney(entryCost)} · {daysRem}d al vto
        </span>
      </div>

      {/* Métricas clave */}
      {metricas && (
        <div className="grid grid-cols-4 gap-px bg-[var(--t-border)] shrink-0">
          <Metric label="P&L HOY" value={fmtMoney(metricas.hoy)} pos={metricas.hoy >= 0} />
          <Metric
            label="θ / DÍA"
            value={fmtMoney(metricas.thetaDia)}
            pos={metricas.thetaDia >= 0}
            hint="a spot quieto"
          />
          <Metric
            label="BE HOY"
            value={metricas.be ? `$${metricas.be.toFixed(0)}` : "—"}
            hint={metricas.be ? `${(((metricas.be - spot) / spot) * 100).toFixed(1)}% vs spot` : ""}
          />
          <Metric
            label="VOL ±5pt"
            value={`${fmtMoney(metricas.volUp)} / ${fmtMoney(metricas.volDn)}`}
            hint="IV +5 / −5"
          />
        </div>
      )}

      {/* Matriz P&L precio × tiempo */}
      <div className="flex-1 min-h-0 overflow-auto p-1">
        <table className="w-full text-[9px] font-mono tabular-nums border-collapse">
          <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[var(--t-text-muted)]">
            <tr>
              <th className="px-1 py-0.5 text-left">SPOT</th>
              {cols.map((d) => (
                <th key={d} className="px-1 py-0.5 text-right">
                  {d === 0 ? "HOY" : d === daysRem ? "VTO" : `+${d}d`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.map((row) => (
              <tr key={row.pct} className="border-t border-[var(--t-border)]">
                <td className="px-1 py-0.5 text-[var(--t-text-dim)] whitespace-nowrap">
                  <span className={row.pct === 0 ? "text-[#ffcc00]" : ""}>
                    {row.pct >= 0 ? "+" : ""}
                    {(row.pct * 100).toFixed(0)}%
                  </span>{" "}
                  <span className="text-[var(--t-text-muted)]">{row.S.toFixed(0)}</span>
                </td>
                {row.cells.map((pl, i) => (
                  <td
                    key={i}
                    className="px-1 py-0.5 text-right"
                    style={{ background: cellColor(pl), color: "#e8e8e8" }}
                    title={`${fmtMoney(pl)}`}
                  >
                    {fmtMoney(pl)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  pos,
  hint,
}: {
  label: string;
  value: string;
  pos?: boolean;
  hint?: string;
}) {
  return (
    <div className="bg-[var(--t-panel)] px-2 py-1">
      <div className="text-[8px] text-[var(--t-text-muted)] tracking-wide">{label}</div>
      <div
        className="text-[12px] font-semibold tabular-nums"
        style={pos === undefined ? { color: "#d0d0d0" } : { color: pos ? "var(--t-pos)" : "#ff4444" }}
      >
        {value}
      </div>
      {hint && <div className="text-[8px] text-[var(--t-text-muted)]">{hint}</div>}
    </div>
  );
}
