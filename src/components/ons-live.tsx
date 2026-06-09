"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePoll } from "@/lib/use-poll";
import { Empty, Panel, fmtHoraAR, fmtPrice, fmtVol } from "@/components/ui";

// ── Tipos (shape de /api/analitica/listar-curva?curva=on y /ons-calendario) ──
export interface ONRow {
  ticker: string;
  ticker_corto: string | null;
  emisor?: string | null;
  sector?: string | null; // "on_energia" | "on_finanzas" | "on_otros" | ...
  moneda?: string | null;
  fecha_vencimiento: string | null;
  meses_al_vto: number;
  ultimo_precio: number | null;
  tea: number | null; // fracción (0.06 = 6%)
  duration: number | null;
  paridad: number | null;
  total_nominals_dia: number | null;
}

export interface ONPago {
  fecha: string;
  ticker: string | null;
  emisor: string | null;
  sector: string | null;
  moneda: string | null;
  tasa_cupon: number | null; // fracción anual
  cupon: number | null;
  amortizacion: number | null;
  monto: number | null;
}

const POLL_MS = 10_000;

// Sector slug → label + color. Buckets que maneja el user en la DB.
const SECTORES: { slug: string; label: string; color: string }[] = [
  { slug: "on_energia", label: "ENERGÍA", color: "#10b981" },
  { slug: "on_finanzas", label: "FINANZAS", color: "#3b82f6" },
  { slug: "on_otros", label: "OTROS", color: "#f59e0b" },
];

function sectorMeta(slug?: string | null) {
  return (
    SECTORES.find((s) => s.slug === slug) ?? {
      slug: slug || "on_otros",
      label: (slug || "otros").replace(/^on_/, "").toUpperCase(),
      color: "#94a3b8",
    }
  );
}

function fmtFecha(iso?: string | null): string {
  if (!iso) return "--";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

function fmtPct1(n?: number | null): string {
  return n === null || n === undefined ? "--" : (n * 100).toFixed(1) + "%";
}

// ── Tabla de ONs cotizando, con tabs por sector ──
function ONsTable({ rows }: { rows: ONRow[] }) {
  const [vista, setVista] = useState<string>("todas");

  const sectoresPresentes = useMemo(() => {
    const set = new Set(rows.map((r) => sectorMeta(r.sector).slug));
    return SECTORES.filter((s) => set.has(s.slug));
  }, [rows]);

  const filtered = useMemo(() => {
    const f = vista === "todas" ? rows : rows.filter((r) => sectorMeta(r.sector).slug === vista);
    // Cotizando (con precio) primero, ordenadas por vencimiento.
    return [...f].sort((a, b) => {
      const pa = a.ultimo_precio ? 0 : 1;
      const pb = b.ultimo_precio ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.fecha_vencimiento || "9999").localeCompare(b.fecha_vencimiento || "9999");
    });
  }, [rows, vista]);

  if (!rows.length) return <Empty />;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex gap-1 mb-1 flex-wrap">
        <FilterBtn label="TODAS" active={vista === "todas"} onClick={() => setVista("todas")} />
        {sectoresPresentes.map((s) => (
          <FilterBtn
            key={s.slug}
            label={s.label}
            active={vista === s.slug}
            color={s.color}
            onClick={() => setVista(s.slug)}
          />
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Emisor</th>
              <th>Mon</th>
              <th>Vto</th>
              <th className="text-right">Last</th>
              <th className="text-right">TEA</th>
              <th className="text-right">Dur</th>
              <th className="text-right">Parid.</th>
              <th className="text-right">Vol Nom</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const sm = sectorMeta(r.sector);
              return (
                <tr key={r.ticker}>
                  <td className="font-semibold" style={{ color: sm.color }}>
                    {r.ticker_corto || r.ticker}
                  </td>
                  <td className="text-[var(--t-text-muted)]">{r.emisor || "--"}</td>
                  <td className="text-[var(--t-text-muted)]">{r.moneda || "--"}</td>
                  <td className="text-[var(--t-text-muted)] tabular-nums">
                    {fmtFecha(r.fecha_vencimiento)}
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {fmtPrice(r.ultimo_precio ?? undefined)}
                  </td>
                  <td className="text-right tabular-nums">{fmtPct1(r.tea)}</td>
                  <td className="text-right tabular-nums">
                    {r.duration != null ? r.duration.toFixed(2) : "--"}
                  </td>
                  <td className="text-right tabular-nums">
                    {r.paridad != null ? r.paridad.toFixed(1) : "--"}
                  </td>
                  <td className="text-right tabular-nums text-[#ffaa00]">
                    {fmtVol(r.total_nominals_dia ?? undefined)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[10px] text-[var(--t-text-muted)] text-right">
        {filtered.length} ON{filtered.length !== 1 ? "s" : ""} ·{" "}
        {filtered.filter((r) => r.ultimo_precio).length} cotizando
      </div>
    </div>
  );
}

function FilterBtn({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors " +
        (active
          ? "bg-white/15 text-white border-white/30"
          : "text-[var(--t-text-muted)] border-[var(--t-border)] hover:text-white")
      }
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {label}
    </button>
  );
}

// ── Curva: scatter TEA (y) vs duration (x), coloreado por sector ──
function ONsCurva({ rows }: { rows: ONRow[] }) {
  const porSector = useMemo(() => {
    const out: Record<string, { x: number; y: number; ticker: string; emisor: string }[]> = {};
    for (const r of rows) {
      if (r.duration == null || r.tea == null || !r.ultimo_precio) continue;
      const slug = sectorMeta(r.sector).slug;
      (out[slug] ??= []).push({
        x: r.duration,
        y: r.tea * 100,
        ticker: r.ticker_corto || r.ticker,
        emisor: r.emisor || "",
      });
    }
    return out;
  }, [rows]);

  const totalPts = Object.values(porSector).reduce((s, a) => s + a.length, 0);
  if (!totalPts) return <Empty />;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex gap-3 mb-1 flex-wrap">
        {SECTORES.map((s) => (
          <span key={s.slug} className="text-[10px] flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
            <span className="text-[var(--t-text-muted)]">{s.label}</span>
          </span>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
            <XAxis
              type="number"
              dataKey="x"
              name="Duration"
              tick={{ fontSize: 10, fill: "var(--t-text-muted)" }}
              label={{ value: "Duration (años)", position: "insideBottom", offset: -8, fontSize: 10, fill: "var(--t-text-muted)" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="TEA"
              unit="%"
              tick={{ fontSize: 10, fill: "var(--t-text-muted)" }}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as
                  | { ticker: string; emisor: string; x: number; y: number }
                  | undefined;
                if (!p) return null;
                return (
                  <div className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[11px]">
                    <div className="font-semibold">{p.ticker}</div>
                    <div className="text-[var(--t-text-muted)]">{p.emisor}</div>
                    <div>
                      TEA {p.y.toFixed(2)}% · Dur {p.x.toFixed(2)}
                    </div>
                  </div>
                );
              }}
            />
            {SECTORES.map((s) => (
              <Scatter key={s.slug} name={s.label} data={porSector[s.slug] || []} fill={s.color} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Calendario de pagos: próximos cupones/amortizaciones ──
function ONsCalendario({ pagos }: { pagos: ONPago[] }) {
  if (!pagos.length) return <Empty />;
  return (
    <div className="h-full min-h-0 overflow-auto">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Ticker</th>
            <th>Emisor</th>
            <th className="text-right">Cupón%</th>
            <th className="text-right">Cupón</th>
            <th className="text-right">Amort.</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map((p, i) => (
            <tr key={`${p.ticker}-${p.fecha}-${i}`}>
              <td className="tabular-nums">{fmtFecha(p.fecha)}</td>
              <td className="font-semibold" style={{ color: sectorMeta(p.sector).color }}>
                {p.ticker}
              </td>
              <td className="text-[var(--t-text-muted)]">{p.emisor || "--"}</td>
              <td className="text-right tabular-nums">{fmtPct1(p.tasa_cupon)}</td>
              <td className="text-right tabular-nums">{fmtPrice(p.cupon ?? undefined)}</td>
              <td className="text-right tabular-nums text-[var(--t-text-muted)]">
                {p.amortizacion ? fmtPrice(p.amortizacion) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista principal (2×2) ──
export function ONsLiveView({
  initialRows,
  calendario,
}: {
  initialRows: ONRow[];
  calendario: ONPago[];
}) {
  const initial = useMemo(() => initialRows, [initialRows]);
  const { data: rows, lastAt } = usePoll<ONRow[]>(
    "/api/analitica/listar-curva?curva=on&ordenar_por=vencimiento",
    initial,
    POLL_MS,
  );
  const sub = lastAt > 0 ? fmtHoraAR(lastAt) : "";

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="ONs" count={rows.length} sub={sub} expandable>
            <ONsTable rows={rows} />
          </Panel>
          <Panel title="CURVA TEA / DURATION" sub={sub} fill expandable>
            <ONsCurva rows={rows} />
          </Panel>
        </div>

        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="CALENDARIO DE PAGOS" count={calendario.length} expandable>
            <ONsCalendario pagos={calendario} />
          </Panel>
          <Panel title="—" fill>
            <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-xs">
              PRÓXIMAMENTE
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
