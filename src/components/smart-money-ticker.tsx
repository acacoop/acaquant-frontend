"use client";

import { useEffect, useState } from "react";
import { Panel } from "./ui";
import type {
  CedearCatalogItem,
  InsiderTx,
  TickerFlow,
  TopHolder,
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

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR");
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

function statusColor(s: string): string {
  if (s === "NEW") return "bg-[#4ade80]/15 text-[#4ade80]";
  if (s === "INCREASED") return "bg-[#4ade80]/10 text-[#4ade80]";
  if (s === "REDUCED") return "bg-[#f87171]/10 text-[#f87171]";
  if (s === "EXITED") return "bg-[#f87171]/15 text-[#f87171]";
  return "bg-[#2a2a2a] text-[#808080]";
}

function txCodeStyle(code: string): string {
  if (code === "P") return "bg-[#4ade80]/15 text-[#4ade80]";
  if (code === "S") return "bg-[#f87171]/15 text-[#f87171]";
  return "bg-[#2a2a2a] text-[#a0a0a0]";
}

export function SmartMoneyTicker({ catalog }: { catalog: CedearCatalogItem[] }) {
  const [ticker, setTicker] = useState<string>(catalog[0]?.ticker ?? "AAPL");
  const [flow, setFlow] = useState<TickerFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
     
    setError(null);
    fetch(`/api/smart-money/ticker/${ticker}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as TickerFlow;
      })
      .then((data) => {
        if (cancelled) return;
        setFlow(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e.message || e));
        setFlow(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-3 overflow-auto">
      {/* Selector */}
      <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2 flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-[#808080] uppercase">CEDEAR</span>
        <select
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none min-w-[200px]"
        >
          {catalog.map((c) => (
            <option key={c.ticker} value={c.ticker}>
              {c.ticker} — {c.nombre_corto}
            </option>
          ))}
        </select>
        {loading && <span className="text-[10px] text-[#666]">cargando…</span>}
        {error && <span className="text-[10px] text-[#f87171]">{error}</span>}
      </div>

      {flow && <TickerFlowView flow={flow} />}
    </div>
  );
}

function TickerFlowView({ flow }: { flow: TickerFlow }) {
  const inst = flow.institutional_13f;
  const insiders = flow.insiders_form4;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="border border-[#1a1a1a] bg-[#080808] px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[24px] font-bold text-[#ff9900]">{flow.meta.ticker}</span>
          <span className="text-[14px] text-[#d0d0d0]">{flow.meta.nombre_corto}</span>
          <span className="text-[9px] text-[#555] font-mono ml-auto">
            CUSIP {flow.meta.cusip} · CIK {flow.meta.cik_issuer || "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 13F block */}
        <Panel
          title={`🐋 INSTITUTIONAL 13F · Q ${inst.current_quarter ?? "—"}`}
          sub={`vs Q ${inst.previous_quarter ?? "—"}`}
        >
          {!inst.current_quarter ? (
            <p className="text-[#555] text-xs py-4 text-center">
              Sin holdings 13F en período actual
            </p>
          ) : (
            <Institutional13FBlock
              n_managers={inst.n_managers ?? 0}
              total_value_usd={inst.total_value_usd ?? 0}
              qoq={inst.qoq_summary ?? {
                new_positions: 0, increased: 0, reduced: 0,
                exited: 0, unchanged: 0, net_change_usd: 0,
              }}
              top_holders={inst.top_holders ?? []}
            />
          )}
        </Panel>

        {/* Insiders block */}
        <Panel
          title={`🧑 INSIDERS — Form 4 últimos ${insiders.since_days}d`}
          sub={`desde ${insiders.since_date}`}
        >
          <InsidersBlock
            n_transactions={insiders.n_transactions}
            n_insiders={insiders.n_insiders}
            total_buy={insiders.total_buy_usd}
            total_sell={insiders.total_sell_usd}
            net={insiders.net_usd}
            top_tx={insiders.top_transactions}
          />
        </Panel>
      </div>
    </div>
  );
}

function Institutional13FBlock({
  n_managers,
  total_value_usd,
  qoq,
  top_holders,
}: {
  n_managers: number;
  total_value_usd: number;
  qoq: { new_positions: number; increased: number; reduced: number; exited: number; unchanged: number; net_change_usd: number };
  top_holders: TopHolder[];
}) {
  return (
    <div className="p-2 flex flex-col gap-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <Kpi label="MANAGERS" value={fmtNum(n_managers)} />
        <Kpi label="TOTAL HELD" value={fmtUSD(total_value_usd)} color="#ff9900" />
        <Kpi
          label="NET Δ vs PREV Q"
          value={fmtUSDSigned(qoq.net_change_usd)}
          color={qoq.net_change_usd >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      {/* Q-on-Q breakdown */}
      <div className="grid grid-cols-5 gap-2 text-[9px]">
        <Mini label="🆕 NEW" value={qoq.new_positions} color="#4ade80" />
        <Mini label="↑ INC" value={qoq.increased} color="#4ade80" />
        <Mini label="↓ RED" value={qoq.reduced} color="#f87171" />
        <Mini label="❌ EXIT" value={qoq.exited} color="#f87171" />
        <Mini label="= SAME" value={qoq.unchanged} color="#a0a0a0" />
      </div>

      {/* Top holders */}
      <div>
        <div className="text-[9px] text-[#808080] uppercase mb-1 pl-1">
          Top 20 holders
        </div>
        {top_holders.length === 0 ? (
          <p className="text-[#555] text-xs py-3 text-center">Sin top holders</p>
        ) : (
          <table className="w-full text-[10px] font-mono">
            <thead className="text-[8px] text-[#808080] uppercase bg-[#0a0a0a]">
              <tr>
                <th className="text-left px-2 py-1">Manager</th>
                <th className="text-right px-2 py-1">Shares</th>
                <th className="text-right px-2 py-1">Value</th>
                <th className="text-center px-2 py-1">Status</th>
                <th className="text-right px-2 py-1">Δ %</th>
              </tr>
            </thead>
            <tbody>
              {top_holders.map((h) => (
                <tr key={h.filer_cik} className="border-b border-[#101010] hover:bg-[#0d0d0d]">
                  <td className="px-2 py-1 text-[#d0d0d0]">{h.filer_name.slice(0, 35)}</td>
                  <td className="px-2 py-1 text-right text-[#a0a0a0]">{fmtNum(h.shares)}</td>
                  <td className="px-2 py-1 text-right text-[#ff9900]">{fmtUSD(h.value_usd)}</td>
                  <td className="px-2 py-1 text-center">
                    <span className={`text-[8px] px-1.5 py-0.5 ${statusColor(h.status)}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right">
                    {h.shares_delta_pct !== null ? (
                      <span className={h.shares_delta_pct >= 0 ? "text-[#4ade80]" : "text-[#f87171]"}>
                        {fmtPct(h.shares_delta_pct)}
                      </span>
                    ) : (
                      <span className="text-[#666]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InsidersBlock({
  n_transactions,
  n_insiders,
  total_buy,
  total_sell,
  net,
  top_tx,
}: {
  n_transactions: number;
  n_insiders: number;
  total_buy: number;
  total_sell: number;
  net: number;
  top_tx: InsiderTx[];
}) {
  return (
    <div className="p-2 flex flex-col gap-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <Kpi label="TX TOTAL" value={fmtNum(n_transactions)} />
        <Kpi label="INSIDERS" value={fmtNum(n_insiders)} />
        <Kpi
          label="NET FLOW"
          value={fmtUSDSigned(net)}
          color={net >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <Kpi label="🟢 BUYS (P)" value={fmtUSD(total_buy)} color="#4ade80" />
        <Kpi label="🔴 SELLS (S)" value={fmtUSD(total_sell)} color="#f87171" />
      </div>

      {/* Top transactions */}
      <div>
        <div className="text-[9px] text-[#808080] uppercase mb-1 pl-1">
          Top 10 transactions por USD
        </div>
        {top_tx.length === 0 ? (
          <p className="text-[#555] text-xs py-3 text-center">Sin transacciones</p>
        ) : (
          <table className="w-full text-[10px] font-mono">
            <thead className="text-[8px] text-[#808080] uppercase bg-[#0a0a0a]">
              <tr>
                <th className="text-left px-2 py-1">Insider</th>
                <th className="text-left px-2 py-1">Title</th>
                <th className="text-center px-2 py-1">Code</th>
                <th className="text-right px-2 py-1">Value</th>
                <th className="text-right px-2 py-1">Date</th>
              </tr>
            </thead>
            <tbody>
              {top_tx.map((tx, i) => (
                <tr key={i} className="border-b border-[#101010] hover:bg-[#0d0d0d]">
                  <td className="px-2 py-1 text-[#d0d0d0]">{tx.insider_name.slice(0, 25)}</td>
                  <td className="px-2 py-1 text-[#808080] text-[9px]">{(tx.officer_title || "").slice(0, 18)}</td>
                  <td className="px-2 py-1 text-center">
                    <span className={`text-[8px] px-1.5 py-0.5 ${txCodeStyle(tx.tx_code)}`}>
                      {tx.tx_code} {TX_LABELS[tx.tx_code] ? `· ${TX_LABELS[tx.tx_code]}` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right text-[#ff9900]">{fmtUSD(tx.value_usd)}</td>
                  <td className="px-2 py-1 text-right text-[#666]">{(tx.transaction_date || "").slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-2 py-1.5">
      <div className="text-[8px] text-[#808080] uppercase">{label}</div>
      <div className="font-mono text-[12px] font-semibold" style={{ color: color || "#d0d0d0" }}>
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-2 py-1 text-center">
      <div className="text-[8px] text-[#808080]">{label}</div>
      <div className="font-mono text-[11px] font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
