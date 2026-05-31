"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fmtCompact, fmtSigned } from "@/components/pnl-titulos-view";

// Una fila por cuenta — viene de /api/valuaciones/consolidado, que reusa
// el cálculo de la tabla MENSUAL de PORTAFOLIO (valuacion_mensual).
interface CuentaRow {
  cuenta: string;
  id_cuenta: string;
  ultimo_dia: string | null;
  valor_ars: number;
  valor_usd: number;
  base100_ars: number | null;
  base100_usd: number | null;
  pnl_acum_ars: number;
  pnl_acum_usd: number;
}

interface ConsolidadoResp {
  rows: CuentaRow[];
  n: number;
  filtro_cuenta: string;
}

type FiltroCuenta =
  | "todas" | "accionistas" | "sin_accionistas" | "cooperativas" | "productores";
const FILTRO_OPTS: { value: FiltroCuenta; label: string }[] = [
  { value: "todas",           label: "TODAS" },
  { value: "accionistas",     label: "ACCIONISTAS" },
  { value: "sin_accionistas", label: "SIN ACCIONISTAS" },
  { value: "cooperativas",    label: "COOPERATIVAS" },
  { value: "productores",     label: "PRODUCTORES" },
];

type SortKey =
  | "cuenta" | "valor_ars" | "valor_usd"
  | "pnl_acum_ars" | "pnl_acum_usd" | "base100_ars" | "base100_usd";

const base100Class = (v: number | null) =>
  v == null ? "text-[#666]" : v >= 100 ? "text-[#00cc66]" : "text-[#ff4d4d]";
const pnlCls = (v: number) => (v >= 0 ? "text-[#00cc66]" : "text-[#ff4d4d]");

// Cuentas con |valor ARS| por debajo de esto se consideran "saldo muerto"
// (carteras casi vacías, ej. $2.000 / $30.000) y se ocultan por defecto.
// El filtro es sobre el VALOR, no sobre el PnL — una cuenta con pérdida
// fuerte pero saldo real igual se muestra.
const SALDO_MUERTO = 100_000;

// El backend manda BASE 100 (TWR como índice: 100 = arrancó parejo).
// En TOTALES > POR CUENTA se muestra como rendimiento %: 140.56 → "+40,56%".
const fmtRend = (base100: number) => {
  const r = base100 - 100;
  return `${r >= 0 ? "+" : ""}${r.toFixed(2)}%`;
};

/**
 * PorCuentaView — TOTALES consolidado: una fila por cuenta con valor,
 * PnL acumulado y base 100, en ARS y USD. Mismo cálculo que la tabla
 * MENSUAL de PORTAFOLIO, sólo que para todas las cuentas a la vez —
 * para comparar qué cartera rinde más.
 */
export function PorCuentaView({ onVolver }: { onVolver: () => void }) {
  const [data, setData]       = useState<ConsolidadoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [filtroCta, setFiltroCta] = useState<FiltroCuenta>("todas");
  const [searchCta, setSearchCta] = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("base100_ars");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [ocultarMuerto, setOcultarMuerto] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(
          `/api/valuaciones/consolidado?filtro_cuenta=${encodeURIComponent(filtroCta)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filtroCta]);

  const filas = useMemo(() => {
    if (!data) return [];
    const q = searchCta.trim().toLowerCase();
    const f = data.rows.filter((r) => {
      if (ocultarMuerto && Math.abs(r.valor_ars) < SALDO_MUERTO) return false;
      if (
        q &&
        !r.cuenta.toLowerCase().includes(q) &&
        !r.id_cuenta.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      if (sortKey === "cuenta") return a.cuenta.localeCompare(b.cuenta) * sgn;
      const av = (a[sortKey] as number | null) ?? Number.NEGATIVE_INFINITY;
      const bv = (b[sortKey] as number | null) ?? Number.NEGATIVE_INFINITY;
      return (av - bv) * sgn;
    });
  }, [data, searchCta, sortKey, sortDir, ocultarMuerto]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Toggle POR TÍTULO / POR CUENTA */}
      <div className="flex gap-1 px-2 pt-2 shrink-0">
        <button
          onClick={onVolver}
          className="px-3 py-1 text-[10px] tracking-widest border border-[#2a2a2a] text-[#888] hover:text-[#ff9900]"
        >
          POR TÍTULO
        </button>
        <button
          className="px-3 py-1 text-[10px] tracking-widest border border-[#ff9900] bg-[#ff9900]/10 text-[#ff9900]"
        >
          POR CUENTA
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 shrink-0">
        <select
          value={filtroCta}
          onChange={(e) => setFiltroCta(e.target.value as FiltroCuenta)}
          className="bg-black border border-[#2a2a2a] text-[10px] px-2 py-0.5 text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
        >
          {FILTRO_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchCta}
          onChange={(e) => setSearchCta(e.target.value)}
          placeholder="Filtrar cuenta…"
          className="bg-black border border-[#2a2a2a] text-[10px] px-2 py-0.5 text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none w-48"
        />
        <label className="flex items-center gap-1 text-[10px] text-[#888] font-mono cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ocultarMuerto}
            onChange={(e) => setOcultarMuerto(e.target.checked)}
            className="accent-[#ff9900]"
          />
          Ocultar saldo muerto (&lt;$100k)
        </label>
        {data && (
          <span className="text-[10px] text-[#666] font-mono">
            {filas.length} cuentas
          </span>
        )}
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 mx-2 mb-2 border border-[#1a1a1a] bg-[var(--t-panel)] overflow-hidden flex flex-col">
        {err ? (
          <div className="p-3 text-[11px] text-[#ff4d4d]">Error: {err}</div>
        ) : loading && !data ? (
          <div className="h-full flex items-center justify-center text-[#555] text-[11px]">
            Cargando…
          </div>
        ) : !data || filas.length === 0 ? (
          <div className="p-6 text-center text-[#555] text-[11px]">
            Sin cuentas para mostrar.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[#1a1a1a] z-10">
                <tr className="text-[9px] tracking-widest text-[#888]">
                  <Th onClick={() => toggleSort("cuenta")} left>CUENTA{arrow("cuenta")}</Th>
                  <Th onClick={() => toggleSort("valor_ars")}>VALOR ARS{arrow("valor_ars")}</Th>
                  <Th onClick={() => toggleSort("valor_usd")}>VALOR USD{arrow("valor_usd")}</Th>
                  <Th onClick={() => toggleSort("pnl_acum_ars")}>PNL ACUM ARS{arrow("pnl_acum_ars")}</Th>
                  <Th onClick={() => toggleSort("pnl_acum_usd")}>PNL ACUM USD{arrow("pnl_acum_usd")}</Th>
                  <Th onClick={() => toggleSort("base100_ars")}>RENDIM. ARS{arrow("base100_ars")}</Th>
                  <Th onClick={() => toggleSort("base100_usd")}>RENDIM. USD{arrow("base100_usd")}</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => {
                  const cuentaShort = r.cuenta.replace(/^\[\d+\]\s*/, "");
                  return (
                    <tr key={r.id_cuenta} className="border-b border-[#111] hover:bg-[#ff9900]/5">
                      <td className="px-2 py-1.5 text-[#888] truncate max-w-[220px]" title={r.cuenta}>
                        <span className="text-[#555] mr-1">[{r.id_cuenta}]</span>
                        {cuentaShort}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[#d0d0d0]">{fmtCompact(r.valor_ars)}</td>
                      <td className="px-2 py-1.5 text-right text-[#d0d0d0]">{fmtCompact(r.valor_usd)}</td>
                      <td className={`px-2 py-1.5 text-right ${pnlCls(r.pnl_acum_ars)}`}>{fmtSigned(r.pnl_acum_ars)}</td>
                      <td className={`px-2 py-1.5 text-right ${pnlCls(r.pnl_acum_usd)}`}>{fmtSigned(r.pnl_acum_usd)}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${base100Class(r.base100_ars)}`}>
                        {r.base100_ars != null ? fmtRend(r.base100_ars) : "—"}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${base100Class(r.base100_usd)}`}>
                        {r.base100_usd != null ? fmtRend(r.base100_usd) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  left,
}: {
  children: ReactNode;
  onClick: () => void;
  left?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      className={
        "px-2 py-2 cursor-pointer hover:text-[#ff9900] select-none " +
        (left ? "text-left" : "text-right")
      }
    >
      {children}
    </th>
  );
}
