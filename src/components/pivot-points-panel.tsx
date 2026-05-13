"use client";

import { useEffect, useState } from "react";
import { TableHelp } from "./help-tooltip";
import type {
  PivotData,
  PivotFrame,
  QuantStats,
} from "@/lib/types-scanner";

const METRICAS_GLOSSARY = [
  { label: "ZONAS",              text: "Pivot Points (Floor Trader). Niveles de soporte/resistencia calculados sobre OHLC del período PREVIO cerrado. Si el precio supera R1, probable continuación; toca y rebota, posible reversión." },
  { label: "DIARIO/SEM/MES/AÑO", text: "Período del que se sacan H/L/C base. Diario = día hábil anterior. Semanal = lun-vie pasados. Mensual = mes calendario previo. Anual = año calendario previo." },
  { label: "R1/R2/R3",           text: "Resistencias arriba del PP. Niveles donde un precio en suba tiende a frenar." },
  { label: "PP",                 text: "Pivot Point = (H + L + C) / 3 del período previo. Eje del movimiento esperado." },
  { label: "S1/S2/S3",           text: "Soportes abajo del PP. Niveles donde un precio en baja tiende a rebotar." },
  { label: "VOL & BETA",         text: "Estadística rolling sobre 60 ruedas hábiles vs SPY (mercado US) y QQQ (Nasdaq tech)." },
  { label: "Beta",               text: "Sensibilidad al benchmark. β=1 se mueve igual; β>1 más volátil que el bench; β<1 más defensivo. β = cov(activo, bench) / var(bench)." },
  { label: "Alpha (anual)",      text: "Retorno extra anualizado por encima de lo que explicaría el beta. α > 0 = outperformance idiosincrática del activo." },
  { label: "Correlación",        text: "Pearson entre retornos diarios. 1 = se mueven juntos; 0 = independientes; −1 = opuestos. Junto al beta da la imagen completa." },
  { label: "Vol Realizada",      text: "Volatilidad histórica anualizada: stdev(retornos) × √252. Cuánto se movió realmente. Sirve para sizing." },
];

/**
 * Panel MÉTRICAS del Scanner. 2 niveles de tabs:
 *
 *   Main:    ZONAS (pivot points)  |  VOLATILIDAD & BETA
 *   Sub:     DIARIO / SEMANAL / MENSUAL / ANUAL   (solo si Main = ZONAS)
 *
 * Todo se computa sobre Trading.PreciosAcciones (USD del underlying).
 * Re-fetcha cuando cambia el ticker. STATS lazy (solo se pide cuando se
 * selecciona el main tab VOLATILIDAD & BETA).
 */

type MainTab = "zonas" | "stats";
type SubTab  = "diario" | "semanal" | "mensual" | "anual";

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: "zonas", label: "ZONAS" },
  { key: "stats", label: "VOLATILIDAD & BETA" },
];

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "diario",  label: "DIARIO"  },
  { key: "semanal", label: "SEMANAL" },
  { key: "mensual", label: "MENSUAL" },
  { key: "anual",   label: "ANUAL"   },
];

export function PivotPointsPanel({ ticker }: { ticker: string | null }) {
  const [pivot, setPivot] = useState<PivotData | null>(null);
  const [stats, setStats] = useState<QuantStats | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("zonas");
  const [subTab,  setSubTab]  = useState<SubTab>("diario");
  const [loading, setLoading] = useState(false);

  // Fetch pivots cuando cambia el ticker — siempre (los pivots se ven
  // por default y el sub-tab cambia sin re-fetch).
  useEffect(() => {
    if (!ticker) {
      setPivot(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/scanner/pivot/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) {
          setPivot(j as PivotData | null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setPivot(null);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [ticker]);

  // Fetch stats lazy — solo cuando se activa el tab VOL & BETA.
  useEffect(() => {
    if (!ticker || mainTab !== "stats") return;
    let alive = true;
    fetch(`/api/scanner/quant/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setStats(j as QuantStats | null);
      })
      .catch(() => {
        if (alive) setStats(null);
      });
    return () => {
      alive = false;
    };
  }, [ticker, mainTab]);

  if (!ticker) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Seleccioná un ticker en la tabla
      </p>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 text-[10px]">
      {/* Main tabs */}
      <div className="flex items-center gap-1 mb-1 shrink-0">
        {MAIN_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              mainTab === key
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {label}
          </button>
        ))}
        <TableHelp entries={METRICAS_GLOSSARY} align="left" />
        <span className="ml-auto text-[#808080]">
          {ticker} · last{" "}
          <span className="text-[#d0d0d0] font-mono">
            {pivot?.last != null ? `$${pivot.last.toFixed(2)}` : "--"}
          </span>
        </span>
      </div>

      {/* Sub tabs — solo en ZONAS */}
      {mainTab === "zonas" && (
        <div className="flex items-center gap-1 mb-2 shrink-0 pl-2 border-l border-[#1a1a1a]">
          {SUB_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              className={`px-1.5 py-0.5 text-[9px] tracking-wide border transition-colors ${
                subTab === key
                  ? "text-[#ff9900] border-[#ff9900]/40"
                  : "text-[#555555] border-transparent hover:text-[#ff9900]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Contenido */}
      {loading && mainTab === "zonas" ? (
        <p className="text-[#555555] text-xs py-4 text-center">Cargando…</p>
      ) : mainTab === "stats" ? (
        <StatsView stats={stats} />
      ) : (
        <PivotView
          frame={pivot?.frames[subTab] ?? null}
          last={pivot?.last ?? null}
          tabLabel={subTab}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subvistas
// ─────────────────────────────────────────────────────────────────────

function PivotView({
  frame,
  last,
  tabLabel,
}: {
  frame: PivotFrame | null;
  last: number | null;
  tabLabel: string;
}) {
  if (!frame) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Sin data para {tabLabel.toUpperCase()} (probable: ticker arrancó después del rango)
      </p>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="text-[#555555] text-[9px] mb-1 tabular-nums">
        Rango: {fmtFecha(frame.fecha_desde)} → {fmtFecha(frame.fecha_hasta)} ({frame.n_velas} ruedas) ·
        H={frame.h.toFixed(2)} L={frame.l.toFixed(2)} C={frame.c.toFixed(2)}
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-[#707070]">
            <th className="!px-1 text-left">NIVEL</th>
            <th className="!px-1 text-right">PRECIO</th>
            <th className="!px-1 text-right">vs LAST</th>
          </tr>
        </thead>
        <tbody>
          <Row label="R3" value={frame.levels.r3} last={last} color="resistance" />
          <Row label="R2" value={frame.levels.r2} last={last} color="resistance" />
          <Row label="R1" value={frame.levels.r1} last={last} color="resistance" />
          <Row label="PP" value={frame.levels.pp} last={last} color="pivot" />
          <Row label="S1" value={frame.levels.s1} last={last} color="support" />
          <Row label="S2" value={frame.levels.s2} last={last} color="support" />
          <Row label="S3" value={frame.levels.s3} last={last} color="support" />
        </tbody>
      </table>
    </div>
  );
}

function StatsView({ stats }: { stats: QuantStats | null }) {
  if (!stats) {
    return <p className="text-[#555555] text-xs py-4 text-center">Cargando stats…</p>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="text-[#555555] text-[9px] mb-1">
        Window: 60 ruedas hábiles · n={stats.n_observations}
      </div>
      <table className="w-full mb-3">
        <thead>
          <tr className="text-[#707070]">
            <th className="!px-1 text-left">MÉTRICA</th>
            <th className="!px-1 text-right">vs SPY</th>
            <th className="!px-1 text-right">vs QQQ</th>
          </tr>
        </thead>
        <tbody>
          <StatRow label="Beta"          spy={stats.beta.spy}  qqq={stats.beta.qqq}  fmt="num" />
          <StatRow label="Alpha (anual)" spy={stats.alpha.spy} qqq={stats.alpha.qqq} fmt="pct" />
          <StatRow label="Correlación"   spy={stats.corr.spy}  qqq={stats.corr.qqq}  fmt="num" />
        </tbody>
      </table>
      <table className="w-full">
        <thead>
          <tr className="text-[#707070]">
            <th className="!px-1 text-left">VOL REALIZADA (anual)</th>
            <th className="!px-1 text-right">VALOR</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="!px-1 text-[#808080]">30 días</td>
            <td className="!px-1 text-right text-[#d0d0d0] tabular-nums font-semibold">
              {stats.vol.d30 != null ? `${(stats.vol.d30 * 100).toFixed(1)}%` : "--"}
            </td>
          </tr>
          <tr>
            <td className="!px-1 text-[#808080]">60 días</td>
            <td className="!px-1 text-right text-[#d0d0d0] tabular-nums font-semibold">
              {stats.vol.d60 != null ? `${(stats.vol.d60 * 100).toFixed(1)}%` : "--"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Row({
  label,
  value,
  last,
  color,
}: {
  label: string;
  value: number;
  last: number | null;
  color: "resistance" | "pivot" | "support";
}) {
  const dist = last !== null && last > 0 ? ((last / value) - 1) * 100 : null;
  const labelColor =
    color === "resistance"
      ? "text-[#ff3333]"
      : color === "support"
      ? "text-[#00cc66]"
      : "text-[#ff9900]";
  return (
    <tr>
      <td className={`!px-1 font-semibold ${labelColor}`}>{label}</td>
      <td className="!px-1 text-right tabular-nums font-semibold">
        {value.toFixed(2)}
      </td>
      <td
        className={`!px-1 text-right tabular-nums ${
          dist === null
            ? "text-[#555555]"
            : dist >= 0
            ? "text-[#00cc66]"
            : "text-[#ff3333]"
        }`}
      >
        {dist !== null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%` : "--"}
      </td>
    </tr>
  );
}

function StatRow({
  label,
  spy,
  qqq,
  fmt,
}: {
  label: string;
  spy: number | null;
  qqq: number | null;
  fmt: "num" | "pct";
}) {
  const format = (v: number | null) => {
    if (v == null) return "--";
    if (fmt === "pct") return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
    return v.toFixed(2);
  };
  const colorFor = (v: number | null) => {
    if (v == null) return "text-[#555555]";
    if (fmt === "pct") return v >= 0 ? "text-[#00cc66]" : "text-[#ff3333]";
    return "text-[#d0d0d0]";
  };
  return (
    <tr>
      <td className="!px-1 text-[#808080]">{label}</td>
      <td className={`!px-1 text-right tabular-nums font-semibold ${colorFor(spy)}`}>
        {format(spy)}
      </td>
      <td className={`!px-1 text-right tabular-nums font-semibold ${colorFor(qqq)}`}>
        {format(qqq)}
      </td>
    </tr>
  );
}

function fmtFecha(iso: string): string {
  const s = iso.slice(0, 10);
  if (s.length !== 10) return s;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
}
