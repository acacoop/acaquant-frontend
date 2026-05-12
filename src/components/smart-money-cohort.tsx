"use client";

import { Panel } from "./ui";
import type {
  CohortOverview,
  CohortTicker,
  RecentActivity,
  RecentTx,
} from "@/lib/types-smart-money";

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${n < 0 ? "-" : ""}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${n < 0 ? "-" : ""}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${n < 0 ? "-" : ""}$${(a / 1e3).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${a.toFixed(0)}`;
}

function fmtUSDSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + fmtUSD(n);
}

function deltaColor(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "text-[#666]";
  return n >= 0 ? "text-[#4ade80]" : "text-[#f87171]";
}

function fmtFecha(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

const TX_LABELS: Record<string, string> = {
  P: "Purchase",
  S: "Sale",
  A: "Award",
  M: "Exercise",
  F: "Tax W/H",
  G: "Gift",
  D: "Disposition",
};

function txCodeStyle(code: string): string {
  if (code === "P") return "bg-[#4ade80]/15 text-[#4ade80]";
  if (code === "S") return "bg-[#f87171]/15 text-[#f87171]";
  return "bg-[#2a2a2a] text-[#a0a0a0]";
}

export function SmartMoneyCohort({
  initial,
  recent,
}: {
  initial: CohortOverview;
  recent: RecentActivity;
}) {
  return (
    <div className="h-full min-h-0 p-3 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-auto">
      {/* Top buys */}
      <Panel
        title={`🟢 TOP BUYS — Q ${initial.current_quarter ?? "—"} vs Q ${initial.previous_quarter ?? "—"}`}
        sub="net change USD (cohort agregado)"
      >
        <CohortTable rows={initial.top_buys} netColor="green" emptyMsg="Sin top buys" />
      </Panel>

      {/* Top sells */}
      <Panel
        title={`🔴 TOP SELLS`}
        sub="net change USD (cohort agregado)"
      >
        <CohortTable rows={initial.top_sells} netColor="red" emptyMsg="Sin top sells" />
      </Panel>

      {/* Consensus buy */}
      <Panel
        title={`🤝 CONSENSUS BUY (>=70% movers comprando)`}
        sub="señal positiva de cobertura"
      >
        <ConsensusTable rows={initial.consensus_buy} kind="buy" emptyMsg="Sin consensus buys" />
      </Panel>

      {/* Consensus sell */}
      <Panel
        title={`🔥 CONSENSUS SELL (<=30% movers comprando)`}
        sub="señal negativa de cobertura"
      >
        <ConsensusTable rows={initial.consensus_sell} kind="sell" emptyMsg="Sin consensus sells" />
      </Panel>

      {/* Divergences */}
      <Panel
        title={`⚖️ DIVERGENCIAS (45-55% buyers)`}
        sub="split fuerte — cohort dividido"
      >
        <ConsensusTable rows={initial.divergences} kind="div" emptyMsg="Sin divergencias" />
      </Panel>

      {/* Recent activity (Form 4) */}
      <Panel
        title={`📰 INSIDERS últimos ${recent.since_days} días`}
        sub={`desde ${fmtFecha(recent.since_date)}`}
      >
        <InsiderRecentTable rows={recent.transactions} />
      </Panel>
    </div>
  );
}

function CohortTable({
  rows,
  netColor,
  emptyMsg,
}: {
  rows: CohortTicker[];
  netColor: "green" | "red";
  emptyMsg: string;
}) {
  if (!rows.length) {
    return <p className="text-[#555] text-xs py-4 text-center">{emptyMsg}</p>;
  }
  const color = netColor === "green" ? "text-[#4ade80]" : "text-[#f87171]";
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="text-[9px] text-[#808080] uppercase bg-[#0a0a0a]">
        <tr>
          <th className="text-left px-2 py-1">Ticker</th>
          <th className="text-right px-2 py-1">NET Δ</th>
          <th className="text-right px-2 py-1">Holders</th>
          <th className="text-right px-2 py-1">NEW</th>
          <th className="text-right px-2 py-1">↑</th>
          <th className="text-right px-2 py-1">↓</th>
          <th className="text-right px-2 py-1">EXIT</th>
          <th className="text-right px-2 py-1">Total $</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ticker} className="border-b border-[#101010] hover:bg-[#0d0d0d]">
            <td className="px-2 py-1 text-[#ff9900] font-semibold">{r.ticker}</td>
            <td className={`px-2 py-1 text-right font-semibold ${color}`}>
              {fmtUSDSigned(r.net_change_usd)}
            </td>
            <td className="px-2 py-1 text-right text-[#d0d0d0]">{r.n_holders_curr}</td>
            <td className="px-2 py-1 text-right text-[#4ade80]">{r.new || ""}</td>
            <td className="px-2 py-1 text-right text-[#4ade80]">{r.increased || ""}</td>
            <td className="px-2 py-1 text-right text-[#f87171]">{r.reduced || ""}</td>
            <td className="px-2 py-1 text-right text-[#f87171]">{r.exited || ""}</td>
            <td className="px-2 py-1 text-right text-[#a0a0a0]">{fmtUSD(r.current_value_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConsensusTable({
  rows,
  kind,
  emptyMsg,
}: {
  rows: CohortTicker[];
  kind: "buy" | "sell" | "div";
  emptyMsg: string;
}) {
  if (!rows.length) {
    return <p className="text-[#555] text-xs py-4 text-center">{emptyMsg}</p>;
  }
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="text-[9px] text-[#808080] uppercase bg-[#0a0a0a]">
        <tr>
          <th className="text-left px-2 py-1">Ticker</th>
          <th className="text-right px-2 py-1">BUY %</th>
          <th className="text-right px-2 py-1">Holders</th>
          <th className="text-right px-2 py-1">NEW</th>
          <th className="text-right px-2 py-1">↑</th>
          <th className="text-right px-2 py-1">↓</th>
          <th className="text-right px-2 py-1">EXIT</th>
          <th className="text-right px-2 py-1">NET Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pctColor =
            kind === "buy"
              ? "text-[#4ade80]"
              : kind === "sell"
              ? "text-[#f87171]"
              : "text-[#ffd700]";
          return (
            <tr key={r.ticker} className="border-b border-[#101010] hover:bg-[#0d0d0d]">
              <td className="px-2 py-1 text-[#ff9900] font-semibold">{r.ticker}</td>
              <td className={`px-2 py-1 text-right font-semibold ${pctColor}`}>
                {r.buy_pct !== null ? `${r.buy_pct}%` : "—"}
              </td>
              <td className="px-2 py-1 text-right text-[#d0d0d0]">{r.n_holders_curr}</td>
              <td className="px-2 py-1 text-right text-[#4ade80]">{r.new || ""}</td>
              <td className="px-2 py-1 text-right text-[#4ade80]">{r.increased || ""}</td>
              <td className="px-2 py-1 text-right text-[#f87171]">{r.reduced || ""}</td>
              <td className="px-2 py-1 text-right text-[#f87171]">{r.exited || ""}</td>
              <td className={`px-2 py-1 text-right ${deltaColor(r.net_change_usd)}`}>
                {fmtUSDSigned(r.net_change_usd)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InsiderRecentTable({ rows }: { rows: RecentTx[] }) {
  if (!rows.length) {
    return <p className="text-[#555] text-xs py-4 text-center">Sin actividad en el período</p>;
  }
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="text-[9px] text-[#808080] uppercase bg-[#0a0a0a]">
        <tr>
          <th className="text-left px-2 py-1">Ticker</th>
          <th className="text-left px-2 py-1">Insider</th>
          <th className="text-left px-2 py-1">Title</th>
          <th className="text-center px-2 py-1">Code</th>
          <th className="text-right px-2 py-1">Value</th>
          <th className="text-right px-2 py-1">Filed</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 25).map((r, i) => (
          <tr key={`${r.ticker}-${r.filing_date}-${i}`} className="border-b border-[#101010] hover:bg-[#0d0d0d]">
            <td className="px-2 py-1 text-[#ff9900] font-semibold">{r.ticker}</td>
            <td className="px-2 py-1 text-[#d0d0d0]">{r.insider_name}</td>
            <td className="px-2 py-1 text-[#808080] text-[9px]">{(r.officer_title || "").slice(0, 24)}</td>
            <td className="px-2 py-1 text-center">
              <span className={`text-[9px] px-1.5 py-0.5 ${txCodeStyle(r.tx_code)}`}>
                {r.tx_code} {TX_LABELS[r.tx_code] ? `· ${TX_LABELS[r.tx_code]}` : ""}
              </span>
            </td>
            <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtUSD(r.value_usd)}</td>
            <td className="px-2 py-1 text-right text-[#666]">{fmtFecha(r.filing_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
