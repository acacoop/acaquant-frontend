"use client";

/**
 * OPERAR → ÓRDENES DEL DÍA (ALyC completa).
 *
 * Distinto del panel "Órdenes del día" que vive dentro de TÍTULOS Y FCI
 * (`operar-shared.tsx::OrderManagement`): ese es por-cuenta, con merge al
 * broker y botón de cancelar (nuestro propio sistema, `/api/ordenes/dia`).
 * Esta vista es de SOLO LECTURA y de TODA la ALyC: el orderReport CRUDO tal
 * cual lo manda ROFEX/Primary, para cualquier cuenta que el usuario pueda ver
 * (comitentes incluidas, no solo lo que salió por nuestro propio envío) —
 * fuente: `engines/motor_ordenes.py` → `operaciones.ordenes_dia` (push por
 * WS, sin pollear al broker desde acá).
 *
 * `GET /api/operar/ordenes-dia` ya filtra por scope de cuentas del usuario en
 * el backend; acá solo se agrega búsqueda/orden client-side sobre lo que
 * llega (hoy + día hábil anterior, ventana que retiene el motor).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtTime } from "./dolar-mep-shared";

interface OrdenDiaRaw {
  account?: string | null;
  order_id?: string | null;
  fecha?: string | null;
  cl_ord_id?: string | null;
  proprietary?: string | null;
  symbol?: string | null;
  price?: number | null;
  order_qty?: number | null;
  ord_type?: string | null;
  side?: "BUY" | "SELL" | null;
  transact_time?: string | null;
  avg_px?: number | null;
  last_px?: number | null;
  last_qty?: number | null;
  cum_qty?: number | null;
  status?: string | null;
  originating_username?: string | null;
}

type FiltroFecha = "todo" | "hoy" | "ayer";

function useOrdenesDiaAlyc(pollMs = 5000) {
  const [ordenes, setOrdenes] = useState<OrdenDiaRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/operar/ordenes-dia", { cache: "no-store" });
      if (r.ok) {
        setOrdenes(await r.json());
        setError(null);
      } else {
        const j = await r.json().catch(() => ({}));
        setError(j.detail || `HTTP ${r.status}`);
      }
    } catch {
      setError("sin conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { ordenes, loading, error, refresh };
}

function statusColor(s?: string | null): string {
  if (!s) return "text-[var(--t-text-dim)]";
  if (s === "FILLED") return "text-[var(--t-pos)]";
  if (s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED") return "text-[var(--t-neg)]";
  if (s === "NEW" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "text-[#ffe066]";
  return "text-[var(--t-text)]";
}

function fmtNum(v?: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("es-AR", { maximumFractionDigits: 6 });
}

function hoyISO(offsetDias = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

export function OperarOrdenesDiaView() {
  const { ordenes, loading, error, refresh } = useOrdenesDiaAlyc();
  const [q, setQ] = useState("");
  const [soloEjecuciones, setSoloEjecuciones] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>("todo");

  const filtradas = useMemo(() => {
    const hoy = hoyISO(0);
    const term = q.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (soloEjecuciones && !(o.last_qty && o.last_qty > 0)) return false;
      if (filtroFecha === "hoy" && o.fecha !== hoy) return false;
      if (filtroFecha === "ayer" && o.fecha === hoy) return false;
      if (!term) return true;
      const hay = [o.account, o.symbol, o.order_id, o.cl_ord_id, o.originating_username, o.proprietary]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
      return hay;
    });
  }, [ordenes, q, soloEjecuciones, filtroFecha]);

  const ejecuciones = useMemo(() => ordenes.filter((o) => (o.last_qty ?? 0) > 0).length, [ordenes]);

  return (
    <div className="h-full flex flex-col gap-2 p-2 bg-[var(--t-bg)] min-h-0 overflow-hidden">
      {/* Toolbar: búsqueda + filtros */}
      <div className="flex items-center gap-2 px-3 py-1.5 border border-[var(--t-border)] rounded bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[10px] tracking-wider text-[var(--t-text-dim)]">BUSCAR</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="cuenta, símbolo, operador…"
          className="bg-[var(--t-bg)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] w-56 focus:border-[var(--t-accent)] outline-none"
        />

        <div className="flex items-center gap-1 ml-2">
          {(["todo", "hoy", "ayer"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroFecha(f)}
              className={`px-2 py-1 text-[10px] font-semibold tracking-wide border transition-colors ${
                filtroFecha === f
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}
            >
              {f === "todo" ? "TODO" : f === "hoy" ? "HOY" : "HÁBIL ANTERIOR"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 text-[10px] text-[var(--t-text-dim)] ml-2 cursor-pointer">
          <input
            type="checkbox"
            checked={soloEjecuciones}
            onChange={(e) => setSoloEjecuciones(e.target.checked)}
          />
          solo ejecuciones (lastQty &gt; 0)
        </label>

        <div className="ml-auto flex items-center gap-2 text-[10px] text-[var(--t-text-dim)]">
          <span>
            {filtradas.length} de {ordenes.length} · {ejecuciones} ejecución(es)
          </span>
          {error && <span className="text-[var(--t-neg)]">· {error}</span>}
          <button
            onClick={() => void refresh()}
            className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[13px] leading-none"
            title="Refrescar"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Tabla — crudo del broker, sin normalizar */}
      <div className="flex-1 min-h-0 border border-[var(--t-border)] rounded bg-[var(--t-panel)] overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="px-3 py-4 text-[10px] text-[var(--t-text-muted)] text-center">
              Cargando…
            </div>
          ) : filtradas.length === 0 ? (
            <div className="px-3 py-4 text-[10px] text-[var(--t-text-muted)] text-center">
              Sin órdenes en el rango elegido
            </div>
          ) : (
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider bg-[var(--t-panel)] sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-1">HORA</th>
                  <th className="text-left px-2 py-1">CUENTA</th>
                  <th className="text-left px-2 py-1">SYMBOL</th>
                  <th className="text-left px-2 py-1">PROPIETARY</th>
                  <th className="text-left px-2 py-1">SIDE</th>
                  <th className="text-left px-2 py-1">TIPO</th>
                  <th className="text-right px-2 py-1">PRICE</th>
                  <th className="text-right px-2 py-1">ORDER QTY</th>
                  <th className="text-right px-2 py-1">AVG PX</th>
                  <th className="text-right px-2 py-1">LAST PX</th>
                  <th className="text-right px-2 py-1">LAST QTY</th>
                  <th className="text-right px-2 py-1">CUM QTY</th>
                  <th className="text-left px-2 py-1">STATUS</th>
                  <th className="text-left px-2 py-1">ORDER ID</th>
                  <th className="text-left px-3 py-1">OPERADOR</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((o, i) => {
                  const corto = o.symbol?.split(" - ")[2] ?? o.symbol ?? "?";
                  const esEjecucion = (o.last_qty ?? 0) > 0;
                  return (
                    <tr
                      key={`${o.account}-${o.order_id}-${i}`}
                      className={`border-t border-[var(--t-border)] hover:bg-[var(--t-surface)] ${
                        esEjecucion ? "bg-[var(--t-pos)]/5" : ""
                      }`}
                    >
                      <td className="px-3 py-0.5 text-[var(--t-text-dim)]">
                        {o.transact_time ? fmtTime(o.transact_time) : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]">{o.account ?? "—"}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]" title={o.symbol ?? undefined}>
                        {corto}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{o.proprietary ?? "—"}</td>
                      <td
                        className={`px-2 py-0.5 font-semibold ${
                          o.side === "BUY" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                        }`}
                      >
                        {o.side ?? "—"}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{o.ord_type ?? "—"}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">{fmtNum(o.price)}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">{fmtNum(o.order_qty)}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">{fmtNum(o.avg_px)}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">{fmtNum(o.last_px)}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">{fmtNum(o.last_qty)}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">{fmtNum(o.cum_qty)}</td>
                      <td className={`px-2 py-0.5 ${statusColor(o.status)}`}>{o.status ?? "—"}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text-dim)] truncate max-w-[140px]" title={o.order_id ?? undefined}>
                        {o.order_id ?? "—"}
                      </td>
                      <td className="px-3 py-0.5 text-[var(--t-text-dim)] truncate max-w-[140px]" title={o.originating_username ?? undefined}>
                        {o.originating_username ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
