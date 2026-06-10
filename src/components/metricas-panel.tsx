"use client";

import { useMemo, useState } from "react";
import type { CedearScannerRow } from "@/lib/types-scanner";
import { fmtMoney } from "@/lib/fmt-money";
import { PivotPointsPanel } from "./pivot-points-panel";

/**
 * Panel MÉTRICAS del Scanner — 2 tabs:
 *   PULSO   → pulso del mercado por SECTOR (default). $ operado + %1D/INTRA/USD
 *             ponderados por $ operado + breadth (▲/▼). Real-time: se recalcula
 *             con cada poll de la tabla (rows), sin fetch propio.
 *   PIVOTS  → lo de antes (pivot points / zonas / volatilidad del ticker elegido).
 *
 * Por qué ponderar por $ OPERADO y no sumar volumen nominal: sumar acciones de
 * tickers con precios distintos mezcla peras con manzanas; el cash operado
 * (total_money) sí es comparable y refleja dónde está la plata.
 */

type Tab = "pulso" | "pivots";

export function MetricasPanel({ rows, ticker }: { rows: CedearScannerRow[]; ticker: string | null }) {
  const [tab, setTab] = useState<Tab>("pulso");
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-1 shrink-0">
        {([["pulso", "PULSO"], ["pivots", "PIVOTS / VOL"]] as [Tab, string][]).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              tab === k
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {l}
          </button>
        ))}
        {tab === "pivots" && <span className="ml-auto text-[10px] text-[var(--t-text-dim)]">{ticker || "—"}</span>}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "pulso" ? <PulsoSectoresPanel rows={rows} /> : <PivotPointsPanel ticker={ticker} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PULSO por sector
// ─────────────────────────────────────────────────────────────────────

type SortKey = "sector" | "money" | "p1d" | "intra" | "usd" | "breadth";

interface SectorAgg {
  sector: string;
  money: number;
  p1d: number | null;
  intra: number | null;
  usd: number | null;
  up: number;
  down: number;
}

// Promedio ponderado por $ operado. Si el sector aún no operó ($=0), cae a
// promedio simple para no dejar la fila vacía pre-volumen.
function wavg(items: { pct: number | null; w: number }[]): number | null {
  let sw = 0, swp = 0, n = 0, sp = 0;
  for (const it of items) {
    if (it.pct == null) continue;
    n++;
    sp += it.pct;
    if (it.w > 0) {
      sw += it.w;
      swp += it.pct * it.w;
    }
  }
  if (sw > 0) return swp / sw;
  return n > 0 ? sp / n : null;
}

function PulsoSectoresPanel({ rows }: { rows: CedearScannerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("money");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { sectores, total } = useMemo(() => {
    const bySector: Record<string, CedearScannerRow[]> = {};
    for (const r of rows) {
      const s = r.sector || "—";
      (bySector[s] ??= []).push(r);
    }
    const sectores: SectorAgg[] = Object.entries(bySector).map(([sector, rs]) => {
      let up = 0, down = 0;
      for (const r of rs) {
        if (r.vs_1d_pct != null && r.vs_1d_pct > 0) up++;
        else if (r.vs_1d_pct != null && r.vs_1d_pct < 0) down++;
      }
      return {
        sector,
        money: rs.reduce((a, r) => a + (r.total_money || 0), 0),
        p1d: wavg(rs.map((r) => ({ pct: r.vs_1d_pct, w: r.total_money || 0 }))),
        intra: wavg(rs.map((r) => ({ pct: r.intraday_pct, w: r.total_money || 0 }))),
        usd: wavg(rs.map((r) => ({ pct: r.vs_1d_usd_pct, w: r.total_money || 0 }))),
        up,
        down,
      };
    });
    const total = {
      money: rows.reduce((a, r) => a + (r.total_money || 0), 0),
      p1d: wavg(rows.map((r) => ({ pct: r.vs_1d_pct, w: r.total_money || 0 }))),
      up: rows.filter((r) => r.vs_1d_pct != null && r.vs_1d_pct > 0).length,
      down: rows.filter((r) => r.vs_1d_pct != null && r.vs_1d_pct < 0).length,
    };
    return { sectores, total };
  }, [rows]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (s: SectorAgg): number | string =>
      sortKey === "sector" ? s.sector
        : sortKey === "money" ? s.money
        : sortKey === "p1d" ? (s.p1d ?? -Infinity)
        : sortKey === "intra" ? (s.intra ?? -Infinity)
        : sortKey === "usd" ? (s.usd ?? -Infinity)
        : s.up - s.down;
    return [...sectores].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      return dir * ((av as number) - (bv as number));
    });
  }, [sectores, sortKey, sortDir]);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "sector" ? "asc" : "desc");
    }
  };

  if (rows.length === 0) {
    return <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Sin datos.</p>;
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Resumen del mercado entero */}
      <div className="px-2 py-1 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2 text-[10px] font-mono">
        <span className="text-[var(--t-accent)] uppercase tracking-widest">Mercado</span>
        <span className="text-[var(--t-text-dim)]">$op {fmtMoney(total.money)}</span>
        <Pct v={total.p1d} suffix=" pond" />
        <span className="ml-auto tabular-nums">
          <span className="text-[var(--t-pos)]">{total.up}▲</span>
          {" / "}
          <span className="text-[var(--t-neg)]">{total.down}▼</span>
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-panel)]">
            <tr className="text-[var(--t-text-muted)]">
              <Th label="SECTOR" k="sector" sk={sortKey} sd={sortDir} on={toggle} align="left" />
              <Th label="$OP" k="money" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="%1D" k="p1d" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="INTRA" k="intra" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="USD" k="usd" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="▲/▼" k="breadth" sk={sortKey} sd={sortDir} on={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.sector} className="hover:bg-[var(--t-border)]">
                <td className="!px-2 truncate max-w-[120px]" title={s.sector}>{s.sector}</td>
                <td className="!px-2 text-right tabular-nums">{fmtMoney(s.money)}</td>
                <td className="!px-2 text-right"><Pct v={s.p1d} /></td>
                <td className="!px-2 text-right"><Pct v={s.intra} /></td>
                <td className="!px-2 text-right"><Pct v={s.usd} /></td>
                <td className="!px-2 text-right tabular-nums">
                  <span className="text-[var(--t-pos)]">{s.up}</span>
                  <span className="text-[var(--t-text-dim)]">/</span>
                  <span className="text-[var(--t-neg)]">{s.down}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pct({ v, suffix = "" }: { v: number | null; suffix?: string }) {
  if (v == null) return <span className="text-[var(--t-text-muted)]">--</span>;
  const c = v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
  return (
    <span className={`${c} tabular-nums`}>
      {v >= 0 ? "+" : ""}{v.toFixed(2)}%{suffix}
    </span>
  );
}

function Th({
  label, k, sk, sd, on, align = "right",
}: {
  label: string;
  k: SortKey;
  sk: SortKey;
  sd: "asc" | "desc";
  on: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sk === k;
  return (
    <th
      onClick={() => on(k)}
      className={`!px-2 cursor-pointer select-none ${align === "left" ? "text-left" : "text-right"} ${active ? "text-[var(--t-accent)]" : ""}`}
    >
      {label}{active ? (sd === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
