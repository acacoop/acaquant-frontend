"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/fmt-money";

/**
 * COBROS FUTUROS (tab de OPERADORES, dentro de NEGOCIO).
 *
 * Misma data que Back Office / Acreencias (CashFlow.Acreencias) pero scopeada al
 * operador del filtro madre. Layout:
 *   · Izquierda: tabla de clientes (arriba) + gráfico de cobros ACUMULADOS (abajo).
 *   · Derecha: cliente seleccionado → sumatoria + títulos que cobra.
 * El gráfico es interactivo: por defecto muestra el acumulado del scope entero;
 * al elegir un cliente, el acumulado de ese cliente. Switch ARS/USD = filtro madre
 * de moneda (no se pesifica: son flujos futuros en su moneda nativa).
 *
 * Consume /api/operaciones/comercial/cobros-futuros(/cliente).
 */

type SeriePt = { fecha: string; ars: number; usd: number };
type ClienteRow = { id_cuenta: string; cliente: string | null; total_ars: number; total_usd: number };
type ScopeResp = { serie: SeriePt[]; clientes: ClienteRow[]; total_ars: number; total_usd: number };
type Titulo = { fecha_pago: string; ticker: string | null; emisor: string | null; moneda: string | null; monto: number };
type ClienteResp = { id_cuenta: string; cliente: string | null; serie: SeriePt[]; titulos: Titulo[]; total_ars: number; total_usd: number };

const nivelQS = (n1?: string, n3?: string, ref?: string) =>
  (n1 ? `&nivel_1=${encodeURIComponent(n1)}` : "") +
  (n3 ? `&nivel_3=${encodeURIComponent(n3)}` : "") +
  (ref ? `&referido=${encodeURIComponent(ref)}` : "");

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

const fmtFecha = (s: string) => {
  const [y, m, d] = s.split("-");
  return d ? `${d}/${m}/${y.slice(-2)}` : s;
};

// Acumula la serie diaria en la moneda activa → [{fecha, monto, acum}].
function acumular(serie: SeriePt[], key: "ars" | "usd") {
  const ord = [...serie].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let acc = 0;
  return ord.map((p) => {
    acc += p[key] || 0;
    return { fecha: p.fecha, monto: p[key] || 0, acum: acc };
  });
}

export function CobrosFuturosView({
  operador,
  moneda = "ARS",
  nivel1 = "",
  nivel3 = "",
  referido = "",
}: {
  operador: string;
  moneda?: "ARS" | "USD";
  nivel1?: string;
  nivel3?: string;
  referido?: string;
}) {
  const mk: "ars" | "usd" = moneda === "USD" ? "usd" : "ars";
  const monLabel = moneda === "USD" ? "USD" : "ARS";
  const nQS = nivelQS(nivel1, nivel3, referido);

  const [scope, setScope] = useState<ScopeResp | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ClienteResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Scope (operador + filtros madre) → tabla + serie base. Reset selección.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const d = await getJson<ScopeResp>(
          `/api/operaciones/comercial/cobros-futuros?operador=${encodeURIComponent(operador)}${nQS}`,
        );
        if (cancel) return;
        setScope(d);
        setSel(null);
        setDetalle(null);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [operador, nQS]);

  // Detalle del cliente seleccionado (interactivo).
  useEffect(() => {
    if (!sel) {
      setDetalle(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const d = await getJson<ClienteResp>(
          `/api/operaciones/comercial/cobros-futuros/cliente?id_cuenta=${encodeURIComponent(sel)}`,
        );
        if (!cancel) setDetalle(d);
      } catch {
        if (!cancel) setDetalle(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [sel]);

  const clientes = useMemo(() => {
    const list = scope?.clientes ?? [];
    return [...list].sort((a, b) => (mk === "usd" ? b.total_usd - a.total_usd : b.total_ars - a.total_ars));
  }, [scope, mk]);

  // Serie del gráfico: cliente seleccionado o scope entero. Acumulada en la moneda activa.
  const chartData = useMemo(() => {
    const serie = sel && detalle ? detalle.serie : scope?.serie ?? [];
    return acumular(serie, mk);
  }, [sel, detalle, scope, mk]);

  const totalScope = mk === "usd" ? scope?.total_usd ?? 0 : scope?.total_ars ?? 0;
  const totalCli = detalle ? (mk === "usd" ? detalle.total_usd : detalle.total_ars) : 0;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
      {/* IZQUIERDA: tabla clientes (arriba) + gráfico acumulado (abajo) */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* TABLA CLIENTES */}
        <div className="flex-[2_1_0%] min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Clientes · cobros futuros</span>
            <span className="text-[9px] text-[var(--t-text-muted)]">{clientes.length}</span>
            <span className="ml-auto text-[10px] font-mono">{monLabel} {fmtMoney(totalScope)}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            ) : err ? (
              <p className="p-3 text-[11px] text-[#ff7777]">{err}</p>
            ) : clientes.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin cobros futuros para este scope.</p>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[var(--t-panel)]">
                  <tr className="text-[var(--t-text-muted)]">
                    <th className="text-left !px-2">Cliente</th>
                    <th className="text-left !px-2">Cuenta</th>
                    <th className="text-right !px-2">Total {monLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => {
                    const tot = mk === "usd" ? c.total_usd : c.total_ars;
                    const on = c.id_cuenta === sel;
                    return (
                      <tr
                        key={c.id_cuenta}
                        onClick={() => setSel(on ? null : c.id_cuenta)}
                        className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}
                      >
                        <td className="!px-2 truncate max-w-[180px]" title={c.cliente ?? ""}>{c.cliente || c.id_cuenta}</td>
                        <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{c.id_cuenta}</td>
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(tot)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* GRÁFICO ACUMULADO */}
        <div className="flex-[3_1_0%] min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Cobros acumulados · {monLabel}</span>
            <span className="text-[9px] text-[var(--t-text-muted)] truncate">
              {sel && detalle ? detalle.cliente || sel : "Todo el scope"}
            </span>
          </div>
          <div className="flex-1 min-h-0 p-1">
            {chartData.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="cf-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--t-accent)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--t-accent)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" />
                  <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={24} />
                  <YAxis tickFormatter={(v) => fmtMoney(v as number)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={54} />
                  <Tooltip
                    contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }}
                    labelFormatter={(l) => fmtFecha(String(l))}
                    formatter={(v) => [`${monLabel} ${fmtMoney(Number(v))}`, "Acumulado"]}
                  />
                  <Area type="monotone" dataKey="acum" stroke="var(--t-accent)" strokeWidth={2} fill="url(#cf-grad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* DERECHA: cliente seleccionado (sumatoria) + títulos que cobra */}
      <div className="min-h-0 flex flex-col border border-[var(--t-border)] overflow-hidden">
        {!sel || !detalle ? (
          <div className="flex-1 flex items-center justify-center p-3">
            <span className="text-[11px] text-[var(--t-text-dim)] text-center">
              Elegí un cliente (tabla izquierda) para ver su sumatoria y los títulos que cobra.
            </span>
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-[var(--t-border)] shrink-0">
              <div className="text-[12px] font-semibold truncate" title={detalle.cliente ?? ""}>
                {detalle.cliente || detalle.id_cuenta}
              </div>
              <div className="text-[9px] text-[var(--t-text-muted)] tabular-nums">Cuenta {detalle.id_cuenta}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">Σ cobros {monLabel}</span>
                <span className="font-mono font-semibold text-[var(--t-accent)] text-[12px]">{fmtMoney(totalCli)}</span>
              </div>
            </div>
            <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
              Títulos que cobra
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[var(--t-panel)]">
                  <tr className="text-[var(--t-text-muted)]">
                    <th className="text-left !px-2">Fecha</th>
                    <th className="text-left !px-2">Ticker</th>
                    <th className="text-left !px-2">Emisor</th>
                    <th className="text-center !px-2">Mon</th>
                    <th className="text-right !px-2">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.titulos.map((t, i) => (
                    <tr key={`${t.fecha_pago}-${t.ticker}-${i}`} className="hover:bg-[var(--t-border)]">
                      <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{fmtFecha(t.fecha_pago)}</td>
                      <td className="!px-2 font-semibold">{t.ticker || "--"}</td>
                      <td className="!px-2 text-[var(--t-text-dim)] truncate max-w-[140px]" title={t.emisor ?? ""}>{t.emisor || "--"}</td>
                      <td className="!px-2 text-center">{t.moneda}</td>
                      <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(t.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
