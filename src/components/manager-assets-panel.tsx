"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// TabAssets — edición de Valuaciones.Assets (fuente de verdad UPPERCASE).
// Lista TODO el catálogo de assets y permite editar los 7 campos
// in-place. Filtro `CAMPO VACÍO` para ver solo los que tienen un campo
// puntual sin completar. PATCH a /api/manager/assets escribe UPPERCASE.
// ─────────────────────────────────────────────────────────────────────────
type AssetGap = {
  unidad: string;
  CARTERA?: string | null;
  EMISOR?: string | null;
  INSTRUMENTO?: string | null;
  CLASE_ACTIVO?: string | null;
  CALIFICACION?: string | null;
  TICKER?: string | null;
  VENCIMIENTO?: string | null;
  // Código CNV del instrumento (string; puede tener ceros a la izquierda).
  CODIGO_CNV?: string | null;
  // Fee de administración del FCI: FRACCIÓN decimal (0.01 = 1%). Solo FCI.
  FEE_ADMIN?: number | null;
  actualizado_por?: string | null;
  actualizado_at?: string | null;
};

export type RowState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; msg: string };

// Campos UPPERCASE editables — define el orden de columnas de la tabla.
const ASSET_CAMPOS = [
  "CARTERA", "EMISOR", "CLASE_ACTIVO", "CALIFICACION",
  "TICKER", "VENCIMIENTO", "INSTRUMENTO", "CODIGO_CNV",
] as const;
type AssetCampo = (typeof ASSET_CAMPOS)[number];
type AssetDraft = Record<AssetCampo, string>;

// Campos de dropdown CERRADO: solo se eligen valores existentes, no se
// pueden tipear nuevos. El resto son inputs editables con datalist.
const ASSET_CAMPOS_CERRADOS: readonly AssetCampo[] = ["CARTERA", "CLASE_ACTIVO"];

function emptyDraft(): AssetDraft {
  return {
    CARTERA: "", EMISOR: "", CLASE_ACTIVO: "", CALIFICACION: "",
    TICKER: "", VENCIMIENTO: "", INSTRUMENTO: "", CODIGO_CNV: "",
  };
}
function emptyOpts(): Record<AssetCampo, string[]> {
  return {
    CARTERA: [], EMISOR: [], CLASE_ACTIVO: [], CALIFICACION: [],
    TICKER: [], VENCIMIENTO: [], INSTRUMENTO: [], CODIGO_CNV: [],
  };
}
function draftFromAsset(a: AssetGap): AssetDraft {
  const d = emptyDraft();
  for (const c of ASSET_CAMPOS) d[c] = (a[c] ?? "") as string;
  return d;
}

export function TabAssets() {
  const [assets, setAssets] = useState<AssetGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({});
  // FEE_ADMIN editado por unidad (string mientras se tipea; numérico al guardar).
  // Aparte de `drafts` porque es numérico — no contamina la maquinaria de strings.
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  // Valores únicos por campo (dropdown cerrado / datalist editable).
  const [valueOpts, setValueOpts] = useState<Record<AssetCampo, string[]>>(emptyOpts);
  // Filtros de la query backend.
  const [filtroCartera, setFiltroCartera] = useState<string>("");
  const [filtroEmisor, setFiltroEmisor] = useState<string>("");
  // "mostrar solo los que tienen este campo vacío". "" = sin filtro (todo).
  const [campoVacio, setCampoVacio] = useState<AssetCampo | "">("");
  // Buscador por unidad — filtro en el CLIENTE sobre el catálogo ya cargado (instantáneo,
  // sin pegarle al backend en cada tecla). Matchea substring case-insensitive.
  const [buscaUnidad, setBuscaUnidad] = useState("");

  const fetchAssets = () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (filtroCartera) q.set("cartera", filtroCartera);
    if (filtroEmisor) q.set("emisor", filtroEmisor);
    if (campoVacio) q.set("campo_vacio", campoVacio);
    fetch(`/api/manager/assets?${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: { assets: AssetGap[] }) => {
        setAssets(d.assets || []);
        const initial: Record<string, AssetDraft> = {};
        const feeInit: Record<string, string> = {};
        for (const a of d.assets || []) {
          initial[a.unidad] = draftFromAsset(a);
          feeInit[a.unidad] = a.FEE_ADMIN != null ? String(a.FEE_ADMIN) : "";
        }
        setDrafts(initial);
        setFeeDrafts(feeInit);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/manager/assets/values")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { values?: Partial<Record<AssetCampo, string[]>>; carteras?: string[]; emisores?: string[] }) => {
        const opts = emptyOpts();
        for (const c of ASSET_CAMPOS) opts[c] = d.values?.[c] ?? [];
        // Fallback a los alias viejos si el backend no manda `values`.
        if (!d.values) {
          opts.CARTERA = d.carteras ?? [];
          opts.EMISOR = d.emisores ?? [];
        }
        setValueOpts(opts);
      })
      .catch(() => { /* silencioso — sin sugerencias el input sigue funcionando */ });
  }, []);

  // Re-fetch cuando cambian los filtros.
  useEffect(() => { fetchAssets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filtroCartera, filtroEmisor, campoVacio]);

  const setDraftField = (unidad: string, field: AssetCampo, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [unidad]: { ...(prev[unidad] || emptyDraft()), [field]: value },
    }));
  };

  const saveRow = async (asset: AssetGap, draftOverride?: AssetDraft) => {
    const draft = draftOverride ?? drafts[asset.unidad];
    if (!draft) return;
    const payload: Record<string, string> = { unidad: asset.unidad };
    for (const c of ASSET_CAMPOS) {
      if (draft[c] !== ((asset[c] ?? "") as string)) payload[c] = draft[c];
    }
    // Si no hay nada que cambiar, no llama al backend.
    if (Object.keys(payload).length === 1) return;

    setRowState((s) => ({ ...s, [asset.unidad]: { kind: "saving" } }));
    try {
      // unidad va en el body, no en path — evita problemas de URL-encoding
      // con corchetes, espacios, slashes, etc.
      const r = await fetch(`/api/manager/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        // Tratamos de parsear como JSON {detail: "..."} (FastAPI default).
        let detail = txt;
        try {
          const j = JSON.parse(txt);
          if (j && typeof j.detail === "string") detail = j.detail;
        } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: AssetGap = await r.json();
      setAssets((prev) => prev.map((a) => (a.unidad === asset.unidad ? updated : a)));
      setDrafts((prev) => ({ ...prev, [asset.unidad]: draftFromAsset(updated) }));
      // Sumar valores nuevos al pool de sugerencias para el resto de las filas
      // (sin re-fetch — merge local instantáneo).
      setValueOpts((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const c of ASSET_CAMPOS) {
          const v = (updated[c] ?? "") as string;
          if (v && v !== "NO APLICA" && !next[c].includes(v)) {
            next[c] = [...next[c], v].sort();
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setRowState((s) => ({ ...s, [asset.unidad]: { kind: "saved" } }));
      setTimeout(() => {
        setRowState((s) => ({ ...s, [asset.unidad]: { kind: "idle" } }));
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRowState((s) => ({ ...s, [asset.unidad]: { kind: "error", msg } }));
    }
  };

  // Guarda el fee del FCI (numérico, fracción 0.01 = 1%). Independiente de
  // saveRow (que solo manda los campos string). Vacío = no tocar.
  const saveFee = async (a: AssetGap) => {
    const raw = (feeDrafts[a.unidad] ?? "").trim();
    if (raw === "") return;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setRowState((s) => ({ ...s, [a.unidad]: { kind: "error", msg: "fee inválido" } }));
      return;
    }
    if (a.FEE_ADMIN != null && num === a.FEE_ADMIN) return; // sin cambio
    setRowState((s) => ({ ...s, [a.unidad]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unidad: a.unidad, FEE_ADMIN: num }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: AssetGap = await r.json();
      setAssets((prev) => prev.map((x) => (x.unidad === a.unidad ? updated : x)));
      setFeeDrafts((prev) => ({ ...prev, [a.unidad]: updated.FEE_ADMIN != null ? String(updated.FEE_ADMIN) : "" }));
      setRowState((s) => ({ ...s, [a.unidad]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [a.unidad]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [a.unidad]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Campos abiertos (input editable): datalist con valores existentes.
  // Los campos cerrados (CARTERA, CLASE_ACTIVO) van como <select> y no usan list.
  const camposAbiertos = ASSET_CAMPOS.filter((c) => !ASSET_CAMPOS_CERRADOS.includes(c));

  // Filtro por unidad en el cliente (el catálogo entero ya está cargado por fetchAssets).
  const qUnidad = buscaUnidad.trim().toUpperCase();
  const assetsVisibles = qUnidad
    ? assets.filter((a) => (a.unidad || "").toUpperCase().includes(qUnidad))
    : assets;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Datalists para autocomplete de los campos abiertos — via list="<campo>-options" */}
      {camposAbiertos.map((c) => (
        <datalist key={c} id={`${c}-options`}>
          {(valueOpts[c] || []).map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">ASSETS</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">
          {assetsVisibles.length}{qUnidad ? ` / ${assets.length}` : ""} resultados
        </span>

        {/* Buscador por unidad (filtra el catálogo ya cargado, en vivo mientras tipeás) */}
        <input
          value={buscaUnidad}
          onChange={(e) => setBuscaUnidad(e.target.value)}
          placeholder="Buscar unidad…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none w-[180px]"
        />
        {buscaUnidad && (
          <button
            onClick={() => setBuscaUnidad("")}
            className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[12px]"
            title="Limpiar búsqueda"
          >
            ✕
          </button>
        )}

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CARTERA</span>
        <select
          value={filtroCartera}
          onChange={(e) => setFiltroCartera(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
        >
          <option value="">— todas —</option>
          {valueOpts.CARTERA.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">EMISOR</span>
        <select
          value={filtroEmisor}
          onChange={(e) => setFiltroEmisor(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
        >
          <option value="">— todos —</option>
          {valueOpts.EMISOR.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CAMPO VACÍO</span>
        <select
          value={campoVacio}
          onChange={(e) => setCampoVacio(e.target.value as AssetCampo | "")}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          title="Mostrar solo los assets con este campo sin completar"
        >
          <option value="">— sin filtro —</option>
          {ASSET_CAMPOS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button
          onClick={fetchAssets}
          disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
        >
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && assets.length === 0 && (
          <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>
        )}
        {!error && !loading && assets.length === 0 && (
          <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados para el filtro actual.</div>
        )}
        {assets.length > 0 && (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2 min-w-[280px]">UNIDAD</th>
                {ASSET_CAMPOS.map((c) => <th key={c} className="px-2 py-2">{c}</th>)}
                <th className="px-2 py-2 w-px whitespace-nowrap">FEE ADMIN<span className="text-[var(--t-text-muted)]"> (frac.)</span></th>
                <th className="px-2 py-2 w-px whitespace-nowrap">EDITADO</th>
                <th className="px-3 py-2 w-px"></th>
              </tr>
            </thead>
            <tbody>
              {assetsVisibles.length === 0 && (
                <tr><td colSpan={20} className="px-3 py-3 text-[11px] text-[var(--t-text-muted)]">
                  Sin assets que matcheen “{buscaUnidad}”.
                </td></tr>
              )}
              {assetsVisibles.map((a) => {
                const draft = drafts[a.unidad] || emptyDraft();
                const state: RowState = rowState[a.unidad] || { kind: "idle" };
                const dirty = ASSET_CAMPOS.some((c) => draft[c] !== ((a[c] ?? "") as string));
                return (
                  <tr key={a.unidad} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td
                      className="px-3 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[520px] min-w-[280px] truncate"
                      title={a.unidad}
                    >
                      {a.unidad}
                    </td>
                    {ASSET_CAMPOS.map((c) => {
                      const cerrado = ASSET_CAMPOS_CERRADOS.includes(c);
                      return (
                        <td key={c} className="px-2 py-1.5">
                          {cerrado ? (
                            // Dropdown cerrado: solo valores existentes, sin tipear nuevos.
                            // Guarda al instante al elegir (no depende del blur del select).
                            <select
                              value={draft[c]}
                              onChange={(e) => {
                                const nd = { ...(drafts[a.unidad] || emptyDraft()), [c]: e.target.value };
                                setDraftField(a.unidad, c, e.target.value);
                                saveRow(a, nd);
                              }}
                              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-full min-w-[90px]"
                            >
                              <option value="">—</option>
                              {/* Incluye el valor actual aunque no esté en la lista (placeholder viejo). */}
                              {(draft[c] && !valueOpts[c].includes(draft[c])
                                ? [draft[c], ...valueOpts[c]]
                                : valueOpts[c]
                              ).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            // Campo abierto: input editable + datalist (flechita de sugerencias).
                            <input
                              type="text"
                              list={`${c}-options`}
                              value={draft[c]}
                              onChange={(e) => setDraftField(a.unidad, c, e.target.value)}
                              onBlur={() => saveRow(a)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              placeholder="—"
                              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-full min-w-[90px]"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 w-px whitespace-nowrap">
                      {(a.CARTERA || "").toUpperCase().includes("FCI") ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" step="0.0001" min="0" max="1"
                            value={feeDrafts[a.unidad] ?? ""}
                            onChange={(e) => setFeeDrafts((p) => ({ ...p, [a.unidad]: e.target.value }))}
                            onBlur={() => saveFee(a)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            placeholder="—"
                            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[78px]"
                          />
                          <span className="text-[9px] text-[var(--t-text-muted)] tabular-nums w-[52px]">
                            {feeDrafts[a.unidad] && Number.isFinite(Number(feeDrafts[a.unidad]))
                              ? `= ${(Number(feeDrafts[a.unidad]) * 100).toFixed(2)}%` : ""}
                          </span>
                        </div>
                      ) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--t-text-muted)] text-[10px] w-px whitespace-nowrap">
                      {a.actualizado_at ? (
                        <>
                          {new Date(a.actualizado_at).toLocaleString("es-AR", {
                            year: "2-digit", month: "2-digit", day: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {a.actualizado_por && <div className="text-[var(--t-text-muted)]">{a.actualizado_por}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] w-px whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved"  && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error"  && (
                        <span
                          className="text-red-400 cursor-help"
                          title={state.msg}
                        >
                          ✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}
                        </span>
                      )}
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
