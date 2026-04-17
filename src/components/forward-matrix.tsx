"use client";

interface ForwardMatrixProps {
  tickers: string[];
  matrix: Record<string, Record<string, number>>;
}

function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

function heatmapColor(value: number, min: number, median: number, max: number): string {
  if (min === max) return "#ffaa00";
  let r: number, g: number, b: number;
  if (value <= median) {
    const t = (value - min) / (median - min || 1);
    r = 220;
    g = Math.round(60 + t * 160);
    b = Math.round(60 + t * 40);
  } else {
    const t = (value - median) / (max - median || 1);
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
  if (tickers.length < 2) return <p className="text-[#555555] text-xs py-4 text-center">Mínimo 2 instrumentos</p>;

  const short = tickers.map(shortTicker);

  // Collect all values for color scale
  const allValues: number[] = [];
  for (const row of Object.values(matrix)) {
    for (const v of Object.values(row)) {
      if (v !== null && v !== undefined) allValues.push(v);
    }
  }
  allValues.sort((a, b) => a - b);
  const vMin = allValues[0] ?? 0;
  const vMax = allValues[allValues.length - 1] ?? 1;
  const vMedian = allValues[Math.floor(allValues.length / 2)] ?? 0.5;

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
              <td className="!px-2 !py-1 text-[#3399ff] font-semibold whitespace-nowrap">
                {short[i + 1]}
              </td>
              {tickers.slice(0, -1).map((tCorto, j) => {
                if (j >= i + 1) {
                  return <td key={tCorto} className="!px-2 !py-1" />;
                }
                const val = matrix[tLargo]?.[tCorto];
                if (val === null || val === undefined) {
                  return <td key={tCorto} className="!px-2 !py-1 text-center text-[#555555]">--</td>;
                }
                const bg = heatmapColor(val, vMin, vMedian, vMax);
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
