/**
 * Tipos para el módulo Scanner (Renta Variable).
 *
 * Los devuelve `GET /api/scanner/cedears` — join de Trading.Cedears
 * (master categórico) + Trading.CedearsSnapshot (live).
 */

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
