"use client";

import { useEffect, useState } from "react";

const TERMINAL_STATES = new Set(["FILLED", "CANCELLED", "REJECTED", "EXPIRED"]);

interface Orden {
  cl_ord_id: string;
  ticker?: string;
  side?: string;
  size?: number;
  price?: number | null;
  status?: string;
  cum_qty?: number;
  leaves_qty?: number;
  reject_reason?: string | null;
  created_at?: string;
  actor_email?: string;
  proprietary?: string;
}

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";
type Tif = "DAY" | "IOC" | "FOK" | "GTC";

export function OperarView() {
  const [ticker, setTicker] = useState("MERV - XMEV - AL30 - 24hs");
  const [side, setSide] = useState<Side>("BUY");
  const [size, setSize] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [price, setPrice] = useState("");
  const [tif, setTif] = useState<Tif>("DAY");

  const [orders, setOrders] = useState<Orden[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function fetchOrders() {
    try {
      const r = await fetch("/api/ordenes/dia", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignorado — el polling reintenta solo
    }
  }

  useEffect(() => {
    fetchOrders();
    const id = setInterval(fetchOrders, 3000);
    return () => clearInterval(id);
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setFeedback(null);
    const sizeNum = parseInt(size, 10);
    const priceNum = orderType === "LIMIT" ? parseFloat(price) : null;
    if (!ticker.trim() || !sizeNum || sizeNum <= 0) {
      setFeedback({ kind: "err", msg: "ticker y size > 0 son obligatorios" });
      setSubmitting(false);
      return;
    }
    if (orderType === "LIMIT" && (priceNum === null || isNaN(priceNum) || priceNum <= 0)) {
      setFeedback({ kind: "err", msg: "LIMIT requiere precio > 0" });
      setSubmitting(false);
      return;
    }
    try {
      const r = await fetch("/api/ordenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim(),
          side,
          size: sizeNum,
          order_type: orderType,
          price: priceNum,
          tif,
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setFeedback({ kind: "ok", msg: `Orden enviada · cl_ord_id=${data.cl_ord_id}` });
        await fetchOrders();
      } else {
        const msg = data.error || data.detail || `error ${r.status}`;
        setFeedback({ kind: "err", msg: typeof msg === "string" ? msg : JSON.stringify(msg) });
      }
    } catch (e) {
      setFeedback({ kind: "err", msg: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(clOrdId: string) {
    if (!confirm(`¿Cancelar orden ${clOrdId}?`)) return;
    try {
      const r = await fetch(`/api/ordenes/${encodeURIComponent(clOrdId)}`, {
        method: "DELETE",
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        setFeedback({ kind: "ok", msg: `Cancel enviado · ${clOrdId}` });
        await fetchOrders();
      } else {
        const msg = data.error || data.detail || `error ${r.status}`;
        setFeedback({ kind: "err", msg: typeof msg === "string" ? msg : JSON.stringify(msg) });
      }
    } catch (e) {
      setFeedback({ kind: "err", msg: String(e) });
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3 bg-black text-white text-[12px] overflow-auto">
      <h2 className="text-[14px] font-bold tracking-wide text-[#ff9900]">ENVÍO DE ÓRDENES</h2>

      <div className="flex gap-2 items-end p-3 bg-[#080808] border border-[#1a1a1a] flex-wrap">
        <Field label="TICKER" className="flex-1 min-w-[280px]">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="SIDE" className="w-[80px]">
          <select value={side} onChange={(e) => setSide(e.target.value as Side)} className={inputCls}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </Field>
        <Field label="SIZE" className="w-[90px]">
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className={inputCls}
            min={1}
          />
        </Field>
        <Field label="TIPO" className="w-[100px]">
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as OrderType)}
            className={inputCls}
          >
            <option value="LIMIT">LIMIT</option>
            <option value="MARKET">MARKET</option>
          </select>
        </Field>
        <Field label="PRECIO" className="w-[110px]">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputCls}
            disabled={orderType === "MARKET"}
            step="0.01"
            placeholder={orderType === "MARKET" ? "—" : ""}
          />
        </Field>
        <Field label="TIF" className="w-[80px]">
          <select value={tif} onChange={(e) => setTif(e.target.value as Tif)} className={inputCls}>
            <option>DAY</option>
            <option>IOC</option>
            <option>FOK</option>
            <option>GTC</option>
          </select>
        </Field>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-[#ff9900] text-black font-bold tracking-wide px-4 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {submitting ? "ENVIANDO…" : "ENVIAR"}
        </button>
      </div>

      {feedback && (
        <div
          className={`px-3 py-2 text-[11px] border ${
            feedback.kind === "ok"
              ? "bg-[#0a2a0a] border-[#1a4a1a] text-[#7fff7f]"
              : "bg-[#2a0a0a] border-[#4a1a1a] text-[#ff7f7f]"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto bg-[#080808] border border-[#1a1a1a]">
        <table className="w-full text-[11px]">
          <thead className="bg-[#1a1a1a] sticky top-0">
            <tr>
              <Th>HORA</Th>
              <Th>CL_ORD_ID</Th>
              <Th>TICKER</Th>
              <Th>SIDE</Th>
              <Th right>SIZE</Th>
              <Th right>PRECIO</Th>
              <Th>STATUS</Th>
              <Th right>CUM</Th>
              <Th right>LEAVES</Th>
              <Th>MOTIVO</Th>
              <Th>USER</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-center text-[#666]">
                  Sin órdenes hoy
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const terminal = TERMINAL_STATES.has(o.status ?? "");
              return (
                <tr key={o.cl_ord_id} className="border-b border-[#1a1a1a]">
                  <Td>{fmtTime(o.created_at)}</Td>
                  <Td className="font-mono">{o.cl_ord_id}</Td>
                  <Td>{o.ticker ?? ""}</Td>
                  <Td className={o.side === "BUY" ? "text-[#7fff7f]" : "text-[#ff7f7f]"}>
                    {o.side ?? ""}
                  </Td>
                  <Td right>{o.size ?? ""}</Td>
                  <Td right>{o.price ?? "—"}</Td>
                  <Td className={statusColor(o.status)}>{o.status ?? ""}</Td>
                  <Td right>{o.cum_qty ?? 0}</Td>
                  <Td right>{o.leaves_qty ?? 0}</Td>
                  <Td>{o.reject_reason ?? ""}</Td>
                  <Td>{o.actor_email ?? ""}</Td>
                  <Td>
                    {!terminal && (
                      <button
                        onClick={() => handleCancel(o.cl_ord_id)}
                        className="text-[#ff7f7f] hover:bg-[#2a0a0a] px-2 py-0.5 border border-[#4a1a1a] text-[10px]"
                      >
                        CANCELAR
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputCls =
  "bg-black border border-[#2a2a2a] px-2 py-1 text-[11px] w-full focus:border-[#ff9900] outline-none disabled:opacity-40";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[9px] tracking-wider text-[#888]">{label}</span>
      {children}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-2 py-1 text-[10px] tracking-wider text-[#888] font-semibold ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-2 py-1 ${right ? "text-right" : ""} ${className ?? ""}`}>{children}</td>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().substring(11, 19);
}

function statusColor(s?: string): string {
  if (!s) return "";
  if (s === "FILLED") return "text-[#7fff7f]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED") return "text-[#ff7f7f]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "text-[#ffe066]";
  return "text-white";
}
