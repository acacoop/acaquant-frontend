"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/fmt-money";

/**
 * COBROS FUTUROS (tab de OPERADORES, dentro de NEGOCIO).
 *
 * Data: CashFlow.Acreencias scopeada al operador (filtro madre). Layout:
 *   · Izquierda: tabla de clientes (arriba) + gráfico de BARRAS por fecha (abajo,
 *     lo que se cobra cada día — NO acumulado).
 *   · Derecha (cliente elegido): 50% arriba sumatoria POR TÍTULO + 50% abajo
 *     detalle por fecha.
 * Toggle ARS/USD local (filtra TODO). Interactivo: elegir cliente enfoca la
 * derecha y el gráfico; elegir un título filtra gráfico + detalle; clic en una
 * barra filtra el detalle a esa fecha. Consume /comercial/cobros-futuros(/cliente).
 */

type SeriePt = { fecha: string; ars: number; usd: number };
type ClienteRow = { id_cuenta: string; cliente: string | null; total_ars: number; total_usd: number };
type ScopeResp = { serie: SeriePt[]; clientes: ClienteRow[]; total_ars: number; total_usd: number };
type Titulo = { fecha_pago: string; ticker: string | null; emisor: string | null; moneda: string | null; monto: number };
type ClienteResp = { id_cuenta: string; cliente: string | null; serie: SeriePt[]; titulos: Titulo[]; total_ars: number; total_usd: number };
type Mon = "ARS" | "USD";

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

const monKey = (m: string | null): "ars" | "usd" => (m === "USD" ? "usd" : "ars");

export function CobrosFuturosView({
  operador,
  moneda = "ARS",
  nivel1 = "",
  nivel3 = "",
  referido = "",
}: {
  operador: string;
  moneda?: Mon;
  nivel1?: string;
  nivel3?: string;
  referido?: string;
}) {
  const nQS = nivelQS(nivel1, nivel3, referido);

  // Moneda LOCAL de la vista (arranca del filtro madre, pero el toggle de acá
  // manda y filtra todo: tabla, gráfico, sumatoria y detalle).
  const [mon, setMon] = useState<Mon>(moneda);
  useEffect(() => setMon(moneda), [moneda]);
  const mk: "ars" | "usd" = mon === "USD" ? "usd" : "ars";

  const [scope, setScope] = useState<ScopeResp | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ClienteResp | null>(null);
  const [selTicker, setSelTicker] = useState<string | null>(null);
  const [selFecha, setSelFecha] = useState<string | null>(null);
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
        setSelTicker(null);
        setSelFecha(null);
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
    setSelTicker(null);
    setSelFecha(null);
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

  // Gráfico de BARRAS por fecha (NO acumulado), en la moneda activa.
  //  · sin cliente → serie del scope.
  //  · con cliente → sus títulos (filtrados por moneda y, si hay, por ticker).
  const chartData = useMemo(() => {
    if (sel && detalle) {
      const map: Record<string, number> = {};
      for (const t of detalle.titulos) {
        if (monKey(t.moneda) !== mk) continue;
        if (selTicker && t.ticker !== selTicker) continue;
        map[t.fecha_pago] = (map[t.fecha_pago] || 0) + t.monto;
      }
      return Object.keys(map).sort().map((f) => ({ fecha: f, monto: map[f] }));
    }
    const serie = scope?.serie ?? [];
    return [...serie]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((p) => ({ fecha: p.fecha, monto: mk === "usd" ? p.usd : p.ars }));
  }, [sel, detalle, scope, mk, selTicker]);

  // Sumatoria POR TÍTULO del cliente (moneda activa).
  const porTitulo = useMemo(() => {
    if (!sel || !detalle) return [] as { ticker: string; emisor: string | null; total: number }[];
    const map: Record<string, { ticker: string; emisor: string | null; total: number }> = {};
    for (const t of detalle.titulos) {
      if (monKey(t.moneda) !== mk) continue;
      const k = t.ticker || "—";
      (map[k] ??= { ticker: k, emisor: t.emisor, total: 0 }).total += t.monto;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sel, detalle, mk]);

  // Detalle por fecha (moneda activa + drilldown por ticker / por fecha).
  const detalleRows = useMemo(() => {
    if (!sel || !detalle) return [] as Titulo[];
    return detalle.titulos
      .filter(
        (t) =>
          monKey(t.moneda) === mk &&
          (!selTicker || t.ticker === selTicker) &&
          (!selFecha || t.fecha_pago === selFecha),
      )
      .sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago) || b.monto - a.monto);
  }, [sel, detalle, mk, selTicker, selFecha]);

  const totalScope = mk === "usd" ? scope?.total_usd ?? 0 : scope?.total_ars ?? 0;
  const totalCli = detalle ? (mk === "usd" ? detalle.total_usd : detalle.total_ars) : 0;

  return (
    <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
      {/* IZQUIERDA: tabla clientes (arriba) + gráfico de barras por fecha (abajo) */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* TABLA CLIENTES */}
        <div className="flex-[2_1_0%] min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Clientes · cobros futuros</span>
            <MonToggle mon={mon} onChange={setMon} />
            <span className="text-[9px] text-[var(--t-text-muted)]">{clientes.length}</span>
            <span className="ml-auto text-[10px] font-mono">{mon} {fmtMoney(totalScope)}</span>
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
                    <th className="text-right !px-2">Total {mon}</th>
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

        {/* GRÁFICO DE BARRAS POR FECHA */}
        <div className="flex-[3_1_0%] min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Cobros por fecha · {mon}</span>
            <span className="text-[9px] text-[var(--t-text-muted)] truncate">
              {sel && detalle ? detalle.cliente || sel : "Todo el scope"}
              {selTicker ? ` · ${selTicker}` : ""}
            </span>
          </div>
          <div className="flex-1 min-h-0 p-1">
            {chartData.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" vertical={false} />
                  <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={16} />
                  <YAxis tickFormatter={(v) => fmtMoney(v as number)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={54} />
                  <Tooltip
                    cursor={{ fill: "var(--t-border)", opacity: 0.3 }}
                    contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }}
                    labelFormatter={(l) => fmtFecha(String(l))}
                    formatter={(v) => [`${mon} ${fmtMoney(Number(v))}`, "A cobrar"]}
                  />
                  <Bar
                    dataKey="monto"
                    onClick={(d) => {
                      const f = (d as { fecha?: string })?.fecha ?? null;
                      setSelFecha((prev) => (prev === f ? null : f));
                    }}
                    cursor="pointer"
                  >
                    {chartData.map((d) => (
                      <Cell
                        key={d.fecha}
                        fill={selFecha === d.fecha ? "var(--t-accent)" : "var(--t-accent)"}
                        fillOpacity={selFecha && selFecha !== d.fecha ? 0.35 : 0.9}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* DERECHA: 50% sumatoria por título + 50% detalle por fecha */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
        {!sel || !detalle ? (
          <div className="flex-1 flex items-center justify-center border border-[var(--t-border)] p-3">
            <span className="text-[11px] text-[var(--t-text-dim)] text-center">
              Elegí un cliente (tabla izquierda) para ver su sumatoria por título y el detalle por fecha.
            </span>
          </div>
        ) : (
          <>
            {/* ARRIBA (50%): SUMATORIA POR TÍTULO */}
            <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--t-border)] shrink-0">
                <div className="flex items-center gap-2">
                  <div className="text-[12px] font-semibold truncate" title={detalle.cliente ?? ""}>
                    {detalle.cliente || detalle.id_cuenta}
                  </div>
                  <span className="ml-auto text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">Σ {mon}</span>
                  <span className="font-mono font-semibold text-[var(--t-accent)] text-[12px]">{fmtMoney(totalCli)}</span>
                </div>
                <div className="text-[9px] text-[var(--t-text-muted)] tabular-nums">Cuenta {detalle.id_cuenta} · sumatoria por título</div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {porTitulo.length === 0 ? (
                  <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin cobros en {mon}.</p>
                ) : (
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-[var(--t-panel)]">
                      <tr className="text-[var(--t-text-muted)]">
                        <th className="text-left !px-2">Ticker</th>
                        <th className="text-left !px-2">Emisor</th>
                        <th className="text-right !px-2">Total {mon}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porTitulo.map((t) => {
                        const on = t.ticker === selTicker;
                        return (
                          <tr
                            key={t.ticker}
                            onClick={() => setSelTicker(on ? null : t.ticker)}
                            className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}
                          >
                            <td className="!px-2 font-semibold">{t.ticker}</td>
                            <td className="!px-2 text-[var(--t-text-dim)] truncate max-w-[140px]" title={t.emisor ?? ""}>{t.emisor || "--"}</td>
                            <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(t.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ABAJO (50%): DETALLE POR FECHA */}
            <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
              <div className="px-3 py-1 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Detalle por fecha</span>
                {(selTicker || selFecha) && (
                  <button
                    onClick={() => {
                      setSelTicker(null);
                      setSelFecha(null);
                    }}
                    className="text-[9px] text-[var(--t-accent)] hover:underline"
                  >
                    {selTicker ? `Ticker ${selTicker}` : ""}{selTicker && selFecha ? " · " : ""}{selFecha ? fmtFecha(selFecha) : ""} ✕
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {detalleRows.length === 0 ? (
                  <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin cobros para el filtro.</p>
                ) : (
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-[var(--t-panel)]">
                      <tr className="text-[var(--t-text-muted)]">
                        <th className="text-left !px-2">Fecha</th>
                        <th className="text-left !px-2">Ticker</th>
                        <th className="text-left !px-2">Emisor</th>
                        <th className="text-right !px-2">Monto {mon}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleRows.map((t, i) => (
                        <tr key={`${t.fecha_pago}-${t.ticker}-${i}`} className="hover:bg-[var(--t-border)]">
                          <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{fmtFecha(t.fecha_pago)}</td>
                          <td className="!px-2 font-semibold">{t.ticker || "--"}</td>
                          <td className="!px-2 text-[var(--t-text-dim)] truncate max-w-[140px]" title={t.emisor ?? ""}>{t.emisor || "--"}</td>
                          <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoney(t.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MonToggle({ mon, onChange }: { mon: Mon; onChange: (m: Mon) => void }) {
  return (
    <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
      {(["ARS", "USD"] as Mon[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={
            "px-1.5 py-0.5 text-[9px] font-semibold tracking-wide " +
            (mon === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-transparent text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
          }
        >
          {m}
        </button>
      ))}
    </div>
  );
}
