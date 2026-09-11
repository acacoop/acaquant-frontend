"use client";

import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useViewportKey } from "@/lib/use-viewport-key";
import { fmtDiaMes, fmtFechaCorta } from "@/lib/fmt";
import { FilterBtn } from "@/components/ui";
import { fmtVcp, pct } from "@/components/fci-table";
import type { FciFicha, FciFila } from "@/lib/types-fci";

/**
 * La FICHA de un fondo — el lado derecho de /fci.
 *
 * Tres bloques: los datos del fondo (gerente, estante, moneda, T+n, tipo de
 * renta, símbolo Primary, el asset de Manager si está linkeado), los OCHO
 * rendimientos con sus TNA, y la curva del VCP en base 100 en el rango elegido,
 * con qué fuente aportó cada tramo (Primary / tenencia / manual).
 *
 * Los rendimientos de la ficha son LOS MISMOS números de la fila de la tabla
 * (mismo endpoint de origen, misma convención): la ficha no puede contradecir a
 * la fila que la abrió. Las métricas que la mesa quiera sumar van acá abajo.
 */
type Rango = "1M" | "3M" | "YTD" | "1A";
const DIAS: Record<Rango, number | null> = { "1M": 31, "3M": 92, "YTD": null, "1A": 366 };

export function FciFichaPanel({ fila, ficha, cargando, error }: {
  fila: FciFila | null;
  ficha: FciFicha | null;
  cargando: boolean;
  error: string | null;
}) {
  const [rango, setRango] = useState<Rango>("3M");
  const vk = useViewportKey();

  const serie = useMemo(() => {
    const s = ficha?.serie ?? [];
    if (!s.length) return [];
    const ult = s[s.length - 1].fecha;
    let desde: string;
    if (rango === "YTD") desde = `${ult.slice(0, 4)}-01-01`;
    else {
      const d = new Date(`${ult}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (DIAS[rango] ?? 0));
      desde = d.toISOString().slice(0, 10);
    }
    // El primer punto es el último VCP ANTES del rango (el ancla), así la curva
    // arranca en 100 exactamente donde arranca el rendimiento.
    let i0 = s.findIndex((p) => p.fecha >= desde);
    if (i0 < 0) i0 = 0;
    if (i0 > 0) i0 -= 1;
    const base = s[i0].vcp;
    return s.slice(i0).map((p) => ({ fecha: p.fecha, idx: (p.vcp / base) * 100, vcp: p.vcp, fuente: p.fuente }));
  }, [ficha?.serie, rango]);

  if (!fila) {
    return <p className="text-[var(--t-text-muted)] text-xs py-6 text-center">Elegí un fondo en la tabla</p>;
  }
  const f = ficha && ficha.fci_id === fila.fci_id ? ficha : null;
  const varRango = serie.length > 1 ? serie[serie.length - 1].idx / 100 - 1 : null;

  return (
    <div className="h-full min-h-0 overflow-y-auto text-[10px] flex flex-col gap-3 pr-1">
      <div className="grid grid-cols-4 gap-x-3 gap-y-1">
        <Dato label="GERENTE" valor={fila.gerente} />
        <Dato label="CLASE" valor={fila.categoria ?? "—"} />
        <Dato label="MONEDA" valor={fila.moneda} />
        <Dato label="LIQUIDACIÓN" valor={fila.plazo != null ? `T+${fila.plazo}` : "—"} />
        <Dato label="TIPO RENTA" valor={fila.tipo_renta} />
        <Dato label="SÍMBOLO PRIMARY" valor={fila.simbolo_primary?.trim() || "— (bilateral)"} />
        <Dato label="VCP" valor={fmtVcp(fila.vcp)} sub={fila.fecha ? `${fmtFechaCorta(fila.fecha)} · ${fila.fuente ?? ""}` : undefined} />
        <Dato label="EN TENENCIA" valor={fila.en_tenencia ? "sí" : "no"} sub={fila.cafci ?? undefined} />
        {f?.asset && (
          <>
            <Dato label="ASSET · EMISOR" valor={f.asset.emisor} />
            <Dato label="CLASE ACTIVO" valor={f.asset.clase_activo || "—"} />
            <Dato label="FEE ADMIN" valor={f.asset.fee_admin != null ? pct(f.asset.fee_admin, 2).replace("+", "") : "—"} />
            <Dato label="CNV" valor={f.asset.codigo_cnv || "—"} />
          </>
        )}
      </div>

      <div>
        <Titulo>RENDIMIENTO DIRECTO</Titulo>
        <div className="grid grid-cols-4 gap-1">
          <Rend label="1D" v={fila.r_1d} />
          <Rend label="WTD" v={fila.r_wtd} />
          <Rend label="MTD" v={fila.r_mtd} />
          <Rend label="YTD" v={fila.r_ytd} dec={1} />
          <Rend label="7D" v={fila.r_7d} sub={fila.tna_7d != null ? `TNA ${pct(fila.tna_7d, 1)}` : undefined} />
          <Rend label="30D" v={fila.r_30d} sub={fila.tna_30d != null ? `TNA ${pct(fila.tna_30d, 1)}` : undefined} />
          <Rend label="90D" v={fila.r_90d} />
          <Rend label="365D" v={fila.r_365d} dec={1} />
        </div>
      </div>

      <div className="flex flex-col min-h-[180px]">
        <div className="flex items-center gap-1 mb-1">
          <Titulo>VCP · BASE 100</Titulo>
          <div className="ml-auto flex items-center gap-1">
            {(Object.keys(DIAS) as Rango[]).map((r) => (
              <FilterBtn key={r} active={rango === r} onClick={() => setRango(r)}>{r}</FilterBtn>
            ))}
            {varRango != null && (
              <span className={`ml-2 tabular-nums font-semibold ${varRango >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
                {pct(varRango, 2)}
              </span>
            )}
          </div>
        </div>
        {cargando && !f ? (
          <p className="text-[var(--t-text-muted)] py-6 text-center">Cargando…</p>
        ) : error ? (
          <p className="text-[var(--t-neg)] py-6 text-center">{error}</p>
        ) : serie.length < 2 ? (
          <p className="text-[var(--t-text-muted)] py-6 text-center">
            Sin serie de VCP para este rango: la serie arranca el día que el job la empieza a guardar
            (o con el backfill de la tenencia si la ALyC lo tuvo).
          </p>
        ) : (
          <div className="h-[170px]">
            <ResponsiveContainer key={vk} width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="fecha" tickFormatter={fmtDiaMes} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                  axisLine={{ stroke: "var(--t-border-2)" }} tickLine={false} minTickGap={28} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={40}
                  axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip
                  contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 10 }}
                  labelFormatter={(l) => fmtFechaCorta(String(l))}
                  formatter={(v, _n, p) => {
                    const pl = p?.payload as { vcp?: number; fuente?: string } | undefined;
                    return [`${Number(v).toFixed(2)} · VCP ${fmtVcp(pl?.vcp)} · ${pl?.fuente ?? ""}`, "índice"];
                  }}
                />
                <Line type="monotone" dataKey="idx" stroke="var(--t-accent)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {f && f.fuentes.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-1 text-[9px] text-[var(--t-text-muted)]">
            {f.fuentes.map((x) => (
              <span key={x.fuente}>
                <span className="uppercase">{x.fuente}</span>: {x.n} días
                {x.desde && x.hasta && ` (${fmtFechaCorta(x.desde)} → ${fmtFechaCorta(x.hasta)})`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-semibold tracking-wider text-[var(--t-accent)] uppercase mb-1">{children}</div>;
}

function Dato({ label, valor, sub }: { label: string; valor: string | null | undefined; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] tracking-wider text-[var(--t-text-muted)] uppercase">{label}</div>
      <div className="truncate text-[var(--t-text)]" title={valor ?? undefined}>{valor ?? "—"}</div>
      {sub && <div className="text-[8px] text-[var(--t-text-muted)] truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function Rend({ label, v, dec = 2, sub }: { label: string; v: number | null; dec?: number; sub?: string }) {
  return (
    <div className="border border-[var(--t-border)] px-2 py-1">
      <div className="text-[8px] tracking-wider text-[var(--t-text-muted)]">{label}</div>
      <div className={`text-[12px] font-semibold tabular-nums ${v == null ? "text-[var(--t-text-muted)]" : v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
        {pct(v, dec)}
      </div>
      {sub && <div className="text-[8px] text-[var(--t-text-dim)] tabular-nums">{sub}</div>}
    </div>
  );
}
