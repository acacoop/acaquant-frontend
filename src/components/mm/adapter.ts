import type { ApiTrade, CurvaBond, SessionInfo, SpecTrade } from "./types";

// Mapea el shape de /api/cotizaciones/historico/trades al shape
// {ts, p, s, d} que espera el motor de la spec.
//
//   API: side="BUY"   → spec: d="B"
//   API: side="SELL"  → spec: d="S"
//   otros (MARKET, etc.) → d="M"  (la spec los acepta como market trades sin side)
export function apiToSpecTrade(t: ApiTrade): SpecTrade {
  const side = (t.side || "").toUpperCase();
  const d: "B" | "S" | "M" = side === "BUY" ? "B" : side === "SELL" ? "S" : "M";
  // ts: solo HH:MM:SS local — los timestamps del motor son naive ART
  // rotulados UTC en Mongo. Para mostrar "12:00:23" del horario real ART,
  // tomamos los chars 11-19 del ISO.
  const ts = (t.timestamp || "").length >= 19
    ? t.timestamp.substring(11, 19)
    : (t.timestamp || "");
  return { ts, p: t.price, s: t.size, d };
}

export function buildSessionInfo(
  bond: CurvaBond,
  fecha: string,
  trades: SpecTrade[],
): SessionInfo {
  if (!trades.length) {
    return {
      ticker:           bond.ticker_corto,
      full_ticker:      bond.ticker,
      date:             fecha,
      open: 0, high: 0, low: 0, close: 0,
      total_volume_vn:  0,
      total_money_ars:  0,
      num_trades:       0,
      duration:         bond.duration ?? 0,
      mod_duration:     bond.mod_duration ?? 0,
      tea:              bond.tea ?? 0,
      paridad:          bond.paridad ?? 0,
    };
  }
  const prices = trades.map((t) => t.p);
  const open = prices[0];
  const close = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const totalVN = trades.reduce((acc, t) => acc + t.s, 0);
  const totalMoney = trades.reduce((acc, t) => acc + t.s * t.p, 0);
  return {
    ticker:           bond.ticker_corto,
    full_ticker:      bond.ticker,
    date:             fecha,
    open, high, low, close,
    total_volume_vn:  totalVN,
    total_money_ars:  totalMoney,
    num_trades:       trades.length,
    duration:         bond.duration ?? 0,
    mod_duration:     bond.mod_duration ?? 0,
    tea:              bond.tea ?? 0,
    paridad:          bond.paridad ?? 0,
  };
}
