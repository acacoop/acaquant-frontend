// Tipos compartidos del MM Workstation.

// Shape que espera el motor del REPLAY (port directo de la spec
// docs/mm_workstation.jsx). El backend entrega trades en otro shape; ver
// adapter.ts para el mapping.
export interface SpecTrade {
  ts: string;          // "HH:MM:SS"
  p: number;           // price
  s: number;           // size
  d: "B" | "S" | "M";  // direction (buy/sell/market)
}

export interface ApiTrade {
  timestamp: string;   // ISO
  price: number;
  size: number;
  side: string;        // "BUY" | "SELL" | "MARKET" | otros
}

// Bond row de /api/analitica/listar-curva — solo lo que el MM Workstation
// usa para alimentar SESSION_INFO + dropdown de instrumento.
export interface CurvaBond {
  ticker: string;
  ticker_corto: string;
  tipo: string;
  fecha_vencimiento: string;
  ultimo_precio: number | null;
  tea: number | null;
  duration: number | null;
  mod_duration: number | null;
  paridad: number | null;
  total_money_dia: number;
  total_nominals_dia: number;
  ts_ultimo_trade: string | null;
}

export interface SessionInfo {
  ticker: string;
  full_ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  total_volume_vn: number;
  total_money_ars: number;
  num_trades: number;
  duration: number;
  mod_duration: number;
  tea: number;
  paridad: number;
}

export type Curva = "tasa_fija" | "cer" | "soberanos" | "tamar" | "dolar_linked";

export const CURVAS: { value: Curva; label: string }[] = [
  { value: "soberanos",    label: "SOBERANOS" },
  { value: "tasa_fija",    label: "TASA FIJA" },
  { value: "cer",          label: "CER" },
  { value: "tamar",        label: "TAMAR" },
  { value: "dolar_linked", label: "DÓLAR LINKED" },
];

// Backtest response del backend.
export interface BacktestResponse {
  instrumento_full: string;
  desde: string;
  hasta: string;
  fechas: string[];
  params: {
    quote_size: number;
    skew_intensity: number;
    auto_skew: boolean;
    inv_cap: number;
    spreads: number[];
  };
  por_spread: BacktestSpreadStats[];
  por_dia: BacktestDayResult[];
}

export interface BacktestSpreadStats {
  spread: number;
  n_dias: number;
  pnl_mean: number;
  pnl_std: number;
  pnl_min: number;
  pnl_max: number;
  win_rate: number;
  sharpe: number;
  max_dd_avg: number;
  fills_avg: number;
}

export interface BacktestDayResult {
  fecha: string;
  spread: number;
  total_pnl: number;
  spread_pnl: number;
  inv_pnl: number;
  total_fills: number;
  fills_buy: number;
  fills_sell: number;
  max_inv: number;
  min_inv: number;
  final_inv: number;
  max_dd: number;
}
