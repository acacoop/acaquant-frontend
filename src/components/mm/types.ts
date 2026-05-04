// Types espejo del backend api/services/mm_microstructure.py.

export interface BookLevel {
  price: number;
  size: number;
}

export interface BookSnapshot {
  bids: BookLevel[];
  offers: BookLevel[];
}

export interface BookMetrics {
  best_bid: number | null;
  best_ask: number | null;
  bid_size: number | null;
  ask_size: number | null;
  mid: number | null;
  microprice: number | null;
  obi: number | null;
  quoted_spread: number | null;
  qs_bps: number | null;
}

export interface EnrichedTrade {
  timestamp: string;
  price: number;
  size: number;
  side: string;
  es: number | null;
  es_bps: number | null;
  lee_ready: string;
  lee_ready_matches_side: boolean | null;
  walking: boolean | null;
  top_size_at_trade: number | null;
  mid: number | null;
}

export interface LiveResp {
  ticker: string;
  ts_book: string | null;
  book: BookSnapshot;
  metrics: BookMetrics;
  last_trade: EnrichedTrade | null;
}

export interface TapeResp {
  ticker: string;
  desde: string;
  hasta: string;
  n: number;
  trades: EnrichedTrade[];
}

export interface IntradayBucket {
  ts_start: string;
  ts_start_ar: string;
  n_trades: number;
  volume: number;
  nof: number;
  qES: number | null;
  walking_pct: number | null;
  realized_vol: number | null;
  mid_close: number | null;
}

export interface IntradayResp {
  ticker: string;
  fecha: string | null;
  bucket_min: number;
  buckets: IntradayBucket[];
  n_trades?: number;
}

export interface ImpactResp {
  ticker: string;
  desde: string | null;
  hasta: string | null;
  dias: number;
  permanent_impact: {
    b: number | null;
    r2: number | null;
    n_buckets: number;
    interpretacion: string;
  };
  temporary_impact: {
    k: number | null;
    r2: number | null;
    n_trades: number;
    interpretacion: string;
  };
}

export interface SmileBucket {
  idx: number;
  ts_ar: string;
  n_dias_obs: number;
  avg_volume: number | null;
  avg_realized_vol: number | null;
  avg_n_trades: number | null;
}

export interface SmileResp {
  ticker: string;
  dias: number;
  bucket_min: number;
  buckets: SmileBucket[];
}

export interface StylizedFactsResp {
  ticker: string;
  dias: number;
  bucket_min: number;
  n_obs: number;
  mu?: number;
  sigma?: number;
  skewness?: number;
  kurtosis?: number;
  exceso_kurt?: number;
  acf1_mid?: number | null;
  acf1_last?: number | null;
  acf_abs_persistencia?: number;
  acf_abs?: (number | null)[];
  jarque_bera?: number;
  jb_p?: number;
  interpretacion?: string[];
  error?: string;
}
