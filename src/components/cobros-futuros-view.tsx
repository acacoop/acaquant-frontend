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
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { fetchJson as getJson } from "@/lib/fetch-json";
import { MESES_CORTOS as MESES } from "@/lib/fmt";

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

const nivelQS = (n1?: string, n2?: string, n3?: string, ref?: string) =>
  (n1 ? `&nivel_1=${encodeURIComponent(n1)}` : "") +
  (n2 ? `&nivel_2=${encodeURIComponent(n2)}` : "") +
  (n3 ? `&nivel_3=${encodeURIComponent(n3)}` : "") +
  (ref ? `&referido=${encodeURIComponent(ref)}` : "");

const fmtFecha = (s: string) => {
  const [y, m, d] = s.split("-");
  return d ? `${d}/${m}/${y.slice(-2)}` : s;
};

// Fecha LOCAL del browser en ISO YYYY-MM-DD, con offset de días opcional.
function isoLocal(offsetDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

const monKey = (m: string | null): "ars" | "usd" => (m === "USD" ? "usd" : "ars");

// Agregación temporal del gráfico (solo el gráfico — las tablas no se tocan).
type Agg = "DIA" | "SEM" | "MES" | "ANIO";
const AGGS: [Agg, string][] = [["DIA", "Día"], ["SEM", "Sem"], ["MES", "Mes"], ["ANIO", "Año"]];

function lunesDeSemana(fechaIso: string): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  const dow = d.getUTCDay();
  const off = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + off * 86400000).toISOString().slice(0, 10);
}
function bucketKey(fecha: string, agg: Agg): string {
  if (agg === "ANIO") return fecha.slice(0, 4);
  if (agg === "MES") return fecha.slice(0, 7);
  if (agg === "SEM") return lunesDeSemana(fecha);
  return fecha;
}
function bucketLabel(key: string, agg: Agg): string {
  if (agg === "ANIO") return key;
  if (agg === "MES") {
    const [y, m] = key.split("-");
    return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
  }
  return fmtFecha(key); // DIA y SEM (lunes de la semana)
}

export function CobrosFuturosView({
  operador,
  moneda = "ARS",
  nivel1 = "",
  nivel2 = "",
  nivel3 = "",
  referido = "",
}: {
  operador: string;
  moneda?: Mon;
  nivel1?: string;
  nivel2?: string;
  nivel3?: string;
  referido?: string;
}) {
  const nQS = nivelQS(nivel1, nivel2, nivel3, referido);

  // Moneda LOCAL de la vista (arranca del filtro madre, pero el toggle de acá
  // manda y filtra todo: tabla, gráfico, sumatoria y detalle).
  const [mon, setMon] = useState<Mon>(moneda);
  useEffect(() => setMon(moneda), [moneda]);
  const mk: "ars" | "usd" = mon === "USD" ? "usd" : "ars";

  const [scope, setScope] = useState<ScopeResp | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ClienteResp | null>(null);
  const [selTicker, setSelTicker] = useState<string | null>(null);
  const [selBucket, setSelBucket] = useState<string | null>(null);
  const [agg, setAgg] = useState<Agg>("MES");
  const [escala, setEscala] = useState<"lin" | "log">("lin");
  // Rango por FECHA DE COBRO (ISO 'YYYY-MM-DD'). Default = HOY → HOY+60 (lo más
  // útil es lo que se viene ya). Vacío ("todo") = todo el futuro.
  const [desde, setDesde] = useState<string>(() => isoLocal(0));
  const [hasta, setHasta] = useState<string>(() => isoLocal(60));
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fechaQS = (desde ? `&desde=${desde}` : "") + (hasta ? `&hasta=${hasta}` : "");

  // Scope (operador + filtros madre + rango de cobro) → tabla + serie base. Reset selección.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const d = await getJson<ScopeResp>(
          `/api/operaciones/comercial/cobros-futuros?operador=${encodeURIComponent(operador)}${nQS}${fechaQS}`,
        );
        if (cancel) return;
        setScope(d);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [operador, nQS, fechaQS]);

  // Reset de la selección SOLO cuando cambia el universo de clientes (operador/niveles),
  // NO al mover el rango de fecha → así podés ajustar el rango con una cuenta elegida.
  useEffect(() => {
    setSel(null);
    setSelTicker(null);
    setSelBucket(null);
  }, [operador, nQS]);

  // Detalle del cliente seleccionado (interactivo).
  useEffect(() => {
    if (!sel) {
      setDetalle(null);
      return;
    }
    let cancel = false;
    setSelTicker(null);
    setSelBucket(null);
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

  // Cambiar la agregación temporal limpia la barra seleccionada (cambian los buckets).
  useEffect(() => setSelBucket(null), [agg]);

  const clientes = useMemo(() => {
    const list = scope?.clientes ?? [];
    const term = q.trim().toLowerCase();
    const filtrada = term
      ? list.filter(
          (c) =>
            (c.cliente ?? "").toLowerCase().includes(term) ||
            c.id_cuenta.toLowerCase().includes(term),
        )
      : list;
    return [...filtrada].sort((a, b) => (mk === "usd" ? b.total_usd - a.total_usd : b.total_ars - a.total_ars));
  }, [scope, mk, q]);

  // Títulos del cliente ACOTADOS por el rango de fecha de cobro (el endpoint de detalle
  // trae todo el libro; el rango se aplica acá). Alimenta gráfico + por-título + detalle.
  const titulosRango = useMemo(() => {
    const list = detalle?.titulos ?? [];
    return list.filter(
      (t) => (!desde || t.fecha_pago >= desde) && (!hasta || t.fecha_pago <= hasta),
    );
  }, [detalle, desde, hasta]);

  // Detalle por fecha TOTAL (sin cuenta elegida): la serie del scope ya viene filtrada por
  // rango desde el backend. {fecha, monto en la moneda activa}.
  const serieRows = useMemo(() => {
    return (scope?.serie ?? [])
      .map((p) => ({ fecha: p.fecha, monto: mk === "usd" ? p.usd : p.ars }))
      .filter((r) => r.monto !== 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [scope, mk]);
  const totalSerie = useMemo(() => serieRows.reduce((s, r) => s + r.monto, 0), [serieRows]);

  // Gráfico de BARRAS por fecha (NO acumulado), en la moneda activa.
  //  · sin cliente → serie del scope.
  //  · con cliente → sus títulos (filtrados por moneda y, si hay, por ticker).
  const chartData = useMemo(() => {
    const map: Record<string, number> = {};
    if (sel && detalle) {
      for (const t of titulosRango) {
        if (monKey(t.moneda) !== mk) continue;
        if (selTicker && t.ticker !== selTicker) continue;
        const k = bucketKey(t.fecha_pago, agg);
        map[k] = (map[k] || 0) + t.monto;
      }
    } else {
      for (const p of scope?.serie ?? []) {
        const k = bucketKey(p.fecha, agg);
        map[k] = (map[k] || 0) + (mk === "usd" ? p.usd : p.ars);
      }
    }
    return Object.keys(map)
      .sort()
      .map((k) => ({ bucket: k, monto: map[k] }));
  }, [sel, detalle, titulosRango, scope, mk, selTicker, agg]);

  // Sumatoria POR TÍTULO del cliente (moneda activa).
  const porTitulo = useMemo(() => {
    if (!sel || !detalle) return [] as { ticker: string; emisor: string | null; total: number }[];
    const map: Record<string, { ticker: string; emisor: string | null; total: number }> = {};
    for (const t of titulosRango) {
      if (monKey(t.moneda) !== mk) continue;
      const k = t.ticker || "—";
      (map[k] ??= { ticker: k, emisor: t.emisor, total: 0 }).total += t.monto;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sel, detalle, titulosRango, mk]);

  // Detalle por fecha (moneda activa + drilldown por ticker / por fecha).
  const detalleRows = useMemo(() => {
    if (!sel || !detalle) return [] as Titulo[];
    return titulosRango
      .filter(
        (t) =>
          monKey(t.moneda) === mk &&
          (!selTicker || t.ticker === selTicker) &&
          (!selBucket || bucketKey(t.fecha_pago, agg) === selBucket),
      )
      .sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago) || b.monto - a.monto);
  }, [sel, detalle, titulosRango, mk, selTicker, selBucket, agg]);

  // Con búsqueda activa el total del header acompaña a lo que se ve en la tabla.
  const totalScope = q.trim()
    ? clientes.reduce((s, c) => s + (mk === "usd" ? c.total_usd : c.total_ars), 0)
    : mk === "usd"
      ? scope?.total_usd ?? 0
      : scope?.total_ars ?? 0;
  // Total del cliente ACOTADO al rango (suma de sus títulos en la moneda activa).
  const totalCli = useMemo(
    () => titulosRango.filter((t) => monKey(t.moneda) === mk).reduce((s, t) => s + t.monto, 0),
    [titulosRango, mk],
  );

  return (
    <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
      {/* IZQUIERDA: tabla clientes (arriba) + gráfico de barras por fecha (abajo) */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* TABLA CLIENTES */}
        <div className="flex-[3_1_0%] min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Clientes</span>
            <label className={"inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] " + (q ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border-2)] bg-[var(--t-panel)]")} title="Buscar por nombre de cliente o número de cuenta">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="buscar cliente o cuenta"
                className="w-[150px] bg-transparent text-[10px] text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-muted)]"
              />
              {q && (
                <button onClick={() => setQ("")} title="Limpiar búsqueda" className="text-[9px] text-[var(--t-accent)] hover:underline">
                  ✕
                </button>
              )}
            </label>
            <MonToggle mon={mon} onChange={setMon} />
            {/* Rango por fecha de cobro. Vacío = todo el futuro. */}
            <label className={"inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] " + ((desde || hasta) ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border-2)] bg-[var(--t-panel)]")} title="Filtrar por fecha de cobro. Vacío = todo el futuro.">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Desde</span>
              <input type="date" value={desde} max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                className="bg-transparent text-[10px] tabular-nums text-[var(--t-text)] outline-none" />
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Hasta</span>
              <input type="date" value={hasta} min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                className="bg-transparent text-[10px] tabular-nums text-[var(--t-text)] outline-none" />
              {(desde || hasta) && <button onClick={() => { setDesde(""); setHasta(""); }} title="Quitar filtro de fecha" className="text-[9px] text-[var(--t-accent)] hover:underline">todo</button>}
            </label>
            <button
              onClick={() => { const h = isoLocal(0); setDesde(h); setHasta(h); setAgg("DIA"); }}
              title="Solo lo que se cobra HOY"
              className="border border-[var(--t-border-2)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            >
              HOY
            </button>
            <span className="text-[9px] text-[var(--t-text-muted)]">{clientes.length}</span>
            <span className="ml-auto text-[10px] font-mono">{mon} {fmtMoneyFull(totalScope)}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            ) : err ? (
              <p className="p-3 text-[11px] text-[#ff7777]">{err}</p>
            ) : clientes.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">
                {q ? `Sin resultados para "${q}".` : "Sin cobros futuros para este scope."}
              </p>
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
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoneyFull(tot)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* GRÁFICO DE BARRAS POR FECHA */}
        <div className="flex-[2_1_0%] min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">A cobrar · {mon}</span>
            <span className="text-[9px] text-[var(--t-text-muted)] truncate">
              {sel && detalle ? detalle.cliente || sel : "Todo el scope"}
              {selTicker ? ` · ${selTicker}` : ""}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {AGGS.map(([a, label]) => (
                  <button key={a} onClick={() => setAgg(a)}
                    className={"px-1.5 py-0.5 text-[9px] font-semibold " + (agg === a ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setEscala((e) => (e === "log" ? "lin" : "log"))}
                title="Escala logarítmica: comprime el vencimiento gigante para ver los cobros chicos"
                className={"px-1.5 py-0.5 text-[9px] font-semibold border " + (escala === "log" ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}
              >
                LOG
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-1">
            {chartData.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" vertical={false} />
                  <XAxis dataKey="bucket" tickFormatter={(k) => bucketLabel(String(k), agg)} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} minTickGap={16} />
                  <YAxis
                    tickFormatter={(v) => fmtMoney(v as number)}
                    tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                    width={54}
                    scale={escala === "log" ? "log" : "auto"}
                    domain={escala === "log" ? [1, "auto"] : [0, "auto"]}
                    allowDataOverflow={escala === "log"}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--t-border)", opacity: 0.3 }}
                    contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }}
                    labelFormatter={(l) => bucketLabel(String(l), agg)}
                    formatter={(v) => [`${mon} ${fmtMoneyFull(Number(v))}`, "A cobrar"]}
                  />
                  <Bar
                    dataKey="monto"
                    maxBarSize={72}
                    onClick={(d) => {
                      const k = (d as { bucket?: string })?.bucket ?? null;
                      setSelBucket((prev) => (prev === k ? null : k));
                    }}
                    cursor="pointer"
                  >
                    {chartData.map((d) => (
                      <Cell
                        key={d.bucket}
                        fill="var(--t-accent)"
                        fillOpacity={selBucket && selBucket !== d.bucket ? 0.35 : 0.9}
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
          /* Sin cuenta elegida → DETALLE POR FECHA TOTAL de todo el scope (serie ya
             filtrada por rango en el backend). Elegir un cliente enfoca el detalle por título. */
          <div className="flex-1 min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Detalle por fecha · Total</span>
              <span className="text-[9px] text-[var(--t-text-dim)] truncate">todo el scope · elegí un cliente para el detalle por título</span>
              <span className="ml-auto text-[10px] font-mono font-semibold text-[var(--t-accent)]">{mon} {fmtMoneyFull(totalSerie)}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {serieRows.length === 0 ? (
                <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin cobros futuros para el filtro.</p>
              ) : (
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-[var(--t-panel)]">
                    <tr className="text-[var(--t-text-muted)]">
                      <th className="text-left !px-2">Fecha</th>
                      <th className="text-right !px-2">Monto {mon}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serieRows.map((r) => (
                      <tr key={r.fecha} className="hover:bg-[var(--t-border)]">
                        <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{fmtFecha(r.fecha)}</td>
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoneyFull(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
                  <span className="font-mono font-semibold text-[var(--t-accent)] text-[12px]">{fmtMoneyFull(totalCli)}</span>
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
                            <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoneyFull(t.total)}</td>
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
                {(selTicker || selBucket) && (
                  <button
                    onClick={() => {
                      setSelTicker(null);
                      setSelBucket(null);
                    }}
                    className="text-[9px] text-[var(--t-accent)] hover:underline"
                  >
                    {selTicker ? `Ticker ${selTicker}` : ""}{selTicker && selBucket ? " · " : ""}{selBucket ? bucketLabel(selBucket, agg) : ""} ✕
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
                          <td className="!px-2 text-right tabular-nums font-semibold">{fmtMoneyFull(t.monto)}</td>
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
