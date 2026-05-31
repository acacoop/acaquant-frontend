"use client";

import type { ForwardZscoreStats } from "@/lib/types";

interface Props {
  tickers: string[];
  matrix: Record<string, Record<string, number>>;
  stats?: Record<string, Record<string, ForwardZscoreStats>>;
}

function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

// Coloreado INVERTIDO respecto al modo LIVE: verde = z bajo (forward
// descontado vs su historia), rojo = z alto (caro vs su historia).
function zscoreColor(z: number): { bg: string; fg: string } {
  if (z <= -2)        return { bg: "#1f8a3e", fg: "#ffffff" };  // verde intenso
  if (z <= -1)        return { bg: "#3fbf6f", fg: "#000000" };  // verde suave
  if (z < 1)          return { bg: "#1a1a1a", fg: "#a0a0a0" };  // neutro
  if (z < 2)          return { bg: "#d97706", fg: "#000000" };  // naranja suave
  return                     { bg: "#c0271a", fg: "#ffffff" };  // rojo intenso
}

function fmtZ(z: number): string {
  const sign = z >= 0 ? "+" : "";
  return `${sign}${z.toFixed(2)}`;
}

export function ForwardMatrixZscore({ tickers, matrix, stats }: Props) {
  if (tickers.length < 2) {
    return <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Mínimo 2 instrumentos</p>;
  }
  const short = tickers.map(shortTicker);

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
                const tCortoShort = shortTicker(tCorto);
                const tLargoShort = shortTicker(tLargo);
                const fwd = matrix[tLargo]?.[tCorto];
                const stat =
                  stats?.[tLargo]?.[tCorto] ??
                  stats?.[tLargoShort]?.[tCortoShort];
                if (
                  fwd === null ||
                  fwd === undefined ||
                  !stat ||
                  stat.desvio <= 0 ||
                  stat.n_obs < 20
                ) {
                  // n/d sin tooltip — el usuario pidió ocultarlo cuando faltan datos.
                  return (
                    <td
                      key={tCorto}
                      className="!px-2 !py-1 text-center text-[var(--t-text-muted)] bg-[var(--t-surface)]"
                    >
                      n/d
                    </td>
                  );
                }
                const z = (fwd - stat.media) / stat.desvio;
                const { bg, fg } = zscoreColor(z);
                const tooltip = [
                  `Forward hoy: ${(fwd * 100).toFixed(2)}%`,
                  `Media 30d:   ${(stat.media * 100).toFixed(2)}%`,
                  `Desvío 30d:  ${(stat.desvio * 100).toFixed(2)}%`,
                  `Z-score:     ${fmtZ(z)}`,
                  `N obs:       ${stat.n_obs}`,
                ].join("\n");
                return (
                  <td
                    key={tCorto}
                    className="!px-2 !py-1 text-center font-semibold cursor-help"
                    style={{ backgroundColor: bg, color: fg }}
                    title={tooltip}
                  >
                    {fmtZ(z)}
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
