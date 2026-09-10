/**
 * Tipos del módulo Scanner (Renta Variable) — lo que devuelve `/api/scanner/*`.
 */

/**
 * Respuesta de `GET /api/scanner/ccl` — KPI live de CCL.
 * Cualquier campo puede ser null si el motor está caído o no hay cierre
 * previo.
 */
export interface CclLive {
  value:     number | null;
  vs_1d_pct: number | null;
  ts:        string | null;
}

/**
 * Respuesta de `GET /api/scanner/pivot/{ticker}` — 4 timeframes de
 * pivot points sobre el subyacente USD (la ventana PIVOTS de TRADING → MONITOR).
 */
export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface PivotFrame {
  label:       string;
  fecha_desde: string;
  fecha_hasta: string;
  n_velas:     number;
  h:           number;
  l:           number;
  c:           number;
  levels:      PivotLevels;
}

export interface PivotData {
  ticker:     string;
  last:       number | null;
  last_fecha: string | null;
  // "live" = precio del ADR (adr_snapshot, ~cada 15 min); "eod" = cierre EOD.
  last_source?: "live" | "eod";
  frames: {
    diario:  PivotFrame | null;
    semanal: PivotFrame | null;
    mensual: PivotFrame | null;
    anual:   PivotFrame | null;
  };
}

/**
 * Fila de `GET /api/scanner/cedears` — master + snapshot live del CEDEAR en
 * ARS. Desde 2026-09-10 NO trae más las métricas del ADR (`adr_*`) ni la
 * clasificación (`rubro` / `es_ia`): nadie las consumía y viajaban cada 2 s.
 */
export interface CedearScannerRow {
  ticker_corto: string;
  nombre:       string | null;
  underlying:   string | null;   // US symbol (YPFD → YPF); el chart ADR lo usa
  ratio_cedear: number | null;
  // Métricas live (null si motor recién arrancado / sin tick aún).
  last:         number | null;
  open:         number | null;
  high:         number | null;
  low:          number | null;
  close:        number | null;
  intraday_pct:  number | null;  // (last/open − 1) × 100 — variación ARS intradía
  vs_1d_pct:     number | null;  // (last/close − 1) × 100 — variación ARS vs cierre ayer
  vs_1d_usd_pct: number | null;  // retorno USD real: vs_1d_pct descontando variación CCL
  // Datos de trading (live desde el motor): puntas, spread, VWAP, VOL.
  bid:        number | null;
  offer:      number | null;
  spread:     number | null;     // offer − bid (ARS)
  spread_pct: number | null;     // spread / mid × 100
  vwap:       number | null;     // EV / NV (precio promedio ponderado por volumen)
  volume:     number | null;     // NOMINAL_VOLUME acumulado del día
  total_money: number | null;    // TRADE_EFFECTIVE_VOLUME ($ operado en el día)
  updated_at:    string | null;
}
