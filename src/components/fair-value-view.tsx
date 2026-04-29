"use client";

import { useMemo, useState } from "react";
import type { FairValueBono, FairValueDoc } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { FairValueModal } from "./fair-value-modal";
import { InfoIcon } from "./info-icon";

type Curva = "tasa_fija" | "cer";

const POLL_LIVE_MS = 90_000;

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
  // ⚠ MUST be useMemo: usePoll dispara setState si initial cambia de
  // identidad (ver renta-fija-live.tsx). Sin esto, cada render crea
  // objeto nuevo → setState → re-render → loop (React error #185).
  const initial: FairValueDoc = useMemo(() => initialDoc ?? {
    curva,
    beta0: 0, beta1: 0, beta2: 0, r2: 0,
    sigma_dia_bps: 0, n_bonos_universo: 0,
    bonos: [],
  }, [curva, initialDoc]);
  const { data: doc } = usePoll<FairValueDoc>(endpoint, initial, POLL_LIVE_MS);

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
    <div className="h-full overflow-y-auto flex flex-col gap-2">
      {/* Header con métricas del fit */}
      <div className="flex items-center gap-3 text-[10px] text-[#808080] shrink-0 flex-wrap">
        <span>
          β cierre <span className="text-[#ff9900]">{doc.ts_cierre_beta ?? doc.ts_cierre ?? "—"}</span>
        </span>
        <span>R² <span className="text-[#ff9900]">{doc.r2.toFixed(3)}</span></span>
        <span>σ <span className="text-[#ff9900]">{doc.sigma_dia_bps.toFixed(1)} bps</span></span>
        <span>universo <span className="text-[#ff9900]">{doc.n_bonos_universo}</span></span>
        {doc.error && <span className="text-[#c0271a]">⚠ {doc.error}</span>}
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[9px] text-[#666]">qué mira esta tabla</span>
          <InfoIcon
            width="380px"
            align="right"
            tip={
              "FAIR VALUE — modelo cuadrático de TEA vs Duration ajustado al cierre del día.\n\n" +
              "Cada noche se ajusta TEA = β0 + β1·Dur + β2·Dur² sobre el universo de bonos elegibles. Los β quedan fijos para el día siguiente. Durante la rueda comparamos la TEA observada de cada bono contra la TEA teórica del modelo y vemos cuánto se aparta.\n\n" +
              "Columnas:\n" +
              "• TICKER — bono.\n" +
              "• DUR — duration en años.\n" +
              "• TEA — TEA observada con el último precio.\n" +
              "• TEA TEÓRICA — TEA que predice el modelo (β0+β1·Dur+β2·Dur²).\n" +
              "• RES bps — residuo en bps = (TEA − TEA teórica) × 10000. Positivo = bono BARATO (rinde más que la curva). Negativo = CARO.\n" +
              "• Z EST — z-score estático = residuo del bono / σ del fit del día. Cuánto se aparta vs los demás bonos AHORA.\n" +
              "• Z TEMP — z-score temporal = residuo de hoy / desvío histórico del residuo de ESE bono. Compara cada bono contra SU PROPIA historia (más útil para detectar cambios).\n" +
              "• N — observaciones de histórico que tiene el bono.\n\n" +
              "Cómo interpretar Z TEMP (la columna que se colorea):\n" +
              "• > +1.5 verde fuerte = barato vs su historia (oportunidad de compra).\n" +
              "• > +0.5 verde clara.\n" +
              "• ±0.5 neutral.\n" +
              "• < −0.5 naranja.\n" +
              "• < −1.5 rojo = caro vs su historia.\n\n" +
              "R² mide qué tan bien el modelo explica la curva (más cerca de 1 = más fiable). σ del fit es el desvío de los residuos del día (sirve para normalizar Z EST)."
            }
          />
        </span>
      </div>

      {/* El user pidió que en modo fair-value solo se vea la tabla;
         el scatter + cuadrática quedó deshabilitado. Si querés volverlo,
         está en el commit anterior (git log -- fair-value-view.tsx). */}
      {!hayDatos && (
        <p className="text-[#555555] text-xs py-4 text-center">
          {doc.error ? doc.error : "SIN DATOS — corré jobs.snapshot_cierre + jobs.fair_value"}
        </p>
      )}

      {/* Tabla rankeable */}
      {hayDatos && (
        <div className="border-t border-[#2a2a2a] shrink-0">
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
