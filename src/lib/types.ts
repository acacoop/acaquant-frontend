/**
 * Tipos compartidos entre páginas y componentes. Antes estaban duplicados
 * en casi cada archivo. Los componentes existentes pueden migrar
 * gradualmente — no es breaking.
 */

export interface RentaFijaDoc {
  instrumento: string;
  metrics?: {
    last_price?: number;
    vwap?: number;
    total_nominals?: number;
    high_price?: number;
    low_price?: number;
    closing_price?: number;
    open_price?: number;
    duration?: number;
    mod_duration?: number;
    convexity?: number;
    // TC breakeven = MEP × (flujo_vto / last). Sólo populado para
    // bonos de tasa fija (nativa o CER ya fijado por el BCRA).
    tc_breakeven?: number | null;
  };
}

export interface ForwardDoc {
  curva: string;
  tickers?: string[];
  tasas?: Record<string, number>;
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

export interface ForwardHistDoc {
  curva: string;
  fecha: string;
  matrix: Record<string, Record<string, number>>;
}

export interface ForwardZscoreStats {
  media: number;
  desvio: number;
  n_obs: number;
}

export interface ForwardZscoreDoc {
  curva: string;
  fecha_calculo?: string;
  ventana_dias_habiles?: number;
  n_obs_min?: number;
  stats?: Record<string, Record<string, ForwardZscoreStats>>;
}

export interface FairValueBono {
  ticker: string;
  ticker_corto?: string | null;
  duration: number;
  tea_obs: number;
  tea_teorica: number;
  residuo_bps: number;
  z_estatico: number | null;
  z_temporal: number | null;
  n_obs?: number | null;
  en_universo?: boolean;
}

export interface FairValueDoc {
  curva: string;
  ts_cierre_beta?: string;     // live trae el ts_cierre del cual son los β
  ts_cierre?: string;           // cierre persistido trae fecha del cierre
  beta0: number;
  beta1: number;
  beta2: number;
  r2: number;
  sigma_dia_bps: number;
  n_bonos_universo: number;
  updated_at?: string | null;
  bonos: FairValueBono[];
  error?: string;
}

export interface FairValueHistRow {
  fecha: string;
  residuo_bps: number;
  z_temporal: number | null;
  z_estatico: number | null;
  tea_obs: number;
  tea_teorica: number;
  duration: number;
}

export interface FairValueHistorico {
  ticker: string;
  curva?: string | null;
  dias: number;
  serie: FairValueHistRow[];
}

export interface FlujoTicker {
  ticker: string;
  curva: string;
  fecha_vencimiento?: string;
}

export interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  dias: number;
  tem_lecap: number;
  paridad_cer: number;
  breakeven_mensual: number;
}

export interface BreakevenDoc {
  pares?: BreakevenPar[];
  updated_at?: string;
}

export interface BreakevenHistDoc {
  fecha: string;
  pares: BreakevenPar[];
}

export interface Quote {
  symbol: string;
  type: "stock" | "forex" | "treasury" | "index";
  grupo?: string;
  last: number | null;
  prev_close: number | null;
  pct_day: number | null;
  ret_7d:  number | null;
  ret_mtd: number | null;
  ret_ytd: number | null;
  ret_1y:  number | null;
  updated_at?: string;
}
