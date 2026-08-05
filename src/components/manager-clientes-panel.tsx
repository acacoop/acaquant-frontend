"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { readSheetRows } from "@/lib/xlsx-read";
import { type RowState } from "./manager-assets-panel";
import { CheckPanel, Pill, RunBtn, StatusBadge } from "./manager-shared";

// ── Tab: Clientes ─────────────────────────────────────────────────────────────
// Edición de Clientes.Comitentes (master del Tablero Comercial). Espejo de
// TabAssets: campos de Aunesa read-only, edición in-place de los 13 campos
// manuales de segmentación. PATCH a /api/manager/clientes.
const CLIENTE_CAMPOS = [
  "nivel_1", "nivel_2", "nivel_3", "nivel_4", "nivel_5",
  "primer_contacto_comercial", "riesgo_la_ft", "division",
  "adc", "dma", "observaciones", "sucursal", "referido",
] as const;
type ClienteCampo = (typeof CLIENTE_CAMPOS)[number];
const CLIENTE_CAMPO_LABEL: Record<ClienteCampo, string> = {
  nivel_1: "NIVEL 1", nivel_2: "NIVEL 2", nivel_3: "NIVEL 3",
  nivel_4: "NIVEL 4", nivel_5: "NIVEL 5",
  primer_contacto_comercial: "1ER CONTACTO", riesgo_la_ft: "RIESGO LA/FT",
  division: "DIVISIÓN", adc: "ADC", dma: "DMA",
  observaciones: "OBSERVACIONES", sucursal: "SUCURSAL", referido: "REFERIDO",
};

type Cliente = {
  id_cuenta: string;
  denominacion?: string | null;
  operador_nombre?: string | null;
  operador_email?: string | null;
  actualizado_por?: string | null;
  actualizado_at?: string | null;
} & Partial<Record<ClienteCampo, string | null>>;

type ClienteDraft = Record<ClienteCampo, string>;

function emptyClienteDraft(): ClienteDraft {
  return Object.fromEntries(CLIENTE_CAMPOS.map((c) => [c, ""])) as ClienteDraft;
}
function draftFromCliente(c: Cliente): ClienteDraft {
  const d = emptyClienteDraft();
  for (const k of CLIENTE_CAMPOS) d[k] = (c[k] ?? "") as string;
  return d;
}

function TabClientesSegmentacion() {
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [drafts, setDrafts] = useState<Record<string, ClienteDraft>>({});
  const [vals, setVals] = useState<Record<string, string[]>>({});
  const [operadores, setOperadores] = useState<{ email: string; nombre: string }[]>([]);
  // Jerarquía de segmentación (combos nivel_1..5) + cuál input de nivel está
  // enfocado → para sugerir en cascada (nivel_N filtra por los niveles padre).
  const [niveles, setNiveles] = useState<Record<string, string>[]>([]);
  const [nivelFocus, setNivelFocus] = useState<{ row: string; level: ClienteCampo } | null>(null);
  // Filtros
  const [fOperador, setFOperador] = useState("");
  const [fNivel1, setFNivel1] = useState("");
  const [fNivel2, setFNivel2] = useState("");
  const [fNivel3, setFNivel3] = useState("");
  const [fNivel4, setFNivel4] = useState("");
  const [fNivel5, setFNivel5] = useState("");
  const [campoVacio, setCampoVacio] = useState<ClienteCampo | "">("");
  const [q, setQ] = useState("");
  // Import de archivo (csv/xlsx)
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchClientes = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (fOperador) qs.set("operador", fOperador);
    if (fNivel1) qs.set("nivel_1", fNivel1);
    if (fNivel2) qs.set("nivel_2", fNivel2);
    if (fNivel3) qs.set("nivel_3", fNivel3);
    if (fNivel4) qs.set("nivel_4", fNivel4);
    if (fNivel5) qs.set("nivel_5", fNivel5);
    if (campoVacio) qs.set("campo_vacio", campoVacio);
    if (q.trim()) qs.set("q", q.trim());
    fetch(`/api/manager/clientes?${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: { clientes: Cliente[] }) => {
        // Cuentas ordenadas por id_cuenta ascendente (numérico) — no desparramadas.
        const ordenadas = [...(d.clientes || [])].sort(
          (a, b) => (Number(a.id_cuenta) || 0) - (Number(b.id_cuenta) || 0),
        );
        setRows(ordenadas);
        const initial: Record<string, ClienteDraft> = {};
        for (const c of ordenadas) initial[c.id_cuenta] = draftFromCliente(c);
        setDrafts(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/manager/clientes/values")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { values: Record<string, string[]>; operadores: { email: string; nombre: string }[]; niveles?: Record<string, string>[] }) => {
        setVals(d.values || {});
        setOperadores(d.operadores || []);
        setNiveles(d.niveles || []);
      })
      .catch(() => { /* silencioso */ });
  }, []);

  // Opciones del nivel ENFOCADO, filtradas por los niveles PADRE de esa fila:
  // nivel_N sugiere solo lo que co-ocurre con nivel_1..N-1 ya elegidos (padre
  // vacío = no filtra). Así no se cruzan valores de distintos nivel_1.
  const NIVELES_ORD: ClienteCampo[] = ["nivel_1", "nivel_2", "nivel_3", "nivel_4", "nivel_5"];
  const nivelDynOpts = useMemo(() => {
    if (!nivelFocus) return [];
    const idx = NIVELES_ORD.indexOf(nivelFocus.level);
    const draft = drafts[nivelFocus.row];
    if (idx < 0 || !draft) return [];
    const padres = NIVELES_ORD.slice(0, idx);
    const out = new Set<string>();
    for (const combo of niveles) {
      if (padres.every((p) => !draft[p] || combo[p] === draft[p]) && combo[nivelFocus.level]) {
        out.add(combo[nivelFocus.level]);
      }
    }
    return [...out].sort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelFocus, drafts, niveles]);

  // Opciones del FILTRO de nivel 2: solo las que conviven con el nivel 1
  // elegido (mismo criterio de cascada que los combos de la tabla, sobre los
  // mismos datos ya cargados — sin pedirle nada más al backend). Una lista
  // plana mostraría valores de otros nivel_1 que siempre dan cero resultados.
  const opcionesNivel2 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && combo["nivel_2"]) {
        out.add(combo["nivel_2"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1]);

  // Opciones del FILTRO de nivel 3: las que conviven con el nivel_1 / nivel_2
  // ya elegidos (mismo criterio de cascada).
  const opcionesNivel3 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && (!fNivel2 || combo["nivel_2"] === fNivel2) && combo["nivel_3"]) {
        out.add(combo["nivel_3"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1, fNivel2]);

  // Opciones del FILTRO de nivel 4: conviven con nivel_1..3 elegidos.
  const opcionesNivel4 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && (!fNivel2 || combo["nivel_2"] === fNivel2) && (!fNivel3 || combo["nivel_3"] === fNivel3) && combo["nivel_4"]) {
        out.add(combo["nivel_4"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1, fNivel2, fNivel3]);

  // Opciones del FILTRO de nivel 5: conviven con nivel_1..4 elegidos.
  const opcionesNivel5 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && (!fNivel2 || combo["nivel_2"] === fNivel2) && (!fNivel3 || combo["nivel_3"] === fNivel3) && (!fNivel4 || combo["nivel_4"] === fNivel4) && combo["nivel_5"]) {
        out.add(combo["nivel_5"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1, fNivel2, fNivel3, fNivel4]);

  // Re-fetch al cambiar filtros de select. La búsqueda libre va por Enter/botón.
  useEffect(() => { fetchClientes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fOperador, fNivel1, fNivel2, fNivel3, fNivel4, fNivel5, campoVacio]);

  const setDraftField = (id: string, field: ClienteCampo, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyClienteDraft()), [field]: value } }));
  };

  const saveRow = async (c: Cliente) => {
    const draft = drafts[c.id_cuenta];
    if (!draft) return;
    const payload: Record<string, string> = { id_cuenta: c.id_cuenta };
    for (const k of CLIENTE_CAMPOS) {
      if (draft[k] !== ((c[k] ?? "") as string)) payload[k] = draft[k];
    }
    if (Object.keys(payload).length === 1) return;
    setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/clientes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: Cliente = await r.json();
      setRows((prev) => prev.map((x) => (x.id_cuenta === c.id_cuenta ? updated : x)));
      setDrafts((prev) => ({ ...prev, [c.id_cuenta]: draftFromCliente(updated) }));
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Cambio inline del operador (desplegable). Setea mail + nombre juntos (el
  // nombre se busca en la lista de operadores) → quedan coherentes. Para un
  // operador nuevo que no esté en la lista, se usa la carga por Excel.
  const saveOperador = async (c: Cliente, email: string) => {
    if (email === (c.operador_email ?? "")) return;
    const nombre = operadores.find((o) => o.email === email)?.nombre ?? "";
    setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/clientes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta: c.id_cuenta, operador_email: email, operador_nombre: nombre }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: Cliente = await r.json();
      setRows((prev) => prev.map((x) => (x.id_cuenta === c.id_cuenta ? updated : x)));
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Import desde archivo .csv / .xlsx. Columnas válidas = id_cuenta + campos
  // manuales (mismo nombre que la base). Cualquier otra columna → error.
  const onImportFile = async (file: File) => {
    setImportMsg(null);
    try {
      const json = await readSheetRows(file);
      if (!json.length) { setImportMsg({ ok: false, text: "El archivo está vacío." }); return; }

      const norm = (h: string) => h.trim().toLowerCase().replace(/[-\s]+/g, "_").replace(/\//g, "_");
      // El bulk también puede corregir el operador (mail + nombre). No está en
      // CLIENTE_CAMPOS (en el editor fila-por-fila sigue read-only).
      const OPERADOR_COLS = ["operador_email", "operador_nombre"];
      // Alias: nombres de columna habituales del Excel → campo real de la base.
      const ALIAS: Record<string, string> = {
        operador: "operador_nombre",
        nombre_operador: "operador_nombre",
        comercial: "operador_nombre",
        operador_mail: "operador_email",
        mail_operador: "operador_email",
        email_operador: "operador_email",
      };
      const valid = new Set<string>(["id_cuenta", ...CLIENTE_CAMPOS, ...OPERADOR_COLS]);
      const map: Record<string, string> = {};
      const unknown: string[] = [];
      for (const h of Object.keys(json[0])) {
        const n = ALIAS[norm(h)] ?? norm(h);
        if (valid.has(n)) map[h] = n;
        else unknown.push(h);
      }
      if (unknown.length) {
        setImportMsg({ ok: false, text: `Columnas no reconocidas: ${unknown.join(", ")}. Deben ser id_cuenta + alguno de: ${[...CLIENTE_CAMPOS, ...OPERADOR_COLS].join(", ")}` });
        return;
      }
      const dataCols = Object.values(map).filter((c) => c !== "id_cuenta");
      if (!Object.values(map).includes("id_cuenta")) { setImportMsg({ ok: false, text: "Falta la columna id_cuenta." }); return; }
      if (!dataCols.length) { setImportMsg({ ok: false, text: "Necesitás al menos una columna de datos además de id_cuenta." }); return; }

      const rowsOut: Record<string, string>[] = [];
      for (const r of json) {
        const out: Record<string, string> = {};
        for (const [h, c] of Object.entries(map)) {
          const v = String(r[h] ?? "").trim();
          if (c === "id_cuenta") out.id_cuenta = v;
          else if (v !== "") out[c] = v;
        }
        if (out.id_cuenta) rowsOut.push(out);
      }
      if (!rowsOut.length) { setImportMsg({ ok: false, text: "No hay filas con id_cuenta." }); return; }

      if (!window.confirm(`Importar ${rowsOut.length} filas · columnas: ${dataCols.join(", ")}.\n¿Aplicar?`)) return;

      setImporting(true);
      const res = await fetch("/api/manager/clientes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsOut }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setImportMsg({ ok: false, text: j.detail || `HTTP ${res.status}` }); return; }
      setImportMsg({
        ok: true,
        text: `✓ ${j.actualizadas} actualizadas` + (j.n_no_encontradas ? ` · ${j.n_no_encontradas} id_cuenta no encontradas en el master` : ""),
      });
      fetchClientes();
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "error parseando el archivo" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Datalists para autocomplete de cada campo manual */}
      {CLIENTE_CAMPOS.map((cmp) => (
        <datalist key={cmp} id={`cli-${cmp}`}>
          {(vals[cmp] || []).map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}
      {/* Datalist dinámico de niveles: opciones en cascada del input enfocado. */}
      <datalist id="cli-nivel-dyn">
        {nivelDynOpts.map((v) => <option key={v} value={v} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">CLIENTES</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{rows.length} resultados</span>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">OPERADOR</span>
        <select value={fOperador} onChange={(e) => setFOperador(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          <option value="__vacio__">(sin operador)</option>
          {operadores.map((o) => <option key={o.email} value={o.email}>{o.nombre}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 1</span>
        <select value={fNivel1}
          onChange={(e) => {
            setFNivel1(e.target.value);
            // el nivel 2..5 elegido puede no existir dentro del nuevo nivel 1 →
            // sin esto quedaría un filtro invisible que devuelve cero
            setFNivel2("");
            setFNivel3("");
            setFNivel4("");
            setFNivel5("");
          }}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {(vals["nivel_1"] || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 2</span>
        <select value={fNivel2}
          onChange={(e) => {
            setFNivel2(e.target.value);
            // idem: los niveles inferiores pueden no convivir con el nuevo nivel 2
            setFNivel3("");
            setFNivel4("");
            setFNivel5("");
          }}
          title={fNivel1 ? `Subsegmentos dentro de ${fNivel1}` : "Subsegmento (nivel 2)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel2.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 3</span>
        <select value={fNivel3}
          onChange={(e) => {
            setFNivel3(e.target.value);
            setFNivel4("");
            setFNivel5("");
          }}
          title={fNivel2 ? `Subsegmentos dentro de ${fNivel2}` : "Subsegmento (nivel 3)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel3.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 4</span>
        <select value={fNivel4}
          onChange={(e) => {
            setFNivel4(e.target.value);
            setFNivel5("");
          }}
          title={fNivel3 ? `Subsegmentos dentro de ${fNivel3}` : "Subsegmento (nivel 4)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel4.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 5</span>
        <select value={fNivel5} onChange={(e) => setFNivel5(e.target.value)}
          title={fNivel4 ? `Subsegmentos dentro de ${fNivel4}` : "Subsegmento (nivel 5)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel5.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CAMPO VACÍO</span>
        <select value={campoVacio} onChange={(e) => setCampoVacio(e.target.value as ClienteCampo | "")}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          title="Mostrar solo los clientes con este campo sin completar">
          <option value="">— sin filtro —</option>
          {CLIENTE_CAMPOS.map((c) => <option key={c} value={c}>{CLIENTE_CAMPO_LABEL[c]}</option>)}
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchClientes(); }}
          placeholder="buscar id o nombre…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[170px]"
        />

        <label
          className={`ml-auto px-3 py-1 text-[10px] font-semibold border cursor-pointer transition-colors ${importing ? "opacity-40 pointer-events-none border-[var(--t-border-2)] text-[var(--t-text-muted)]" : "border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"}`}
          title="Subí un .csv/.xlsx con columna id_cuenta + las columnas a rellenar (nombres = campos: nivel_1, riesgo_la_ft, …). Solo rellena lo que traiga el archivo."
        >
          {importing ? "Importando…" : "📁 Importar archivo"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
          />
        </label>

        <button onClick={fetchClientes} disabled={loading}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {importMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${importMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados para el filtro actual.</div>}
        {rows.length > 0 && (
          <table className="text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">CUENTA</th>
                <th className="px-2 py-2">DENOMINACIÓN</th>
                <th className="px-2 py-2">OPERADOR</th>
                {CLIENTE_CAMPOS.map((c) => <th key={c} className="px-2 py-2 whitespace-nowrap">{CLIENTE_CAMPO_LABEL[c]}</th>)}
                <th className="px-3 py-2">EDITADO</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const draft = drafts[c.id_cuenta] || emptyClienteDraft();
                const state: RowState = rowState[c.id_cuenta] || { kind: "idle" };
                const dirty = CLIENTE_CAMPOS.some((k) => draft[k] !== ((c[k] ?? "") as string));
                return (
                  <tr key={c.id_cuenta} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-accent)] whitespace-nowrap">{c.id_cuenta}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[220px] truncate" title={c.denominacion ?? ""}>{c.denominacion ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.operador_email ?? ""}
                        onChange={(e) => saveOperador(c, e.target.value)}
                        title={c.operador_email ?? "sin operador"}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none min-w-[120px] max-w-[170px]"
                      >
                        {!c.operador_email && <option value="" disabled>— elegí —</option>}
                        {c.operador_email && !operadores.some((o) => o.email === c.operador_email) && (
                          <option value={c.operador_email}>{c.operador_nombre ?? c.operador_email}</option>
                        )}
                        {operadores.map((o) => (
                          <option key={o.email} value={o.email}>{o.nombre || o.email}</option>
                        ))}
                      </select>
                    </td>
                    {CLIENTE_CAMPOS.map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        <input
                          type="text"
                          // observaciones = texto libre (sin datalist). nivel_N =
                          // datalist dinámico en cascada (filtra por niveles padre).
                          // resto = datalist plano del campo.
                          list={k === "observaciones" ? undefined : k.startsWith("nivel_") ? "cli-nivel-dyn" : `cli-${k}`}
                          onFocus={k.startsWith("nivel_") ? () => setNivelFocus({ row: c.id_cuenta, level: k }) : undefined}
                          value={draft[k]}
                          onChange={(e) => setDraftField(c.id_cuenta, k, e.target.value)}
                          onBlur={() => saveRow(c)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          placeholder="—"
                          className={`bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none ${k === "observaciones" ? "min-w-[180px]" : "min-w-[90px]"} w-full`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-[var(--t-text-muted)] text-[10px] whitespace-nowrap">
                      {c.actualizado_at ? (
                        <>
                          {new Date(c.actualizado_at).toLocaleString("es-AR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {c.actualizado_por && <div className="text-[var(--t-text-muted)]">{c.actualizado_por}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved" && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error" && <span className="text-red-400 cursor-help" title={state.msg}>✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}</span>}
                      {state.kind === "idle" && dirty && <span className="text-[var(--t-text-muted)]">sin guardar</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Sub-tab: Fondeos ──────────────────────────────────────────────────────────
// Carga masiva del cupo de fondeo del custodio (ARS). Pega a
// POST /api/manager/clientes/bulk-fondeo. Subdoc `cupo` en
// Clientes.Comitentes (ver docs/SEGMENTACION_PATRIMONIAL.md en TradingAV).
type Cupo = {
  transaccional_ars?: number | null;
  usado_ars?: number | null;
  utilizacion_pct?: number | null;
  cargado_en?: string | null;
  fuente?: string | null;
};
type ClienteFondeo = {
  id_cuenta: string;
  denominacion?: string | null;
  tipo_cliente?: string | null;
  nivel_3?: string | null;
  operador_nombre?: string | null;
  cupo?: Cupo | null;
};

function fmtARS(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function TabClientesFondeos() {
  const [rows, setRows] = useState<ClienteFondeo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [soloCargados, setSoloCargados] = useState(true);
  const [nivelSel, setNivelSel] = useState<string | null>(null);
  const [nivel3Opts, setNivel3Opts] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [recalc, setRecalc] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchClientes = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    fetch(`/api/manager/clientes?${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: { clientes: ClienteFondeo[] }) => setRows(d.clientes || []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClientes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Valores existentes de nivel_3 (para el select — NO se pueden crear nuevos).
  useEffect(() => {
    fetch("/api/manager/clientes/values")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { values?: Record<string, string[]> } | null) => setNivel3Opts(d?.values?.nivel_3 ?? []))
      .catch(() => { /* silencioso */ });
  }, []);

  // Segmentar inline: setea nivel_3 (solo valores existentes) vía PATCH.
  const saveNivel3 = async (id_cuenta: string, nivel_3: string) => {
    setSavingId(id_cuenta);
    try {
      const res = await fetch("/api/manager/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta, nivel_3 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((prev) => prev.map((c) => (c.id_cuenta === id_cuenta ? { ...c, nivel_3: nivel_3 || null } : c)));
    } catch {
      setImportMsg({ ok: false, text: `No se pudo guardar el nivel 3 de ${id_cuenta}.` });
    } finally {
      setSavingId(null);
    }
  };

  // Recalcular nivel_3 patrimonial de TODAS las activas (motor de segmentación).
  // Preview → confirmación → aplica. NO destructivo (no borra niveles existentes).
  const recalcularNiveles = async () => {
    setRecalc(true);
    setImportMsg(null);
    try {
      const post = (apply: boolean) =>
        fetch("/api/manager/clientes/recalcular-niveles", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply }),
        }).then((r) => r.json());
      const prev = await post(false);
      if (!prev || prev.evaluadas == null) throw new Error("preview falló");
      if (!prev.cambios) {
        setImportMsg({ ok: true, text: "Niveles al día — no hay nada que recalcular." });
        return;
      }
      const warn = prev.sin_uva ? "\n⚠ Sin UVA cargada → las PJ no se calculan." : "";
      const ok = window.confirm(
        "Recalcular niveles patrimoniales\n(FCI/contraparte → PJ GRANDE; PH por cupo/MEP; PJ por cupo/UVA).\n\n" +
        `${prev.cambios} cuentas cambiarían de nivel (de ${prev.evaluadas} activas).\n` +
        `No borra los niveles existentes — solo asigna lo que puede derivar.${warn}\n\n¿Aplicar?`,
      );
      if (!ok) return;
      const res = await post(true);
      setImportMsg({ ok: true, text: `✓ Recalculado: ${res.modificadas} niveles actualizados de ${res.evaluadas} cuentas.` });
      fetchClientes();
    } catch {
      setImportMsg({ ok: false, text: "Error al recalcular niveles." });
    } finally {
      setRecalc(false);
    }
  };

  // Resumen de segmentación (nivel_3) sobre TODAS las cuentas — para ver de un
  // vistazo cuántas hay por nivel y cuántas sin segmentar. Click en un chip
  // filtra la tabla por ese nivel.
  const nivel3De = (c: ClienteFondeo) => c.nivel_3 || "(sin segmentar)";
  const tieneCupo = (c: ClienteFondeo) =>
    !!(c.cupo && (c.cupo.transaccional_ars != null || c.cupo.usado_ars != null));
  const resumenNivel = (() => {
    const m = new Map<string, number>();
    for (const c of rows) m.set(nivel3De(c), (m.get(nivel3De(c)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) =>
      // "(sin segmentar)" siempre al final; el resto por count desc.
      (a[0] === "(sin segmentar)" ? 1 : 0) - (b[0] === "(sin segmentar)" ? 1 : 0) || b[1] - a[1]);
  })();
  const nSinSegmentar = rows.filter((c) => !c.nivel_3).length;
  const nConCupo = rows.filter(tieneCupo).length;

  const visibles = rows.filter((c) => {
    if (nivelSel && nivel3De(c) !== nivelSel) return false;
    if (soloCargados) return tieneCupo(c);
    return true;
  });

  // Import .csv / .xlsx. Headers válidos: id_cuenta, cupo_transaccional,
  // cupo_usado. Solo se mandan filas con al menos un valor cargado.
  const onImportFile = async (file: File) => {
    setImportMsg(null);
    try {
      const json = await readSheetRows(file);
      if (!json.length) { setImportMsg({ ok: false, text: "El archivo está vacío." }); return; }

      const norm = (h: string) => h.trim().toLowerCase().replace(/[-\s]+/g, "_").replace(/\//g, "_");
      const valid = new Set<string>(["id_cuenta", "cupo_transaccional", "cupo_usado"]);
      const map: Record<string, string> = {};
      const unknown: string[] = [];
      // xlsx asigna `__EMPTY`, `__EMPTY_1`, ... a columnas sin header. Las
      // ignoramos en silencio — ruido común en Excels reales (columnas en
      // blanco al lado de las útiles, títulos mergeados, etc.).
      const isPhantom = (h: string) => /^__EMPTY(?:_\d+)?$/i.test(h) || h.trim() === "";
      for (const h of Object.keys(json[0])) {
        if (isPhantom(h)) continue;
        const n = norm(h);
        if (valid.has(n)) map[h] = n;
        else unknown.push(h);
      }
      if (unknown.length) {
        setImportMsg({ ok: false, text: `Columnas no reconocidas: ${unknown.join(", ")}. Deben ser: id_cuenta, cupo_transaccional, cupo_usado.` });
        return;
      }
      if (!Object.values(map).includes("id_cuenta")) {
        setImportMsg({ ok: false, text: "Falta la columna id_cuenta." });
        return;
      }
      if (!Object.values(map).some((c) => c !== "id_cuenta")) {
        setImportMsg({ ok: false, text: "Necesitás al menos una columna de cupo (cupo_transaccional y/o cupo_usado)." });
        return;
      }

      const rowsOut: Record<string, string>[] = [];
      for (const r of json) {
        const out: Record<string, string> = {};
        for (const [h, c] of Object.entries(map)) {
          const v = String(r[h] ?? "").trim();
          if (c === "id_cuenta") out.id_cuenta = v;
          else if (v !== "") out[c] = v;
        }
        if (out.id_cuenta && (out.cupo_transaccional || out.cupo_usado)) rowsOut.push(out);
      }
      if (!rowsOut.length) { setImportMsg({ ok: false, text: "No hay filas con id_cuenta + algún límite." }); return; }

      if (!window.confirm(`Importar ${rowsOut.length} filas de fondeo.\nFuente: ${file.name}\n¿Aplicar?`)) return;

      setImporting(true);
      const res = await fetch("/api/manager/clientes/bulk-fondeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsOut, fuente: `archivo:${file.name}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setImportMsg({ ok: false, text: j.detail || `HTTP ${res.status}` }); return; }
      const extras: string[] = [];
      if (j.sin_numeros) extras.push(`${j.sin_numeros} filas con valores no numéricos`);
      if (j.n_no_encontradas) extras.push(`${j.n_no_encontradas} id_cuenta no encontradas`);
      setImportMsg({
        ok: true,
        text: `✓ ${j.actualizadas} actualizadas` + (extras.length ? ` · ${extras.join(" · ")}` : ""),
      });
      fetchClientes();
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "error parseando el archivo" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">FONDEOS</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{visibles.length} / {rows.length}</span>

        <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-dim)]">
          <input type="checkbox" checked={soloCargados} onChange={(e) => setSoloCargados(e.target.checked)} className="accent-[var(--t-accent)]" />
          solo con fondeo cargado
        </label>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchClientes(); }}
          placeholder="buscar id o nombre…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[170px]"
        />

        <label
          className={`ml-auto px-3 py-1 text-[10px] font-semibold border cursor-pointer transition-colors ${importing ? "opacity-40 pointer-events-none border-[var(--t-border-2)] text-[var(--t-text-muted)]" : "border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"}`}
          title="CSV/XLSX con columnas: id_cuenta, cupo_transaccional, cupo_usado (ARS). Solo toca las cuentas que vienen en el archivo."
        >
          {importing ? "Importando…" : "📁 Importar archivo"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
          />
        </label>

        <button onClick={fetchClientes} disabled={loading}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {importMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${importMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      {/* Resumen de segmentación (nivel_3) — chips clickeables que filtran la tabla.
          "(sin segmentar)" resaltado en ámbar para verlo de un vistazo. */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">Nivel 3:</span>
        <button onClick={() => setNivelSel(null)}
          className={"px-2 py-0.5 text-[10px] border tabular-nums " + (nivelSel === null ? "border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)]")}>
          TODAS <span className="font-semibold">{rows.length}</span>
        </button>
        {resumenNivel.map(([n, c]) => {
          const sinSeg = n === "(sin segmentar)";
          const active = nivelSel === n;
          return (
            <button key={n} onClick={() => setNivelSel(active ? null : n)}
              className={"px-2 py-0.5 text-[10px] border tabular-nums " + (active
                ? "border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10"
                : sinSeg
                  ? "border-amber-500/50 text-amber-400 hover:border-amber-500"
                  : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)]")}>
              {n} <span className="font-semibold">{c}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          sin segmentar <span className="font-semibold text-amber-400">{nSinSegmentar}</span>
          {" · "}con cupo <span className="font-semibold text-[var(--t-text)]">{nConCupo}</span>
        </span>
        <button onClick={recalcularNiveles} disabled={recalc || loading}
          className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)]/60 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 transition-colors disabled:opacity-40"
          title="Recalcula el nivel_3 patrimonial de todas las cuentas activas (FCI/contraparte → PJ GRANDE; PH/PJ por cupo). No borra los niveles existentes; previsualiza antes de aplicar.">
          {recalc ? "Recalculando…" : "⟳ Recalcular niveles"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && visibles.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">{soloCargados ? "Ninguna cuenta tiene cupo de fondeo cargado." : "Sin resultados."}</div>}
        {visibles.length > 0 && (
          <table className="text-[11px] font-mono w-full">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">CUENTA</th>
                <th className="px-2 py-2">DENOMINACIÓN</th>
                <th className="px-2 py-2">TIPO</th>
                <th className="px-2 py-2">NIVEL 3</th>
                <th className="px-2 py-2 text-right">CUPO TRANS. (ARS)</th>
                <th className="px-2 py-2 text-right">CUPO USADO (ARS)</th>
                <th className="px-2 py-2 text-right">% UTIL.</th>
                <th className="px-3 py-2">CARGADO</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const lf = c.cupo || {};
                const cargado = lf.cargado_en ? new Date(lf.cargado_en).toLocaleDateString("es-AR") : "—";
                return (
                  <tr key={c.id_cuenta} className="border-b border-[var(--t-border)]/50 hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-text)]">{c.id_cuenta}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)]">{c.denominacion || "—"}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text-dim)]">{c.tipo_cliente || "—"}</td>
                    <td className="px-2 py-1.5">
                      <select value={c.nivel_3 ?? ""} disabled={savingId === c.id_cuenta}
                        onChange={(e) => saveNivel3(c.id_cuenta, e.target.value)}
                        className={"bg-[var(--t-panel)] border px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-[var(--t-accent)] [color-scheme:dark] disabled:opacity-40 " + (c.nivel_3 ? "border-[var(--t-border-2)] text-[var(--t-text)]" : "border-amber-500/50 text-amber-400")}>
                        <option value="">— sin segmentar —</option>
                        {nivel3Opts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmtARS(lf.transaccional_ars)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmtARS(lf.usado_ars)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{lf.utilizacion_pct != null ? `${lf.utilizacion_pct.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--t-text-muted)]">{cargado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Wrapper TabClientes: switch entre sub-tabs Segmentación / Fondeos ────────
// canBulk = true → muestra ambas sub-tabs. false → solo SEGMENTACIÓN (carga
// masiva de fondeos requiere el módulo manager_clientes_bulk, admin-only).
// ── Clientes → Control Automático (concilia Excel de CUITs ↔ cuentas) ──────────

interface ReconcFila {
  cuit: string; id_cuenta: string; denominacion: string | null;
  operador: string | null; nivel_1: string | null; ya_productor: boolean;
}
interface ReconcData {
  tenemos: ReconcFila[]; no_tenemos: { cuit: string }[];
  n_excel: number; n_tenemos: number; n_no_tenemos: number;
}

function TabControlAutomatico() {
  const [data, setData] = useState<ReconcData | null>(null);
  const [loading, setLoading] = useState(false);
  const [segmentando, setSegmentando] = useState(false);
  const [fileName, setFileName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onFile = async (file: File) => {
    setMsg(null); setData(null); setFileName(file.name);
    try {
      const json = await readSheetRows(file);
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      const cols = Object.keys(json[0]);
      // El CUIT está en 'Nº ident.fis.1' (normalizado → contiene 'identfis1').
      const cuitCol = cols.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "").includes("identfis1"));
      if (!cuitCol) {
        setMsg({ ok: false, text: `No encontré la columna 'Nº ident.fis.1'. Columnas: ${cols.join(", ")}` });
        return;
      }
      const cuits = json.map((r) => String(r[cuitCol] ?? "").trim()).filter(Boolean);
      if (!cuits.length) { setMsg({ ok: false, text: `La columna '${cuitCol}' está vacía.` }); return; }
      setLoading(true);
      const r = await fetch("/api/manager/control-automatico/reconciliar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuits }),
      });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const segmentar = async () => {
    if (!data) return;
    const ids = data.tenemos.filter((t) => !t.ya_productor).map((t) => t.id_cuenta);
    if (!ids.length) { setMsg({ ok: true, text: "Todas las que tenemos ya son PRODUCTORES." }); return; }
    setSegmentando(true); setMsg(null);
    try {
      const r = await fetch("/api/manager/control-automatico/segmentar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuentas: ids }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json();
      setMsg({ ok: true, text: `✅ ${res.modificadas} cuenta(s) marcadas nivel_1 = PRODUCTORES.` });
      setData((d) => d ? { ...d, tenemos: d.tenemos.map((t) => ({ ...t, nivel_1: "PRODUCTORES", ya_productor: true })) } : d);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSegmentando(false);
    }
  };

  const pendientes = data ? data.tenemos.filter((t) => !t.ya_productor).length : 0;

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <label className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] cursor-pointer transition-colors">
          {loading ? "Conciliando…" : "📄 Subir Excel"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
        {fileName && <span className="text-[10px] text-[var(--t-text-dim)] font-mono">{fileName}</span>}
        {data && (
          <span className="text-[10px] text-[var(--t-text-muted)]">
            {data.n_excel} en el Excel · <span className="text-[var(--t-pos)] font-semibold">{data.n_tenemos} tenemos</span> · {data.n_no_tenemos} no
          </span>
        )}
        {data && data.n_tenemos > 0 && (
          <button onClick={segmentar} disabled={segmentando || pendientes === 0}
            className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40 transition-colors">
            {segmentando ? "Segmentando…" : `Segmentar a PRODUCTORES (${pendientes})`}
          </button>
        )}
      </div>
      {msg && <div className={`text-[10px] shrink-0 ${msg.ok ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>{msg.text}</div>}
      {!data && !loading && (
        <div className="text-[10px] text-[var(--t-text-muted)] p-2">
          Subí el Excel de clientes (el CUIT se lee de la columna <span className="font-mono">Nº ident.fis.1</span>).
          Te muestro cuáles tenemos (con su id de cuenta) y cuáles no; el botón marca las que tenemos como
          productores de nivel 1.
        </div>
      )}

      {data && (
        <div className="flex-1 min-h-0 flex gap-3">
          {/* TENEMOS */}
          <div className="w-2/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-pos)]/10 text-[10px] font-semibold text-[var(--t-pos)] tracking-widest shrink-0">
              LAS QUE TENEMOS ({data.n_tenemos})
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider sticky top-0 bg-[var(--t-panel)]">
                  <tr>
                    <th className="text-left px-2 py-1">CUIT</th>
                    <th className="text-left px-2 py-1">ID CUENTA</th>
                    <th className="text-left px-2 py-1">DENOMINACIÓN</th>
                    <th className="text-left px-2 py-1">OPERADOR</th>
                    <th className="text-left px-2 py-1">NIVEL 1</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenemos.map((t) => (
                    <tr key={t.id_cuenta} className="border-b border-[var(--t-border)]/40">
                      <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)]">{t.cuit}</td>
                      <td className="px-2 py-0.5 font-mono text-[var(--t-accent)]">{t.id_cuenta}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]">{t.denominacion ?? "—"}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text-muted)]">{t.operador ?? "—"}</td>
                      <td className="px-2 py-0.5 font-mono">
                        {t.ya_productor
                          ? <span className="text-[var(--t-pos)]">PRODUCTORES</span>
                          : <span className="text-[var(--t-text-muted)]">{t.nivel_1 ?? "—"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* NO TENEMOS */}
          <div className="w-1/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-text-muted)]/10 text-[10px] font-semibold text-[var(--t-text-muted)] tracking-widest shrink-0">
              NO LAS TENEMOS ({data.n_no_tenemos})
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {data.no_tenemos.map((n, i) => (
                <div key={i} className="px-2 py-0.5 font-mono text-[10px] text-[var(--t-text-dim)]">{n.cuit}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clientes → Sin Operador (cuentas que caen en "(sin operador)" del ranking) ──

interface SinOpFila {
  id_cuenta: string; vol: number; cuenta?: string;
  denominacion?: string; estado?: string; categoria?: string;
}
interface SinOpData {
  clientes_sin_operador: SinOpFila[];
  no_clientes: SinOpFila[];
  resumen_no_clientes: { categoria: string; n: number; vol: number }[];
  n_clientes_sin_op: number; n_no_clientes: number; sin_clasificar: number;
}

function TabSinOperador() {
  const [data, setData] = useState<SinOpData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>("SIN CLASIFICAR");

  const cargar = useCallback(() => {
    setLoading(true); setErr(null);
    fetch("/api/manager/clientes/sin-operador", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: SinOpData) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">SIN OPERADOR</span>
        {data && (
          <span className="text-[10px] text-[var(--t-text-muted)]">
            <span className="text-[var(--t-neg)] font-semibold">{data.n_clientes_sin_op}</span> clientes reales sin operador
            {" · "}{data.n_no_clientes} no-clientes
            {data.sin_clasificar > 0 && <span className="text-[#ff9900]">{" · ⚠ "}{data.sin_clasificar} sin clasificar</span>}
          </span>
        )}
        <button onClick={cargar} disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40 transition-colors">
          {loading ? "Calculando…" : "↻ Recalcular"}
        </button>
      </div>
      {err && <div className="text-[10px] text-[var(--t-neg)] shrink-0">Error: {err}</div>}
      {!data && !loading && <div className="text-[10px] text-[var(--t-text-muted)] p-2">Cargando…</div>}

      {data && (
        <div className="flex-1 min-h-0 flex gap-3">
          {/* A: clientes reales sin operador → accionable */}
          <div className="w-1/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-neg)]/10 text-[10px] font-semibold text-[var(--t-neg)] tracking-widest shrink-0">
              CLIENTES REALES SIN OPERADOR ({data.n_clientes_sin_op})
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider sticky top-0 bg-[var(--t-panel)]">
                  <tr>
                    <th className="text-left px-2 py-1">ID</th>
                    <th className="text-left px-2 py-1">DENOMINACIÓN</th>
                    <th className="text-right px-2 py-1">VOL (ARS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientes_sin_operador.map((f) => (
                    <tr key={f.id_cuenta} className="border-b border-[var(--t-border)]/40">
                      <td className="px-2 py-0.5 font-mono text-[var(--t-accent)]">{f.id_cuenta}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]">{f.denominacion ?? "—"}</td>
                      <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)] text-right">{fmt(f.vol)}</td>
                    </tr>
                  ))}
                  {data.clientes_sin_operador.length === 0 && (
                    <tr><td colSpan={3} className="px-2 py-2 text-[10px] text-[var(--t-pos)]">✓ Ningún cliente real quedó sin operador.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* B: no-clientes — DETALLE con filtro por categoría (SIN CLASIFICAR = revisar) */}
          <div className="w-2/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-2 py-1 border-b border-[var(--t-border)] bg-[var(--t-text-muted)]/10 flex items-center gap-1 flex-wrap shrink-0">
              <span className="text-[10px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-1">NO-CLIENTES</span>
              <button onClick={() => setCatFilter("")}
                className={`px-1.5 py-0.5 text-[9px] border font-mono ${catFilter === "" ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]"}`}>
                todas ({data.n_no_clientes})
              </button>
              {data.resumen_no_clientes.map((r) => {
                const sc = r.categoria === "SIN CLASIFICAR";
                const on = catFilter === r.categoria;
                return (
                  <button key={r.categoria} onClick={() => setCatFilter(r.categoria)}
                    className={`px-1.5 py-0.5 text-[9px] border font-mono ${on ? "border-[var(--t-accent)] text-[var(--t-accent)]" : sc ? "border-[#ff9900] text-[#ff9900]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]"}`}>
                    {sc ? "⚠ " : ""}{r.categoria} ({r.n})
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider sticky top-0 bg-[var(--t-panel)]">
                  <tr>
                    <th className="text-left px-2 py-1">ID CUENTA</th>
                    <th className="text-left px-2 py-1">CUENTA (cruda)</th>
                    <th className="text-left px-2 py-1">CATEGORÍA</th>
                    <th className="text-right px-2 py-1">VOLUMEN (ARS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.no_clientes
                    .filter((f) => !catFilter || f.categoria === catFilter)
                    .map((f) => {
                      const sc = f.categoria === "SIN CLASIFICAR";
                      return (
                        <tr key={f.id_cuenta} className="border-b border-[var(--t-border)]/40">
                          <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)]">{f.id_cuenta}</td>
                          <td className="px-2 py-0.5 text-[var(--t-text)]">{f.cuenta ?? "—"}</td>
                          <td className={`px-2 py-0.5 font-mono ${sc ? "text-[#ff9900]" : "text-[var(--t-text-muted)]"}`}>{f.categoria}</td>
                          <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)] text-right">{fmt(f.vol)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TabClientes({ canBulk = true }: { canBulk?: boolean }) {
  const [subTab, setSubTab] = usePersistedState<"segmentacion" | "control" | "sinoperador" | "fondeos">("manager.cli.subtab", "segmentacion");
  const subs = canBulk
    ? ([
        { id: "segmentacion", label: "SEGMENTACIÓN" },
        { id: "control",      label: "CONTROL AUTO" },
        { id: "sinoperador",  label: "SIN OPERADOR" },
        { id: "fondeos",      label: "FONDEOS" },
      ] as const)
    : ([
        { id: "segmentacion", label: "SEGMENTACIÓN" },
        { id: "control",      label: "CONTROL AUTO" },
        { id: "sinoperador",  label: "SIN OPERADOR" },
      ] as const);
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        {subs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1 text-[10px] font-semibold tracking-widest transition-colors ${subTab === t.id ? "text-[var(--t-accent)] border-b border-[var(--t-accent)]" : "text-[var(--t-text-muted)] hover:text-[var(--t-text-dim)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {subTab === "segmentacion" && <TabClientesSegmentacion />}
        {subTab === "control" && <TabControlAutomatico />}
        {subTab === "sinoperador" && <TabSinOperador />}
        {subTab === "fondeos" && canBulk && <TabClientesFondeos />}
      </div>
    </div>
  );
}
