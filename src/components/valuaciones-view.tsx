"use client";

import { useEffect, useMemo, useState } from "react";

interface Posicion {
  ticker: string;
  tipo: string | null;
  fecha_vencimiento: string | null;
  moneda: string;
  cantidad: number;
  precio_promedio: number;
  precio_actual: number | null;
  costo_total: number;
  valor_mercado: number;
  pnl_no_realizado: number;
  pnl_no_realizado_pct: number | null;
  pnl_realizado: number;
  n_compras: number;
  n_ventas: number;
  completeness: "completa" | "parcial";
}

interface Totales {
  costo_total: number;
  valor_mercado: number;
  pnl_no_realizado: number;
  pnl_realizado: number;
  pnl_total: number;
  pnl_total_pct: number | null;
}

interface ValuacionesResp {
  id_cuenta: string;
  hasta: string | null;
  posiciones: Posicion[];
  totales: Totales;
  n_tickers: number;
  n_boletos: number;
}

interface Props {
  /** id_cuenta para MVP — typicamente "805". */
  idCuenta: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

function fmtSigned(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + fmtCompact(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtPrice(n: number | null | undefined, dec = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtVto(s: string | null): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

const TIPO_COLOR: Record<string, string> = {
  cer:           "#5fc4f0",
  tasa_fija:     "#3fbf6f",
  globales:      "#ff9900",
  bonares:       "#ff9900",
  tamar:         "#bb66ff",
  dolar_linked:  "#94e7b3",
};

function tipoColor(tipo: string | null): string {
  if (!tipo) return "#666";
  return TIPO_COLOR[tipo] ?? "#888";
}

function tipoBadge(tipo: string | null): string {
  if (!tipo) return "—";
  if (tipo === "cer") return "CER";
  if (tipo === "tasa_fija") return "TF";
  if (tipo === "globales") return "GLOB";
  if (tipo === "bonares") return "BON";
  if (tipo === "tamar") return "TAMAR";
  if (tipo === "dolar_linked") return "DL";
  return tipo.toUpperCase();
}

const monedaColor = (m: string): string => {
  if (m === "ARS") return "#4a9eff";
  if (m === "USD") return "#00cc66";
  return "#888";
};

// ── Componente ────────────────────────────────────────────────────────────

export function ValuacionesView({ idCuenta }: Props) {
  const [data, setData] = useState<ValuacionesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/valuaciones/${encodeURIComponent(idCuenta)}/posiciones`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: ValuacionesResp = await res.json();
        if (cancelled) return;
        setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta]);

  const sortedPositions = useMemo<Posicion[]>(
    () => (data?.posiciones ?? []).slice().sort((a, b) => b.valor_mercado - a.valor_mercado),
    [data],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Cargando valuaciones…
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] text-sm p-4">
        Error: {error}
      </div>
    );
  }

  if (!data || data.posiciones.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm p-6 text-center">
        Sin posiciones para cuenta [{idCuenta}].
        <br />
        <span className="text-[#444] text-xs">
          Asegurate que haya boletos en CashFlow.NegocioMovimientos para esta cuenta.
        </span>
      </div>
    );
  }

  const t = data.totales;
  const pnlColor = (n: number | null | undefined) =>
    n == null ? "#888" : n >= 0 ? "#00cc66" : "#ff3333";

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">

      {/* KPIs row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 shrink-0">
        <Kpi
          label="VALOR MERCADO"
          value={fmtCompact(t.valor_mercado)}
          accent="#4a9eff"
        />
        <Kpi
          label="COSTO TOTAL"
          value={fmtCompact(t.costo_total)}
        />
        <Kpi
          label="PNL NO REAL"
          value={fmtSigned(t.pnl_no_realizado)}
          accent={pnlColor(t.pnl_no_realizado)}
        />
        <Kpi
          label="PNL REALIZADO"
          value={fmtSigned(t.pnl_realizado)}
          accent={pnlColor(t.pnl_realizado)}
        />
        <Kpi
          label="PNL TOTAL"
          value={fmtSigned(t.pnl_total)}
          accent={pnlColor(t.pnl_total)}
        />
        <Kpi
          label="PNL TOTAL %"
          value={fmtPct(t.pnl_total_pct)}
          accent={pnlColor(t.pnl_total_pct)}
        />
      </div>

      {/* Posiciones table */}
      <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
        <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
          <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
            Posiciones · cuenta [{idCuenta}]
          </span>
          <span className="ml-auto text-[10px] text-[#888] font-mono">
            {data.n_tickers} ticker{data.n_tickers !== 1 ? "s" : ""} · {data.n_boletos} boletos
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[#0f0f0f] z-10 text-[9px] uppercase tracking-widest text-[#666]">
              <tr>
                <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Ticker</th>
                <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Clase</th>
                <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Mon</th>
                <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Vto.</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">P. Entrada</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">P. Actual</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Cantidad</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Costo</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Valor Mdo</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">PNL $</th>
                <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">PNL %</th>
                <th className="px-2 py-1.5 text-center border-b border-[#1a1a1a]">✓</th>
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((p) => (
                <tr key={p.ticker} className="border-t border-[#111] hover:bg-[#0f0f0f]">
                  <td className="px-2 py-1 text-[#ff9900] font-semibold">{p.ticker}</td>
                  <td className="px-2 py-1">
                    <span
                      className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
                      style={{
                        background: `${tipoColor(p.tipo)}22`,
                        color: tipoColor(p.tipo),
                        border: `1px solid ${tipoColor(p.tipo)}55`,
                      }}
                    >
                      {tipoBadge(p.tipo)}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 inline-block rounded-full" style={{ background: monedaColor(p.moneda) }} />
                      <span className="text-[#888]">{p.moneda}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1 text-[#888]">{fmtVto(p.fecha_vencimiento)}</td>
                  <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtPrice(p.precio_promedio, 2)}</td>
                  <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtPrice(p.precio_actual, 2)}</td>
                  <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtQty(p.cantidad)}</td>
                  <td className="px-2 py-1 text-right text-[#888]">{fmtCompact(p.costo_total)}</td>
                  <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtCompact(p.valor_mercado)}</td>
                  <td
                    className="px-2 py-1 text-right font-semibold"
                    style={{ color: pnlColor(p.pnl_no_realizado) }}
                  >
                    {fmtSigned(p.pnl_no_realizado)}
                  </td>
                  <td
                    className="px-2 py-1 text-right"
                    style={{ color: pnlColor(p.pnl_no_realizado_pct) }}
                  >
                    {fmtPct(p.pnl_no_realizado_pct)}
                  </td>
                  <td
                    className="px-2 py-1 text-center text-[10px]"
                    title={
                      p.completeness === "completa"
                        ? "Cost basis completo (todos los compras observadas)"
                        : "⚠ Cost basis parcial — la cuenta tenía posición antes del primer boleto disponible. PnL es aproximado."
                    }
                  >
                    {p.completeness === "completa" ? (
                      <span className="text-[#00cc66]">✓</span>
                    ) : (
                      <span className="text-[#ff9900]">⚠</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#2a2a2a] bg-[#0a0a0a] font-semibold">
                <td className="px-2 py-1.5 text-[#ff9900]" colSpan={7}>TOTAL</td>
                <td className="px-2 py-1.5 text-right text-[#888]">{fmtCompact(t.costo_total)}</td>
                <td className="px-2 py-1.5 text-right text-[#d0d0d0]">{fmtCompact(t.valor_mercado)}</td>
                <td
                  className="px-2 py-1.5 text-right"
                  style={{ color: pnlColor(t.pnl_no_realizado) }}
                >
                  {fmtSigned(t.pnl_no_realizado)}
                </td>
                <td
                  className="px-2 py-1.5 text-right"
                  style={{ color: pnlColor(t.pnl_total_pct) }}
                >
                  {fmtPct(t.pnl_total_pct)}
                </td>
                <td className="px-2 py-1.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footnote sobre completeness */}
      <div className="text-[9px] text-[#555] shrink-0">
        ✓ = cost basis completo · ⚠ = parcial (la cuenta ya tenía la posición antes del primer boleto disponible — PnL aproximado).
        PnL TOTAL incluye realizado + no realizado · MVP: solo posiciones con boletos en CashFlow.NegocioMovimientos.
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
      <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1">{label}</div>
      <div
        className="text-[16px] font-mono font-semibold tabular-nums"
        style={accent ? { color: accent } : { color: "#d0d0d0" }}
      >
        {value}
      </div>
    </div>
  );
}
