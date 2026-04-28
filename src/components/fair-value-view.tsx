"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { FairValueBono, FairValueDoc } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { useViewportKey } from "@/lib/use-viewport-key";
import { FairValueModal } from "./fair-value-modal";

type Curva = "tasa_fija" | "cer";

const POLL_LIVE_MS = 90_000;
const Z_THRESHOLD_HI = 1.5;

type SortKey = "z_temporal" | "ticker" | "duration" | "tea_obs" | "residuo_bps" | "z_estatico";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

// Coloreado del z_temporal (escala vs propia historia).
// z >= +1.5 → verde (residuo alto vs historia = TEA alta vs su norm = barato)
// z <= -1.5 → rojo  (residuo bajo  = TEA baja vs su norm = caro)
function zColorTemporal(z: number | null | undefined): { bg: string; fg: string } | null {
  if (z === null || z === undefined || !isFinite(z)) return null;
  if (z >= 1.5) return { bg: "#1f8a3e", fg: "#ffffff" };
  if (z >= 0.5) return { bg: "#3fbf6f", fg: "#000000" };
  if (z > -0.5) return { bg: "#1a1a1a", fg: "#a0a0a0" };
  if (z > -1.5) return { bg: "#d97706", fg: "#000000" };
  return { bg: "#c0271a", fg: "#ffffff" };
}

function fmtZ(z: number | null | undefined): string {
  if (z === null || z === undefined || !isFinite(z)) return "n/d";
  const sign = z >= 0 ? "+" : "";
  return `${sign}${z.toFixed(2)}`;
}

function fmtBps(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(0)}`;
}

function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

interface Props {
  curva: Curva;
  initialDoc?: FairValueDoc;
}

export function FairValueView({ curva, initialDoc }: Props) {
  const endpoint = `/api/cotizaciones/fair-value?curva=${encodeURIComponent(curva)}`;
  const initial: FairValueDoc = initialDoc ?? {
    curva,
    beta0: 0, beta1: 0, beta2: 0, r2: 0,
    sigma_dia_bps: 0, n_bonos_universo: 0,
    bonos: [],
  };
  const { data: doc } = usePoll<FairValueDoc>(endpoint, initial, POLL_LIVE_MS);
  const vpKey = useViewportKey();

  const [sort, setSort] = useState<SortState>({ key: "z_temporal", dir: "desc" });
  const [tickerSel, setTickerSel] = useState<string | null>(null);

  // Nota: cuando cambia la curva, el componente se remonta vía `key={curva}`
  // en el padre — por eso `tickerSel` arranca null sin necesidad de useEffect.

  const bonos = useMemo(() => doc.bonos ?? [], [doc.bonos]);
  const hayDatos = bonos.length > 0;

  const bonosOrdenados = useMemo(() => {
    const arr = [...bonos];
    arr.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sort.key];
      const vb = (b as unknown as Record<string, unknown>)[sort.key];
      // n/d (null) al final siempre
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") {
        // Para z_temporal y z_estatico ordenamos por valor absoluto:
        // los más extremos arriba sin importar signo.
        if (sort.key === "z_temporal" || sort.key === "z_estatico") {
          cmp = Math.abs(va) - Math.abs(vb);
        } else {
          cmp = va - vb;
        }
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [bonos, sort]);

  // Línea cuadrática del cierre (β del último cron) sobre el rango de durations.
  const fitData = useMemo(() => {
    if (!hayDatos) return [] as { Duration: number; fitY: number }[];
    const xs = bonos.map((b) => b.duration);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const steps = 80;
    const out: { Duration: number; fitY: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = xMin + ((xMax - xMin) * i) / steps;
      const y = doc.beta0 + doc.beta1 * x + doc.beta2 * x * x;
      out.push({ Duration: +x.toFixed(4), fitY: +(y * 100).toFixed(4) });
    }
    return out;
  }, [bonos, doc, hayDatos]);

  // Dataset combinado para el ComposedChart: scatter + fit.
  const merged = useMemo(() => {
    const map = new Map<number, Record<string, number | string>>();
    const ensure = (d: number) => {
      let r = map.get(d);
      if (!r) {
        r = { Duration: d };
        map.set(d, r);
      }
      return r;
    };
    for (const b of bonos) {
      const r = ensure(+b.duration.toFixed(4));
      r.scatterY = +(b.tea_obs * 100).toFixed(4);
      r.Ticker = b.ticker_corto ?? shortTicker(b.ticker);
      r.zTemp = b.z_temporal ?? Number.NaN;
      r.residuoBps = b.residuo_bps;
    }
    for (const f of fitData) {
      const r = ensure(f.Duration);
      r.fitY = f.fitY;
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.Duration as number) - (b.Duration as number),
    );
  }, [bonos, fitData]);

  const xs = bonos.map((b) => b.duration);
  const ys = bonos.map((b) => b.tea_obs * 100);
  const xMin = xs.length ? Math.min(...xs) * 0.95 : 0;
  const xMax = xs.length ? Math.max(...xs) * 1.05 : 1;
  const yMin = ys.length ? Math.min(...ys) - 1 : 0;
  const yMax = ys.length ? Math.max(...ys) + 1 : 1;

  const renderHeader = (label: string, key: SortKey, align: "left" | "right" = "right") => (
    <th
      onClick={() =>
        setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))
      }
      className={`!px-2 !py-1 !text-[10px] cursor-pointer hover:text-[#ff9900] ${align === "left" ? "text-left" : "text-right"}`}
    >
      {label}
      {sort.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  return (
    <div className="h-full flex flex-col min-h-0 gap-2">
      {/* Header con métricas del fit */}
      <div className="flex items-center gap-3 text-[10px] text-[#808080] shrink-0 flex-wrap">
        <span>
          β cierre <span className="text-[#ff9900]">{doc.ts_cierre_beta ?? doc.ts_cierre ?? "—"}</span>
        </span>
        <span>R² <span className="text-[#ff9900]">{doc.r2.toFixed(3)}</span></span>
        <span>σ <span className="text-[#ff9900]">{doc.sigma_dia_bps.toFixed(1)} bps</span></span>
        <span>universo <span className="text-[#ff9900]">{doc.n_bonos_universo}</span></span>
        {doc.error && <span className="text-[#c0271a]">⚠ {doc.error}</span>}
      </div>

      {/* Scatter + cuadrática */}
      <div className="flex-1 min-h-0">
        {hayDatos ? (
          <ResponsiveContainer key={vpKey} width="100%" height="100%">
            <ComposedChart data={merged} margin={{ top: 16, right: 12, bottom: 8, left: 8 }}>
              <XAxis
                dataKey="Duration"
                type="number"
                domain={[xMin, xMax]}
                tick={{ fill: "#808080", fontSize: 10 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fill: "#808080", fontSize: 10 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#0e0e0e",
                  border: "1px solid #2a2a2a",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                formatter={(value, name, item) => {
                  const key = String(name);
                  const v = Number(value);
                  if (key === "scatterY") {
                    const p = item.payload as Record<string, number | string>;
                    const r = p.residuoBps as number;
                    const z = p.zTemp as number;
                    return [
                      `${v.toFixed(2)}% · res ${fmtBps(r)}bps · z ${fmtZ(Number.isFinite(z) ? z : null)}`,
                      String(p.Ticker),
                    ];
                  }
                  if (key === "fitY") return [`${v.toFixed(2)}%`, "Cuadrática"];
                  return [String(value), key];
                }}
                labelFormatter={(v) => `Duration ${Number(v).toFixed(2)} años`}
              />
              <Line
                dataKey="fitY"
                type="monotone"
                stroke="#4488ff"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Scatter
                dataKey="scatterY"
                isAnimationActive={false}
                onClick={(p) => {
                  const tk = (p?.payload as Record<string, unknown> | undefined)?.Ticker;
                  if (typeof tk === "string") {
                    const found = bonos.find((b) => (b.ticker_corto ?? shortTicker(b.ticker)) === tk);
                    if (found) setTickerSel(found.ticker);
                  }
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shape={(props: any) => {
                  const cx = Number(props.cx);
                  const cy = Number(props.cy);
                  const payload = (props.payload || {}) as Record<string, unknown>;
                  const z = Number(payload.zTemp);
                  let fill = "#00cc66";
                  let stroke = "transparent";
                  let strokeWidth = 0;
                  if (Number.isFinite(z)) {
                    if (z >= Z_THRESHOLD_HI) {
                      fill = "#3fbf6f";
                      stroke = "#1f8a3e";
                      strokeWidth = 2;
                    } else if (z <= -Z_THRESHOLD_HI) {
                      fill = "#d97706";
                      stroke = "#c0271a";
                      strokeWidth = 2;
                    }
                  }
                  return (
                    <circle cx={cx} cy={cy} r={4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} style={{ cursor: "pointer" }} />
                  );
                }}
              >
                <LabelList
                  dataKey="Ticker"
                  position="top"
                  fill="#aaaaaa"
                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                />
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-[#555555] text-xs py-4 text-center">
            {doc.error ? doc.error : "SIN DATOS — corré jobs.snapshot_cierre + jobs.fair_value"}
          </p>
        )}
      </div>

      {/* Tabla rankeable */}
      {hayDatos && (
        <div className="max-h-[180px] overflow-auto border-t border-[#2a2a2a] shrink-0">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0a0a0a] border-b border-[#2a2a2a]">
              <tr className="text-[#808080]">
                {renderHeader("TICKER", "ticker", "left")}
                {renderHeader("DUR", "duration")}
                {renderHeader("TEA", "tea_obs")}
                <th className="!px-2 !py-1 !text-[10px] text-right">TEA TEÓRICA</th>
                {renderHeader("RES bps", "residuo_bps")}
                {renderHeader("Z EST", "z_estatico")}
                {renderHeader("Z TEMP", "z_temporal")}
                <th className="!px-2 !py-1 !text-[10px] text-right">N</th>
              </tr>
            </thead>
            <tbody>
              {bonosOrdenados.map((b: FairValueBono) => {
                const z = b.z_temporal;
                const color = zColorTemporal(z);
                const tk = b.ticker_corto ?? shortTicker(b.ticker);
                return (
                  <tr
                    key={b.ticker}
                    onClick={() => setTickerSel(b.ticker)}
                    className="cursor-pointer hover:bg-[#181818]"
                  >
                    <td className="!px-2 !py-0.5 text-[#ff9900]">{tk}</td>
                    <td className="!px-2 !py-0.5 text-right text-[#d0d0d0]">{b.duration.toFixed(2)}</td>
                    <td className="!px-2 !py-0.5 text-right text-[#d0d0d0]">{(b.tea_obs * 100).toFixed(2)}%</td>
                    <td className="!px-2 !py-0.5 text-right text-[#888888]">{(b.tea_teorica * 100).toFixed(2)}%</td>
                    <td className="!px-2 !py-0.5 text-right text-[#d0d0d0]">{fmtBps(b.residuo_bps)}</td>
                    <td className="!px-2 !py-0.5 text-right text-[#d0d0d0]">{fmtZ(b.z_estatico)}</td>
                    <td
                      className="!px-2 !py-0.5 text-center font-semibold"
                      style={color ? { backgroundColor: color.bg, color: color.fg } : undefined}
                    >
                      {fmtZ(z)}
                    </td>
                    <td className="!px-2 !py-0.5 text-right text-[#666666]">{b.n_obs ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tickerSel && (
        <FairValueModal
          ticker={tickerSel}
          tickerCorto={bonos.find((b) => b.ticker === tickerSel)?.ticker_corto ?? shortTicker(tickerSel)}
          onClose={() => setTickerSel(null)}
        />
      )}
    </div>
  );
}
