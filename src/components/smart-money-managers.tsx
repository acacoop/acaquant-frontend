"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "./ui";
import type {
  ManagerDoc,
  ManagerHolding,
  ManagerPortfolio,
} from "@/lib/types-smart-money";

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `${n < 0 ? "-" : ""}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${n < 0 ? "-" : ""}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${n < 0 ? "-" : ""}$${(a / 1e3).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${a.toFixed(0)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR");
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function statusColor(s: string): string {
  if (s === "NEW") return "bg-[#4ade80]/15 text-[#4ade80]";
  if (s === "INCREASED") return "bg-[#4ade80]/10 text-[#4ade80]";
  if (s === "REDUCED") return "bg-[#f87171]/10 text-[#f87171]";
  if (s === "EXITED") return "bg-[#f87171]/15 text-[#f87171]";
  return "bg-[#2a2a2a] text-[#808080]";
}

export function SmartMoneyManagers({
  initialManagers,
}: {
  initialManagers: ManagerDoc[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCik, setSelectedCik] = useState<string | null>(null);

  // Top managers por max_n_cedear_holdings (los más exposed a CEDEARs).
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? initialManagers.filter((m) =>
          (m.name || "").toLowerCase().includes(q) || m.cik.includes(q),
        )
      : initialManagers;
    return [...filtered].sort(
      (a, b) => (b.max_n_cedear_holdings || 0) - (a.max_n_cedear_holdings || 0),
    );
  }, [initialManagers, search]);

  return (
    <div className="h-full min-h-0 p-3 grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-3 overflow-hidden">
      {/* Lista de managers */}
      <div className="min-h-0 flex flex-col">
        <Panel title={`🐋 MANAGERS DESCUBIERTOS (${initialManagers.length.toLocaleString("es-AR")})`} fill>
          <div className="p-2 flex flex-col gap-2 h-full min-h-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o CIK…"
              className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[10px] font-mono">
                <thead className="text-[8px] text-[#808080] uppercase bg-[#0a0a0a] sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Manager</th>
                    <th className="text-right px-2 py-1">CEDEARs</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 300).map((m) => {
                    const isSel = m.cik === selectedCik;
                    return (
                      <tr
                        key={m.cik}
                        onClick={() => setSelectedCik(m.cik)}
                        className={`border-b border-[#101010] cursor-pointer ${
                          isSel ? "bg-[#ff9900]/10" : "hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <td className={`px-2 py-1 ${isSel ? "text-[#ff9900]" : "text-[#d0d0d0]"}`}>
                          {(m.name || "").slice(0, 36)}
                        </td>
                        <td className="px-2 py-1 text-right text-[#a0a0a0]">
                          {m.max_n_cedear_holdings || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sorted.length > 300 && (
                <p className="text-[9px] text-[#555] text-center py-2">
                  Mostrando los 300 con más holdings · refiná con el buscador
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* Portfolio del seleccionado */}
      <div className="min-h-0 overflow-auto">
        {selectedCik ? (
          <ManagerPortfolioView cik={selectedCik} />
        ) : (
          <Panel title="PORTFOLIO" fill>
            <div className="p-6 text-center text-[#666] text-[12px]">
              Seleccioná un manager de la lista para ver su portfolio CEDEAR y los cambios Q-on-Q.
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ManagerPortfolioView({ cik }: { cik: string }) {
  const [data, setData] = useState<ManagerPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
     
    setError(null);
    fetch(`/api/smart-money/manager/${cik}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ManagerPortfolio;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && (setError(String(e.message || e)), setData(null)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cik]);

  if (loading) {
    return (
      <Panel title="PORTFOLIO" fill>
        <p className="text-[#555] text-xs py-6 text-center">Cargando…</p>
      </Panel>
    );
  }
  if (error || !data) {
    return (
      <Panel title="PORTFOLIO" fill>
        <p className="text-[#f87171] text-xs py-6 text-center">{error ?? "Sin data"}</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title={`🐋 ${data.manager.name || data.manager.cik}`}
        sub={`CIK ${data.manager.cik} · last filing ${data.manager.last_filing_date ?? "—"}`}
      >
        <div className="p-2 grid grid-cols-3 gap-2 text-[10px]">
          <Kpi label="HOLDINGS CEDEAR" value={fmtNum(data.n_holdings_cedear)} />
          <Kpi label="TOTAL VALUE" value={fmtUSD(data.total_value_usd)} color="#ff9900" />
          <Kpi
            label="CURRENT Q"
            value={data.current_quarter ?? "—"}
            color="#a0a0a0"
          />
        </div>
      </Panel>

      <Panel
        title={`HOLDINGS — Q ${data.current_quarter ?? "—"} vs Q ${data.previous_quarter ?? "—"}`}
      >
        {data.holdings.length === 0 ? (
          <p className="text-[#555] text-xs py-4 text-center">
            Sin holdings en el período
          </p>
        ) : (
          <HoldingsTable rows={data.holdings} />
        )}
      </Panel>

      {data.exited.length > 0 && (
        <Panel title={`❌ EXITED — posiciones cerradas el último Q`}>
          <HoldingsTable rows={data.exited} hidePctPortfolio />
        </Panel>
      )}
    </div>
  );
}

function HoldingsTable({
  rows,
  hidePctPortfolio,
}: {
  rows: ManagerHolding[];
  hidePctPortfolio?: boolean;
}) {
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="text-[8px] text-[#808080] uppercase bg-[#0a0a0a]">
        <tr>
          <th className="text-left px-2 py-1">Ticker</th>
          <th className="text-right px-2 py-1">Shares</th>
          <th className="text-right px-2 py-1">Value</th>
          {!hidePctPortfolio && <th className="text-right px-2 py-1">% Port</th>}
          <th className="text-center px-2 py-1">Status</th>
          <th className="text-right px-2 py-1">Δ %</th>
          <th className="text-right px-2 py-1">Prev Shares</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.ticker} className="border-b border-[#101010] hover:bg-[#0d0d0d]">
            <td className="px-2 py-1 text-[#ff9900] font-semibold">{h.ticker}</td>
            <td className="px-2 py-1 text-right text-[#a0a0a0]">{fmtNum(h.shares)}</td>
            <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtUSD(h.value_usd)}</td>
            {!hidePctPortfolio && (
              <td className="px-2 py-1 text-right text-[#a0a0a0]">
                {h.pct_of_cedear_portfolio.toFixed(1)}%
              </td>
            )}
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
            <td className="px-2 py-1 text-right text-[#666]">
              {h.prev_shares !== null ? fmtNum(h.prev_shares) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
