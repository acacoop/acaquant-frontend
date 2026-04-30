"use client";

import { useEffect, useState } from "react";

interface OrdenLive {
  cl_ord_id?: string;
  ticker?: string;
  side?: string;
  account?: string;
  status?: string;
  size?: number;
  cum_qty?: number;
  leaves_qty?: number;
  avg_px?: number;
  last_px?: number;
  last_qty?: number;
  order_type?: string;
  tif?: string;
  proprietary?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  reject_reason?: string | null;
}

interface AuditEntry {
  ts: string;
  kind: string;
  payload: Record<string, unknown> | null;
}

interface PataDetalle {
  live: OrdenLive | null;
  audit: AuditEntry[];
}

interface DetalleResp {
  operativa: Record<string, unknown> | null;
  buy: PataDetalle;
  sell: PataDetalle;
  metricas: {
    usd_efectivo?: number;
    mep_efectivo?: number;
    slippage_pct?: number;
    duracion_ms?: number;
  };
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return iso;
  }
}

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function statusColor(st: string | undefined): string {
  if (!st) return "#888";
  if (st === "FILLED") return "#00cc66";
  if (st === "PARTIALLY_FILLED" || st === "NEW" || st === "PENDING_NEW") return "#ffcc00";
  if (st === "REJECTED" || st === "CANCELLED" || st === "EXPIRED") return "#ff3333";
  return "#888";
}

function PataPanel({ titulo, pata }: { titulo: string; pata: PataDetalle }) {
  const live = pata.live;
  if (!live) {
    return (
      <div className="border border-[#1a1a1a] p-3 mb-3">
        <div className="text-[11px] tracking-wider text-[#888] mb-2">{titulo}</div>
        <div className="text-[#555] text-[11px]">Sin orden registrada</div>
      </div>
    );
  }
  return (
    <div className="border border-[#1a1a1a] p-3 mb-3">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[11px] tracking-wider text-[#888]">{titulo}</span>
        <span className="text-[11px] text-[#d0d0d0] font-mono">{live.ticker}</span>
        <span
          className="ml-auto text-[10px] font-semibold tabular-nums"
          style={{ color: statusColor(live.status) }}
        >
          {live.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
        <Row k="cl_ord_id" v={live.cl_ord_id} />
        <Row k="cuenta" v={live.account} />
        <Row k="size" v={live.size?.toString()} />
        <Row k="filled / leaves" v={`${live.cum_qty ?? 0} / ${live.leaves_qty ?? 0}`} />
        <Row k="avg px" v={fmtNum(live.avg_px, 2)} />
        <Row k="last px" v={fmtNum(live.last_px, 2)} />
        <Row k="last qty" v={live.last_qty?.toString()} />
        <Row k="tipo / TIF" v={`${live.order_type ?? "—"} / ${live.tif ?? "—"}`} />
        <Row k="enviada" v={fmtTime(live.created_at)} />
        <Row k="updated" v={fmtTime(live.updated_at)} />
        <Row k="proprietary" v={live.proprietary} />
        <Row k="source" v={live.source} />
      </div>
      {live.reject_reason && (
        <div className="mt-2 text-[10px] text-[#ff3333] font-mono">
          reject_reason: {live.reject_reason}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | undefined }) {
  return (
    <>
      <div className="text-[#666]">{k}</div>
      <div className="text-[#d0d0d0] tabular-nums break-all">{v ?? "—"}</div>
    </>
  );
}

function AuditTimeline({ buy, sell }: { buy: AuditEntry[]; sell: AuditEntry[] }) {
  // Combinamos los 2 audit logs en una sola línea de tiempo, indicando pata.
  const merged = [
    ...buy.map((a) => ({ ...a, pata: "BUY" })),
    ...sell.map((a) => ({ ...a, pata: "SELL" })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));

  if (merged.length === 0) {
    return (
      <div className="text-[#555] text-[11px] mt-2">
        Sin execution reports registrados
      </div>
    );
  }
  return (
    <div className="border border-[#1a1a1a] p-3">
      <div className="text-[11px] tracking-wider text-[#888] mb-2">
        EXECUTION TIMELINE
      </div>
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-[#666] border-b border-[#1a1a1a]">
            <th className="text-left py-1 px-1">ts</th>
            <th className="text-left py-1 px-1">pata</th>
            <th className="text-left py-1 px-1">kind</th>
            <th className="text-left py-1 px-1">status</th>
            <th className="text-right py-1 px-1">last px</th>
            <th className="text-right py-1 px-1">qty</th>
            <th className="text-right py-1 px-1">cum</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((a, i) => {
            const p = (a.payload || {}) as Record<string, unknown>;
            const status = (p.status as string) ?? "";
            const lastPx = p.lastPx as number | undefined;
            const lastQty = p.lastQty as number | undefined;
            const cumQty = p.cumQty as number | undefined;
            return (
              <tr key={i} className="border-b border-[#0a0a0a]">
                <td className="py-0.5 px-1 text-[#d0d0d0]">{fmtTime(a.ts)}</td>
                <td
                  className="py-0.5 px-1 font-semibold"
                  style={{ color: a.pata === "BUY" ? "#00cc66" : "#4488ff" }}
                >
                  {a.pata}
                </td>
                <td className="py-0.5 px-1 text-[#888]">{a.kind}</td>
                <td className="py-0.5 px-1" style={{ color: statusColor(status) }}>
                  {status}
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums text-[#d0d0d0]">
                  {fmtNum(lastPx, 2)}
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums text-[#d0d0d0]">
                  {lastQty ?? "—"}
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums text-[#d0d0d0]">
                  {cumQty ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  operativaId: string | null;
  onClose: () => void;
}

export function DolarMepDetalleDrawer({ operativaId, onClose }: Props) {
  const [data, setData] = useState<DetalleResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ESC cierra el drawer
  useEffect(() => {
    if (!operativaId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [operativaId, onClose]);

  // Fetch al abrir
  useEffect(() => {
    if (!operativaId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/operativa/mep/${operativaId}/detalle`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: DetalleResp) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [operativaId]);

  if (!operativaId) return null;

  const op = data?.operativa as
    | {
        operativa_id?: string;
        created_at?: string;
        account?: string;
        rueda?: string;
        actor_email?: string;
        monto_ars?: number;
        nominales?: number;
        mep_inicial?: number;
        status?: string;
      }
    | undefined;

  return (
    <>
      {/* Backdrop semitransparente — click cierra */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Drawer lateral derecho */}
      <div className="fixed right-0 top-0 h-full w-[640px] max-w-[95vw] bg-[#080808] border-l border-[#1a1a1a] z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-[#1a1a1a] shrink-0">
          <span className="text-[12px] tracking-wider text-[#ff9900] font-semibold uppercase">
            Detalle operativa MEP
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[#888] hover:text-[#ff3333] text-[18px] leading-none"
            title="Cerrar (Esc)"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-[#888] text-[11px]">Cargando…</div>
          )}
          {error && (
            <div className="text-[#ff3333] text-[11px] font-mono">
              Error: {error}
            </div>
          )}
          {data && op && (
            <>
              {/* Header de la operativa */}
              <div className="border border-[#1a1a1a] p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                  <Row k="operativa_id" v={op.operativa_id} />
                  <Row k="created_at" v={fmtTime(op.created_at)} />
                  <Row k="cuenta" v={op.account} />
                  <Row k="rueda" v={op.rueda} />
                  <Row k="actor" v={op.actor_email} />
                  <Row k="status" v={op.status} />
                  <Row k="monto ARS" v={fmtNum(op.monto_ars, 2)} />
                  <Row k="nominales" v={op.nominales?.toString()} />
                  <Row k="MEP inicial" v={fmtNum(op.mep_inicial, 2)} />
                  <Row
                    k="duración"
                    v={
                      data.metricas.duracion_ms !== undefined
                        ? `${data.metricas.duracion_ms} ms`
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Patas */}
              <PataPanel titulo="PATA BUY" pata={data.buy} />
              <PataPanel titulo="PATA SELL" pata={data.sell} />

              {/* Métricas finales */}
              <div className="border border-[#1a1a1a] p-3">
                <div className="text-[11px] tracking-wider text-[#888] mb-2">
                  RESULTADO
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                  <Row
                    k="USD efectivo"
                    v={
                      data.metricas.usd_efectivo !== undefined
                        ? `US$${fmtNum(data.metricas.usd_efectivo, 2)}`
                        : undefined
                    }
                  />
                  <Row
                    k="MEP efectivo"
                    v={fmtNum(data.metricas.mep_efectivo, 2)}
                  />
                  <Row
                    k="slippage vs MEP ini"
                    v={
                      data.metricas.slippage_pct !== undefined
                        ? `${data.metricas.slippage_pct >= 0 ? "+" : ""}${data.metricas.slippage_pct}%`
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Audit timeline */}
              <AuditTimeline
                buy={data.buy.audit}
                sell={data.sell.audit}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
