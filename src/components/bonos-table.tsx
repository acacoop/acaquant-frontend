"use client";

import type { BonoCurva } from "@/lib/types";
import { fmtPrice, fmtVol } from "./ui";

// Tabla de la tab CURVAS (docs/RENTA_FIJA.md §0, paso 3b).
//
// Una tasa con duration ~0 no es un rendimiento: es un artefacto de anualizar
// pocos días. Se muestra APAGADA con el motivo en el tooltip. Quién es ruido lo
// decide el BACKEND (`tasa_ruido`) — acá solo se pinta, así la tabla y el gráfico
// no pueden discrepar.
const tasaCls = (b: BonoCurva) => (b.tasa_ruido ? "opacity-40" : "");
const tasaTip = (b: BonoCurva) =>
  b.tasa_ruido
    ? "Vence en pocos días: anualizar ese plazo infla la tasa. No es comparable con el resto de la curva."
    : "";

// A diferencia de `renta-fija-table`, acá NO se clasifica ni se filtra por curva:
// las filas llegan YA resueltas por el backend (`/api/cotizaciones/curvas-vista`).
// Este componente solo formatea.
//
// Las COLUMNAS se curan por moneda, que es lo que hace legible la partición en
// dos: `TC BE` y `Pago Final` solo tienen sentido en pesos, y del lado USD lo que
// importa es paridad y el EMISOR.
//
// La LEY (Bonar vs Global) se sacó de la vista el 2026-08-15: con el filtro de
// EMISOR arriba, el lado USD es mayormente corporativo y ahí la ley no dice
// nada — lo que hace falta para leer la tabla es de QUIÉN es el papel. El campo
// sigue viajando en `BonoCurva.ley` y se sigue clasificando server-side: se
// quitó de la pantalla, no del modelo.

function fmtMatur(iso: string | null | undefined): string {
  if (!iso) return "--";
  const s = String(iso).slice(0, 10);
  if (s.length !== 10 || s[4] !== "-" || s[7] !== "-") return s;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
}

// La rueda de las tasas que NO vienen del motor live, o "" si son todas del
// motor. Se muestra UNA vez arriba de la tabla en lugar de un ícono por fila:
// el aviso importa una vez, y repetirlo 18 veces lo vuelve invisible.
function filasConDelay(bonos: BonoCurva[]): string {
  const f = bonos.find((b) => b.tea_fuente && b.tea_fecha);
  return f?.tea_fecha ? String(f.tea_fecha).slice(0, 10) : "";
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

  // El LADO de la tabla, no la moneda del bono: son cosas distintas desde que un
  // dual puede tener una pata de cada lado. TMVE8 es TAMAR (columna ARS) + DOLAR
  // LINKED (columna USD): con `moneda` — que es ARS, y es correcto — el bono le
  // cambiaba las columnas a TODA la tabla USD según qué fila cayera primera.
  // `lado` lo manda el backend por fila y ya viene desde antes de los duales, así
  // que este cambio funciona igual contra el backend viejo.
  const esArs = bonos[0]?.lado === "ARS";
  // La columna solo aparece si ALGUIEN de esta pill la tiene: los bullet
  // (lecaps/boncaps) tienen pago final, los que amortizan en cuotas no.
  const hayPagoFinal = bonos.some((b) => b.flujo_vencimiento);
  // TC BREAKEVEN: solo en pesos (en USD no significa nada) y solo si el backend
  // lo pudo calcular — necesita flujo final determinado + MEP. Estaba en la tabla
  // vieja y se había perdido en esta.
  const hayTcBe = bonos.some((b) => b.tc_breakeven != null);
  // MARGEN sobre la TAMAR: es LO que se mira de un bono TAMAR (cuánto paga por
  // encima de la tasa de referencia del BCRA), y hasta ahora no existía en la
  // app. La columna aparece sola donde hay dato — o sea en la pill TAMAR — sin
  // necesidad de preguntarle a la pill: si algún día 1816 publica margen para
  // otra familia, la columna aparece ahí también.
  const hayMargen = bonos.some((b) => b.margen != null);
  // La tasa de 1816 llega por un job cada 30', no por el motor live. Decirlo una
  // vez arriba es más honesto que repetir un ícono en cada fila, y evita que
  // alguien compare un TAMAR contra un soberano creyendo que son del mismo
  // instante. `tea_fecha` es la rueda REAL del dato (puede ser la anterior).
  const delayed = filasConDelay(bonos);
  // Mismo orden que la vista de siempre: por duration, y los que todavía no
  // tienen (ticker nuevo sin enriquecer) al final en vez de arriba.
  const filas = [...bonos].sort(
    (a, b) => (a.metrics?.duration ?? Infinity) - (b.metrics?.duration ?? Infinity),
  );

  return (
    <>
    {delayed && (
      <div className="px-1 pb-1 text-[10px] text-[var(--t-text-2)]"
           title="Los bonos TAMAR no se valúan con el motor live: la tasa y el margen se traen de 1816, que es la misma fuente que valida la mesa. Se actualizan cada 30 minutos.">
        Tasa y margen de 1816 · rueda {fmtMatur(delayed)} · actualiza cada 30′
      </div>
    )}
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
          {hayTcBe && (
            <th className="!px-1 text-center"
                title="TC al que este bono empata contra comprar MEP hoy y esperar al vencimiento">
              TC BE
            </th>
          )}
          <th className="!px-1 text-center">TNA</th>
          <th className="!px-1 text-center">TEA</th>
          {hayMargen && (
            <th className="!px-1 text-center"
                title="Margen sobre la TAMAR: cuánto paga este bono por encima de la tasa de referencia del BCRA. Fuente 1816.">
              MARGEN
            </th>
          )}
          {esArs && <th className="!px-1 text-center">TEM</th>}
          <th className="!px-1 text-center">DUR</th>
          <th className="!px-1 text-center">MOD DUR</th>
          {!esArs && <th className="!px-1 text-center">PARIDAD</th>}
          {!esArs && <th className="!px-1 text-left">EMISOR</th>}
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
            v === null ? "" : v > 0 ? "text-[var(--t-pos)]" : v < 0 ? "text-[var(--t-neg)]" : "";
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
              {hayTcBe && (
                <td className="!px-1 text-center">
                  {b.tc_breakeven != null
                    ? Math.round(b.tc_breakeven).toLocaleString("es-AR")
                    : "--"}
                </td>
              )}
              {/* TNA y TEM se DERIVAN de la TEA con la misma fórmula que la vista
                  de siempre (TEM = (1+TEA)^(1/12)−1, TNA = TEM×12): el snapshot
                  no publica TNA, y calcularla de otra forma daría un número que
                  no coincide con el que la mesa viene mirando. */}
              {/* Tasa RUIDO (duration ~0): el número se MUESTRA pero apagado y
                  con el porqué en el tooltip. Ocultarlo sería mentir por omisión;
                  mostrarlo como si fuera comparable con un bono a 5 años es peor.
                  Lo decide el backend (`tasa_ruido`) para que la tabla y el
                  gráfico no puedan contradecirse. */}
              <td className={`!px-1 text-center ${tasaCls(b)}`} title={tasaTip(b)}>
                {m.TEA === undefined ? "--" : `${((Math.pow(1 + m.TEA, 1 / 12) - 1) * 12 * 100).toFixed(1)}%`}
              </td>
              <td className={`!px-1 text-center ${tasaCls(b)}`} title={tasaTip(b)}>{pct(m.TEA)}</td>
              {hayMargen && (
                <td className="!px-1 text-center font-medium"
                    title={b.margen == null ? "1816 no publica margen para este bono" : ""}>
                  {pct(b.margen ?? undefined, 2)}
                </td>
              )}
              {esArs && (
                <td className={`!px-1 text-center ${tasaCls(b)}`} title={tasaTip(b)}>
                  {m.TEA === undefined ? "--" : `${((Math.pow(1 + m.TEA, 1 / 12) - 1) * 100).toFixed(2)}%`}
                </td>
              )}
              <td className="!px-1 text-center">{num(m.duration)}</td>
              <td className="!px-1 text-center">{num(m.mod_duration)}</td>
              {!esArs && <td className="!px-1 text-center">{num(m.paridad)}</td>}
              {!esArs && (
                <td className="!px-1 text-left opacity-70 max-w-[140px] truncate"
                    title={b.emisor || undefined}>
                  {b.emisor || "--"}
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
    </>
  );
}
