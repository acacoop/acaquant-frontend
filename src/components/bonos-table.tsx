"use client";

import type { BonoCurva } from "@/lib/types";
import { fmtPrice, fmtVol } from "./ui";

// Tabla de la tab CURVAS (docs/RENTA_FIJA.md §0, paso 3b).
//
// A diferencia de `renta-fija-table`, acá NO se clasifica ni se filtra por curva:
// las filas llegan YA resueltas por el backend (`/api/cotizaciones/curvas-vista`).
// Este componente solo formatea.
//
// Las COLUMNAS se curan por moneda, que es lo que hace legible la partición en
// dos: `TC BE` y `Pago Final` solo tienen sentido en pesos, y del lado USD lo que
// importa es paridad y la LEY (Bonar vs Global), que hasta ahora no se veía en
// ningún lado aunque su spread sea de lo más mirado de la mesa.

function fmtMatur(iso: string | null | undefined): string {
  if (!iso) return "--";
  const s = String(iso).slice(0, 10);
  if (s.length !== 10 || s[4] !== "-" || s[7] !== "-") return s;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
}

const pct = (v: number | undefined, d = 1) =>
  v === undefined || v === null ? "--" : `${(v * 100).toFixed(d)}%`;
const num = (v: number | undefined, d = 2) =>
  v === undefined || v === null ? "--" : v.toFixed(d);

export function BonosTable({ bonos }: { bonos: BonoCurva[] }) {
  if (bonos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-2)] text-xs">
        Sin bonos para esta combinación.
      </div>
    );
  }

  const esArs = bonos[0]?.moneda === "ARS";
  // La columna solo aparece si ALGUIEN de esta pill la tiene: los bullet
  // (lecaps/boncaps) tienen pago final, los que amortizan en cuotas no.
  const hayPagoFinal = bonos.some((b) => b.flujo_vencimiento);
  // Mismo orden que la vista de siempre: por duration, y los que todavía no
  // tienen (ticker nuevo sin enriquecer) al final en vez de arriba.
  const filas = [...bonos].sort(
    (a, b) => (a.metrics?.duration ?? Infinity) - (b.metrics?.duration ?? Infinity),
  );

  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className="!px-1 text-center">Ticker</th>
          <th className="!px-1 text-center">Matur.</th>
          <th className="!px-1 text-center">LAST</th>
          <th className="!px-1 text-center">Intra</th>
          <th className="!px-1 text-center">1D</th>
          {hayPagoFinal && (
            <th className="!px-1 text-center" title="Pago al vencimiento por 100 VN (bullet)">
              Pago Final
            </th>
          )}
          <th className="!px-1 text-center">TNA</th>
          <th className="!px-1 text-center">TEA</th>
          {esArs && <th className="!px-1 text-center">TEM</th>}
          <th className="!px-1 text-center">DUR</th>
          <th className="!px-1 text-center">MOD DUR</th>
          {!esArs && <th className="!px-1 text-center">PARIDAD</th>}
          {!esArs && <th className="!px-1 text-center" title="Ley: local (Bonar) / NY (Global)">LEY</th>}
          <th className="!px-1 text-center">VOL NOM</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((b) => {
          const m = b.metrics || {};
          const last = m.last_price;
          const intra = last && m.open_price ? (last / m.open_price - 1) * 100 : null;
          const d1 = last && m.closing_price ? (last / m.closing_price - 1) * 100 : null;
          const color = (v: number | null) =>
            v === null ? "" : v > 0 ? "text-[var(--t-up)]" : v < 0 ? "text-[var(--t-down)]" : "";
          return (
            <tr key={b.ticker_corto}>
              <td className="!px-1 text-center font-medium" title={b.instrumento || ""}>
                {b.ticker_corto}
                {/* Un CER ya fijado se comporta como tasa fija y por eso aparece
                    en esa pill: la marca explica por qué está acá. */}
                {b.cer_fijado && <span className="ml-1 opacity-60" title="CER fijado">·f</span>}
              </td>
              <td className="!px-1 text-center">{fmtMatur(b.vencimiento)}</td>
              <td className="!px-1 text-center">{last ? fmtPrice(last) : "--"}</td>
              <td className={`!px-1 text-center ${color(intra)}`}>
                {intra === null ? "--" : `${intra > 0 ? "+" : ""}${intra.toFixed(2)}%`}
              </td>
              <td className={`!px-1 text-center ${color(d1)}`}>
                {d1 === null ? "--" : `${d1 > 0 ? "+" : ""}${d1.toFixed(2)}%`}
              </td>
              {hayPagoFinal && (
                <td className="!px-1 text-center">
                  {b.flujo_vencimiento ? fmtPrice(b.flujo_vencimiento) : "--"}
                </td>
              )}
              {/* TNA y TEM se DERIVAN de la TEA con la misma fórmula que la vista
                  de siempre (TEM = (1+TEA)^(1/12)−1, TNA = TEM×12): el snapshot
                  no publica TNA, y calcularla de otra forma daría un número que
                  no coincide con el que la mesa viene mirando. */}
              <td className="!px-1 text-center">
                {m.TEA === undefined ? "--" : `${((Math.pow(1 + m.TEA, 1 / 12) - 1) * 12 * 100).toFixed(1)}%`}
              </td>
              <td className="!px-1 text-center">{pct(m.TEA)}</td>
              {esArs && (
                <td className="!px-1 text-center">
                  {m.TEA === undefined ? "--" : `${((Math.pow(1 + m.TEA, 1 / 12) - 1) * 100).toFixed(2)}%`}
                </td>
              )}
              <td className="!px-1 text-center">{num(m.duration)}</td>
              <td className="!px-1 text-center">{num(m.mod_duration)}</td>
              {!esArs && <td className="!px-1 text-center">{num(m.paridad)}</td>}
              {!esArs && (
                <td className="!px-1 text-center opacity-70">
                  {b.ley === "ny" ? "NY" : b.ley === "local" ? "LOCAL" : "--"}
                </td>
              )}
              <td className="!px-1 text-center">
                {m.total_nominals ? fmtVol(m.total_nominals) : "--"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
