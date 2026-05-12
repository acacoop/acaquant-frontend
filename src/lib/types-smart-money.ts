// Types del módulo /renta-variable — smart money tracker.
// Matchean los shapes que devuelve api/services/smart_money.py.

export type Holding13FStatus =
  | "NEW"
  | "INCREASED"
  | "REDUCED"
  | "UNCHANGED"
  | "EXITED";

// ── CEDEAR catalog ──────────────────────────────────────────────────────────

export interface CedearCatalogItem {
  ticker: string;
  cusip: string;
  nombre_corto: string;
  cik_issuer?: string | null;
  is_active: boolean;
  seeded_at?: string;
}

// ── Managers ────────────────────────────────────────────────────────────────

export interface ManagerDoc {
  cik: string;
  name: string;
  last_filing_date?: string;
  last_seen_at?: string;
  first_seen_at?: string;
  n_filings_seen?: number;
  max_n_cedear_holdings?: number;
  discovered_via?: string;
}

// ── Holdings (output del manager portfolio) ─────────────────────────────────

export interface ManagerHolding {
  ticker: string;
  cusip: string;
  shares: number;
  value_usd: number;
  n_lines: number;
  pct_of_cedear_portfolio: number;
  status: Holding13FStatus;
  shares_delta_pct: number | null;
  prev_shares: number | null;
  prev_value_usd: number | null;
}

export interface ManagerPortfolio {
  manager: ManagerDoc;
  current_quarter: string | null;
  previous_quarter: string | null;
  n_holdings_cedear: number;
  total_value_usd: number;
  holdings: ManagerHolding[];
  exited: ManagerHolding[];
}

// ── Ticker flow (la pantalla central) ───────────────────────────────────────

export interface TopHolder {
  filer_cik: string;
  filer_name: string;
  shares: number;
  value_usd: number;
  status: Holding13FStatus;
  shares_delta_pct: number | null;
}

export interface QoqSummary {
  new_positions: number;
  increased: number;
  reduced: number;
  exited: number;
  unchanged: number;
  net_change_usd: number;
}

export interface Institutional13F {
  current_quarter: string;
  previous_quarter: string | null;
  n_managers: number;
  total_value_usd: number;
  qoq_summary: QoqSummary;
  top_holders: TopHolder[];
}

export interface InsiderTx {
  insider_name: string;
  officer_title: string | null;
  is_director: boolean | null;
  is_officer: boolean | null;
  is_ten_percent: boolean | null;
  tx_code: string;
  tx_type: string;
  shares: number;
  price_per_share: number | null;
  value_usd: number | null;
  transaction_date: string | null;
  filing_date: string;
}

export interface Form4Block {
  since_days: number;
  since_date: string;
  n_transactions: number;
  n_insiders: number;
  total_buy_usd: number;
  total_sell_usd: number;
  net_usd: number;
  top_transactions: InsiderTx[];
}

export interface TickerFlow {
  meta: {
    ticker: string;
    cusip: string;
    nombre_corto: string;
    cik_issuer: string | null;
  };
  institutional_13f: Partial<Institutional13F>;
  insiders_form4: Form4Block;
}

// ── Cohort overview ─────────────────────────────────────────────────────────

export interface CohortTicker {
  ticker: string;
  cusip: string;
  nombre_corto: string;
  n_holders_curr: number;
  n_holders_prev: number;
  new: number;
  increased: number;
  reduced: number;
  exited: number;
  unchanged: number;
  net_change_usd: number;
  current_value_usd: number;
  buy_pct: number | null;
}

export interface CohortOverview {
  current_quarter: string | null;
  previous_quarter: string | null;
  top_buys: CohortTicker[];
  top_sells: CohortTicker[];
  consensus_buy: CohortTicker[];
  consensus_sell: CohortTicker[];
  divergences: CohortTicker[];
}

// ── Recent activity ─────────────────────────────────────────────────────────

export interface RecentTx {
  ticker: string;
  insider_name: string;
  officer_title: string | null;
  tx_code: string;
  shares: number;
  value_usd: number | null;
  transaction_date: string | null;
  filing_date: string;
}

export interface RecentActivity {
  since_days: number;
  since_date: string;
  ts: string;
  transactions: RecentTx[];
}
