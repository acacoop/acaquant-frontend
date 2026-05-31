"use client";

import { useEffect, useState } from "react";

interface DetalleResp {
  operativa: {
    operativa_id?: string;
    created_at?: string;
    account?: string;
    rueda?: string;
    actor_email?: string;
    monto_ars?: number;
    nominales?: number;
    mep_inicial?: number;
    status?: string;
  } | null;
  metricas: {
    precio_compra_al30?: number;
    precio_venta_al30d?: number;
    usd_efectivo?: number;
    ars_operados?: number;
    mep_efectivo?: number;
    mep_costo_cliente?: number;
    slippage_pct?: number;
  };
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtArs(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusColor(st: string | undefined): string {
  if (!st) return "#888";
  if (st === "OK" || st === "FILLED") return "var(--t-pos)";
  if (st.startsWith("OK_")) return "#ffcc00";
  return "var(--t-neg)";
}

interface Props {
  operativaId: string | null;
  onClose: () => void;
}

export function DolarMepDetalleDrawer({ operativaId, onClose }: Props) {
  const [data, setData] = useState<DetalleResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!operativaId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [operativaId, onClose]);

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

  const op = data?.operativa;
  const m = data?.metricas;

  return (
    <>
      <div className="fixed inset-0 bg-[var(--t-panel)]/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-[95vw] bg-[var(--t-panel)] border-l border-[var(--t-border)] z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--t-border)] shrink-0">
          <span className="text-[12px] tracking-wider text-[var(--t-accent)] font-semibold uppercase">
            Detalle operativa
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-neg)] text-[18px] leading-none"
            title="Cerrar (Esc)"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="text-[var(--t-text-dim)] text-[11px]">Cargando…</div>
          )}
          {error && (
            <div className="text-[var(--t-neg)] text-[11px] font-mono">
              Error: {error}
            </div>
          )}
          {data && op && m && (
            <>
              {/* Mini-header */}
              <div className="flex items-baseline gap-2 text-[11px] font-mono">
                <span className="text-[var(--t-text)]">{fmtTime(op.created_at)}</span>
                <span className="text-[var(--t-text-muted)]">·</span>
                <span className="text-[var(--t-text-dim)]">cuenta {op.account}</span>
                <span className="text-[var(--t-text-muted)]">·</span>
                <span className="text-[var(--t-text-dim)]">{op.rueda}</span>
                <span className="text-[var(--t-text-dim)]">· {op.nominales} VN</span>
                <span
                  className="ml-auto text-[10px] font-semibold"
                  style={{ color: statusColor(op.status) }}
                >
                  {op.status}
                </span>
              </div>

              {/* Lo justo y necesario */}
              <div className="border border-[var(--t-border)]">
                <Linea label="Compra AL30" value={`$${fmtArs(m.precio_compra_al30)}`} color="var(--t-pos)" />
                <Linea label="Venta AL30D" value={`US$${fmtArs(m.precio_venta_al30d)}`} color="#4488ff" />
                <Linea label="USD obtenidos" value={m.usd_efectivo !== undefined ? `US$${fmtArs(m.usd_efectivo)}` : "—"} color="#d0d0d0" />
                <Linea
                  label="TC efectivo"
                  value={m.mep_efectivo !== undefined ? `$${fmtArs(m.mep_efectivo)}` : "—"}
                  color="#ff9900"
                  bold
                />
              </div>

              {/* Slippage discreto */}
              {m.slippage_pct !== undefined && op.mep_inicial && (
                <div className="text-[10px] text-[var(--t-text-muted)] font-mono px-1">
                  MEP inicial $ {fmtArs(op.mep_inicial)} · slippage{" "}
                  <span style={{ color: m.slippage_pct >= 0 ? "var(--t-neg)" : "var(--t-pos)" }}>
                    {m.slippage_pct >= 0 ? "+" : ""}
                    {m.slippage_pct}%
                  </span>
                </div>
              )}

              {/* Costo cliente final (con comisión) — opcional, abajo */}
              {m.mep_costo_cliente !== undefined && op.monto_ars && (
                <div className="text-[10px] text-[var(--t-text-muted)] font-mono px-1 leading-relaxed">
                  Cliente pagó ${fmtArs(op.monto_ars)} brutos →{" "}
                  TC con comisión <span className="text-[var(--t-text-dim)]">${fmtArs(m.mep_costo_cliente)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Linea({
  label,
  value,
  color,
  bold = false,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between px-3 py-2 border-b border-[var(--t-border)] last:border-b-0">
      <span className="text-[11px] tracking-wide text-[var(--t-text-dim)] uppercase">
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${bold ? "text-[14px] font-semibold" : "text-[12px]"}`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}
