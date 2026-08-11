"use client";

import { useMemo, useState } from "react";
import type { CedearScannerRow } from "@/lib/types-scanner";
import { fmtMoney } from "@/lib/fmt-money";
import { medir } from "@/lib/perf";
import { PivotPointsPanel } from "./pivot-points-panel";
import { RetornosChart } from "./retornos-chart";

/**
 * Panel MÉTRICAS del Scanner — 3 tabs:
 *   PULSO    → pulso del mercado por RUBRO (default). Retornos 1D/WTD/15R/MTD/YTD del
 *              ADR (USD del subyacente) ponderados por volumen USD del ADR + breadth
 *              (▲/▼). Real-time: se recalcula con cada poll de la tabla.
 *   PIVOTS   → pivot points / zonas / volatilidad del ticker elegido.
 *   RETORNOS → el retorno DIARIO del ticker elegido a lo largo del tiempo (% vs
 *              fecha). PULSO responde "cómo viene el mercado hoy"; esto responde
 *              "cómo se movió ESTE papel, día por día".
 *
 * Filtro "A.I" (toggle en el header del Pulso): cuando está activo, el Pulso muestra
 * SOLO los rubros del ecosistema IA (filtra rows a es_ia=true ANTES de agrupar).
 * es_ia NO es una columna — es solo este filtro general (pedido explícito).
 *
 * Acá NO se usan más métricas del CEDEAR (ARS): todo sale del ADR del subyacente.
 * Los retornos vienen de adr_* (1D/WTD/MTD/YTD) y el PESO es el volumen USD del ADR
 * (adr_dollar_vol = cierre × volumen del último EOD) — la "size" pura del subyacente.
 * Sumar volumen nominal mezclaría peras con manzanas; el volumen en USD es comparable.
 *
 * Por qué agrupar por RUBRO y no por sector: el rubro (mercado.cedears) es la
 * clasificación de negocio nueva, más granular que el sector legacy del master.
 */

type Tab = "pulso" | "pivots" | "retornos";

// Estos dos campos viven en mercado.cedears (columnas) y los expone el path SQL
// del scanner (api/services/scanner_sql.py). El tipo CedearScannerRow en
// src/lib/types-scanner.ts ya los declara opcionales; acá los leemos vía un
// helper para no castear en cada uso. Si el path Mongo (legacy) no los trae,
// quedan null/undefined y todo cae al grupo "—" sin romper.
type RowConClasificacion = CedearScannerRow & {
  rubro?: string | null;
  es_ia?: boolean | null;
};

const SIN_RUBRO = "—";

export function rubroDe(r: CedearScannerRow): string {
  const v = (r as RowConClasificacion).rubro;
  return v && v.trim() ? v : SIN_RUBRO;
}

function esIA(r: CedearScannerRow): boolean {
  return (r as RowConClasificacion).es_ia === true;
}

export function MetricasPanel({
  rows, ticker, selectedRubro = null, onRubroSelect,
}: {
  rows: CedearScannerRow[];
  ticker: string | null;
  selectedRubro?: string | null;
  onRubroSelect?: (rubro: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>("pulso");
  const [soloIA, setSoloIA] = useState(false);

  // Filtro general "A.I": cuando está activo, el Pulso muestra SOLO los rubros del
  // ecosistema IA (filtra rows a es_ia antes de agrupar). No afecta PIVOTS (por ticker).
  const rowsFiltradas = useMemo(
    () => (soloIA ? rows.filter(esIA) : rows),
    [rows, soloIA],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-1 shrink-0">
        {([["pulso", "PULSO"], ["pivots", "PIVOTS / VOL"],
           ["retornos", "RETORNOS"]] as [Tab, string][]).map(([k, l]) => (
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
        {tab === "pulso" && (
          <button
            onClick={() => setSoloIA((v) => !v)}
            title="Mostrar solo los rubros del ecosistema IA (es_ia)"
            className={`ml-auto px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              soloIA
                ? "bg-[#5fb3d4] text-black border-[#5fb3d4]"
                : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#5fb3d4] hover:border-[#5fb3d4]"
            }`}
          >
            A.I
          </button>
        )}
        {(tab === "pivots" || tab === "retornos") && (
          <span className="ml-auto text-[10px] text-[var(--t-text-dim)]">{ticker || "—"}</span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "pulso" && (
          <PulsoRubrosPanel rows={rowsFiltradas} selected={selectedRubro} onSelect={onRubroSelect} />
        )}
        {tab === "pivots" && <PivotPointsPanel ticker={ticker} />}
        {tab === "retornos" && <RetornosChart ticker={ticker} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PULSO por rubro
// ─────────────────────────────────────────────────────────────────────

type SortKey = "rubro" | "vol" | "p1d" | "wtd" | "r15" | "mtd" | "ytd" | "breadth";

interface RubroAgg {
  rubro: string;
  vol: number;
  p1d: number | null;
  wtd: number | null;
  r15: number | null;
  mtd: number | null;
  ytd: number | null;
  up: number;
  down: number;
}

// Promedio ponderado por volumen USD del ADR. Si el rubro no tiene volumen (w=0),
// cae a promedio simple para no dejar la fila vacía.
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

function PulsoRubrosPanel({
  rows, selected = null, onSelect,
}: {
  rows: CedearScannerRow[];
  selected?: string | null;
  onSelect?: (rubro: string | null) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("vol");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { rubros, total } = useMemo(() => medir("pulso agregado por rubro", () => {
    const byRubro: Record<string, CedearScannerRow[]> = {};
    for (const r of rows) {
      (byRubro[rubroDe(r)] ??= []).push(r);
    }
    const rubros: RubroAgg[] = Object.entries(byRubro).map(([rubro, rs]) => {
      let up = 0, down = 0;
      for (const r of rs) {
        if (r.adr_vs_1d_pct != null && r.adr_vs_1d_pct > 0) up++;
        else if (r.adr_vs_1d_pct != null && r.adr_vs_1d_pct < 0) down++;
      }
      return {
        rubro,
        vol: rs.reduce((a, r) => a + (r.adr_dollar_vol || 0), 0),
        p1d: wavg(rs.map((r) => ({ pct: r.adr_vs_1d_pct, w: r.adr_dollar_vol || 0 }))),
        wtd: wavg(rs.map((r) => ({ pct: r.adr_ret_wtd_pct, w: r.adr_dollar_vol || 0 }))),
        r15: wavg(rs.map((r) => ({ pct: r.adr_ret_15r_pct, w: r.adr_dollar_vol || 0 }))),
        mtd: wavg(rs.map((r) => ({ pct: r.adr_ret_mtd_pct, w: r.adr_dollar_vol || 0 }))),
        ytd: wavg(rs.map((r) => ({ pct: r.adr_ret_ytd_pct, w: r.adr_dollar_vol || 0 }))),
        up,
        down,
      };
    });
    const total = {
      vol: rows.reduce((a, r) => a + (r.adr_dollar_vol || 0), 0),
      p1d: wavg(rows.map((r) => ({ pct: r.adr_vs_1d_pct, w: r.adr_dollar_vol || 0 }))),
      up: rows.filter((r) => r.adr_vs_1d_pct != null && r.adr_vs_1d_pct > 0).length,
      down: rows.filter((r) => r.adr_vs_1d_pct != null && r.adr_vs_1d_pct < 0).length,
    };
    return { rubros, total };
  }), [rows]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (s: RubroAgg): number | string =>
      sortKey === "rubro" ? s.rubro
        : sortKey === "vol" ? s.vol
        : sortKey === "p1d" ? (s.p1d ?? -Infinity)
        : sortKey === "wtd" ? (s.wtd ?? -Infinity)
        : sortKey === "r15" ? (s.r15 ?? -Infinity)
        : sortKey === "mtd" ? (s.mtd ?? -Infinity)
        : sortKey === "ytd" ? (s.ytd ?? -Infinity)
        : s.up - s.down;
    return [...rubros].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
      return dir * ((av as number) - (bv as number));
    });
  }, [rubros, sortKey, sortDir]);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "rubro" ? "asc" : "desc");
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
        <span className="text-[var(--t-text-dim)]">$vol {fmtMoney(total.vol)}</span>
        <Pct v={total.p1d} suffix=" 1D" />
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
              <Th label="RUBRO" k="rubro" sk={sortKey} sd={sortDir} on={toggle} align="left" />
              <Th label="$VOL" k="vol" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="1D" k="p1d" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="WTD" k="wtd" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="15R" k="r15" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="MTD" k="mtd" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="YTD" k="ytd" sk={sortKey} sd={sortDir} on={toggle} />
              <Th label="▲/▼" k="breadth" sk={sortKey} sd={sortDir} on={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.rubro}
                onClick={() => onSelect?.(s.rubro === selected ? null : s.rubro)}
                title={`Filtrar la tabla a ${s.rubro}${s.rubro === selected ? " (click para quitar)" : ""}`}
                className={`cursor-pointer ${
                  s.rubro === selected
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                    : "hover:bg-[var(--t-border)]"
                }`}
              >
                <td className="!px-2 truncate max-w-[120px]" title={s.rubro}>{s.rubro}</td>
                <td className="!px-2 text-right tabular-nums">{fmtMoney(s.vol)}</td>
                <td className="!px-2 text-right"><Pct v={s.p1d} /></td>
                <td className="!px-2 text-right"><Pct v={s.wtd} /></td>
                <td className="!px-2 text-right"><Pct v={s.r15} /></td>
                <td className="!px-2 text-right"><Pct v={s.mtd} /></td>
                <td className="!px-2 text-right"><Pct v={s.ytd} /></td>
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
