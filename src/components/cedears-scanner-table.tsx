"use client";

import { useMemo, useState } from "react";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";
import { fmtPrice, fmtVol } from "./ui";

/**
 * Tabla del Scanner — switch CEDEAR / ADR.
 *
 * CEDEAR: precio BYMA en ARS, métricas live del motor_cedears.
 * ADR:    precio NYSE en USD del underlying, EOD desde Trading.PreciosAcciones.
 *
 * Click en cualquier header invierte el orden (asc/desc). Default:
 * INTRA descendente (CEDEAR) / vs_1d (ADR) — top movers arriba.
 */

type View = "cedear" | "adr";

type CedearSortKey =
  | "ticker_corto" | "nombre" | "rubro"
  | "last" | "intraday_pct" | "vs_1d_pct" | "vs_1d_usd_pct"
  | "vwap" | "spread_pct" | "volume";

type AdrSortKey =
  | "ticker_corto" | "nombre" | "rubro"
  | "adr_last" | "adr_vs_1d_pct" | "adr_ret_7d_pct" | "adr_ret_15r_pct"
  | "adr_ret_mtd_pct" | "adr_ret_ytd_pct";

type SortKey = CedearSortKey | AdrSortKey;
type SortDir = "asc" | "desc";

export function CedearsScannerTable({
  data,
  selectedTicker,
  onSelect,
  ccl,
  rubroFiltro,
  onClearRubro,
  hideRubro = false,
  hideTicker = false,
}: {
  data: CedearScannerRow[];
  selectedTicker?: string | null;
  onSelect?: (ticker: string) => void;
  ccl?: CclLive;
  rubroFiltro?: string | null;
  onClearRubro?: () => void;
  // TRADING radar: oculta la columna RUBRO para ganar ancho (la vista embebida
  // al lado de las cards es angosta). El Scanner de Renta Variable la mantiene.
  hideRubro?: boolean;
  // TRADING radar: oculta también la columna TICKER (queda solo NOMBRE) — el
  // ticker se ve al hacer click y cargar el papel en una card.
  hideTicker?: boolean;
}) {
  const [view, setView] = useState<View>("cedear");
  const [sortKey, setSortKey] = useState<SortKey>("intraday_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker_corto" || key === "rubro" ? "asc" : "desc");
    }
  }

  function changeView(v: View) {
    setView(v);
    // Reset sort default según vista
    if (v === "cedear") {
      setSortKey("intraday_pct");
      setSortDir("desc");
    } else {
      setSortKey("adr_vs_1d_pct");
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (r) =>
            r.ticker_corto?.toLowerCase().includes(q) ||
            r.nombre?.toLowerCase().includes(q),
        )
      : data;
    const cmp = (a: CedearScannerRow, b: CedearScannerRow) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey];
      const bv = (b as unknown as Record<string, unknown>)[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    };
    return [...filtered].sort(cmp);
  }, [data, sortKey, sortDir, query]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 mb-1 shrink-0 px-1 py-1 border-b border-[var(--t-border)]">
        <ViewBtn active={view === "cedear"} onClick={() => changeView("cedear")} tone="orange">
          CEDEAR
        </ViewBtn>
        <ViewBtn active={view === "adr"} onClick={() => changeView("adr")} tone="cyan">
          ADR
        </ViewBtn>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ticker…"
          className="ml-2 w-[150px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none placeholder:text-[var(--t-text-muted)]"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[12px] px-1"
            title="Limpiar búsqueda"
          >
            ✕
          </button>
        )}
        {rubroFiltro && (
          <button
            onClick={onClearRubro}
            title="Quitar filtro de rubro (tocá otro en el Pulso para cambiarlo)"
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors"
          >
            <span className="truncate max-w-[130px]">{rubroFiltro}</span>
            <span>✕</span>
          </button>
        )}
        {ccl && (
          <div
            className="ml-auto flex items-center gap-2 pr-1 text-[10px] tabular-nums"
            title="CCL live + variación vs cierre día previo"
          >
            <span className="text-[var(--t-text-dim)] tracking-wide uppercase">CCL</span>
            <span className="text-[var(--t-text)] font-mono">
              {ccl.value !== null
                ? `$${ccl.value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`
                : "--"}
            </span>
            <span
              className={
                ccl.vs_1d_pct === null
                  ? "text-[var(--t-text-muted)]"
                  : ccl.vs_1d_pct >= 0
                  ? "text-[var(--t-pos)]"
                  : "text-[var(--t-neg)]"
              }
            >
              {ccl.vs_1d_pct !== null
                ? `${ccl.vs_1d_pct >= 0 ? "+" : ""}${ccl.vs_1d_pct.toFixed(2)}%`
                : "--"}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
            {view === "cedear" ? (
              <tr className="text-[var(--t-text-muted)]">
                {!hideTicker && (
                  <SortableTh label="TICKER" col="ticker_corto" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
                )}
                <SortableTh label="NOMBRE" col="nombre"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
                {!hideRubro && (
                  <SortableTh label="RUBRO"  col="rubro"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" title="Clasificación de negocio (editable en Manager → Renta Variable)" />
                )}
                <SortableTh label="LAST"   col="last"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortableTh label="INTRA"  col="intraday_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="% intradía: (last/open − 1) × 100" />
                <SortableTh label="1D"     col="vs_1d_pct"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Variación ARS vs cierre día anterior" />
                <SortableTh label="USD"    col="vs_1d_usd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Retorno USD real descontando variación CCL" />
                <SortableTh label="VWAP"   col="vwap"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Precio promedio ponderado por volumen (EV/NV)" />
                <SortableTh label="SPREAD" col="spread_pct"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Spread de puntas: (offer − bid) / mid × 100" />
                <SortableTh label="VOL"    col="volume"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Volumen nominal operado en el día" />
              </tr>
            ) : (
              <tr className="text-[#5a8aa3]">
                {!hideTicker && (
                  <SortableTh label="TICKER"  col="ticker_corto"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left"  tone="cyan" />
                )}
                <SortableTh label="NOMBRE"  col="nombre"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left"  tone="cyan" />
                {!hideRubro && (
                  <SortableTh label="RUBRO"   col="rubro"           sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left"  tone="cyan" title="Clasificación de negocio (editable en Manager → Renta Variable)" />
                )}
                <SortableTh label="LAST"    col="adr_last"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="Último close USD del subyacente (NYSE/NASDAQ)" />
                <SortableTh label="1D"      col="adr_vs_1d_pct"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / prev close − 1) × 100" />
                <SortableTh label="7D"      col="adr_ret_7d_pct"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / close ~7d atrás − 1) × 100" />
                <SortableTh label="15R"     col="adr_ret_15r_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: retorno de las últimas 15 ruedas (last / close 15 ruedas atrás − 1) × 100" />
                <SortableTh label="MTD"     col="adr_ret_mtd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / close 1° del mes − 1) × 100" />
                <SortableTh label="YTD"     col="adr_ret_ytd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / close 1° del año − 1) × 100" />
              </tr>
            )}
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10 - (hideRubro ? 1 : 0) - (hideTicker ? 1 : 0)} className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  SIN CEDEARS ACTIVOS — correr scripts/seed_cedears.py
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const isSelected = r.ticker_corto === selectedTicker;
                return (
                  <tr
                    key={r.ticker_corto}
                    onClick={onSelect ? () => onSelect(r.ticker_corto) : undefined}
                    className={`${onSelect ? "cursor-pointer" : ""} ${
                      isSelected
                        ? "bg-[var(--t-accent)]/15"
                        : onSelect
                        ? "hover:bg-[var(--t-border)]"
                        : ""
                    }`}
                  >
                    {!hideTicker && (
                      <td className={`!px-1 font-semibold ${view === "adr" ? "text-[#5fb3d4]" : "text-[var(--t-accent)]"}`}>
                        {r.ticker_corto}
                      </td>
                    )}
                    <td className="!px-1 text-[var(--t-text)] truncate max-w-[180px]" title={r.nombre ?? ""}>
                      {r.nombre || "--"}
                    </td>
                    {!hideRubro && (
                      <td className="!px-1 text-[var(--t-text-dim)]">
                        {r.rubro || "--"}
                      </td>
                    )}

                    {view === "cedear" ? (
                      <>
                        <td className="!px-1 text-right font-semibold tabular-nums">
                          {fmtPrice(r.last ?? undefined)}
                        </td>
                        <PctCell v={r.intraday_pct} />
                        <PctCell v={r.vs_1d_pct} />
                        <PctCell v={r.vs_1d_usd_pct} />
                        <td className="!px-1 text-right tabular-nums text-[var(--t-text-dim)]">{fmtPrice(r.vwap ?? undefined)}</td>
                        <td className="!px-1 text-right tabular-nums text-[var(--t-text-dim)]">{r.spread_pct != null ? `${r.spread_pct.toFixed(2)}%` : "--"}</td>
                        <td className="!px-1 text-right tabular-nums text-[var(--t-text-dim)]">{fmtVol(r.volume ?? undefined)}</td>
                      </>
                    ) : (
                      <>
                        <td className="!px-1 text-right font-semibold tabular-nums">
                          <span className={r.adr_intraday === false ? "text-[var(--t-text-dim)]" : "text-[var(--t-text)]"}>
                            {r.adr_last != null ? `$${r.adr_last.toFixed(2)}` : "--"}
                          </span>
                          {r.adr_intraday === false && (
                            <span
                              className="ml-1 text-[7px] text-[var(--t-accent)] tracking-widest align-middle"
                              title="Cierre previo — el mercado aún no operó hoy (pre-market) o es cierre EOD"
                            >
                              CIERRE
                            </span>
                          )}
                        </td>
                        <PctCell v={r.adr_vs_1d_pct} />
                        <PctCell v={r.adr_ret_7d_pct} />
                        <PctCell v={r.adr_ret_15r_pct} />
                        <PctCell v={r.adr_ret_mtd_pct} />
                        <PctCell v={r.adr_ret_ytd_pct} />
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PctCell({ v }: { v: number | null | undefined }) {
  return (
    <td
      className={`!px-1 text-right tabular-nums ${
        v === null || v === undefined
          ? "text-[var(--t-text-muted)]"
          : v >= 0
          ? "text-[var(--t-pos)]"
          : "text-[var(--t-neg)]"
      }`}
    >
      {v !== null && v !== undefined
        ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`
        : "--"}
    </td>
  );
}

function ViewBtn({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "orange" | "cyan";
  children: React.ReactNode;
}) {
  // Tono distinto para que el switch visual sea claro pero minimalista.
  const activeColor =
    tone === "orange"
      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
      : "bg-[#5fb3d4] text-black border-[#5fb3d4]";
  const inactiveColor =
    tone === "orange"
      ? "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#5fb3d4] hover:border-[#5fb3d4]";
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active ? activeColor : inactiveColor
      }`}
    >
      {children}
    </button>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  align,
  title,
  tone,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (col: SortKey) => void;
  align: "left" | "right";
  title?: string;
  tone?: "orange" | "cyan";
}) {
  const active = sortKey === col;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const activeColor = tone === "cyan" ? "text-[#5fb3d4]" : "text-[var(--t-accent)]";
  const hoverColor =
    tone === "cyan" ? "hover:text-[#5fb3d4]" : "hover:text-[var(--t-accent)]";
  return (
    <th
      onClick={() => onClick(col)}
      className={`!px-1 cursor-pointer select-none ${hoverColor} transition-colors text-${align} ${
        active ? activeColor : ""
      }`}
      title={title ?? "Click para ordenar"}
    >
      {label}
      <span className="text-[8px]">{arrow}</span>
    </th>
  );
}
