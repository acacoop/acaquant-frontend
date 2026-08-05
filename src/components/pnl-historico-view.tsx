"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";
import { MESES_CORTOS as MESES } from "@/lib/fmt";

// TRADING → PNL HISTÓRICO. Cuaderno de carga MANUAL: el usuario tipea el PnL de
// cada día hábil (desde el 1-jul-2026) y el sistema acumula (total + mensual) y
// grafica. `cuenta` es etiqueta libre; cada cuenta es su propio cuaderno.
// Backend: GET/POST /api/trading/pnl-historico. Service: api/services/pnl_historico.py

type Dia = {
  fecha: string;
  mes: string;
  monto: number | null;
  acumulado_total: number | null;
  acumulado_mensual: number | null;
  es_hoy: boolean;
  nuevo_mes: boolean;
};
type Resp = { cuenta: string; inicio: string; cuentas: string[]; dias: Dia[] };


function fmtDia(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function nombreMes(mes: string): string {
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}

export function PnlHistoricoView() {
  const [cuenta, setCuenta] = usePersistedState<string>("pnlhist.cuenta", "General");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback((c: string) => {
    return fetch(`/api/trading/pnl-historico?cuenta=${encodeURIComponent(c)}`)
      .then((r) => r.json())
      .then((d: Resp) => {
        setData(d);
        setEdits({}); // los inputs vuelven a leer del server
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/trading/pnl-historico?cuenta=${encodeURIComponent(cuenta)}`)
      .then((r) => r.json())
      .then((d: Resp) => { if (vivo) { setData(d); setEdits({}); } })
      .catch(() => { if (vivo) setData(null); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [cuenta]);

  const guardar = useCallback(
    async (fecha: string, texto: string) => {
      const t = texto.trim().replace(",", ".");
      const monto = t === "" ? null : Number(t);
      if (monto !== null && Number.isNaN(monto)) return; // basura → no persistir
      setGuardando(fecha);
      try {
        await fetch("/api/trading/pnl-historico", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha, monto, cuenta }),
        });
        cargar(cuenta); // recalcula acumulados
      } finally {
        setGuardando(null);
      }
    },
    [cuenta, cargar],
  );

  const dias = useMemo(() => data?.dias ?? [], [data]);

  // Mes en curso = el del último día listado (el rango llega a fin de mes actual).
  const mesActual = dias.length ? dias[dias.length - 1].mes : "";

  // Series de los gráficos: solo días con monto cargado (la línea corta ahí).
  //   serieMes   → acumulado mensual, SOLO del mes en curso.
  //   serieTotal → acumulado total desde el 1-jul-2026.
  const serieMes = useMemo(
    () => dias
      .filter((d) => d.mes === mesActual && d.monto !== null)
      .map((d) => ({ fecha: fmtDia(d.fecha), valor: d.acumulado_mensual })),
    [dias, mesActual],
  );
  const serieTotal = useMemo(
    () => dias
      .filter((d) => d.monto !== null)
      .map((d) => ({ fecha: fmtDia(d.fecha), valor: d.acumulado_total })),
    [dias],
  );

  // Subtotal por mes (suma de montos cargados del mes) para la fila separadora.
  const subtotalMes = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const d of dias) if (d.monto !== null) acc[d.mes] = (acc[d.mes] ?? 0) + d.monto;
    return acc;
  }, [dias]);

  const totalGeneral = useMemo(
    () => dias.reduce((s, d) => s + (d.monto ?? 0), 0),
    [dias],
  );

  return (
    <div className="h-full flex flex-col min-h-0 p-2 gap-2 text-[var(--t-text)]">
      {/* barra: selector de cuenta + total */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--t-text-dim)]">CUENTA</span>
        <input
          list="pnlhist-cuentas"
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          placeholder="General"
          className="w-48 bg-[var(--t-surface)] border border-[var(--t-border)] px-2 py-1 text-[12px] text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
        />
        <datalist id="pnlhist-cuentas">
          {(data?.cuentas ?? []).map((c) => <option key={c} value={c} />)}
        </datalist>
        <span className="ml-auto text-[11px] text-[var(--t-text-dim)]">
          Acumulado total{" "}
          <b className={totalGeneral >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}>
            {fmtMoneyFull(totalGeneral)}
          </b>
        </span>
      </div>

      {/* split 50/50: tabla a la izquierda, dos gráficos apilados a la derecha */}
      <div className="flex-1 min-h-0 flex gap-2">
        {/* IZQUIERDA — tabla editable */}
        <div className="w-1/2 min-h-0 overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
          {loading && !data ? (
            <div className="p-4 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>
          ) : (
            <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[var(--t-surface)] z-10">
              <tr className="text-[10px] tracking-wide text-[var(--t-text-dim)]">
                <th className="text-left font-semibold px-3 py-1.5">DÍA</th>
                <th className="text-right font-semibold px-3 py-1.5">PnL DEL DÍA</th>
                <th className="text-right font-semibold px-3 py-1.5">ACUM. MES</th>
                <th className="text-right font-semibold px-3 py-1.5">ACUM. TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d, i) => {
                const prev = i > 0 ? dias[i - 1] : null;
                const cierreMes = prev && d.nuevo_mes; // arrancó un mes nuevo → cerró el anterior
                return (
                  <FilaMes
                    key={d.fecha}
                    dia={d}
                    prevMes={prev?.mes}
                    cierreMes={!!cierreMes}
                    subtotal={prev ? subtotalMes[prev.mes] : 0}
                    edits={edits}
                    setEdits={setEdits}
                    guardar={guardar}
                    guardando={guardando === d.fecha}
                  />
                );
              })}
            </tbody>
          </table>
          )}
        </div>

        {/* DERECHA — dos gráficos apilados: mes (arriba) + acumulado total (abajo) */}
        <div className="w-1/2 min-h-0 flex flex-col gap-2">
          <AcumChart
            titulo={mesActual ? `MES · ${nombreMes(mesActual)}` : "MES"}
            data={serieMes}
            color="var(--t-text-dim)"
          />
          <AcumChart titulo="ACUMULADO TOTAL" data={serieTotal} color="var(--t-accent)" />
        </div>
      </div>
    </div>
  );
}

function AcumChart({
  titulo,
  data,
  color,
}: {
  titulo: string;
  data: { fecha: string; valor: number | null }[];
  color: string;
}) {
  return (
    <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col">
      <div className="px-2 py-1 text-[10px] font-semibold tracking-widest text-[var(--t-text-dim)] border-b border-[var(--t-border)] shrink-0">
        {titulo}
      </div>
      <div className="flex-1 min-h-0 p-1">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-[11px] text-[var(--t-text-muted)]">
            Cargá el PnL de algún día.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 10, bottom: 2, left: 2 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" vertical={false} />
              <ReferenceLine y={0} stroke="var(--t-text-muted)" strokeWidth={1} />
              <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={20} />
              <YAxis tickFormatter={(v) => fmtMoney(v as number)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={50} />
              <Tooltip
                contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 11 }}
                labelStyle={{ color: "var(--t-text-dim)" }}
                formatter={(v) => [fmtMoneyFull(Number(v)), "Acumulado"]}
              />
              <Line type="monotone" dataKey="valor" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function FilaMes(props: {
  dia: Dia;
  prevMes?: string;
  cierreMes: boolean;
  subtotal: number;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  guardar: (fecha: string, texto: string) => void;
  guardando: boolean;
}) {
  const { dia, cierreMes, prevMes, subtotal, edits, setEdits, guardar, guardando } = props;
  const val = edits[dia.fecha] ?? (dia.monto !== null ? String(dia.monto) : "");

  return (
    <>
      {/* subtotal del mes que cierra */}
      {cierreMes && prevMes && (
        <tr className="bg-[var(--t-surface)] text-[10px] text-[var(--t-text-dim)]">
          <td className="px-3 py-1 font-semibold">Σ {nombreMes(prevMes)}</td>
          <td className={`px-3 py-1 text-right font-semibold ${subtotal >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
            {fmtMoneyFull(subtotal)}
          </td>
          <td colSpan={2} />
        </tr>
      )}
      {/* encabezado de mes */}
      {dia.nuevo_mes && (
        <tr className="bg-[var(--t-accent)]/10">
          <td colSpan={4} className="px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-[var(--t-accent)]">
            {nombreMes(dia.mes)}
          </td>
        </tr>
      )}
      <tr className={`border-t border-[var(--t-border)] ${dia.es_hoy ? "bg-[var(--t-accent)]/15" : ""}`}>
        <td className="px-3 py-1 whitespace-nowrap">
          {fmtDia(dia.fecha)}
          {dia.es_hoy && <span className="ml-2 text-[9px] font-bold text-[var(--t-accent)]">HOY</span>}
        </td>
        <td className="px-2 py-0.5 text-right">
          <input
            type="text"
            inputMode="decimal"
            value={val}
            disabled={guardando}
            onChange={(e) => setEdits((s) => ({ ...s, [dia.fecha]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            onBlur={(e) => {
              const nuevo = e.target.value.trim();
              const orig = dia.monto !== null ? String(dia.monto) : "";
              if (nuevo !== orig) guardar(dia.fecha, nuevo);
            }}
            placeholder="—"
            className={`w-28 bg-transparent border border-transparent hover:border-[var(--t-border)] focus:border-[var(--t-accent)] px-2 py-0.5 text-right text-[12px] outline-none ${
              dia.monto === null ? "text-[var(--t-text-muted)]" : dia.monto >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
            }`}
          />
        </td>
        <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">
          {dia.acumulado_mensual !== null ? fmtMoneyFull(dia.acumulado_mensual) : ""}
        </td>
        <td className={`px-3 py-1 text-right font-medium ${
          dia.acumulado_total === null ? "" : dia.acumulado_total >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
        }`}>
          {dia.acumulado_total !== null ? fmtMoneyFull(dia.acumulado_total) : ""}
        </td>
      </tr>
    </>
  );
}
