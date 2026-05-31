"use client";

import { useMemo, useState } from "react";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";
import { fmtPrice } from "./ui";

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
  | "ticker_corto" | "nombre" | "sector"
  | "last" | "intraday_pct" | "vs_1d_pct" | "vs_1d_usd_pct";

type AdrSortKey =
  | "ticker_corto" | "nombre" | "sector"
  | "adr_last" | "adr_vs_1d_pct" | "adr_ret_7d_pct"
  | "adr_ret_mtd_pct" | "adr_ret_ytd_pct";

type SortKey = CedearSortKey | AdrSortKey;
type SortDir = "asc" | "desc";

export function CedearsScannerTable({
  data,
  selectedTicker,
  onSelect,
  ccl,
}: {
  data: CedearScannerRow[];
  selectedTicker?: string | null;
  onSelect?: (ticker: string) => void;
  ccl?: CclLive;
}) {
  const [view, setView] = useState<View>("cedear");
  const [sortKey, setSortKey] = useState<SortKey>("intraday_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker_corto" || key === "sector" ? "asc" : "desc");
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
    return [...data].sort(cmp);
  }, [data, sortKey, sortDir]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 mb-1 shrink-0 px-1 py-1 border-b border-[var(--t-border)]">
        <ViewBtn active={view === "cedear"} onClick={() => changeView("cedear")} tone="orange">
          CEDEAR
        </ViewBtn>
        <ViewBtn active={view === "adr"} onClick={() => changeView("adr")} tone="cyan">
          ADR
        </ViewBtn>
        {ccl && (
          <div
            className="ml-auto flex items-center gap-2 pr-1 text-[10px] tabular-nums"
            title="CCL live (DolarSnapshot._id=current) + variación vs cierre día previo"
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
                  ? "text-[#00cc66]"
                  : "text-[#ff3333]"
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
                <SortableTh label="TICKER" col="ticker_corto" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
                <SortableTh label="NOMBRE" col="nombre"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
                <SortableTh label="SECTOR" col="sector"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
                <SortableTh label="LAST"   col="last"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortableTh label="INTRA"  col="intraday_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="% intradía: (last/open − 1) × 100" />
                <SortableTh label="1D"     col="vs_1d_pct"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Variación ARS vs cierre día anterior" />
                <SortableTh label="USD"    col="vs_1d_usd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Retorno USD real descontando variación CCL" />
              </tr>
            ) : (
              <tr className="text-[#5a8aa3]">
                <SortableTh label="TICKER"  col="ticker_corto"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left"  tone="cyan" />
                <SortableTh label="NOMBRE"  col="nombre"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left"  tone="cyan" />
                <SortableTh label="SECTOR"  col="sector"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left"  tone="cyan" />
                <SortableTh label="LAST"    col="adr_last"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="Último close USD del subyacente (NYSE/NASDAQ, Trading.PreciosAcciones)" />
                <SortableTh label="1D"      col="adr_vs_1d_pct"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / prev close − 1) × 100" />
                <SortableTh label="7D"      col="adr_ret_7d_pct"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / close ~7d atrás − 1) × 100" />
                <SortableTh label="MTD"     col="adr_ret_mtd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / close 1° del mes − 1) × 100" />
                <SortableTh label="YTD"     col="adr_ret_ytd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" tone="cyan" title="USD: (last / close 1° del año − 1) × 100" />
              </tr>
            )}
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-[var(--t-text-muted)] text-xs py-4 text-center">
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
                    <td className={`!px-1 font-semibold ${view === "adr" ? "text-[#5fb3d4]" : "text-[var(--t-accent)]"}`}>
                      {r.ticker_corto}
                    </td>
                    <td className="!px-1 text-[var(--t-text)] truncate max-w-[180px]" title={r.nombre ?? ""}>
                      {r.nombre || "--"}
                    </td>
                    <td className="!px-1 text-[var(--t-text-dim)]">
                      {r.sector || "--"}
                    </td>

                    {view === "cedear" ? (
                      <>
                        <td className="!px-1 text-right font-semibold tabular-nums">
                          {fmtPrice(r.last ?? undefined)}
                        </td>
                        <PctCell v={r.intraday_pct} />
                        <PctCell v={r.vs_1d_pct} />
                        <PctCell v={r.vs_1d_usd_pct} />
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
          ? "text-[#00cc66]"
          : "text-[#ff3333]"
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
