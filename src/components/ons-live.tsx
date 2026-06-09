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
  sector?: string | null; // "on_energia" | "on_finanzas" | "on_otros" | "on"
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
  tasa_cupon: number | null; // fracción anual (NO es el pago de este flujo)
  cupon: number | null; // cupón NOMINAL del pago (por 100 VN)
  amortizacion: number | null;
  monto: number | null;
}

const POLL_MS = 10_000;

// Buckets de sector. El no-clasificado (curva "on" pelada) cae en OTROS.
type Bucket = "energia" | "finanzas" | "otros";
const TABS: { key: Bucket; label: string; color: string }[] = [
  { key: "energia", label: "ENERGÍA", color: "#10b981" },
  { key: "finanzas", label: "FINANZAS", color: "#3b82f6" },
  { key: "otros", label: "OTROS", color: "#f59e0b" },
];
const COLOR: Record<Bucket, string> = { energia: "#10b981", finanzas: "#3b82f6", otros: "#f59e0b" };

function bucketOf(slug?: string | null): Bucket {
  if (slug === "on_energia") return "energia";
  if (slug === "on_finanzas") return "finanzas";
  return "otros"; // "on", "on_otros", o cualquier otro
}

function fmtFecha(iso?: string | null): string {
  if (!iso) return "--";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

function fmtPct1(n?: number | null): string {
  return n === null || n === undefined ? "--" : (n * 100).toFixed(1) + "%";
}

/** Tab bar de sectores. Resalta los que NO tienen datos en gris tenue. */
function SectorTabs({
  value,
  onChange,
  conDatos,
}: {
  value: Bucket;
  onChange: (b: Bucket) => void;
  conDatos: Set<Bucket>;
}) {
  return (
    <div className="flex gap-1 mb-1">
      {TABS.map((t) => {
        const active = value === t.key;
        const hay = conDatos.has(t.key);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              "px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors " +
              (active ? "bg-white/15 text-white" : "text-[var(--t-text-muted)] hover:text-white")
            }
            style={{ borderColor: active ? t.color : "var(--t-border)", color: active ? t.color : undefined, opacity: hay ? 1 : 0.4 }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tabla de ONs CON VOLUMEN, tab por sector ──
function ONsTable({ rows }: { rows: ONRow[] }) {
  // Solo ONs con volumen operado hoy.
  const conVolumen = useMemo(() => rows.filter((r) => (r.total_nominals_dia || 0) > 0), [rows]);
  const conDatos = useMemo(() => new Set(conVolumen.map((r) => bucketOf(r.sector))), [conVolumen]);
  const [sel, setSel] = useState<Bucket | null>(null);
  const active: Bucket = sel ?? TABS.find((t) => conDatos.has(t.key))?.key ?? "energia";

  const filtered = useMemo(
    () =>
      conVolumen
        .filter((r) => bucketOf(r.sector) === active)
        .sort((a, b) => (a.fecha_vencimiento || "9999").localeCompare(b.fecha_vencimiento || "9999")),
    [conVolumen, active],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <SectorTabs value={active} onChange={setSel} conDatos={conDatos} />
      <div className="flex-1 min-h-0 overflow-auto">
        {filtered.length === 0 ? (
          <Empty />
        ) : (
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
              {filtered.map((r) => (
                <tr key={r.ticker}>
                  <td className="font-semibold" style={{ color: COLOR[active] }}>
                    {r.ticker_corto || r.ticker}
                  </td>
                  <td className="text-[var(--t-text-muted)]">{r.emisor || "--"}</td>
                  <td className="text-[var(--t-text-muted)]">{r.moneda || "--"}</td>
                  <td className="text-[var(--t-text-muted)] tabular-nums">{fmtFecha(r.fecha_vencimiento)}</td>
                  <td className="text-right font-semibold tabular-nums">{fmtPrice(r.ultimo_precio ?? undefined)}</td>
                  <td className="text-right tabular-nums">{fmtPct1(r.tea)}</td>
                  <td className="text-right tabular-nums">{r.duration != null ? r.duration.toFixed(2) : "--"}</td>
                  <td className="text-right tabular-nums">{r.paridad != null ? r.paridad.toFixed(1) : "--"}</td>
                  <td className="text-right tabular-nums text-[#ffaa00]">{fmtVol(r.total_nominals_dia ?? undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-1 text-[10px] text-[var(--t-text-muted)] text-right">
        {filtered.length} ON{filtered.length !== 1 ? "s" : ""} con volumen
      </div>
    </div>
  );
}

// ── Curva: scatter TEA(y) vs duration(x) del sector seleccionado ──
function ONsCurva({ rows }: { rows: ONRow[] }) {
  const puntos = useMemo(
    () =>
      rows
        .filter((r) => r.duration != null && r.tea != null && (r.total_nominals_dia || 0) > 0)
        .map((r) => ({
          x: r.duration as number,
          y: (r.tea as number) * 100,
          ticker: r.ticker_corto || r.ticker,
          emisor: r.emisor || "",
          bucket: bucketOf(r.sector),
        })),
    [rows],
  );
  const conDatos = useMemo(() => new Set(puntos.map((p) => p.bucket)), [puntos]);
  const [sel, setSel] = useState<Bucket | null>(null);
  const active: Bucket = sel ?? TABS.find((t) => conDatos.has(t.key))?.key ?? "energia";
  const data = puntos.filter((p) => p.bucket === active);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <SectorTabs value={active} onChange={setSel} conDatos={conDatos} />
      <div className="flex-1 min-h-0">
        {data.length === 0 ? (
          <Empty />
        ) : (
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
              <YAxis type="number" dataKey="y" name="TEA" unit="%" tick={{ fontSize: 10, fill: "var(--t-text-muted)" }} />
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
              <Scatter data={data} fill={COLOR[active]} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Calendario de pagos: cupón NOMINAL (no la tasa anual) + amortización ──
function ONsCalendario({ pagos }: { pagos: ONPago[] }) {
  if (!pagos.length) return <Empty />;
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ticker</th>
              <th>Emisor</th>
              <th>Mon</th>
              <th className="text-right">Cupón</th>
              <th className="text-right">Amort.</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p, i) => (
              <tr key={`${p.ticker}-${p.fecha}-${i}`}>
                <td className="tabular-nums">{fmtFecha(p.fecha)}</td>
                <td className="font-semibold" style={{ color: COLOR[bucketOf(p.sector)] }}>
                  {p.ticker}
                </td>
                <td className="text-[var(--t-text-muted)]">{p.emisor || "--"}</td>
                <td className="text-[var(--t-text-muted)]">{p.moneda || "--"}</td>
                <td className="text-right tabular-nums">{fmtPrice(p.cupon ?? undefined)}</td>
                <td className="text-right tabular-nums text-[var(--t-text-muted)]">
                  {p.amortizacion ? fmtPrice(p.amortizacion) : "--"}
                </td>
                <td className="text-right tabular-nums font-semibold">{fmtPrice(p.monto ?? undefined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[10px] text-[var(--t-text-muted)] text-right">
        montos nominales por 100 VN · cupón = pago de ese flujo (no la tasa anual)
      </div>
    </div>
  );
}

// ── Vista principal (2×2) ──
export function ONsLiveView({ initialRows, calendario }: { initialRows: ONRow[]; calendario: ONPago[] }) {
  const initial = useMemo(() => initialRows, [initialRows]);
  const { data: rows, lastAt } = usePoll<ONRow[]>(
    "/api/analitica/listar-curva?curva=on&ordenar_por=vencimiento",
    initial,
    POLL_MS,
  );
  const sub = lastAt > 0 ? `${fmtHoraAR(lastAt)} · cada 10s` : "cada 10s";

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="ONs" sub={sub} expandable>
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
