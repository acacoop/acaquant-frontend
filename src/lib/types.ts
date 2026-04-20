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
