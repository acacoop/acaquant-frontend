"use client";
import { shortTicker } from "@/components/ui";

interface ForwardMatrixProps {
  tickers: string[];
  matrix: Record<string, Record<string, number>>;
}


// Posición del valor en la DISTRIBUCIÓN (0 = el más bajo, 1 = el más alto).
// `sorted` viene ordenado ascendente.
function percentil(value: number, sorted: number[]): number {
  if (sorted.length < 2) return 0.5;
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo / (sorted.length - 1);
}

// El color sale del PERCENTIL, no del valor absoluto (fix 2026-08-15).
//
// Antes se interpolaba linealmente entre el mínimo y el máximo de la matriz, y
// eso funciona solo si los valores están repartidos parejo. En CER no lo están:
// casi todos caen entre 6% y 10% y un par se va a 31%, así que el outlier
// estiraba la escala y dejaba a TODO el resto en el mismo amarillo — el color
// dejaba de informar, que es exactamente lo que no puede pasar en un heatmap.
//
// Con percentil el reparto es parejo POR CONSTRUCCIÓN: la mitad más baja va de
// rojo a amarillo y la mitad más alta de amarillo a verde, sin importar cómo
// estén distribuidos los números. El color pasa a decir "alto/bajo respecto de
// ESTA matriz", que es como se lee de verdad.
function heatmapColor(p: number): string {
  let r: number, g: number, b: number;
  if (p <= 0.5) {
    const t = p / 0.5;
    r = 220;
    g = Math.round(60 + t * 160);
    b = Math.round(60 + t * 40);
  } else {
    const t = (p - 0.5) / 0.5;
    r = Math.round(220 - t * 180);
    g = Math.round(220 - t * 40);
    b = Math.round(100 - t * 40);
  }
  return `rgb(${r},${g},${b})`;
}

function textColor(bg: string): string {
  const m = bg.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return "#ffffff";
  const lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  return lum > 0.5 ? "#000000" : "#ffffff";
}

export function ForwardMatrix({ tickers, matrix }: ForwardMatrixProps) {
  if (tickers.length < 2) return <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Mínimo 2 instrumentos</p>;

  const short = tickers.map(shortTicker);

  // Collect all values for color scale
  const allValues: number[] = [];
  for (const row of Object.values(matrix)) {
    for (const v of Object.values(row)) {
      if (v !== null && v !== undefined) allValues.push(v);
    }
  }
  allValues.sort((a, b) => a - b);
  // (min/median/max ya no hacen falta: la escala es por percentil sobre
  // `allValues`, que queda ordenado ascendente para la búsqueda binaria.)

  return (
    <div className="overflow-x-auto">
      <table className="text-[11px]">
        <thead>
          <tr>
            <th className="text-left !text-[10px] !px-2 !py-1"></th>
            {short.slice(0, -1).map((t) => (
              <th key={t} className="text-center !text-[10px] !px-2 !py-1 !font-semibold">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.slice(1).map((tLargo, i) => (
            <tr key={tLargo} className="hover:!bg-transparent">
              <td className="!px-2 !py-1 text-[var(--t-accent)] font-semibold whitespace-nowrap">
                {short[i + 1]}
              </td>
              {tickers.slice(0, -1).map((tCorto, j) => {
                if (j >= i + 1) {
                  return <td key={tCorto} className="!px-2 !py-1" />;
                }
                const val = matrix[tLargo]?.[tCorto];
                if (val === null || val === undefined) {
                  return <td key={tCorto} className="!px-2 !py-1 text-center text-[var(--t-text-muted)]">--</td>;
                }
                const bg = heatmapColor(percentil(val, allValues));
                const fg = textColor(bg);
                return (
                  <td
                    key={tCorto}
                    className="!px-2 !py-1 text-center font-semibold"
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    {(val * 100).toFixed(2)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
