"use client";

// OPERACIONES → AGRO: mismo formato que Operaciones, pero en TONELADAS de Futuros
// Agropecuarios. Izq: Σ ton por commodity (arriba) + gráfico (abajo, OpsBarChart).
// Der: Σ ton por cuenta. Tablas = día (modelo ÚLTIMA/DÍA/TODOS); el gráfico trae
// la serie DIARIA y agrega/filtra en cliente (toolbar idéntico a OPERACIONES).
// Endpoint: /api/operaciones/ops/agro.

import { useEffect, useMemo, useState } from "react";
import { OpsBarChart, type SerieDef, type SerieRow } from "./ops-bar-chart";

type Modo = "ULTIMA" | "DIA" | "TODOS";
type AgroSerieRow = { periodo: string; SOJA: number; TRIGO: number; MAIZ: number };
type CuentaRow = { denominacion: string; toneladas: number; n: number };
type Resp = {
  serie: AgroSerieRow[];
  totales: { SOJA: number; TRIGO: number; MAIZ: number };
  por_cuenta: CuentaRow[];
};

const COMMS: SerieDef[] = [
  { key: "SOJA", label: "Soja", color: "#22c55e" },
  { key: "TRIGO", label: "Trigo", color: "#eab308" },
  { key: "MAIZ", label: "Maíz", color: "#3b82f6" },
];

const fmtTon = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

export function AgroView() {
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [fechas, setFechas] = useState<{ fecha: string; n: number }[]>([]);
  const [idx, setIdx] = useState(0);
  const [meta, setMeta] = useState<{ n_boletos: number; ultima_ingesta: string | null } | null>(null);
  const [selComm, setSelComm] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  const fecha = fechas[idx]?.fecha ?? "";
  const rangoFecha = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [modo, fecha, fechas]);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/operaciones/ops/fechas", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null);
      setFechas(r?.fechas ?? []); setIdx(0);
    })();
  }, []);
  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);
  useEffect(() => {
    if (modo === "TODOS" || !fecha) { setMeta(null); return; }
    fetch(`/api/operaciones/ops/meta?fecha=${fecha}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null).then((j) => setMeta(j?.meta ?? null)).catch(() => setMeta(null));
  }, [modo, fecha]);

  // Tablas = rango [desde,hasta]; serie = histórica DIARIA (se agrega/filtra en
  // cliente). Por eso pedimos agg=DIARIO siempre; el toolbar del gráfico no refetch.
  useEffect(() => {
    if (!rangoFecha.desde || !rangoFecha.hasta) return;
    setLoading(true);
    const qs = `desde=${rangoFecha.desde}&hasta=${rangoFecha.hasta}&agg=DIARIO`
      + (selComm ? `&commodity=${selComm}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "");
    fetch(`/api/operaciones/ops/agro?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [rangoFecha.desde, rangoFecha.hasta, selComm, selCuenta]);

  const chartSerie = useMemo<SerieRow[]>(
    () => (data?.serie ?? []).map((p) => ({ fecha: p.periodo, SOJA: p.SOJA, TRIGO: p.TRIGO, MAIZ: p.MAIZ })),
    [data],
  );
  const series = useMemo(() => COMMS.filter((c) => !selComm || selComm === c.key), [selComm]);
  const tot = data?.totales ?? { SOJA: 0, TRIGO: 0, MAIZ: 0 };
  const totGral = tot.SOJA + tot.TRIGO + tot.MAIZ;
  const cuentas = data?.por_cuenta ?? [];

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Filtros — modelo ÚLTIMA/DÍA/TODOS (las tablas son del día; el gráfico es histórico) */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.min(i + 1, fechas.length - 1)); }} disabled={idx >= fechas.length - 1} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">‹</button>
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.max(i - 1, 0)); }} disabled={idx <= 0} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">›</button>
        </div>
        {(["ULTIMA", "DIA", "TODOS"] as Modo[]).map((m) => (
          <button key={m} onClick={() => setModo(m)} className={"px-2 py-0.5 border text-[11px] font-semibold " + (modo === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}>{m}</button>
        ))}
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "TODOS" ? "histórico" : (fecha || "—")}
        </span>
        {meta && modo !== "TODOS" && (
          <><span className="text-[#333]">│</span>
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
          </span></>
        )}
        {(selComm || selCuenta) && (
          <button onClick={() => { setSelComm(null); setSelCuenta(null); }} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ {selComm || selCuenta}</button>
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          TOTAL: <span className="text-[var(--t-text)] font-semibold">{fmtTon(totGral)} t</span>{loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Cuerpo 50/50 */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA: tabla commodity (arriba, chica) + gráfico (abajo, MÁS ALTO) */}
        <div className="min-h-0 grid grid-rows-[2fr_3fr] gap-3 overflow-hidden">
          {/* Por commodity */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por commodity</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtTon(totGral)} t</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {COMMS.filter((c) => tot[c.key as "SOJA" | "TRIGO" | "MAIZ"] !== 0).map((c) => {
                    const ck = c.key as "SOJA" | "TRIGO" | "MAIZ";
                    const act = selComm === c.key;
                    return (
                      <tr key={c.key} onClick={() => { setSelComm(act ? null : c.key); setSelCuenta(null); }}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1">
                          <span className="inline-block w-2 h-2 mr-2" style={{ background: c.color }} />{c.label}
                        </td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtTon(tot[ck])} t</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{totGral ? ((tot[ck] / totGral) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!totGral && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* Gráfico */}
          <OpsBarChart serie={chartSerie} series={series} fmt={fmtTon} unidad="toneladas" defaultAgg="MENSUAL"
            focoFecha={modo === "DIA" ? fecha : null} />
        </div>

        {/* DERECHA: por cuenta */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por cuenta</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{cuentas.length} · Σ {fmtTon(totGral)} t</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Toneladas</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((r) => {
                  const act = selCuenta === r.denominacion;
                  return (
                    <tr key={r.denominacion} onClick={() => { setSelCuenta(act ? null : r.denominacion); setSelComm(null); }}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtTon(r.toneladas)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  );
                })}
                {!cuentas.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
