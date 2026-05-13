/**
 * Tipos para el módulo Scanner (Renta Variable).
 *
 * Los devuelve `GET /api/scanner/cedears` — join de Trading.Cedears
 * (master categórico) + Trading.CedearsSnapshot (live).
 */

/**
 * Respuesta de `GET /api/scanner/ccl` — KPI live de CCL para el shell.
 * Cualquier campo puede ser null si el motor está caído o no hay cierre
 * previo.
 */
export interface CclLive {
  value:     number | null;
  vs_1d_pct: number | null;
  ts:        string | null;
}

export interface CedearScannerRow {
  ticker_corto: string;
  underlying:   string | null;
  ratio_cedear: number | null;
  sector:       string | null;
  industria:    string | null;
  region:       string | null;
  pais:         string | null;
  // Métricas live (null si motor recién arrancado / sin tick aún).
  last:         number | null;
  open:         number | null;
  high:         number | null;
  low:          number | null;
  close:        number | null;
  intraday_pct:  number | null;  // (last/open − 1) × 100 — variación ARS intradía
  vs_1d_pct:     number | null;  // (last/close − 1) × 100 — variación ARS vs cierre ayer
  vs_1d_usd_pct: number | null;  // retorno USD real: vs_1d_pct descontando variación CCL
  updated_at:    string | null;
}
