/**
 * Tipos compartidos de renta variable (universo, TRADE LAB intradía, tape).
 * Los tipos de la tab COBERTURAS (TradeAnalysis/Hedge*) se eliminaron con la
 * vista (2026-07-13).
 */

export type Direccion = "long" | "short";

/** Item del universo para el buscador de tickers (de /api/scanner/cedears). */
export interface UniversoItem {
  ticker: string;       // ticker_corto BYMA
  nombre: string | null;
  sector: string | null;
}

// ── TRADE LAB intradía (day-trading de CEDEARs) ──────────────────────

/** Fila de `GET /api/scanner/day-trading` (api/services/day_trading.py). */
export interface DayTradingRow {
  ticker: string;
  ticker_full: string | null;  // símbolo BYMA completo (book L2 / órdenes)
  nombre: string | null;
  sector: string | null;
  last: number | null;          // ARS
  dia_pct: number | null;       // vs cierre previo
  intradia_pct: number | null;  // vs apertura
  rango_pct: number | null;     // (high-low)/low
  low: number | null;
  high: number | null;
  posicion: number | null;      // 0=piso del día, 100=techo
  vueltas: number;              // patas zigzag >= objetivo hechas HOY
  mejor_vuelta_pct: number | null;
  vueltas_hora: number | null;  // ritmo: vueltas / hora de operatoria
  pata: { dir: Direccion; pct: number } | null; // pata zigzag EN CURSO
  mom15_pct: number | null;     // retorno últimos 15' (por reloj)
  vs_vwap_pct: number | null;
  spread_pct: number | null;    // (offer-bid)/last
  total_money: number | null;      // ARS operados hoy (cash)
  volumen_nominal: number | null;  // unidades operadas hoy (nominales)
  flujo_compra_pct: number | null;   // % de la plata del día que fue COMPRA
  flujo30_compra_pct: number | null; // ídem últimos 30'
  min_sin_operar: number | null;     // minutos desde el último trade
  prom_vueltas: number | null;  // costumbre: vueltas promedio (~20 ruedas)
  prom_rango: number | null;
  prom_dias: number | null;
  idea: { lado: Direccion; motivo: string } | null;
  n_minutos: number;
}

export interface DayTradingResp {
  objetivo_pct: number;
  generado: string;
  en_rueda: boolean;
  rows: DayTradingRow[];
}

/** `GET /api/scanner/companeros/{ticker}` — con qué papeles se mueve. */
export interface Companeros {
  ticker: string;
  con: { ticker: string; rho: number }[];
  contra: { ticker: string; rho: number }[];
  n_obs: number;
}

/** `GET /api/scanner/cedears/trades` — tape intradía. */
export interface TapeTrade {
  timestamp: string | null;
  price: number | null;
  size: number | null;
  side: "BUY" | "SELL" | "MID" | null;
  money: number | null;
}

/** `GET /api/scanner/cedears/intraday` — barra por minuto. */
export interface MinuteBar {
  t: string;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  vol: number | null;
}
