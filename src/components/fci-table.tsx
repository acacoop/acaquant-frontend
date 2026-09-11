"use client";

import { Fragment, useMemo, useState } from "react";
import type { FciFila } from "@/lib/types-fci";

/**
 * Tabla de fondos — el lado izquierdo de /fci.
 *
 * Agrupada por CLASE DE ACTIVO (la de Manager → ASSETS) cuando no hay una
 * clase filtrada: cada grupo lleva su cabecera y el ranking se hace ADENTRO
 * del grupo con la columna elegida — como se lee el informe semanal (1°, 2°,
 * 3° por clase, por 30D). Click en un header cambia la columna; segundo click
 * invierte. Default: 30D desc.
 *
 * Columnas fijas, las del informe: FONDO · GERENTE · VCP · 1D · WTD · MTD · YTD
 * · 30D · TNA 30D. Las otras ventanas (7D, 90D, 365D) están en la ficha.
 */
type SortKey =
  | "nombre" | "gerente" | "vcp"
  | "r_1d" | "r_wtd" | "r_mtd" | "r_ytd" | "r_30d" | "tna_30d";
type SortDir = "asc" | "desc";

const COLS: { key: SortKey; label: string; title: string; dec: number }[] = [
  { key: "r_1d",   label: "1D",  title: "Rendimiento directo vs la rueda anterior con VCP", dec: 2 },
  { key: "r_wtd",  label: "WTD", title: "Desde el último VCP antes del lunes de esta semana (el viernes)", dec: 2 },
  { key: "r_mtd",  label: "MTD", title: "Desde el último VCP del mes anterior", dec: 2 },
  { key: "r_ytd",  label: "YTD", title: "Desde el último VCP del año anterior", dec: 1 },
  { key: "r_30d",  label: "30D", title: "Rendimiento directo en 30 días corridos", dec: 2 },
];

export const SIN_CLASE = "(SIN CLASE)";

export function pct(v: number | null | undefined, dec = 2): string {
  if (v == null) return "—";
  const s = (v * 100).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function fmtVcp(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function FciTable({ filas, agrupar, seleccionada, onSelect }: {
  filas: FciFila[];
  agrupar: boolean;
  seleccionada: number | null;
  onSelect: (fciId: number) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("r_30d");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "nombre" || key === "gerente" ? "asc" : "desc"); }
  }

  const grupos = useMemo(() => {
    const cmp = (a: FciFila, b: FciFila) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;            // nulls SIEMPRE al final
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    };
    if (!agrupar) return [{ nombre: null as string | null, filas: [...filas].sort(cmp) }];
    const orden: string[] = [];
    const por = new Map<string, FciFila[]>();
    for (const f of filas) {
      const k = f.categoria ?? SIN_CLASE;
      if (!por.has(k)) { por.set(k, []); orden.push(k); }
      por.get(k)!.push(f);
    }
    return orden.map((k) => ({ nombre: k, filas: por.get(k)!.sort(cmp) }));
  }, [filas, sortKey, sortDir, agrupar]);

  const nCols = 5 + COLS.length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
            <tr className="text-[var(--t-text-muted)]">
              <th className="!px-1 text-left w-5">#</th>
              <Th label="FONDO"   col="nombre"  align="left"  {...{ sortKey, sortDir, toggleSort }} />
              <Th label="GERENTE" col="gerente" align="left"  {...{ sortKey, sortDir, toggleSort }} />
              <Th label="VCP" col="vcp" align="right" title="Último valor de cuotaparte (la fecha y la fuente, al pasar el mouse por la fila)" {...{ sortKey, sortDir, toggleSort }} />
              {COLS.map((c) => (
                <Th key={c.key} label={c.label} col={c.key} align="right" title={c.title} {...{ sortKey, sortDir, toggleSort }} />
              ))}
              <Th label="TNA 30D" col="tna_30d" align="right" title="30D × 365 / 30 — la TNA «según 30D» del informe" {...{ sortKey, sortDir, toggleSort }} />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={nCols} className="text-[var(--t-text-muted)] text-xs py-4 text-center">Ningún fondo coincide con los filtros</td></tr>
            ) : grupos.map((g) => (
              <Fragment key={g.nombre ?? "_"}>
                {g.nombre !== null && (
                  <tr className="bg-[var(--t-accent)]/10">
                    <td colSpan={nCols} className="!px-1 py-0.5 text-[9px] font-semibold tracking-wider text-[var(--t-accent)] uppercase">
                      {g.nombre} <span className="text-[var(--t-text-muted)] font-normal">({g.filas.length})</span>
                    </td>
                  </tr>
                )}
                {g.filas.map((r, i) => {
                  const sel = r.fci_id === seleccionada;
                  return (
                    <tr
                      key={r.fci_id}
                      onClick={() => onSelect(r.fci_id)}
                      title={r.fecha ? `VCP del ${r.fecha} (${r.fuente})${r.simbolo_primary ? ` · ${r.simbolo_primary.trim()}` : " · sin símbolo Primary"}` : "sin VCP todavía"}
                      className={`cursor-pointer ${sel ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}
                    >
                      <td className="!px-1 text-[var(--t-text-muted)] tabular-nums">{i + 1}</td>
                      <td className="!px-1 truncate max-w-[220px]">
                        <span className="text-[var(--t-text)]">{r.nombre}</span>
                        {r.moneda === "USD" && <span className="ml-1 text-[8px] text-[var(--t-accent)]">USD</span>}
                        {r.en_tenencia && <span className="ml-1 text-[8px] text-[var(--t-text-muted)]" title="La ALyC lo tiene en tenencia (linkeado a Manager → ASSETS)">●</span>}
                        {!r.simbolo_primary && <span className="ml-1 text-[8px] text-[var(--t-text-muted)]" title="Bilateral: no está en Primary, el VCP sale de la tenencia o de carga manual">BIL</span>}
                      </td>
                      <td className="!px-1 text-[var(--t-text-dim)] truncate max-w-[90px]">{r.gerente ?? "—"}</td>
                      <td className="!px-1 text-right tabular-nums">{fmtVcp(r.vcp)}</td>
                      {COLS.map((c) => <Pct key={c.key} v={r[c.key] as number | null} dec={c.dec} />)}
                      <td className="!px-1 text-right tabular-nums font-semibold">{pct(r.tna_30d, 1)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pct({ v, dec }: { v: number | null; dec: number }) {
  return (
    <td className={`!px-1 text-right tabular-nums ${
      v == null ? "text-[var(--t-text-muted)]" : v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
    }`}>
      {pct(v, dec)}
    </td>
  );
}

function Th({ label, col, sortKey, sortDir, toggleSort, align, title }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  toggleSort: (c: SortKey) => void; align: "left" | "right"; title?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => toggleSort(col)}
      className={`!px-1 cursor-pointer select-none hover:text-[var(--t-accent)] transition-colors whitespace-nowrap ${
        align === "left" ? "text-left" : "text-right"
      } ${active ? "text-[var(--t-accent)]" : ""}`}
      title={title ?? "Click para ordenar"}
    >
      {label}<span className="text-[8px]">{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</span>
    </th>
  );
}
