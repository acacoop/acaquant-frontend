"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { CheckPanel, RunBtn, StatusBadge, d10 } from "./manager-shared";

interface CurvaDebugResp {
  ok: boolean;
  message?: string;
  instrumento?: {
    ticker: string; ticker_corto: string; curva: string;
    fecha_emision: string; fecha_vencimiento: string | null;
    valor_nominal: number; cer_emision: number | null; n_flujos: number;
  };
  trade?: {
    timestamp: string | null; price: number;
    TEA_persistido: number | null; TEM_persistido: number | null;
    duration_persistido: number | null; mod_duration_persistido: number | null;
    convexity_persistido: number | null; paridad_persistido: number | null;
  };
  settlement?: {
    fecha_trade: string; fecha_settlement: string;
    dias_a_vto_trade: number; dias_a_vto_settle: number; regla: string;
  };
  cer_info?: { cer_emision: number; cer_liq: number; ratio: number } | null;
  tc_info?: { fuente: string; valor: number | null; precio_usd?: number } | null;
  flujos_futuros?: { fecha: string; monto: number; raw: Record<string, unknown> }[];
  cashflow_xirr?: { fecha: string; monto: number; concepto: string }[];
  calculado?: {
    TEA?: number; TEM?: number; duration?: number;
    mod_duration?: number; convexity?: number; paridad?: number;
  };
  diff?: Record<string, string>;
  error_calc?: string | null;
}

function fmtExpiry(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

interface ExpiriesData {
  disponibles: string[];
  activos:     string[];
  auto_pick:   boolean;
  actualizado: string | null;
}

export function OpcionesExpiriesPanel() {
  const [data, setData] = useState<ExpiriesData | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/manager/options/expiries")
      .then((r) => r.json())
      .then((d: ExpiriesData) => {
        setData(d);
        setSeleccion(d.activos || []);
      })
      .catch((e) => setMsg(`Error: ${e}`));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggle = (exp: string) => {
    setSeleccion((s) => (s.includes(exp) ? s.filter((x) => x !== exp) : [...s, exp]));
  };

  const guardar = () => {
    setSaving(true);
    setMsg(null);
    fetch("/api/manager/options/expiries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiries: seleccion }),
    })
      .then((r) => r.json())
      .then((d) => {
        setMsg(d.auto_pick ? "Guardado — auto-pick activado" : `Guardado — ${d.expiries.length} vencimiento(s)`);
        fetchData();
      })
      .catch((e) => setMsg(`Error: ${e}`))
      .finally(() => setSaving(false));
  };

  const volverAuto = () => {
    setSeleccion([]);
    setSaving(true);
    setMsg(null);
    fetch("/api/manager/options/expiries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiries: [] }),
    })
      .then(() => {
        setMsg("Auto-pick activado");
        fetchData();
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Opciones — vencimientos a trackear
        </span>
        <span className="text-[9px] text-[var(--t-text-muted)]">
          (engine aplica en el próximo chequeo ~5 min)
        </span>
        {data?.actualizado && (
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">
            disponibles actualizados: {data.actualizado}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {!data ? (
          <div className="text-[10px] text-[var(--t-text-muted)] font-mono">Cargando…</div>
        ) : data.disponibles.length === 0 ? (
          <div className="text-[10px] text-[var(--t-accent)] font-mono">
            No hay vencimientos disponibles en Metadata. ¿Está corriendo el motor de opciones?
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {data.disponibles.map((exp) => {
                const sel = seleccion.includes(exp);
                return (
                  <button
                    key={exp}
                    onClick={() => toggle(exp)}
                    disabled={saving}
                    className={`px-2 py-1 text-[10px] font-mono border transition-colors ${
                      sel
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                        : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                    }`}
                  >
                    {fmtExpiry(exp)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={guardar}
                disabled={saving}
                className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar selección"}
              </button>
              <button
                onClick={volverAuto}
                disabled={saving}
                className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
              >
                Volver a auto-pick
              </button>
              <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
                estado actual:{" "}
                {data.auto_pick ? (
                  <span className="text-[var(--t-pos)]">AUTO (próximo &gt; hoy)</span>
                ) : (
                  <span className="text-[var(--t-accent)]">
                    {data.activos.map(fmtExpiry).join(", ")}
                  </span>
                )}
              </span>
              {msg && <span className="text-[10px] font-mono text-[var(--t-pos)] ml-auto">{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}



// ── Main view ─────────────────────────────────────────────────────────────────

// ── Tab: Validaciones ─────────────────────────────────────────────────────────

interface PivotVela { fecha: string; high: number | null; low: number | null; close: number | null; }
interface PivotFrame {
  label: string;
  rango_desde: string;
  rango_hasta: string;
  n_velas: number;
  velas: PivotVela[];
  ok: boolean;
  motivo?: string;
  h?: { valor: number; fecha: string };
  l?: { valor: number; fecha: string };
  c?: { valor: number; fecha: string };
  formula?: { paso: string; valor: string }[];
  levels?: { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
}
interface PivotDebugResp {
  ticker: string;
  last: number | null;
  last_fecha: string | null;
  frames: { diario: PivotFrame; semanal: PivotFrame; mensual: PivotFrame; anual: PivotFrame };
}

export function TabValidaciones() {
  // Tasa Fija
  const [tfLoading, setTfLoading] = useState(false);
  const [tfData, setTfData] = useState<{ snapshot: string | null; ok: number; sin_posicion: number; sin_assets: number; instrumentos: { ticker: string; estado: string }[] } | null>(null);

  // Tickers de curvas (para los selects de Debug Soberano)
  const [tickers, setTickers] = useState<string[]>([]);

  // Debug Breakevens (por fila, compara Buscar Objetivo vs Fisher)
  const [bkvDebugLoading, setBkvDebugLoading] = useState(false);
  const [bkvDebugData, setBkvDebugData] = useState<{
    fecha_cer_max: string | null;
    cer_actual: number | null;
    pares: {
      lecap: string;
      cer: string;
      fecha_vto: string;
      dias: number;
      fecha_cer_liq: string | null;
      meses_pendientes: number | null;
      precio_lecap: number | null;
      flujo_vto_lecap: number | null;
      precio_cer: number | null;
      vn_cer: number | null;
      cer_emision: number | null;
      retorno_lecap: number | null;
      factor_bo: number | null;
      be_buscar_obj: number | null;
      tem_lecap: number | null;
      paridad_cer: number | null;
      retorno_fisher: number | null;
      inflacion_fisher: number | null;
      be_fisher: number | null;
    }[];
  } | null>(null);
  const [bkvExpanded, setBkvExpanded] = useState<string | null>(null);

  // Debug Soberano
  const [tcSob, setTcSob] = useState("");
  const [sobLoading, setSobLoading] = useState(false);
  const [sobData, setSobData] = useState<{
    instrumento: { ticker: string; ticker_corto: string; tipo: string; curva: string; fecha_emision: string; fecha_vencimiento: string; valor_nominal: number; flujos_total: number };
    precio: { ultimo_trade_ts: string | null; precio_rofex: number | null; mep: number | null; precio_usd: number | null };
    settlement: string;
    flujos_futuros: { fecha: string; amortizacion_pct: number; cupon_sobre_residual: number; residual_previo_pct: number; monto_usd: number }[];
    total_flujos_usd: number;
    cashflow: { fecha: string; monto: number }[];
    resultado: { tea_pct: number | null; duration: number | null; paridad: number | null };
  } | null>(null);
  const [sobError, setSobError] = useState<string | null>(null);

  // Debug TEA Curvas (renta fija)
  const [curvaTickerInput, setCurvaTickerInput] = useState("");
  const [curvaLoading, setCurvaLoading] = useState(false);
  const [curvaData, setCurvaData] = useState<CurvaDebugResp | null>(null);

  // Debug TNA Futuros DLR
  const [tnaLoading, setTnaLoading] = useState(false);
  const [tnaData, setTnaData] = useState<{
    spot: { valor: number | null; fuente: string | null };
    filas: {
      ticker: string; vto: string; dias: number;
      bid: number | null; last: number | null; offer: number | null; mid_book: number | null;
      directo_last: number | null; tna_lineal_last: number | null; tea_compuesta_last: number | null;
      tna_lineal_mid: number | null; tea_compuesta_mid: number | null;
      tna_persistida: number | null;
    }[];
    total: number;
    nota: string;
  } | null>(null);

  // Debug Pivot Points
  const [pvTicker, setPvTicker] = useState("");
  const [pvLoading, setPvLoading] = useState(false);
  const [pvData, setPvData] = useState<PivotDebugResp | null>(null);

  // Control: títulos (bonos ARS/HD/DL) sin flujo en Curvas
  const [tsfLoading, setTsfLoading] = useState(false);
  const [tsfData, setTsfData] = useState<{
    total: number; en_cartera: number; ok: boolean;
    titulos: { unidad: string; ticker: string | null; cartera: string;
               emisor: string | null; motivo: string; en_cartera: boolean }[];
  } | null>(null);

  // Backfill Tasas — recalcula TEA/TEM de mercado.curvas y rellena las faltantes
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manager/checks/tickers-curvas").then(r => r.json()).then((d: string[]) => {
      setTickers(d);
    }).catch(console.error);
  }, []);

  const runBackfillTasas = async () => {
    setBtLoading(true);
    setBtResult(null);
    try {
      const start = await fetch("/api/manager/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "backfill_tasas" }),
      }).then(r => r.json());
      const jobId = start?.job_id;
      if (!jobId) { setBtResult("No se pudo lanzar el job (¿sin permiso?)."); return; }
      // Poll hasta que termine (el job es rápido, pero damos margen).
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 2000));
        const job = await fetch(`/api/manager/jobs/${jobId}`, { cache: "no-store" }).then(r => r.json());
        if (job?.status && job.status !== "running") {
          setBtResult(job.result || `(sin salida) status=${job.status}`);
          return;
        }
      }
      setBtResult("Timeout esperando el job (seguí en JOBS → historial).");
    } catch (e) {
      setBtResult(`Error: ${String(e)}`);
    } finally {
      setBtLoading(false);
    }
  };

  const runTf  = () => { setTfLoading(true);  fetch("/api/manager/checks/tasa-fija").then(r => r.json()).then(setTfData).finally(() => setTfLoading(false)); };
  const runBkvDebug = () => {
    setBkvDebugLoading(true);
    fetch("/api/manager/checks/breakevens-debug")
      .then(r => r.json()).then(setBkvDebugData).finally(() => setBkvDebugLoading(false));
  };
  const runTna = () => {
    setTnaLoading(true);
    fetch("/api/manager/checks/debug-tna-futuros")
      .then(r => r.json()).then(setTnaData).finally(() => setTnaLoading(false));
  };
  const runPv = () => {
    if (!pvTicker.trim()) return;
    setPvLoading(true);
    fetch(`/api/manager/checks/debug-pivot?ticker=${encodeURIComponent(pvTicker.trim())}`)
      .then(r => r.json()).then(setPvData).finally(() => setPvLoading(false));
  };
  const runCurva = () => {
    if (!curvaTickerInput.trim()) return;
    setCurvaLoading(true);
    fetch(`/api/manager/checks/debug-curva-tea?ticker=${encodeURIComponent(curvaTickerInput.trim())}`)
      .then(r => r.json()).then(setCurvaData).finally(() => setCurvaLoading(false));
  };
  const runSob = () => {
    if (!tcSob) return;
    setSobLoading(true);
    setSobError(null);
    fetch(`/api/manager/checks/debug-soberano?ticker_corto=${encodeURIComponent(tcSob)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text();
          throw new Error(body || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(setSobData)
      .catch((e) => { setSobData(null); setSobError(e instanceof Error ? e.message : String(e)); })
      .finally(() => setSobLoading(false));
  };
  const runTsf = () => {
    setTsfLoading(true);
    fetch("/api/manager/bonos/sin-flujo")
      .then(r => r.json()).then(setTsfData).finally(() => setTsfLoading(false));
  };

  const ESTADO_LABEL: Record<string, string> = { ok: "✅ En vista", sin_posicion: "⚠️ Sin posición", sin_assets: "❌ Sin Assets" };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">

      <CheckPanel title="Backfill Tasas — recalcular y rellenar TEA/TEM de Renta Fija">
        <div className="text-[10px] text-[var(--t-text-muted)] mb-2 leading-relaxed">
          Recalcula la TEA/TEM de todos los bonos y actualiza los valores.
          Rellena las que están en <b>&quot;--&quot;</b> y refresca las
          existentes, sin esperar al próximo trade (útil tras corregir un flujo o cuando
          el motor no las calculó). Solo escribe lo que puede calcular — no pisa datos buenos.
        </div>
        <RunBtn onClick={runBackfillTasas} loading={btLoading} />
        {btResult && (
          <pre className="text-[10px] text-[var(--t-text)] whitespace-pre-wrap bg-[var(--t-surface)] border border-[var(--t-border)] p-2 mt-1 max-h-64 overflow-y-auto">
            {btResult}
          </pre>
        )}
      </CheckPanel>

      <CheckPanel title="Títulos sin flujo — bonos ARS/HD/DL sin flujo en Curvas">
        <RunBtn onClick={runTsf} loading={tsfLoading} />
        {tsfData && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge ok={tsfData.ok} label={tsfData.ok ? "Todos con flujo" : `${tsfData.total} sin flujo · ${tsfData.en_cartera} en cartera`} />
            </div>
            {!tsfData.ok && (
              <table><thead><tr><th>CART</th><th>UNIDAD</th><th>TICKER</th><th>HOY</th><th>MOTIVO</th></tr></thead>
                <tbody>{tsfData.titulos.map(t => (
                  <tr key={t.unidad}>
                    <td>{t.cartera}</td>
                    <td className="text-[var(--t-accent)]">{t.unidad}</td>
                    <td className="font-mono">{t.ticker ?? "—"}</td>
                    <td className="text-center">{t.en_cartera ? "🔴" : "·"}</td>
                    <td className="text-[var(--t-text-dim)]">{t.motivo}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Breakevens — comparar Buscar Objetivo vs Fisher">
        <RunBtn onClick={runBkvDebug} loading={bkvDebugLoading} />
        {bkvDebugData && (
          <>
            <div className="text-[10px] text-[var(--t-text-muted)] font-mono mb-2">
              CER publicado más reciente:{" "}
              <span className="text-[var(--t-accent)]">{bkvDebugData.fecha_cer_max ?? "—"}</span>
              {bkvDebugData.cer_actual != null && (
                <> ({bkvDebugData.cer_actual.toFixed(4)})</>
              )}
              {" · "}Click en una fila para el desglose paso a paso.
            </div>
            <table>
              <thead>
                <tr>
                  <th>LECAP</th><th>CER</th>
                  <th className="text-right">DÍAS</th>
                  <th className="text-right">MESES PEND</th>
                  <th className="text-right">BE BUSCAR OBJ</th>
                  <th className="text-right">BE FISHER</th>
                  <th className="text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {bkvDebugData.pares.map((p) => {
                  const key = `${p.lecap}__${p.cer}`;
                  const expanded = bkvExpanded === key;
                  const bo = p.be_buscar_obj;
                  const fisher = p.be_fisher;
                  const delta = bo != null && fisher != null ? (bo - fisher) * 100 : null;
                  return (
                    <>
                      <tr
                        key={key}
                        onClick={() => setBkvExpanded(expanded ? null : key)}
                        className="cursor-pointer hover:bg-[var(--t-accent)]/10"
                      >
                        <td className="text-[var(--t-accent)]">{p.lecap}</td>
                        <td className="text-[var(--t-text-dim)]">{p.cer}</td>
                        <td className="text-right text-[var(--t-text-dim)] font-mono">{p.dias}</td>
                        <td className="text-right font-mono">
                          {p.meses_pendientes != null ? p.meses_pendientes.toFixed(3) : "—"}
                        </td>
                        <td className="text-right font-bold font-mono text-[var(--t-accent)]">
                          {bo != null ? `${(bo * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td className="text-right font-mono text-[var(--t-text-dim)]">
                          {fisher != null ? `${(fisher * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td
                          className="text-right font-mono"
                          style={{ color: delta != null && Math.abs(delta) > 0.5 ? "#ff9900" : "#888" }}
                        >
                          {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}pp` : "—"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${key}_detail`}>
                          <td colSpan={7} className="!py-2 !px-3 bg-[var(--t-panel)] border-l-2 border-l-[var(--t-accent)]">
                            <div className="font-mono text-[10px] text-[var(--t-text)] grid grid-cols-2 gap-4">
                              {/* Buscar Objetivo */}
                              <div className="flex flex-col gap-1">
                                <div className="text-[var(--t-accent)] font-semibold uppercase tracking-wide">
                                  Buscar Objetivo
                                </div>
                                <div className="text-[var(--t-text-muted)]">Inputs:</div>
                                <div>P<sub>lecap</sub> = {p.precio_lecap ?? "—"}</div>
                                <div>Flujo<sub>vto lecap</sub> = {p.flujo_vto_lecap ?? "—"}</div>
                                <div>P<sub>cer</sub> = {p.precio_cer ?? "—"}</div>
                                <div>VN<sub>cer</sub> = {p.vn_cer ?? "—"}</div>
                                <div>CER<sub>emision</sub> = {p.cer_emision ?? "—"}</div>
                                <div>CER<sub>actual</sub> = {bkvDebugData.cer_actual?.toFixed(4) ?? "—"}</div>
                                <div>Meses<sub>pend</sub> = {p.meses_pendientes?.toFixed(4) ?? "—"}</div>
                                <div className="text-[var(--t-text-muted)] mt-1">Cálculo:</div>
                                <div>
                                  R<sub>lecap</sub> = Flujo/P − 1
                                  <span className="text-[var(--t-accent)] font-semibold">
                                    {" = "}{p.retorno_lecap != null ? `${(p.retorno_lecap * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                                <div>
                                  factor = (1+R) × (P<sub>cer</sub> × CER<sub>emi</sub>) / (VN × CER<sub>act</sub>)
                                </div>
                                <div className="text-[var(--t-text-dim)]">
                                  {" = "}{p.factor_bo?.toFixed(6) ?? "—"}
                                </div>
                                <div>
                                  BE = factor^(1/meses) − 1
                                  <span className="text-[var(--t-pos)] font-bold">
                                    {" = "}{bo != null ? `${(bo * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                              </div>
                              {/* Fisher */}
                              <div className="flex flex-col gap-1">
                                <div className="text-[var(--t-text-dim)] font-semibold uppercase tracking-wide">
                                  Fisher (clásico)
                                </div>
                                <div className="text-[var(--t-text-muted)]">Inputs:</div>
                                <div>TEM = {p.tem_lecap != null ? `${(p.tem_lecap * 100).toFixed(4)}%` : "—"}</div>
                                <div>Paridad<sub>cer</sub> = {p.paridad_cer != null ? `${p.paridad_cer.toFixed(2)}%` : "—"}</div>
                                <div>Días = {p.dias}</div>
                                <div className="text-[var(--t-text-muted)] mt-1">Cálculo:</div>
                                <div>
                                  R = (1+TEM)^(días/30) − 1
                                  <span className="text-[var(--t-text-dim)]">
                                    {" = "}{p.retorno_fisher != null ? `${(p.retorno_fisher * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                                <div>
                                  π = (1+R) × (paridad/100) − 1
                                </div>
                                <div className="text-[var(--t-text-dim)]">
                                  {" = "}{p.inflacion_fisher != null ? `${(p.inflacion_fisher * 100).toFixed(3)}%` : "—"}
                                </div>
                                <div>
                                  BE = (1+π)^(30/días) − 1
                                  <span className="text-[var(--t-text-dim)] font-semibold">
                                    {" = "}{fisher != null ? `${(fisher * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Check Tasa Fija — estado de instrumentos en AuM">
        <RunBtn onClick={runTf} loading={tfLoading} />
        {tfData && (
          <>
            <div className="flex items-center gap-3 mb-2 text-[10px] font-mono">
              <span className="text-[var(--t-text-muted)]">Corte: {tfData.snapshot ?? "—"}</span>
              <span style={{ color: "var(--t-pos)" }}>✅ {tfData.ok}</span>
              <span style={{ color: "#ff9900" }}>⚠️ {tfData.sin_posicion}</span>
              <span style={{ color: "var(--t-neg)" }}>❌ {tfData.sin_assets}</span>
            </div>
            <table><thead><tr><th>TICKER</th><th>ESTADO</th></tr></thead>
              <tbody>{tfData.instrumentos.map(r => (
                <tr key={r.ticker}>
                  <td className="text-[var(--t-accent)]">{r.ticker}</td>
                  <td className={r.estado === "ok" ? "text-[var(--t-pos)]" : r.estado === "sin_posicion" ? "text-[var(--t-accent)]" : "text-[var(--t-neg)]"}>
                    {ESTADO_LABEL[r.estado] ?? r.estado}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Soberano — cálculo paso a paso del YTM (GD30D / GD35D / GD38D)">
        <div className="flex items-center gap-2 mb-2">
          <select value={tcSob} onChange={e => setTcSob(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-accent)] text-[10px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none">
            <option value="">— elegir ticker —</option>
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={runSob} disabled={sobLoading || !tcSob}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
            {sobLoading ? "Calculando…" : "Calcular"}
          </button>
        </div>
        {sobError && <p className="text-[var(--t-neg)] text-[10px] mb-2">{sobError}</p>}
        {sobData && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[11px] font-semibold text-[var(--t-accent)] mb-1">{sobData.instrumento.ticker_corto}</div>
                <div className="text-[10px] font-mono text-[var(--t-text)]">Ticker: {sobData.instrumento.ticker}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Tipo: {sobData.instrumento.tipo} · Curva: {sobData.instrumento.curva}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Emisión: {sobData.instrumento.fecha_emision}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Vencimiento: {sobData.instrumento.fecha_vencimiento}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">VN: {sobData.instrumento.valor_nominal} · Flujos totales: {sobData.instrumento.flujos_total}</div>
              </div>
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[11px] font-semibold text-[var(--t-accent)] mb-1">Precio</div>
                <div className="text-[10px] font-mono text-[var(--t-text)]">Último trade: {sobData.precio.ultimo_trade_ts ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text)]">Precio ROFEX: {sobData.precio.precio_rofex?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">MEP: {sobData.precio.mep?.toFixed(2) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-pos)]">Precio USD: {sobData.precio.precio_usd?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)] mt-1">Settlement: {sobData.settlement}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="border border-[#00cc66]/30 bg-[#00cc66]/5 p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">TEA (YTM)</div>
                <div className="text-[16px] font-semibold font-mono text-[var(--t-pos)]">
                  {sobData.resultado.tea_pct != null ? `${sobData.resultado.tea_pct.toFixed(2)}%` : "—"}
                </div>
              </div>
              <div className="border border-[var(--t-border)] p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">Duration</div>
                <div className="text-[16px] font-semibold font-mono text-[var(--t-text)]">
                  {sobData.resultado.duration?.toFixed(4) ?? "—"}
                </div>
              </div>
              <div className="border border-[var(--t-border)] p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">Paridad</div>
                <div className="text-[16px] font-semibold font-mono text-[var(--t-text)]">
                  {sobData.resultado.paridad != null ? `${sobData.resultado.paridad.toFixed(2)}%` : "—"}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-[var(--t-text-dim)] mb-1">
              Flujos futuros ({sobData.flujos_futuros.length}) · Total USD: {sobData.total_flujos_usd.toFixed(2)}
            </div>
            <table><thead><tr>
              <th>FECHA</th>
              <th className="text-right">AMORT %</th>
              <th className="text-right">CUP s/RES</th>
              <th className="text-right">RES PREVIO %</th>
              <th className="text-right">MONTO USD</th>
            </tr></thead>
              <tbody>{sobData.flujos_futuros.map(f => (
                <tr key={f.fecha}>
                  <td className="text-[var(--t-text)]">{f.fecha}</td>
                  <td className="text-right font-mono">{f.amortizacion_pct.toFixed(2)}</td>
                  <td className="text-right font-mono">{f.cupon_sobre_residual.toFixed(4)}</td>
                  <td className="text-right font-mono">{f.residual_previo_pct.toFixed(2)}</td>
                  <td className="text-right font-mono text-[var(--t-pos)]">{f.monto_usd.toFixed(4)}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug TEA Curvas (renta fija — tasa_fija / cer / soberanos / dolar_linked)">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={curvaTickerInput}
            onChange={(e) => setCurvaTickerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runCurva(); }}
            placeholder="ticker_corto (ej: TX26, AL30D, T15E7, S30M6)"
            className="flex-1 max-w-[280px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          />
          <button
            onClick={runCurva}
            disabled={curvaLoading || !curvaTickerInput.trim()}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {curvaLoading ? "Calculando…" : "▶ Ejecutar"}
          </button>
        </div>

        {curvaData && !curvaData.ok && (
          <div className="text-[10px] text-[var(--t-neg)] italic">{curvaData.message}</div>
        )}

        {curvaData?.ok && curvaData.instrumento && curvaData.trade && (
          <div className="space-y-3">
            {/* Instrumento + trade */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">INSTRUMENTO</div>
                <div className="font-mono space-y-0.5">
                  <div><span className="text-[var(--t-text-muted)]">ticker</span> <span className="text-[var(--t-accent)]">{curvaData.instrumento.ticker_corto}</span> <span className="text-[var(--t-text-muted)]">({curvaData.instrumento.curva})</span></div>
                  <div><span className="text-[var(--t-text-muted)]">vto</span> {curvaData.instrumento.fecha_vencimiento ?? "—"}</div>
                  <div><span className="text-[var(--t-text-muted)]">VN</span> {curvaData.instrumento.valor_nominal}</div>
                  {curvaData.instrumento.cer_emision !== null && (
                    <div><span className="text-[var(--t-text-muted)]">cer_emision</span> {curvaData.instrumento.cer_emision}</div>
                  )}
                  <div><span className="text-[var(--t-text-muted)]">flujos en JSON</span> {curvaData.instrumento.n_flujos}</div>
                </div>
              </div>
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">ÚLTIMO TRADE (TimeSales)</div>
                <div className="font-mono space-y-0.5">
                  <div><span className="text-[var(--t-text-muted)]">ts</span> {curvaData.trade.timestamp ? new Date(curvaData.trade.timestamp).toLocaleString("es-AR") : "—"}</div>
                  <div><span className="text-[var(--t-text-muted)]">price</span> <span className="text-[var(--t-text)]">{curvaData.trade.price.toFixed(3)}</span></div>
                  <div><span className="text-[var(--t-text-muted)]">TEA persistido</span> <span className="text-[var(--t-accent)]">{curvaData.trade.TEA_persistido !== null ? `${(curvaData.trade.TEA_persistido * 100).toFixed(4)}%` : "—"}</span></div>
                  <div><span className="text-[var(--t-text-muted)]">duration persistido</span> {curvaData.trade.duration_persistido?.toFixed(4) ?? "—"}</div>
                  <div><span className="text-[var(--t-text-muted)]">paridad persistido</span> {curvaData.trade.paridad_persistido?.toFixed(2) ?? "—"}{curvaData.trade.paridad_persistido !== null && "%"}</div>
                </div>
              </div>
            </div>

            {/* Settlement + CER/TC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              {curvaData.settlement && (
                <div className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">SETTLEMENT</div>
                  <div className="font-mono space-y-0.5">
                    <div><span className="text-[var(--t-text-muted)]">fecha trade</span> {curvaData.settlement.fecha_trade}</div>
                    <div><span className="text-[var(--t-text-muted)]">fecha settle</span> <span className="text-[var(--t-pos)]">{curvaData.settlement.fecha_settlement}</span></div>
                    <div><span className="text-[var(--t-text-muted)]">días al vto (trade)</span> {curvaData.settlement.dias_a_vto_trade}</div>
                    <div><span className="text-[var(--t-text-muted)]">días al vto (settle)</span> {curvaData.settlement.dias_a_vto_settle}</div>
                    <div className="text-[var(--t-text-muted)] text-[9px] italic mt-1">{curvaData.settlement.regla}</div>
                  </div>
                </div>
              )}
              {curvaData.cer_info && (
                <div className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">CER (T-10 hábiles del settlement)</div>
                  <div className="font-mono space-y-0.5">
                    <div><span className="text-[var(--t-text-muted)]">CER emisión</span> {curvaData.cer_info.cer_emision.toFixed(4)}</div>
                    <div><span className="text-[var(--t-text-muted)]">CER liquidación</span> {curvaData.cer_info.cer_liq.toFixed(4)}</div>
                    <div><span className="text-[var(--t-text-muted)]">ratio (CER_liq / CER_em)</span> <span className="text-[var(--t-accent)]">{curvaData.cer_info.ratio.toFixed(6)}</span></div>
                  </div>
                </div>
              )}
              {curvaData.tc_info && (
                <div className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">TC ({curvaData.tc_info.fuente})</div>
                  <div className="font-mono space-y-0.5">
                    <div><span className="text-[var(--t-text-muted)]">valor</span> {curvaData.tc_info.valor?.toFixed(4) ?? "—"}</div>
                    {curvaData.tc_info.precio_usd !== undefined && (
                      <div><span className="text-[var(--t-text-muted)]">precio_usd</span> <span className="text-[var(--t-pos)]">{curvaData.tc_info.precio_usd.toFixed(6)}</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cashflow para XIRR */}
            {curvaData.cashflow_xirr && curvaData.cashflow_xirr.length > 0 && (
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">CASHFLOW XIRR ({curvaData.cashflow_xirr.length})</div>
                <table className="w-full text-[10px] font-mono">
                  <thead className="text-[var(--t-text-muted)] text-[9px]">
                    <tr><th className="text-left">FECHA</th><th className="text-left">CONCEPTO</th><th className="text-right">MONTO</th></tr>
                  </thead>
                  <tbody>
                    {curvaData.cashflow_xirr.map((c, i) => (
                      <tr key={i}>
                        <td className="text-[var(--t-text-dim)]">{c.fecha}</td>
                        <td className="text-[var(--t-text-muted)]">{c.concepto}</td>
                        <td className={`text-right ${c.monto < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"}`}>{c.monto.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Resultado calculado vs persistido */}
            <div className="border border-[var(--t-accent)]/40 p-2">
              <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">RESULTADO CALCULADO vs PERSISTIDO</div>
              {curvaData.error_calc ? (
                <div className="text-[10px] text-[var(--t-neg)] italic">⚠ {curvaData.error_calc}</div>
              ) : (
                <table className="w-full text-[10px] font-mono">
                  <thead className="text-[var(--t-text-muted)] text-[9px]">
                    <tr>
                      <th className="text-left">CAMPO</th>
                      <th className="text-right">CALCULADO</th>
                      <th className="text-right">PERSISTIDO</th>
                      <th className="text-right">DIFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { k: "TEA",          c: curvaData.calculado?.TEA,          p: curvaData.trade.TEA_persistido,          pct: true },
                      { k: "TEM",          c: curvaData.calculado?.TEM,          p: curvaData.trade.TEM_persistido,          pct: true },
                      { k: "duration",     c: curvaData.calculado?.duration,     p: curvaData.trade.duration_persistido,     pct: false },
                      { k: "mod_duration", c: curvaData.calculado?.mod_duration, p: curvaData.trade.mod_duration_persistido, pct: false },
                      { k: "convexity",    c: curvaData.calculado?.convexity,    p: curvaData.trade.convexity_persistido,    pct: false },
                      { k: "paridad",      c: curvaData.calculado?.paridad,      p: curvaData.trade.paridad_persistido,      pct: false, suffix: "%" },
                    ].map((row) => {
                      const diff = curvaData.diff?.[row.k];
                      const diffOk = diff === "OK";
                      return (
                        <tr key={row.k} className="border-b border-[var(--t-border)]">
                          <td className="text-[var(--t-text)]">{row.k}</td>
                          <td className="text-right text-[var(--t-pos)]">
                            {row.c !== undefined && row.c !== null
                              ? (row.pct ? `${(row.c * 100).toFixed(4)}%` : `${row.c.toFixed(4)}${row.suffix ?? ""}`)
                              : "—"}
                          </td>
                          <td className="text-right text-[var(--t-text-dim)]">
                            {row.p !== null && row.p !== undefined
                              ? (row.pct ? `${(row.p * 100).toFixed(4)}%` : `${row.p.toFixed(4)}${row.suffix ?? ""}`)
                              : "—"}
                          </td>
                          <td className={`text-right ${diffOk ? "text-[var(--t-pos)]" : diff === "—" ? "text-[var(--t-text-muted)]" : "text-[var(--t-accent)]"}`}>{diff ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="text-[9px] text-[var(--t-text-muted)] mt-2 italic">
                Si DIFF ≠ OK, los inputs cambiaron desde que se persistió el trade (precio nuevo, CER nuevo, MEP nuevo, etc.). El motor reescribe TEA/duration cada 5s al detectar trade sin <code>duration</code>; trades viejos pueden tener valores estáticos del momento.
              </div>
            </div>
          </div>
        )}
      </CheckPanel>

      <CheckPanel title="Debug TNA Futuros DLR (TNA lineal vs TEA compuesta)">
        <RunBtn onClick={runTna} loading={tnaLoading} />
        {tnaData && tnaData.total === 0 && (
          <div className="text-[10px] text-[var(--t-neg)] italic">
            {tnaData.nota || "Sin datos de futuros DLR."}
          </div>
        )}
        {tnaData && tnaData.total > 0 && (
          <>
            <div className="text-[10px] text-[var(--t-text-dim)] mb-2">
              Spot referencia: <span className="font-mono text-[var(--t-text)]">
                {tnaData.spot?.valor?.toFixed(2) ?? "—"}
              </span>{" "}
              <span className="text-[var(--t-text-muted)]">(fuente: {tnaData.spot?.fuente ?? "—"})</span>
              {" · "}{tnaData.total} outrights
            </div>
            <div className="text-[10px] text-[var(--t-text-dim)] mb-2 italic">{tnaData.nota}</div>
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[var(--t-text-muted)] text-[9px] tracking-widest">
                <tr>
                  <th className="text-left">TICKER</th>
                  <th className="text-right">DÍAS</th>
                  <th className="text-right">LAST</th>
                  <th className="text-right">MID BOOK</th>
                  <th className="text-right">DIRECTO%</th>
                  <th className="text-right text-[var(--t-pos)]">TNA LIN (last)</th>
                  <th className="text-right text-[var(--t-accent)]">TEA COMP (last)</th>
                  <th className="text-right text-[var(--t-pos)]">TNA LIN (mid)</th>
                  <th className="text-right text-[var(--t-accent)]">TEA COMP (mid)</th>
                  <th className="text-right">PERSISTIDA</th>
                </tr>
              </thead>
              <tbody>
                {tnaData.filas.map((f) => (
                  <tr key={f.ticker} className="border-b border-[var(--t-border)]">
                    <td className="text-[var(--t-text)]">{f.ticker}</td>
                    <td className="text-right">{f.dias}</td>
                    <td className="text-right">{f.last?.toFixed(2) ?? "—"}</td>
                    <td className="text-right text-[var(--t-text-dim)]">{f.mid_book?.toFixed(2) ?? "—"}</td>
                    <td className="text-right">{f.directo_last?.toFixed(3) ?? "—"}%</td>
                    <td className="text-right text-[var(--t-pos)]">
                      {f.tna_lineal_last?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-accent)]">
                      {f.tea_compuesta_last?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-pos)]">
                      {f.tna_lineal_mid?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-accent)]">
                      {f.tea_compuesta_mid?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-text)] font-semibold">
                      {f.tna_persistida?.toFixed(2) ?? "—"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-[var(--t-text-muted)] mt-2">
              <span className="text-[var(--t-pos)]">TNA LIN</span> = directo × 365/días (lineal — terminal Rofex){" "}
              · <span className="text-[var(--t-accent)]">TEA COMP</span> = (1+directo)^(365/días) − 1 (compuesta) ·{" "}
              <span className="text-[var(--t-text)]">PERSISTIDA</span> = valor calculado y guardado (hoy = TEA COMP)
            </div>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Pivot Points — velas y fechas usadas por timeframe">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={pvTicker}
            onChange={(e) => setPvTicker(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runPv(); }}
            placeholder="ticker (ej: NVDA, AAPL, KO)"
            className="flex-1 max-w-[280px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          />
          <button
            onClick={runPv}
            disabled={pvLoading || !pvTicker.trim()}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {pvLoading ? "Calculando…" : "▶ Ejecutar"}
          </button>
        </div>

        {pvData && (
          <div className="space-y-3">
            <div className="text-[10px] text-[var(--t-text-dim)] font-mono">
              {pvData.ticker} · último close{" "}
              <span className="text-[var(--t-text)]">{pvData.last != null ? pvData.last.toFixed(4) : "—"}</span>
              {pvData.last_fecha && <span className="text-[var(--t-text-muted)]"> ({d10(pvData.last_fecha)})</span>}
            </div>

            {(["diario", "semanal", "mensual", "anual"] as const).map((k) => {
              const fr = pvData.frames[k];
              return (
                <div key={k} className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">
                    {fr.label.toUpperCase()} — VENTANA {d10(fr.rango_desde)} → {d10(fr.rango_hasta)} · {fr.n_velas} VELAS
                  </div>
                  {!fr.ok ? (
                    <div className="text-[10px] text-[var(--t-neg)] italic">{fr.motivo}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="max-h-[260px] overflow-y-auto border border-[var(--t-border)]">
                        <table className="w-full text-[10px] font-mono">
                          <thead className="text-[var(--t-text-muted)] text-[9px] sticky top-0 bg-[var(--t-panel)]">
                            <tr>
                              <th className="text-left px-1">FECHA</th>
                              <th className="text-right px-1">HIGH</th>
                              <th className="text-right px-1">LOW</th>
                              <th className="text-right px-1">CLOSE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fr.velas.map((v, i) => {
                              const esH = !!fr.h && v.fecha === fr.h.fecha;
                              const esL = !!fr.l && v.fecha === fr.l.fecha;
                              const esC = !!fr.c && v.fecha === fr.c.fecha;
                              return (
                                <tr key={i} className="border-b border-[var(--t-border)]">
                                  <td className="text-[var(--t-text-dim)] px-1">{d10(v.fecha)}</td>
                                  <td className={`text-right px-1 ${esH ? "text-[var(--t-pos)] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.high != null ? v.high.toFixed(4) : "—"}{esH ? " ◄H" : ""}
                                  </td>
                                  <td className={`text-right px-1 ${esL ? "text-[var(--t-neg)] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.low != null ? v.low.toFixed(4) : "—"}{esL ? " ◄L" : ""}
                                  </td>
                                  <td className={`text-right px-1 ${esC ? "text-[var(--t-accent)] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.close != null ? v.close.toFixed(4) : "—"}{esC ? " ◄C" : ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="text-[10px] font-mono text-[var(--t-text-dim)]">
                        H = <span className="text-[var(--t-pos)]">{fr.h ? fr.h.valor.toFixed(4) : "—"}</span> ({d10(fr.h?.fecha)}) ·{" "}
                        L = <span className="text-[var(--t-neg)]">{fr.l ? fr.l.valor.toFixed(4) : "—"}</span> ({d10(fr.l?.fecha)}) ·{" "}
                        C = <span className="text-[var(--t-accent)]">{fr.c ? fr.c.valor.toFixed(4) : "—"}</span> ({d10(fr.c?.fecha)})
                      </div>

                      <table className="w-full text-[10px] font-mono">
                        <tbody>
                          {(fr.formula ?? []).map((f, i) => (
                            <tr key={i} className="border-b border-[var(--t-border)]">
                              <td className="text-[var(--t-text-dim)] pr-3 whitespace-nowrap align-top">{f.paso}</td>
                              <td className="text-[var(--t-text)]">{f.valor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {fr.levels && (
                        <div className="grid grid-cols-7 gap-1 text-[10px] font-mono text-center">
                          {([["S3", fr.levels.s3], ["S2", fr.levels.s2], ["S1", fr.levels.s1], ["PP", fr.levels.pp], ["R1", fr.levels.r1], ["R2", fr.levels.r2], ["R3", fr.levels.r3]] as [string, number][]).map(([lbl, val]) => (
                            <div key={lbl} className="border border-[var(--t-border)] py-1">
                              <div className="text-[8px] text-[var(--t-text-muted)]">{lbl}</div>
                              <div className={lbl === "PP" ? "text-[var(--t-accent)] font-bold" : "text-[var(--t-text)]"}>{val.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CheckPanel>

    </div>
  );
}

// ── Tab: Assets ───────────────────────────────────────────────────────────────