"use client";

import { useMemo, useState } from "react";

import { IaVistaPanel } from "@/components/ia-vista-panel";
import { usePoll } from "@/lib/use-poll";

// TRADING → REUTERS: tablero live de los subyacentes US suscriptos (feed de la
// PC de oficina), a pantalla completa. Toda columna ordena con click: números
// de mayor a menor (2do click invierte), texto de A a Z. La columna CCL está
// modelada pero PENDIENTE: precio_cedear_ars × ratio / precio_adr_usd.
const POLL_MS = 5_000;

interface ReutersRow {
  ticker: string;
  ric: string | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volumen: number | null;
  var_pct: number | null;
  var_neta: number | null;
  pre_last: number | null;
  pre_var_pct: number | null;
  ah_last: number | null;
  ah_var_pct: number | null;
  ret_5d: number | null;
  ret_wtd: number | null;
  ret_mtd: number | null;
  ret_qtd: number | null;
  ret_ytd: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_1y: number | null;
  ret_5y: number | null;
  ratio: number | null;
  ccl: number | null;
  updated_at: string | null;
}

type SortKey = keyof ReutersRow;
const TEXT_KEYS: SortKey[] = ["ticker", "ric", "updated_at"];

const RETORNOS: { key: SortKey; label: string }[] = [
  { key: "ret_5d", label: "5D" },
  { key: "ret_wtd", label: "WTD" },
  { key: "ret_mtd", label: "MTD" },
  { key: "ret_qtd", label: "QTD" },
  { key: "ret_ytd", label: "YTD" },
  { key: "ret_1m", label: "1M" },
  { key: "ret_3m", label: "3M" },
  { key: "ret_1y", label: "1A" },
  { key: "ret_5y", label: "5A" },
];

function fmt(n: number | null, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtVol(n: number | null): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null, dec = 1): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
}

function hora(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-AR", { hour12: false });
}

function varClass(v: number | null): string {
  if (v === null || v === undefined || !isFinite(v) || v === 0) return "text-[var(--t-text-dim)]";
  return v > 0 ? "text-green-400" : "text-red-400";
}

export function ReutersView() {
  const { data: rows } = usePoll<ReutersRow[]>(
    "/api/trading/reuters", [], POLL_MS, { fetchOnMount: true },
  );
  // dir: -1 = descendente (default numérico), 1 = ascendente (default texto)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  const clickSort = (key: SortKey) => {
    setSort((s) => {
      if (s?.key === key) return { key, dir: s.dir === 1 ? -1 : 1 };
      return { key, dir: TEXT_KEYS.includes(key) ? 1 : -1 };
    });
  };

  const filas = useMemo(() => {
    const base = Array.isArray(rows) ? [...rows] : [];
    if (!sort) return base;
    const { key, dir } = sort;
    return base.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      // nulls SIEMPRE al final, sin importar la dirección
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sort]);

  const Th = ({ k, label, title, align = "right" }: { k: SortKey; label: string; title?: string; align?: "left" | "right" }) => (
    <th
      onClick={() => clickSort(k)}
      title={title ?? "Click para ordenar"}
      className={`px-2 py-2 cursor-pointer select-none hover:text-[var(--t-accent)] whitespace-nowrap ${align === "left" ? "text-left" : "text-right"} ${sort?.key === k ? "text-[var(--t-accent)]" : ""}`}
    >
      {label}
      {sort?.key === k && <span className="ml-0.5">{sort.dir === -1 ? "▼" : "▲"}</span>}
    </th>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">REUTERS</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">
          {filas.length} activo{filas.length === 1 ? "" : "s"} suscripto{filas.length === 1 ? "" : "s"}
        </span>
        {sort && (
          <button
            onClick={() => setSort(null)}
            className="text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5"
            title="Volver al orden original"
          >
            ✕ orden
          </button>
        )}
        <span className="ml-auto text-[9px] text-[var(--t-text-dim)]">live · 5s</span>
        {/* Copiloto IA de la vista REUTERS (oculto sin módulos ia+trading) */}
        <IaVistaPanel vista="reuters" />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {filas.length === 0 ? (
          <div className="p-4 text-[11px] text-[var(--t-text-muted)]">
            Sin activos suscriptos todavía — prendé el feed en la PC de la oficina
            y cargá los códigos en Manager → Títulos → Renta Variable.
          </div>
        ) : (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
              <tr className="text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <Th k="ticker" label="ACTIVO" align="left" />
                <Th k="last" label="ÚLTIMO" />
                <Th k="bid" label="BID" />
                <Th k="ask" label="ASK" />
                <Th k="open" label="APERTURA" />
                <Th k="high" label="MÁX" />
                <Th k="low" label="MÍN" />
                <Th k="prev_close" label="CIERRE ANT." />
                <Th k="volumen" label="VOLUMEN" />
                <Th k="var_pct" label="VAR %" />
                <Th k="var_neta" label="VAR NETA" />
                <Th k="pre_last" label="PRE MKT" title="Precio del pre market (var. contra el cierre anterior)" />
                <Th k="ah_last" label="AFTER HS" title="Precio del after market (var. contra el cierre de hoy)" />
                {RETORNOS.map((r) => (
                  <Th key={r.key} k={r.key} label={r.label} title={`Retorno ${r.label} (al cierre de la rueda anterior)`} />
                ))}
                <Th k="ratio" label="RATIO" title="Ratio de conversión del CEDEAR (CEDEARs por acción)" />
                <Th k="ccl" label="CCL" title="CCL implícito del activo — próximamente" />
                <Th k="updated_at" label="HORA" />
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.ticker} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="text-[var(--t-accent)] font-semibold">{r.ticker}</span>
                    {r.ric && <span className="ml-1.5 text-[9px] text-[var(--t-text-dim)]">{r.ric}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text)] font-semibold">{fmt(r.last)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmt(r.bid)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmt(r.ask)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.open)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.high)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.low)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.prev_close)}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmtVol(r.volumen)}</td>
                  <td className={`px-2 py-1.5 text-right ${varClass(r.var_pct)}`}>{fmtPct(r.var_pct, 2)}</td>
                  <td className={`px-2 py-1.5 text-right ${varClass(r.var_neta)}`}>
                    {r.var_neta === null ? "—" : `${r.var_neta > 0 ? "+" : ""}${fmt(r.var_neta)}`}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className="text-[var(--t-text)]">{fmt(r.pre_last)}</span>
                    {r.pre_var_pct !== null && (
                      <span className={`ml-1 text-[9px] ${varClass(r.pre_var_pct)}`}>{fmtPct(r.pre_var_pct)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className="text-[var(--t-text)]">{fmt(r.ah_last)}</span>
                    {r.ah_var_pct !== null && (
                      <span className={`ml-1 text-[9px] ${varClass(r.ah_var_pct)}`}>{fmtPct(r.ah_var_pct)}</span>
                    )}
                  </td>
                  {RETORNOS.map((col) => {
                    const v = r[col.key] as number | null;
                    return (
                      <td key={col.key} className={`px-2 py-1.5 text-right ${varClass(v)}`}>{fmtPct(v)}</td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">
                    {r.ratio === null ? "—" : `${fmt(r.ratio, 0)}:1`}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">—</td>
                  <td className="px-3 py-1.5 text-right text-[var(--t-text-dim)] whitespace-nowrap">{hora(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
