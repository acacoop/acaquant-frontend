import { apiFetch } from "@/lib/api";
import { TradingView } from "@/components/trading-view";
import type { PanelResp } from "@/lib/types-trading";

export const dynamic = "force-dynamic";

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function TradingPage() {
  const [wl, panel] = await Promise.all([
    safeFetch<{ tickers: string[] }>("/api/trading/watchlist", { tickers: [] }),
    safeFetch<PanelResp>("/api/trading/panel", {
      generado_en: "",
      ccl: { value: null, vs_1d_pct: null, ts: null },
      rows: [],
    }),
  ]);

  return <TradingView initialWatchlist={wl.tickers} initialPanel={panel} />;
}
