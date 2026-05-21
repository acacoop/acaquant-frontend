"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PosicionDetalle,
  fmtCompact,
  fmtSigned,
  pnlClass,
  type PnLRow,
} from "@/components/pnl-titulos-view";
import { PorCuentaView } from "@/components/por-cuenta-view";

// Cada fila viene del endpoint /api/aum-pnl-todas con (cuenta, id_cuenta)
// agregadas. El resto del shape coincide con PnLRow.
interface RowConCuenta extends PnLRow {
  cuenta: string;
  id_cuenta: string;
}

interface TotalesResp {
  rows: RowConCuenta[];
  totales: {
    n_cuentas:           number;
    n_filas:             number;
    costo_remanente:     number;
    valor_actual:        number;
    pnl_no_realizado:    number;
    pnl_pasivo:          number;
    pnl_realizado_dia:   number;
    pnl_total:           number;
    // Espejo USD — presentes una vez que el cron recalcula el cache.
    valor_actual_usd?:   number;
    costo_remanente_usd?: number;
  };
  filtro_cuenta: string;
}

type Moneda = "ARS" | "USD";

// Valor / costo / PNL de una fila según la moneda elegida. En USD el costo
// va al MEP histórico de cada boleto y el valor al MEP de hoy (backend).
const _valVista = (r: PnLRow, esUSD: boolean) =>
  esUSD ? (r.valor_actual_usd ?? 0) : (r.valor_actual_live ?? r.valor_actual_aum);
const _costoVista = (r: PnLRow, esUSD: boolean) =>
  esUSD ? (r.costo_remanente_usd ?? 0) : r.costo_remanente;

type FiltroCuenta = "todas" | "accionistas" | "sin_accionistas" | "cooperativas" | "productores";
const FILTRO_OPTS: { value: FiltroCuenta; label: string }[] = [
  { value: "todas",            label: "TODAS" },
  { value: "accionistas",      label: "ACCIONISTAS" },
  { value: "sin_accionistas",  label: "SIN ACCIONISTAS" },
  { value: "cooperativas",     label: "COOPERATIVAS" },
  { value: "productores",      label: "PRODUCTORES" },
];

type SortKey = "pnl_total" | "valor_actual" | "costo" | "ganpct" | "cuenta" | "ticker";

const _totalView = (r: PnLRow, esUSD = false) =>
  esUSD
    ? (r.pnl_no_realizado_usd ?? 0) + (r.pnl_pasivo_usd ?? 0) + (r.pnl_realizado_dia_usd ?? 0)
    : (r.pnl_no_realizado ?? 0) + r.pnl_pasivo + (r.pnl_realizado_dia ?? 0);

// Formato moneda-aware: el "$" base se reescribe a "US$" en vista USD.
const fmtMon = (n: number, esUSD: boolean) =>
  esUSD ? fmtCompact(n).replace("$", "US$") : fmtCompact(n);
const fmtMonSigned = (n: number, esUSD: boolean) =>
  esUSD ? fmtSigned(n).replace("$", "US$") : fmtSigned(n);

export function PnLTotalesView() {
  const [data, setData]       = useState<TotalesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const [moneda, setMoneda]       = useState<Moneda>("ARS");
  const esUSD = moneda === "USD";

  const [filtroCta, setFiltroCta] = useState<FiltroCuenta>("todas");
  const [searchCta, setSearchCta] = useState<string>("");
  const [searchTk,  setSearchTk]  = useState<string>("");
  const [sortKey, setSortKey]     = useState<SortKey>("pnl_total");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [selected, setSelected]   = useState<{cuenta: string; ticker: string} | null>(null);
  // Modo de TOTALES: por título (la tabla por (cuenta,ticker)) o por cuenta
  // entera (vista consolidada base 100). Ver PorCuentaView.
  const [modo, setModo] = useState<"titulo" | "cuenta">("titulo");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(
          `/api/aum-pnl-todas?filtro_cuenta=${encodeURIComponent(filtroCta)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setSelected(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filtroCta]);

  const filasFiltradas = useMemo(() => {
    if (!data) return [];
    const qC = searchCta.trim().toLowerCase();
    const qT = searchTk.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (qC && !(r.cuenta.toLowerCase().includes(qC) || r.id_cuenta.toLowerCase().includes(qC))) return false;
      if (qT && !((r.display_name || r.ticker).toLowerCase().includes(qT))) return false;
      return true;
    });
  }, [data, searchCta, searchTk]);

  const filasOrdenadas = useMemo(() => {
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...filasFiltradas].sort((a, b) => {
      switch (sortKey) {
        case "ticker":       return (a.display_name || a.ticker).localeCompare(b.display_name || b.ticker) * sgn;
        case "cuenta":       return a.cuenta.localeCompare(b.cuenta) * sgn;
        case "pnl_total":    return (_totalView(a, esUSD) - _totalView(b, esUSD)) * sgn;
        case "valor_actual": return (_valVista(a, esUSD) - _valVista(b, esUSD)) * sgn;
        case "costo":        return (_costoVista(a, esUSD) - _costoVista(b, esUSD)) * sgn;
        case "ganpct": {
          const ca = _costoVista(a, esUSD), cb = _costoVista(b, esUSD);
          const ga = ca > 0 ? _totalView(a, esUSD) / ca : Number.NEGATIVE_INFINITY;
          const gb = cb > 0 ? _totalView(b, esUSD) / cb : Number.NEGATIVE_INFINITY;
          return (ga - gb) * sgn;
        }
        default: return 0;
      }
    });
  }, [filasFiltradas, sortKey, sortDir, esUSD]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";

  // Aggregates visibles (sobre las filas filtradas).
  const aggVisible = useMemo(() => {
    let costo = 0, valor = 0, no_real = 0, pasivo = 0, real_dia = 0;
    for (const r of filasFiltradas) {
      costo    += _costoVista(r, esUSD);
      valor    += _valVista(r, esUSD);
      no_real  += esUSD ? (r.pnl_no_realizado_usd ?? 0) : (r.pnl_no_realizado ?? 0);
      pasivo   += esUSD ? (r.pnl_pasivo_usd ?? 0) : r.pnl_pasivo;
      real_dia += esUSD ? (r.pnl_realizado_dia_usd ?? 0) : (r.pnl_realizado_dia ?? 0);
    }
    return {
      costo,
      valor,
      pnl: no_real + pasivo + real_dia,
      no_real,
      pasivo,
      real_dia,
    };
  }, [filasFiltradas, esUSD]);

  // ¿El cache ya trae datos USD? (cron recalculado). Si no, deshabilitamos
  // el toggle USD para no mostrar ceros.
  const usdDisponible = useMemo(
    () => (data?.totales?.valor_actual_usd ?? 0) > 0
       || (data?.rows ?? []).some((r) => (r.valor_actual_usd ?? 0) > 0),
    [data],
  );

  const selectedRow = useMemo(() => {
    if (!selected) return null;
    return filasOrdenadas.find(
      (r) => r.id_cuenta === selected.cuenta && r.ticker === selected.ticker,
    ) ?? null;
  }, [selected, filasOrdenadas]);

  if (modo === "cuenta") {
    return <PorCuentaView onVolver={() => setModo("titulo")} />;
  }

  if (err) {
    return <div className="p-3 text-[11px] text-[#ff4d4d]">Error: {err}</div>;
  }
  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center text-[#555] text-[11px]">
        Cargando…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      {/* Toggle POR TÍTULO / POR CUENTA */}
      <div className="flex gap-1">
        <button className="px-3 py-1 text-[10px] tracking-widest border border-[#ff9900] bg-[#ff9900]/10 text-[#ff9900]">
          POR TÍTULO
        </button>
        <button
          onClick={() => setModo("cuenta")}
          className="px-3 py-1 text-[10px] tracking-widest border border-[#2a2a2a] text-[#888] hover:text-[#ff9900]"
        >
          POR CUENTA
        </button>
      </div>
      {/* KPIs agregados de lo visible */}
      <div className="grid grid-cols-5 gap-3">
        <Kpi label={`PNL TOTAL · ${moneda}`}
             value={fmtMonSigned(aggVisible.pnl, esUSD)}
             accent={aggVisible.pnl >= 0 ? "#00cc66" : "#ff4d4d"}
             sub="papel + cobros + dia" />
        <Kpi label="PNL NO REALIZADO"
             value={fmtMonSigned(aggVisible.no_real, esUSD)}
             accent={aggVisible.no_real >= 0 ? "#00cc66" : "#ff4d4d"}
             sub={esUSD ? "valor hoy − costo USD" : "stock vivo · papel"} />
        <Kpi label="PNL PASIVO"
             value={fmtMonSigned(aggVisible.pasivo, esUSD)}
             accent={aggVisible.pasivo >= 0 ? "#00cc66" : "#ff4d4d"}
             sub="cupones · divs · amorts" />
        <Kpi label="VALOR ACTUAL"
             value={fmtMon(aggVisible.valor, esUSD)}
             sub={aggVisible.costo > 0 ? `costo: ${fmtMon(aggVisible.costo, esUSD)}` : ""} />
        <Kpi label="POSICIONES"
             value={`${filasOrdenadas.length}`}
             sub={`${data.totales.n_cuentas} cuentas`} />
      </div>

      {/* Toolbar: filtro de tipo + búsquedas */}
      <div className="flex items-center gap-2 px-2">
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
          className="bg-black border border-[#2a2a2a] text-[10px] px-2 py-0.5 text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none w-44"
        />
        <input
          type="text"
          value={searchTk}
          onChange={(e) => setSearchTk(e.target.value)}
          placeholder="Filtrar ticker…"
          className="bg-black border border-[#2a2a2a] text-[10px] px-2 py-0.5 text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none w-44"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[9px] tracking-widest text-[#666]">MONEDA</span>
          {(["ARS", "USD"] as Moneda[]).map((m) => {
            const disabled = m === "USD" && !usdDisponible;
            return (
              <button
                key={m}
                onClick={() => !disabled && setMoneda(m)}
                disabled={disabled}
                title={disabled ? "Falta recalcular el cache (jobs.pnl_totales_precompute)" : ""}
                className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                  moneda === m
                    ? "bg-[#ff9900] text-black border-[#ff9900]"
                    : disabled
                      ? "bg-transparent text-[#444] border-[#1a1a1a] cursor-not-allowed"
                      : "bg-transparent text-[#888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Split layout: tabla 60 / detalle 40 */}
      <div className="flex-1 min-h-0 flex gap-3">
        <div className="basis-[60%] border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0 overflow-hidden">
          {filasOrdenadas.length === 0 ? (
            <div className="p-6 text-center text-[#555] text-[11px]">Sin posiciones para mostrar.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#1a1a1a] z-10">
                  <tr className="text-[9px] tracking-widest text-[#888]">
                    <th onClick={() => toggleSort("cuenta")} className="px-2 py-2 text-left cursor-pointer hover:text-[#ff9900] select-none">
                      CUENTA {arrow("cuenta")}
                    </th>
                    <th onClick={() => toggleSort("ticker")} className="px-2 py-2 text-left cursor-pointer hover:text-[#ff9900] select-none">
                      TICKER {arrow("ticker")}
                    </th>
                    <th className="px-2 py-2 text-right">CANT</th>
                    <th onClick={() => toggleSort("costo")} className="px-2 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                      COSTO {arrow("costo")}
                    </th>
                    <th onClick={() => toggleSort("valor_actual")} className="px-2 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                      VALOR {arrow("valor_actual")}
                    </th>
                    <th onClick={() => toggleSort("ganpct")} className="px-2 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                      GAN % {arrow("ganpct")}
                    </th>
                    <th onClick={() => toggleSort("pnl_total")} className="px-2 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                      PNL {arrow("pnl_total")}
                    </th>
                    <th className="px-2 py-2 text-right">FLAGS</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((r) => {
                    const isSel = selected?.cuenta === r.id_cuenta && selected?.ticker === r.ticker;
                    const total = _totalView(r, esUSD);
                    const costoRow = _costoVista(r, esUSD);
                    const valorRow = _valVista(r, esUSD);
                    const ganPct = costoRow > 0 ? (total / costoRow) * 100 : null;
                    const cuentaShort = r.cuenta.replace(/^\[\d+\]\s*/, "");
                    return (
                      <tr
                        key={`${r.id_cuenta}|${r.ticker}`}
                        onClick={() => setSelected(isSel ? null : { cuenta: r.id_cuenta, ticker: r.ticker })}
                        className={
                          "border-b border-[#111] cursor-pointer " +
                          (isSel ? "bg-[#ff9900]/10" : "hover:bg-[#ff9900]/5")
                        }
                      >
                        <td className="px-2 py-1.5 text-[#888] truncate max-w-[140px]" title={r.cuenta}>
                          <span className="text-[#555] mr-1">[{r.id_cuenta}]</span>
                          {cuentaShort}
                        </td>
                        <td className="px-2 py-1.5 text-[#d0d0d0] truncate max-w-[160px]" title={r.display_name || r.ticker}>
                          {r.display_name || r.ticker}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#d0d0d0]">
                          {r.qty_aum.toLocaleString("es-AR")}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#888]">
                          {costoRow > 0 ? fmtMon(costoRow, esUSD) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#d0d0d0]">
                          {fmtMon(valorRow, esUSD)}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${pnlClass(ganPct)}`}>
                          {ganPct != null ? `${ganPct >= 0 ? "+" : ""}${ganPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${pnlClass(total)}`}>
                          {fmtMonSigned(total, esUSD)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[9px]">
                          {r.completeness === "parcial" && (
                            <span className="px-1 py-0 bg-[#ff9900]/15 text-[#ff9900] tracking-widest">P</span>
                          )}
                          {r.completeness === "sin_boletos" && (
                            <span className="px-1 py-0 bg-[#ff4d4d]/15 text-[#ff4d4d] tracking-widest">SB</span>
                          )}
                          {r.moneda_mixta && (
                            <span className="ml-1 px-1 py-0 bg-[#4a9eff]/15 text-[#4a9eff] tracking-widest">$</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel detalle 40% */}
        <div className="basis-[40%] border border-[#1a1a1a] bg-[#080808] min-h-0 overflow-y-auto">
          {selectedRow ? (
            <>
              <div className="px-3 py-1 bg-[#0e0e0e] border-b border-[#1a1a1a] text-[9px] tracking-widest text-[#666]">
                <span className="text-[#888]">CUENTA</span> [{selectedRow.id_cuenta}] {selectedRow.cuenta.replace(/^\[\d+\]\s*/, "")}
              </div>
              <PosicionDetalle row={selectedRow} />
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-[#555] text-[11px] tracking-widest">
              Seleccioná una posición a la izquierda
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
      <div className="text-[10px] text-[#555] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[10px] text-[#666]">{sub}</div>}
    </div>
  );
}
