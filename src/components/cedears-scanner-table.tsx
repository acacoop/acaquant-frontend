"use client";

import { useMemo, useState } from "react";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";
import { fmtMoneyFull } from "@/lib/fmt-money";
import { fmtPrice, fmtVol } from "./ui";

/**
 * Tabla de CEDEARs — precio BYMA en ARS, métricas live del motor_cedears.
 *
 * Refactor 2026-09-10 (vista CEDEARS de /renta-variable): se fue el switch
 * CEDEAR/ADR (la tabla es SOLO el CEDEAR en ARS, como en TRADING) y con él las
 * columnas RUBRO, SPREAD y VWAP. El VOL nominal se reemplazó por **$ OPERADO**
 * (`total_money` = TRADE_EFFECTIVE_VOLUME, la plata que realmente se movió),
 * el mismo dato y el mismo formato que ranquea VOLUMENES en /trading: el
 * nominal no compara plata entre papeles de $10 y de $500.
 *
 * Click en cualquier header invierte el orden (asc/desc). Default: INTRA
 * descendente — top movers arriba.
 *
 * El radar de TRADING reusa esta tabla en modo `compact` (columnas propias:
 * VOL nominal, VWAP y SPREAD, sin USD ni buscador). Ese layout NO cambió.
 */

type SortKey =
  | "ticker_corto" | "nombre"
  | "last" | "intraday_pct" | "vs_1d_pct" | "vs_1d_usd_pct"
  | "total_money"
  // solo en modo compact (radar de TRADING)
  | "vwap" | "spread_pct" | "volume";

type SortDir = "asc" | "desc";

export function CedearsScannerTable({
  data,
  selectedTicker,
  onSelect,
  ccl,
  hideTicker = false,
  compact = false,
  headerLeading,
}: {
  data: CedearScannerRow[];
  selectedTicker?: string | null;
  onSelect?: (ticker: string) => void;
  ccl?: CclLive;
  // TRADING radar: oculta la columna TICKER (queda solo NOMBRE) — el ticker se
  // ve al hacer click y cargar el papel en una card.
  hideTicker?: boolean;
  // TRADING radar: layout compacto — saca la columna USD y el buscador, y
  // muestra VOL nominal, VWAP y SPREAD. La vista CEDEARS (sin compact) muestra
  // USD y $ OPERADO.
  compact?: boolean;
  // Nodo opcional (ej. las tabs MOVERS/VOLUMENES) que se renderiza al inicio de
  // la barra de herramientas para compartir la MISMA fila y ahorrar alto.
  headerLeading?: React.ReactNode;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("intraday_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker_corto" || key === "nombre" ? "asc" : "desc");
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
      const av = a[sortKey];
      const bv = b[sortKey];
      // nulls SIEMPRE al final, sin importar la dirección
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

  const nCols = 7 - (hideTicker ? 1 : 0) + (compact ? 1 : 0);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-1 mb-1 shrink-0 px-1 py-1 border-b border-[var(--t-border)]">
        {headerLeading}
        {!compact && (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ticker…"
              className="w-[150px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none placeholder:text-[var(--t-text-muted)]"
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
          </>
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
            <tr className="text-[var(--t-text-muted)]">
              {!hideTicker && (
                <SortableTh label="TICKER" col="ticker_corto" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              )}
              <SortableTh label="NOMBRE" col="nombre"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              <SortableTh label="LAST"   col="last"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Último precio operado en BYMA (ARS)" />
              <SortableTh label="INTRA"  col="intraday_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="% intradía: (last/open − 1) × 100" />
              <SortableTh label="1D"     col="vs_1d_pct"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Variación ARS vs cierre día anterior" />
              {compact ? (
                <>
                  <SortableTh label="VOL"    col="volume"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Volumen nominal operado en el día" />
                  <SortableTh label="VWAP"   col="vwap"       sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Precio promedio ponderado por volumen (EV/NV)" />
                  <SortableTh label="SPREAD" col="spread_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Spread de puntas: (offer − bid) / mid × 100" />
                </>
              ) : (
                <>
                  <SortableTh label="USD"       col="vs_1d_usd_pct" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Retorno USD real descontando variación CCL" />
                  <SortableTh label="$ OPERADO" col="total_money"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" title="Plata operada en el día (precio × cantidad), no nominal — el mismo dato que ranquea VOLUMENES en TRADING" />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={nCols} className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  {query ? "Ningún CEDEAR coincide con la búsqueda" : "Sin CEDEARs activos"}
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
                      <td className="!px-1 font-semibold text-[var(--t-accent)]">
                        {r.ticker_corto}
                      </td>
                    )}
                    <td className="!px-1 text-[var(--t-text)] truncate max-w-[180px]" title={r.nombre ?? ""}>
                      {r.nombre || "--"}
                    </td>
                    <td className="!px-1 text-right font-semibold tabular-nums">
                      {fmtPrice(r.last ?? undefined)}
                    </td>
                    <PctCell v={r.intraday_pct} />
                    <PctCell v={r.vs_1d_pct} />
                    {compact ? (
                      <>
                        <td className="!px-1 text-right tabular-nums text-[var(--t-text-dim)]">{fmtVol(r.volume ?? undefined)}</td>
                        <td className="!px-1 text-right tabular-nums text-[var(--t-text-dim)]">{fmtPrice(r.vwap ?? undefined)}</td>
                        <td className="!px-1 text-right tabular-nums text-[var(--t-text-dim)]">{r.spread_pct != null ? `${r.spread_pct.toFixed(2)}%` : "--"}</td>
                      </>
                    ) : (
                      <>
                        <PctCell v={r.vs_1d_usd_pct} />
                        <td className="!px-1 text-right tabular-nums font-mono text-[var(--t-text)]">
                          {r.total_money != null && r.total_money > 0 ? fmtMoneyFull(r.total_money) : "--"}
                        </td>
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

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  align,
  title,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (col: SortKey) => void;
  align: "left" | "right";
  title?: string;
}) {
  const active = sortKey === col;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => onClick(col)}
      className={`!px-1 cursor-pointer select-none hover:text-[var(--t-accent)] transition-colors whitespace-nowrap ${
        align === "left" ? "text-left" : "text-right"
      } ${active ? "text-[var(--t-accent)]" : ""}`}
      title={title ?? "Click para ordenar"}
    >
      {label}
      <span className="text-[8px]">{arrow}</span>
    </th>
  );
}
