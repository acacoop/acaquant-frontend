"use client";

// MANAGER → CONTRAPARTES (módulo manager_contrapartes). 2 sub-tabs a ancho completo
// (antes era un split 50/50 que dejaba las tablas apretadas para completar datos):
//  - LISTADO (principal): lista CashFlow.Contrapartes; editás `contraparte` + `segmento`
//    (cuenta + denominacion vienen de Aunesa, read-only). Guardado por fila (PATCH).
//  - CONCILIADOR: "Solicitar cuentas" pega Aunesa live y lista cuentas que no
//    están en Contrapartes y cuya denominacion matchea un nombre de contraparte → alta 1 click.
// Consume /api/manager/contrapartes/*. Ver docs (plan wise-weaving-yao).

import { useCallback, useEffect, useRef, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { readSheetRows } from "@/lib/xlsx-read";

import { GROUP_HEADER, GROUP_TITLE, Pill } from "./manager-shared";

type Contraparte = {
  cuenta: string;
  denominacion: string | null;
  contraparte: string | null;
  segmento: string | null;
  // Nº DESTINO del MAE — SOLO el número: la letra la agrega el sistema al
  // armar el Excel MAE de SENEBIS (interno → F), resolviendo por la cc.
  codigo_mae: string | null;
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
type Draft = { contraparte: string; segmento: string; codigo_mae?: string };
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

// Cabeceras del Excel → campo. Sin acentos, minúsculas, sin separadores:
// "Nº MAE", "n_mae", "codigo mae" → codigo_mae.
const COL_ALIAS: Record<string, keyof ImportRow> = {
  cuenta: "cuenta", cta: "cuenta", idcuenta: "cuenta", comitente: "cuenta", nrocuenta: "cuenta",
  denominacion: "denominacion", nombre: "denominacion", razonsocial: "denominacion",
  contraparte: "contraparte",
  segmento: "segmento",
  nmae: "codigo_mae", nomae: "codigo_mae", numeromae: "codigo_mae", mae: "codigo_mae",
  codigomae: "codigo_mae", codmae: "codigo_mae", destinomae: "codigo_mae",
};
const DATA_COLS = ["contraparte", "segmento", "codigo_mae"] as const;
type ImportRow = { cuenta?: string; denominacion?: string; contraparte?: string; segmento?: string; codigo_mae?: string };

const normHeader = (h: string) =>
  h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function TabContrapartes() {
  const [sub, setSub] = usePersistedState<"listado" | "conciliador">("manager.cp.sub", "listado");

  // ── LISTADO: segmentación ──────────────────────────────────────────────
  const [rows, setRows] = useState<Contraparte[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowState, setRowState] = useState<Record<string, { kind: RowKind; msg?: string }>>({});
  const [opts, setOpts] = useState<Opts>({ segmentos: [], contrapartes: [] });
  const [fSegmento, setFSegmento] = useState("");
  const [fVacio, setFVacio] = useState<"" | "contraparte" | "segmento" | "codigo_mae">("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);  // último error de guardado (visible)
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
        setReciensGuardadas(new Set());
        const init: Record<string, Draft> = {};
        for (const c of d.contrapartes || []) init[c.cuenta] = { contraparte: c.contraparte || "", segmento: c.segmento || "", codigo_mae: c.codigo_mae || "" };
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

  // Filtro "vacíos": las que completás en esta pasada NO desaparecen al guardar
  // (se limpia al refrescar), así podés revisar o corregir lo recién cargado.
  const [reciensGuardadas, setReciensGuardadas] = useState<Set<string>>(new Set());
  const visibleRows = fVacio
    ? rows.filter((c) => !c[fVacio] || reciensGuardadas.has(c.cuenta))
    : rows;

  const saveRow = async (c: Contraparte) => {
    const d = drafts[c.cuenta];
    if (!d) return;
    if (d.contraparte === (c.contraparte || "") && d.segmento === (c.segmento || "")
      && (d.codigo_mae ?? "") === (c.codigo_mae || "")) return;
    setRowState((s) => ({ ...s, [c.cuenta]: { kind: "saving" } }));
    setSaveErr(null);
    try {
      const r = await fetch("/api/manager/contrapartes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta: c.cuenta, contraparte: d.contraparte, segmento: d.segmento, codigo_mae: d.codigo_mae ?? "" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} · ${await detail(r)}`);
      const up: Contraparte = await r.json();
      setRows((prev) => prev.map((x) => (x.cuenta === c.cuenta ? { ...x, contraparte: up.contraparte, segmento: up.segmento, codigo_mae: up.codigo_mae } : x)));
      setReciensGuardadas((s) => new Set(s).add(c.cuenta));
      setRowState((s) => ({ ...s, [c.cuenta]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.cuenta]: { kind: "idle" } })), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRowState((s) => ({ ...s, [c.cuenta]: { kind: "error", msg } }));
      setSaveErr(`Cuenta ${c.cuenta}: ${msg}`);  // banner visible arriba
    }
  };

  // ── LISTADO: import de Excel ───────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onImportFile = async (file: File) => {
    setImportMsg(null);
    try {
      const json = await readSheetRows(file);
      if (!json.length) { setImportMsg({ ok: false, text: "El archivo está vacío." }); return; }

      const map: Record<string, keyof ImportRow> = {};
      const unknown: string[] = [];
      for (const h of Object.keys(json[0])) {
        const campo = COL_ALIAS[normHeader(h)];
        if (campo) map[h] = campo; else unknown.push(h);
      }
      const campos = new Set(Object.values(map));
      if (!campos.has("cuenta") && !campos.has("denominacion")) {
        setImportMsg({ ok: false, text: "Falta la columna clave: el archivo tiene que traer Cuenta o Denominación." });
        return;
      }
      const dataCols = DATA_COLS.filter((c) => campos.has(c));
      if (!dataCols.length) {
        setImportMsg({ ok: false, text: "Falta la columna de datos: sumá al menos Contraparte, Segmento o Nº MAE." });
        return;
      }

      const rowsOut: ImportRow[] = [];
      for (const r of json) {
        const out: ImportRow = {};
        for (const [h, campo] of Object.entries(map)) {
          const v = String(r[h] ?? "").trim();
          if (v !== "") out[campo] = v;
        }
        if ((out.cuenta || out.denominacion) && dataCols.some((c) => out[c])) rowsOut.push(out);
      }
      if (!rowsOut.length) { setImportMsg({ ok: false, text: "Ninguna fila tiene clave (cuenta/denominación) + un dato para completar." }); return; }

      const aviso = unknown.length ? `\nColumnas ignoradas: ${unknown.join(", ")}.` : "";
      if (!window.confirm(`Completar ${dataCols.join(", ")} en ${rowsOut.length} filas.${aviso}\nSolo escribe donde haya match — no borra ni da de alta cuentas.\n¿Aplicar?`)) return;

      setImporting(true);
      const r = await jpost("/api/manager/contrapartes/import", { rows: rowsOut });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setImportMsg({ ok: false, text: j.detail || `HTTP ${r.status}` }); return; }
      setImportMsg({
        ok: true,
        text: `✓ ${j.actualizadas} filas completadas`
          + (j.n_no_encontradas ? ` · ${j.n_no_encontradas} sin match (${(j.no_encontradas || []).slice(0, 5).join(", ")}…)` : "")
          + (j.n_ambiguas ? ` · ${j.n_ambiguas} denominaciones ambiguas (2+ cuentas)` : ""),
      });
      fetchRows();
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "error parseando el archivo" });
    } finally {
      setImporting(false);
    }
  };

  // ── CONCILIADOR ────────────────────────────────────────────────────────
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
      fetchRows();  // refrescar el listado
    } catch (e) {
      setCState((s) => ({ ...s, [c.cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Datalists compartidos */}
      <datalist id="cp-segmentos">{opts.segmentos.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="cp-contrapartes">{opts.contrapartes.map((s) => <option key={s} value={s} />)}</datalist>

      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>CONTRAPARTES</span>
        <Pill label="LISTADO" active={sub === "listado"} onClick={() => setSub("listado")} />
        <Pill label={`CONCILIADOR${recDone && cands.length ? ` !${cands.length}` : ""}`} active={sub === "conciliador"} onClick={() => setSub("conciliador")} />
      </div>

      {/* ── LISTADO: segmentar ───────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 flex-col min-h-0 ${sub === "listado" ? "flex" : "hidden"}`}>
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
          <span className="text-[10px] text-[var(--t-text-muted)]">
            {visibleRows.length} cuentas{fVacio && visibleRows.length !== rows.length ? ` de ${rows.length}` : ""}
          </span>
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">SEGMENTO</span>
          <select value={fSegmento} onChange={(e) => setFSegmento(e.target.value)} className={INPUT}>
            <option value="">— todos —</option>
            {opts.segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]" title="Muestra solo las cuentas con esa columna vacía">VACÍOS EN</span>
          <select value={fVacio} onChange={(e) => setFVacio(e.target.value as typeof fVacio)}
            className={INPUT + (fVacio ? " border-[var(--t-accent)] text-[var(--t-accent)]" : "")}>
            <option value="">— sin filtro —</option>
            <option value="contraparte">Contraparte</option>
            <option value="segmento">Segmento</option>
            <option value="codigo_mae">Nº MAE</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar denominación / cuenta…" className={INPUT + " w-[200px]"} />
          <button onClick={fetchRows} className="text-[10px] uppercase tracking-wider border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">↻</button>
          <label className="text-[10px] uppercase tracking-wider border border-[var(--t-accent)] px-2.5 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 cursor-pointer"
            title="Excel/CSV con Cuenta (o Denominación) + al menos una de Contraparte / Segmento / Nº MAE. Solo completa donde hay match: no borra ni da de alta.">
            {importing ? "Importando…" : "Subir Excel"}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                if (fileRef.current) fileRef.current.value = "";  // permite re-subir el mismo archivo
              }} />
          </label>
        </div>
        {importMsg && (
          <div className={"px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] flex items-start gap-2 "
            + (importMsg.ok ? "text-[var(--t-pos)]" : "text-[var(--t-neg)] bg-[#ff333315]")}>
            <span className="flex-1 break-words">{importMsg.text}</span>
            <button onClick={() => setImportMsg(null)} className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">✕</button>
          </div>
        )}
        {error && <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)]">{error}</div>}
        {saveErr && (
          <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)] bg-[#ff333315] border-b border-[var(--t-border)] flex items-start gap-2">
            <span className="flex-1 break-words">⚠ {saveErr}</span>
            <button onClick={() => setSaveErr(null)} className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">✕</button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Contraparte</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Segmento</th>
                <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]" title="Nº DESTINO del Excel MAE — cargá SOLO el número (ej. 062): la letra la pone el sistema según la orden (interno → F de fondo)">Nº MAE</th>
                <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((c) => {
                const d = drafts[c.cuenta] || { contraparte: "", segmento: "" };
                const st = rowState[c.cuenta]?.kind ?? "idle";
                const dirty = d.contraparte !== (c.contraparte || "") || d.segmento !== (c.segmento || "")
                  || (d.codigo_mae ?? "") !== (c.codigo_mae || "");
                return (
                  <tr key={c.cuenta} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1 text-[var(--t-text-muted)] whitespace-nowrap">{c.cuenta}</td>
                    <td className="px-3 py-1 text-[var(--t-text)] truncate max-w-[420px]" title={c.denominacion ?? ""}>{c.denominacion ?? "—"}</td>
                    <td className="px-3 py-1">
                      <input list="cp-contrapartes" value={d.contraparte} onChange={(e) => setField(c.cuenta, "contraparte", e.target.value)} className={INPUT + " w-[260px]"} />
                    </td>
                    <td className="px-3 py-1">
                      <input list="cp-segmentos" value={d.segmento} onChange={(e) => setField(c.cuenta, "segmento", e.target.value)} className={INPUT + " w-[200px]"} />
                    </td>
                    <td className="px-3 py-1">
                      <input value={d.codigo_mae ?? ""} placeholder="062"
                        onChange={(e) => setField(c.cuenta, "codigo_mae", e.target.value.toUpperCase())}
                        className={INPUT + " w-[90px] uppercase"} />
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
              {!visibleRows.length && !loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--t-text-muted)]">
                  {fVacio ? "No quedan cuentas con esa columna vacía." : "Sin contrapartes."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CONCILIADOR ──────────────────────────────────────────────── */}
      <div className={`flex-1 min-w-0 flex-col min-h-0 ${sub === "conciliador" ? "flex" : "hidden"}`}>
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
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
                    <td className="px-3 py-1 text-[var(--t-text)] truncate max-w-[420px]" title={`${c.denominacion} · ${c.tipo_cliente ?? "sin tipo"}`}>
                      {c.denominacion}
                      <span className="ml-1 text-[8px] text-[var(--t-text-muted)]">({c.keyword}{c.tipo_cliente ? ` · ${c.tipo_cliente}` : ""})</span>
                    </td>
                    <td className="px-3 py-1">
                      <input list="cp-contrapartes" value={d.contraparte} onChange={(e) => setCField(c.cuenta, "contraparte", e.target.value)} className={INPUT + " w-[260px]"} />
                    </td>
                    <td className="px-3 py-1">
                      <input list="cp-segmentos" value={d.segmento} onChange={(e) => setCField(c.cuenta, "segmento", e.target.value)} className={INPUT + " w-[200px]"} />
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
