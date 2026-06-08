"use client";

// MANAGER → CONTRAPARTES (módulo manager_contrapartes). Split 2 paneles:
//  - IZQUIERDA (segmentar): lista CashFlow.Contrapartes; editás `contraparte` + `segmento`
//    (cuenta + denominacion vienen de Aunesa, read-only). Guardado por fila (PATCH).
//  - DERECHA (conciliador): "Solicitar cuentas" pega Aunesa live y lista cuentas que no
//    están en Contrapartes y cuya denominacion matchea un nombre de contraparte → alta 1 click.
// Consume /api/manager/contrapartes/*. Ver docs (plan wise-weaving-yao).

import { useCallback, useEffect, useRef, useState } from "react";

type Contraparte = {
  cuenta: string;
  denominacion: string | null;
  contraparte: string | null;
  segmento: string | null;
};
type Candidate = {
  cuenta: string;
  denominacion: string;
  contraparte_sugerida: string | null;
  segmento_sugerido: string | null;
  keyword: string;
  tipo_cliente: string | null;
};
type Opts = { segmentos: string[]; contrapartes: string[] };
type Draft = { contraparte: string; segmento: string };
type RowKind = "idle" | "saving" | "saved" | "error";

const INPUT =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none";

async function jpost(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function detail(r: Response): Promise<string> {
  const txt = await r.text().catch(() => "");
  try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") return j.detail; } catch { /* plano */ }
  return txt.slice(0, 200) || r.statusText;
}

export function TabContrapartes() {
  // ── IZQUIERDA: segmentación ────────────────────────────────────────────
  const [rows, setRows] = useState<Contraparte[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowState, setRowState] = useState<Record<string, { kind: RowKind; msg?: string }>>({});
  const [opts, setOpts] = useState<Opts>({ segmentos: [], contrapartes: [] });
  const [fSegmento, setFSegmento] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Secuencia de request: descarta respuestas viejas (si escribís rápido, la que
  // llega tarde NO pisa a la última) → la lista SIEMPRE corresponde a lo tipeado.
  const reqSeq = useRef(0);

  const fetchRows = useCallback(() => {
    const seq = ++reqSeq.current;
    setLoading(true); setError(null);
    const p = new URLSearchParams();
    if (fSegmento) p.set("segmento", fSegmento);
    if (q.trim()) p.set("q", q.trim());
    fetch(`/api/manager/contrapartes?${p}`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${await detail(r)}`); return r.json(); })
      .then((d: { contrapartes: Contraparte[] }) => {
        if (seq !== reqSeq.current) return;  // respuesta vieja → ignorar
        setRows(d.contrapartes || []);
        const init: Record<string, Draft> = {};
        for (const c of d.contrapartes || []) init[c.cuenta] = { contraparte: c.contraparte || "", segmento: c.segmento || "" };
        setDrafts(init);
      })
      .catch((e) => { if (seq === reqSeq.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (seq === reqSeq.current) setLoading(false); });
  }, [fSegmento, q]);

  useEffect(() => {
    fetch("/api/manager/contrapartes/segmentos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: Opts) => setOpts({ segmentos: d.segmentos || [], contrapartes: d.contrapartes || [] }))
      .catch(() => { /* sin sugerencias el input igual funciona */ });
  }, []);
  // Debounce: no dispara una búsqueda por cada tecla (250ms tras dejar de tipear).
  useEffect(() => {
    const t = setTimeout(fetchRows, 250);
    return () => clearTimeout(t);
  }, [fetchRows]);

  const setField = (cuenta: string, k: keyof Draft, v: string) =>
    setDrafts((prev) => ({ ...prev, [cuenta]: { ...(prev[cuenta] || { contraparte: "", segmento: "" }), [k]: v } }));

  const saveRow = async (c: Contraparte) => {
    const d = drafts[c.cuenta];
    if (!d) return;
    if (d.contraparte === (c.contraparte || "") && d.segmento === (c.segmento || "")) return;
    setRowState((s) => ({ ...s, [c.cuenta]: { kind: "saving" } }));
    try {
      const r = await fetch("/api/manager/contrapartes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta: c.cuenta, contraparte: d.contraparte, segmento: d.segmento }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} · ${await detail(r)}`);
      const up: Contraparte = await r.json();
      setRows((prev) => prev.map((x) => (x.cuenta === c.cuenta ? { ...x, contraparte: up.contraparte, segmento: up.segmento } : x)));
      setRowState((s) => ({ ...s, [c.cuenta]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.cuenta]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [c.cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // ── DERECHA: conciliador ───────────────────────────────────────────────
  const [cands, setCands] = useState<Candidate[]>([]);
  const [cDraft, setCDraft] = useState<Record<string, Draft>>({});
  const [cState, setCState] = useState<Record<string, { kind: "idle" | "adding" | "error"; msg?: string }>>({});
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recDone, setRecDone] = useState(false);

  const solicitar = () => {
    setRecLoading(true); setRecError(null); setRecDone(false);
    fetch("/api/manager/contrapartes/reconcile", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status} — ${await detail(r)}`); return r.json(); })
      .then((d: { candidatos: Candidate[] }) => {
        setCands(d.candidatos || []);
        const init: Record<string, Draft> = {};
        for (const c of d.candidatos || []) init[c.cuenta] = { contraparte: c.contraparte_sugerida || "", segmento: c.segmento_sugerido || "" };
        setCDraft(init);
        setRecDone(true);
      })
      .catch((e) => setRecError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRecLoading(false));
  };

  const setCField = (cuenta: string, k: keyof Draft, v: string) =>
    setCDraft((prev) => ({ ...prev, [cuenta]: { ...(prev[cuenta] || { contraparte: "", segmento: "" }), [k]: v } }));

  const agregar = async (c: Candidate) => {
    const d = cDraft[c.cuenta] || { contraparte: "", segmento: "" };
    setCState((s) => ({ ...s, [c.cuenta]: { kind: "adding" } }));
    try {
      const r = await jpost("/api/manager/contrapartes", {
        cuenta: c.cuenta, denominacion: c.denominacion, contraparte: d.contraparte, segmento: d.segmento,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} · ${await detail(r)}`);
      setCands((prev) => prev.filter((x) => x.cuenta !== c.cuenta));  // sacar de candidatos
      fetchRows();  // refrescar la izquierda
    } catch (e) {
      setCState((s) => ({ ...s, [c.cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  return (
    <div className="h-full flex min-h-0">
      {/* Datalists compartidos */}
      <datalist id="cp-segmentos">{opts.segmentos.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="cp-contrapartes">{opts.contrapartes.map((s) => <option key={s} value={s} />)}</datalist>

      {/* ── IZQUIERDA: segmentar ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 border-r border-[var(--t-border)]">
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">CONTRAPARTES</span>
          <span className="text-[10px] text-[var(--t-text-muted)]">{rows.length} cuentas</span>
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">SEGMENTO</span>
          <select value={fSegmento} onChange={(e) => setFSegmento(e.target.value)} className={INPUT}>
            <option value="">— todos —</option>
            {opts.segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar denominación / cuenta…" className={INPUT + " w-[200px]"} />
          <button onClick={fetchRows} className="text-[10px] uppercase tracking-wider border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">↻</button>
        </div>
        {error && <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)]">{error}</div>}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Contraparte</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Segmento</th>
                <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const d = drafts[c.cuenta] || { contraparte: "", segmento: "" };
                const st = rowState[c.cuenta]?.kind ?? "idle";
                const dirty = d.contraparte !== (c.contraparte || "") || d.segmento !== (c.segmento || "");
                return (
                  <tr key={c.cuenta} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1 text-[var(--t-text-muted)] whitespace-nowrap">{c.cuenta}</td>
                    <td className="px-3 py-1 text-[var(--t-text)] truncate max-w-[280px]" title={c.denominacion ?? ""}>{c.denominacion ?? "—"}</td>
                    <td className="px-3 py-1">
                      <input list="cp-contrapartes" value={d.contraparte} onChange={(e) => setField(c.cuenta, "contraparte", e.target.value)} className={INPUT + " w-[150px]"} />
                    </td>
                    <td className="px-3 py-1">
                      <input list="cp-segmentos" value={d.segmento} onChange={(e) => setField(c.cuenta, "segmento", e.target.value)} className={INPUT + " w-[120px]"} />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      {st === "error"
                        ? <span className="text-[var(--t-neg)] text-[9px]" title={rowState[c.cuenta]?.msg}>error</span>
                        : st === "saved"
                          ? <span className="text-[var(--t-pos)] text-[9px]">✓</span>
                          : <button disabled={!dirty || st === "saving"} onClick={() => saveRow(c)} className="text-[9px] uppercase tracking-wider border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">
                              {st === "saving" ? "…" : "guardar"}
                            </button>}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--t-text-muted)]">Sin contrapartes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DERECHA: conciliador ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">CONCILIADOR</span>
          <button onClick={solicitar} disabled={recLoading} className="text-[10px] uppercase tracking-wider border border-[var(--t-accent)] px-2.5 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
            {recLoading ? "Consultando Aunesa…" : "Solicitar cuentas"}
          </button>
          {recDone && <span className="text-[10px] text-[var(--t-text-muted)]">{cands.length} candidatos</span>}
        </div>
        {/* Banner de advertencia: efectos de agregar una contraparte */}
        <div className="px-3 py-1.5 text-[9px] leading-tight text-[#ffb86b] bg-[#ff990010] border-b border-[var(--t-border)]">
          ⚠ Agregar una contraparte EXCLUYE esa cuenta del AuM y fija su nivel_3 en “PJ GRANDE”. Confirmá antes de dar de alta.
        </div>
        {recError && <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)]">{recError}</div>}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Contraparte</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Segmento</th>
                <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]"></th>
              </tr>
            </thead>
            <tbody>
              {cands.map((c) => {
                const d = cDraft[c.cuenta] || { contraparte: "", segmento: "" };
                const st = cState[c.cuenta]?.kind ?? "idle";
                return (
                  <tr key={c.cuenta} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1 text-[var(--t-text-muted)] whitespace-nowrap">{c.cuenta}</td>
                    <td className="px-3 py-1 text-[var(--t-text)] truncate max-w-[240px]" title={`${c.denominacion} · ${c.tipo_cliente ?? "sin tipo"}`}>
                      {c.denominacion}
                      <span className="ml-1 text-[8px] text-[var(--t-text-muted)]">({c.keyword}{c.tipo_cliente ? ` · ${c.tipo_cliente}` : ""})</span>
                    </td>
                    <td className="px-3 py-1">
                      <input list="cp-contrapartes" value={d.contraparte} onChange={(e) => setCField(c.cuenta, "contraparte", e.target.value)} className={INPUT + " w-[130px]"} />
                    </td>
                    <td className="px-3 py-1">
                      <input list="cp-segmentos" value={d.segmento} onChange={(e) => setCField(c.cuenta, "segmento", e.target.value)} className={INPUT + " w-[110px]"} />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      {st === "error"
                        ? <span className="text-[var(--t-neg)] text-[9px]" title={cState[c.cuenta]?.msg}>error</span>
                        : <button disabled={st === "adding"} onClick={() => agregar(c)} className="text-[9px] uppercase tracking-wider border border-[var(--t-accent)] px-2 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
                            {st === "adding" ? "…" : "agregar"}
                          </button>}
                    </td>
                  </tr>
                );
              })}
              {recDone && !cands.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--t-text-muted)]">Sin cuentas nuevas para conciliar.</td></tr>}
              {!recDone && <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--t-text-muted)]">Tocá “Solicitar cuentas” para buscar en Aunesa.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
