"use client";

import { useMemo, useState } from "react";

import { usePoll } from "@/lib/use-poll";
import {
  SISTEMAS_META,
  type PanelResp,
  type PanelRow,
  type Sistema,
  type Sistemas,
} from "@/lib/types-trading";

// Reglas de gestión (capa de gestión de la spec). En el v1 se MUESTRAN como
// checklist/guía — NO se enforquean sobre órdenes reales.
const REGLAS_GESTION: string[] = [
  "Add escalonado SOLO en S2 (fade) y S3 (scalp). En S1/S4/S5 promediar a la baja está prohibido: si va en contra, la tesis se invalidó.",
  "Definí antes de entrar: máximo de adds (2–3) y un stop total en USD. Si tocás el stop total, cerrás aunque 'tenga que volver'.",
  "Sizing por riesgo, no por monto: dimensioná para que el VaR en USD sea parejo entre trades (RKLB/SNDK tienen mucha más vol que un papel tranquilo).",
  "Shorts con time-stop duro: cubrir sí o sí antes del cierre (no se dejan a t0).",
  "Ventana muerta 13:30–15:45 ART: no abrir trades nuevos, solo gestionar lo abierto.",
  "Una invalidación por trade, escrita antes de entrar. Si no podés nombrarla, no entrás.",
];

const POLL_MS = 6_000;

const fmt = (v: number | null | undefined, dec = 2): string =>
  v == null ? "--" : v.toFixed(dec);
const fmtPct = (v: number | null | undefined): string =>
  v == null ? "--" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-[var(--t-text-muted)]";
  return v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

// ── chip de semáforo de un sistema ──────────────────────────────────────────
function semClasses(s: Sistema): string {
  if (s.estado === "INACTIVO")
    return "text-[var(--t-text-muted)] border-[var(--t-border)] opacity-50";
  if (s.estado === "VIGILAR")
    return "text-[#0b0b0b] bg-[#e0a000] border-[#e0a000]";
  // ACTIVO
  if (s.lado === "short")
    return "text-white bg-[var(--t-neg)] border-[var(--t-neg)]";
  return "text-white bg-[var(--t-pos)] border-[var(--t-pos)]";
}

function ladoFlecha(lado: Sistema["lado"]): string {
  if (lado === "long") return "▲";
  if (lado === "short") return "▼";
  return "";
}

function SemCell({ k, s }: { k: string; s: Sistema }) {
  return (
    <td className="!px-0.5 text-center" title={`${k}: ${s.estado}${s.lado ? ` ${s.lado}` : ""} — ${s.nota}`}>
      <span
        className={
          "inline-block min-w-[34px] px-1 py-0.5 text-[9px] font-bold border rounded-sm " +
          semClasses(s)
        }
      >
        {s.estado === "INACTIVO" ? "·" : `${k} ${ladoFlecha(s.lado)}`}
      </span>
    </td>
  );
}

export function TradingView({
  initialWatchlist,
  initialPanel,
}: {
  initialWatchlist: string[];
  initialPanel: PanelResp;
}) {
  const [watchlist, setWatchlist] = useState<string[]>(initialWatchlist);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const csv = watchlist.join(",");
  const endpoint = `/api/trading/panel?tickers=${encodeURIComponent(csv)}`;
  const { data, lastAt } = usePoll<PanelResp>(endpoint, initialPanel, POLL_MS, {
    fetchOnMount: true,
  });

  const rows = useMemo(() => data.rows ?? [], [data.rows]);
  const ccl = data.ccl;
  const selectedRow = useMemo(
    () => rows.find((r) => r.ticker === selected) ?? null,
    [rows, selected],
  );

  function addTicker() {
    const tk = input.trim().toUpperCase();
    if (!tk) return;
    if (!watchlist.includes(tk)) setWatchlist([...watchlist, tk]);
    setInput("");
  }

  function removeTicker(tk: string) {
    setWatchlist(watchlist.filter((t) => t !== tk));
    if (selected === tk) setSelected(null);
  }

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    try {
      const r = await fetch("/api/trading/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: watchlist }),
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { tickers: string[] };
      setWatchlist(j.tickers);
      setSavedMsg("Watchlist guardada ✓");
    } catch {
      setSavedMsg("No se pudo guardar ✗");
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(null), 3000);
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-2 gap-2 text-[var(--t-text)]">
      {/* ── barra superior ── */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <h1 className="text-sm font-bold tracking-wide">TRADING · Panel intradía CEDEARs</h1>
        <span className="text-[11px]">
          CCL{" "}
          <b>{ccl.value != null ? ccl.value.toFixed(2) : "--"}</b>{" "}
          <span className={pctClass(ccl.vs_1d_pct)}>{fmtPct(ccl.vs_1d_pct)}</span>
        </span>
        <span className="text-[10px] text-[var(--t-text-muted)] ml-auto">
          {lastAt > 0
            ? `actualizado ${new Date(lastAt).toLocaleTimeString("es-AR")}`
            : "cargando…"}
        </span>
      </div>

      {/* ── editor de watchlist ── */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTicker();
            }}
            placeholder="Agregar ticker…"
            className="w-32 px-2 py-1 text-[11px] bg-[var(--t-surface)] border border-[var(--t-border)] rounded-sm outline-none uppercase"
          />
          <button
            type="button"
            onClick={addTicker}
            className="px-2 py-1 text-[11px] font-semibold bg-[var(--t-surface-2)] border border-[var(--t-border)] rounded-sm hover:bg-[var(--t-panel)]"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {watchlist.map((tk) => (
            <span
              key={tk}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--t-surface-2)] border border-[var(--t-border)] rounded-sm"
            >
              {tk}
              <button
                type="button"
                onClick={() => removeTicker(tk)}
                className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)]"
              >
                ×
              </button>
            </span>
          ))}
          {watchlist.length === 0 && (
            <span className="text-[10px] text-[var(--t-text-muted)]">
              watchlist vacía — agregá un ticker
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-2 py-1 text-[11px] font-semibold bg-[#094293] text-white border border-[#062d66] rounded-sm hover:bg-[#0b50ad] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar watchlist"}
        </button>
        {savedMsg && <span className="text-[10px] text-[var(--t-text-muted)]">{savedMsg}</span>}
      </div>

      {/* ── tabla ── */}
      <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)] rounded-sm">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
            <tr className="text-[var(--t-text-muted)]">
              <th className="!px-1 text-left">Ticker</th>
              <th className="!px-1 text-right">Last</th>
              <th className="!px-1 text-right">%1D USD</th>
              <th className="!px-1 text-right">%vVWAP</th>
              <th className="!px-1 text-right">Pos</th>
              <th className="!px-1 text-right">gapADR</th>
              <th className="!px-1 text-right">Spr%</th>
              <th className="!px-1 text-center">Vol</th>
              {SISTEMAS_META.map((m) => (
                <th key={m.key} className="!px-0.5 text-center" title={m.desc}>
                  {m.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Row
                key={r.ticker ?? `row-${i}`}
                r={r}
                selected={r.ticker === selected}
                onSelect={() => setSelected(r.ticker === selected ? null : r.ticker)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center py-4 text-[var(--t-text-muted)]">
                  sin datos — agregá tickers a la watchlist (solo hay datos intradía en rueda)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── detalle del ticker seleccionado ── */}
      {selectedRow && <Detalle r={selectedRow} />}

      {/* ── leyenda + reglas de gestión ── */}
      <Leyenda />
    </div>
  );
}

function Row({
  r,
  selected,
  onSelect,
}: {
  r: PanelRow;
  selected: boolean;
  onSelect: () => void;
}) {
  if (r.error) {
    return (
      <tr className="border-t border-[var(--t-border)]">
        <td className="!px-1 font-semibold">{r.ticker}</td>
        <td colSpan={12} className="!px-1 text-[var(--t-text-muted)] italic">
          {r.error}
        </td>
      </tr>
    );
  }
  const sis = r.sistemas;
  return (
    <tr
      onClick={onSelect}
      className={
        "border-t border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface-2)] " +
        (selected ? "bg-[var(--t-surface-2)]" : "")
      }
    >
      <td className="!px-1 font-semibold">
        {r.ticker}
        {r.dia_volatil && <span className="ml-1 text-[8px] text-[#e0a000]">VOL</span>}
      </td>
      <td className="!px-1 text-right tabular-nums">{fmt(r.last)}</td>
      <td className={"!px-1 text-right tabular-nums " + pctClass(r.vs_1d_usd_pct)}>
        {fmtPct(r.vs_1d_usd_pct)}
      </td>
      <td className={"!px-1 text-right tabular-nums " + pctClass(r.pct_vs_vwap)}>
        {fmtPct(r.pct_vs_vwap)}
      </td>
      <td className="!px-1 text-right tabular-nums">{fmt(r.pos_rango, 0)}</td>
      <td className={"!px-1 text-right tabular-nums " + pctClass(r.gap_adr_pct)}>
        {fmtPct(r.gap_adr_pct)}
      </td>
      <td className="!px-1 text-right tabular-nums">{fmt(r.spread_pct)}</td>
      <td className="!px-1 text-center tabular-nums">{r.vwap_crosses ?? "--"}</td>
      {(["S1", "S2", "S3", "S4", "S5"] as (keyof Sistemas)[]).map((k) => (
        <SemCell key={k} k={k} s={sis[k]} />
      ))}
    </tr>
  );
}

function Detalle({ r }: { r: PanelRow }) {
  return (
    <div className="shrink-0 border border-[var(--t-border)] rounded-sm p-2 bg-[var(--t-surface)]">
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-[12px] font-bold">{r.ticker}</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">
          z {fmt(r.zscore)} · rango {fmt(r.rango_dia_pct)}% · volD {fmt(r.vol_diaria_pct)}% ·
          OR {r.estado_OR ?? "--"} · cruces {r.vwap_crosses ?? "--"} ·
          distR {fmt(r.dist_R_pct)}% · distS {fmt(r.dist_S_pct)}%
          {r.climax ? " · CLÍMAX" : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-1.5">
        {SISTEMAS_META.map((m) => {
          const s = r.sistemas[m.key];
          return (
            <div key={m.key} className="border border-[var(--t-border)] rounded-sm p-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-bold">
                  {m.key} {m.titulo}
                </span>
                <span
                  className={
                    "px-1 py-0.5 text-[9px] font-bold border rounded-sm " + semClasses(s)
                  }
                >
                  {s.estado} {ladoFlecha(s.lado)}
                </span>
              </div>
              <p className="text-[9px] text-[var(--t-text-muted)] leading-tight">{s.nota}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leyenda() {
  return (
    <details className="shrink-0 text-[10px] text-[var(--t-text-muted)]">
      <summary className="cursor-pointer font-semibold">
        Sistemas & reglas de gestión
      </summary>
      <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <div className="font-semibold mb-0.5">Los 5 sistemas</div>
          <ul className="space-y-0.5">
            {SISTEMAS_META.map((m) => (
              <li key={m.key}>
                <b>
                  {m.key} {m.titulo}:
                </b>{" "}
                {m.desc}
              </li>
            ))}
          </ul>
          <div className="mt-1">
            Semáforo:{" "}
            <span className="text-[var(--t-text-muted)]">· INACTIVO</span> ·{" "}
            <span className="text-[#e0a000]">VIGILAR</span> ·{" "}
            <span className="text-[var(--t-pos)]">ACTIVO ▲ long</span> /{" "}
            <span className="text-[var(--t-neg)]">ACTIVO ▼ short</span>
          </div>
        </div>
        <div>
          <div className="font-semibold mb-0.5">Capa de gestión (guía — no se enforquea)</div>
          <ul className="space-y-0.5 list-disc pl-4">
            {REGLAS_GESTION.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
