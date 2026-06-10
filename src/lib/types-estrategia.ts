/**
 * Tipos de la Mesa de Estrategia (vista ESTRATEGIA → tabs TRADE LAB,
 * BOOK & RIESGO y CORRELACIONES).
 *
 * Espejan 1:1 las respuestas del backend (api/services/rv_motor.py):
 *   GET /api/scanner/trade-analysis  → get_trade_analysis
 *   GET /api/scanner/book-analysis   → get_book_analysis
 *   GET /api/scanner/correlaciones   → get_correlation_matrix
 */

export type Direccion = "long" | "short";

export interface TradeCaracterizacion {
  last: number | null;
  vol_anual: { d30: number | null; d60: number | null };
  beta: { spy: number | null; qqq: number | null };
  // zscore del retorno de HOY vs ventana (30/60d). Puede faltar si el
  // ticker no tiene serie en Trading.PreciosAcciones.
  zscore?: { d30: number | null; d60: number | null } | null;
  var_1d_95: number | null;       // USD, magnitud de pérdida potencial
  var_1d_95_pct: number | null;   // % del notional
  peor_mes_1sigma: number | null; // USD
  exposicion_mercado_equiv: { spy: number | null; qqq: number | null };
}

export interface HedgeBeta {
  benchmark: string;   // "SPY" | "QQQ"
  beta: number;
  accion: Direccion;   // qué hacer con el benchmark para neutralizar
  notional: number;    // USD a operar del benchmark
}

export interface HedgeCandidate {
  ticker: string;
  correlacion: number;          // ρ Pearson [-1, 1]
  hedge_ratio: number | null;   // h = ρ × σ_ticker / σ_candidato
  notional_hedge: number | null;
  accion: Direccion;
  reduccion_vol_pct: number;    // (1 − √(1−ρ²)) × 100
}

export interface TradeAnalysis {
  trade: { ticker: string; monto: number; direccion: Direccion };
  caracterizacion: TradeCaracterizacion;
  hedge_beta: HedgeBeta[];
  hedge_finder: HedgeCandidate[];
  nota?: string;
}

export interface BookPosicion {
  ticker: string;
  notional: number;     // >0 long, <0 short
  direccion: Direccion;
  sector: string;
  region: string;
}

export interface ExposicionGrupo {
  grupo: string;
  neto: number;
  bruto: number;
  pct_bruto: number;
}

export interface BookAnalysis {
  book: { posiciones: BookPosicion[]; gross: number; net: number; n: number };
  exposicion: { por_sector: ExposicionGrupo[]; por_region: ExposicionGrupo[] };
  concentracion: { pct_top5?: number; hhi?: number };
  riesgo: {
    vol_anual_book_pct?: number | null;
    var_1d_95?: number | null;
    exposicion_mercado_usd?: { spy: number | null; qqq: number | null };
    n_obs?: number;
  };
  contribucion_riesgo: { ticker: string; notional: number; contrib_pct: number }[];
  excluidos: string[];
  nota?: string;
}

export interface CorrelationMatrix {
  tickers: string[];
  excluidos: string[];
  n_obs: number;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  ventana_dias: number;
  matriz: (number | null)[][];
  vol_anual: Record<string, number | null>;
}

/** Item del universo para el buscador de tickers (de /api/scanner/cedears). */
export interface UniversoItem {
  ticker: string;       // ticker_corto BYMA
  nombre: string | null;
  sector: string | null;
}
