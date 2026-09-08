"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { TabAssets, type RowState } from "./manager-assets-panel";
import { GROUP_HEADER, GROUP_TITLE, Pill } from "./manager-shared";

// Vista dedicada del catálogo de instrumentos pyRofex agrupado por CFI code.
// Reemplaza al panel discovery que vivía dentro de Validaciones — acá hay más
// espacio + búsqueda para identificar productos antes de extender el motor.

interface CfiInstrument {
  ticker: string; maturity: string; underlying: string;
  currency?: string; tickSize?: number;
  contractMultiplier?: number;
  putOrCall?: string; strikePrice?: number;
  minTradeVol?: number; maxTradeVol?: number;
  lowLimitPrice?: number; highLimitPrice?: number;
}

function TabInstrumentos() {
  const [discLoading, setDiscLoading] = useState(false);
  const [discData, setDiscData] = useState<{
    ok: boolean;
    message?: string;
    total_instruments: number;
    by_cficode: {
      cficode: string;
      count: number;
      underlyings: string[];
      samples: { ticker: string; maturity: string; underlying: string }[];
    }[];
    generated_at: string | null;
    stale_h: number | null;
  } | null>(null);

  // CFI seleccionado + drill-down de sus instruments.
  const [selectedCfi, setSelectedCfi] = useState<string>("");
  const [selectedUnderlying, setSelectedUnderlying] = useState<string>("__ALL__");
  const [instruments, setInstruments] = useState<CfiInstrument[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [search, setSearch] = useState("");

  const runDisc = () => {
    setDiscLoading(true);
    fetch("/api/manager/checks/discovery-pyrofex")
      .then(r => r.json()).then(setDiscData).finally(() => setDiscLoading(false));
  };

  // Auto-cargar summary al montar.
  useEffect(() => { runDisc(); }, []);

  // Cuando llega el summary y no hay CFI seleccionado, default = primero
  // (el que tiene más count, vienen ordenados desc).
  useEffect(() => {
    if (discData?.ok && discData.by_cficode.length > 0 && !selectedCfi) {
      setSelectedCfi(discData.by_cficode[0].cficode);
    }
  }, [discData, selectedCfi]);

  // Fetch instruments cuando cambia el CFI seleccionado.
  useEffect(() => {
    if (!selectedCfi) {
      setInstruments([]);
      return;
    }
    setInstLoading(true);
    setSearch("");
    setSelectedUnderlying("__ALL__");
    fetch(`/api/manager/checks/instruments-by-cfi?cficode=${encodeURIComponent(selectedCfi)}`)
      .then((r) => r.json())
      .then((d: { instruments?: CfiInstrument[] }) => setInstruments(d.instruments ?? []))
      .finally(() => setInstLoading(false));
  }, [selectedCfi]);

  // Underlyings ordenados desde los instruments cargados (para tener
  // counts por underlying en el dropdown). discData.by_cficode trae solo
  // el set de nombres sin counts.
  const underlyingsConCount = (() => {
    const counts: Record<string, number> = {};
    for (const inst of instruments) {
      counts[inst.underlying] = (counts[inst.underlying] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  const filteredInst = (() => {
    let list = instruments;
    if (selectedUnderlying !== "__ALL__") {
      list = list.filter((inst) => inst.underlying === selectedUnderlying);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (inst) =>
          inst.ticker.toLowerCase().includes(q) ||
          inst.maturity.includes(q),
      );
    }
    return list;
  })();

  return (
    <div className="space-y-3">
      {/* Header con selector + refresh */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runDisc}
            disabled={discLoading}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {discLoading ? "Cargando…" : "↻ Recargar"}
          </button>

          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CFI</span>
          <select
            value={selectedCfi}
            onChange={(e) => setSelectedCfi(e.target.value)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-accent)] font-mono min-w-[180px] focus:border-[var(--t-accent)] focus:outline-none"
            disabled={!discData?.ok}
          >
            {!discData?.ok && <option value="">— sin data —</option>}
            {discData?.ok && discData.by_cficode.map((g) => (
              <option key={g.cficode} value={g.cficode}>
                {g.cficode}  ({g.count})
              </option>
            ))}
          </select>

          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">UNDERLYING</span>
          <select
            value={selectedUnderlying}
            onChange={(e) => setSelectedUnderlying(e.target.value)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono min-w-[300px] focus:border-[var(--t-accent)] focus:outline-none"
            disabled={instruments.length === 0}
          >
            <option value="__ALL__">
              — todos ({instruments.length}) —
            </option>
            {underlyingsConCount.map(([u, n]) => (
              <option key={u} value={u}>
                {u} ({n})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ticker o maturity"
            className="flex-1 min-w-[200px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
            disabled={!instruments.length}
          />

          {discData?.ok && (
            <div className="text-[10px] text-[var(--t-text-dim)]">
              <span className="font-mono text-[var(--t-text)]">{discData.total_instruments}</span> total
              {" · "}
              <span className="font-mono text-[var(--t-text)]">{discData.by_cficode.length}</span> CFI
            </div>
          )}
        </div>
        {discData?.generated_at && (
          <div className="text-[9px] text-[var(--t-text-muted)] mt-2">
            Actualizado {new Date(discData.generated_at).toLocaleString("es-AR")}
            {discData.stale_h !== null && ` (hace ${discData.stale_h}h)`}
          </div>
        )}
      </div>

      {/* Banner si no hay data */}
      {discData && !discData.ok && (
        <div className="border border-[#ff7f7f]/40 bg-[var(--t-tint-red)] p-3 text-[10px] text-[var(--t-neg)] italic">
          {discData.message}
        </div>
      )}

      {/* Tabla única de instruments */}
      {selectedCfi && (
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
          <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2 text-[10px]">
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">INSTRUMENTS</span>
            <span className="font-mono text-[var(--t-text)]">{filteredInst.length}</span>
            {search && filteredInst.length !== instruments.length && (
              <span className="text-[var(--t-text-muted)]">de {instruments.length}</span>
            )}
            {instLoading && <span className="text-[var(--t-text-muted)] italic ml-2">Cargando…</span>}
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[var(--t-text-muted)] text-[9px] tracking-widest sticky top-0 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
                <tr>
                  <th className="text-left px-3 py-2">TICKER</th>
                  <th className="text-left px-3 py-2">MATURITY</th>
                  <th className="text-left px-3 py-2">UNDERLYING</th>
                  <th className="text-right px-3 py-2">CCY</th>
                  <th className="text-right px-3 py-2">TICK</th>
                  <th className="text-right px-3 py-2">MULT</th>
                  <th className="text-right px-3 py-2">STRIKE</th>
                  <th className="text-right px-3 py-2">P/C</th>
                </tr>
              </thead>
              <tbody>
                {filteredInst.map((inst, i) => (
                  <tr key={`${inst.ticker}-${i}`} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1 text-[var(--t-pos)]">{inst.ticker}</td>
                    <td className="px-3 py-1 text-[var(--t-text-dim)]">{inst.maturity}</td>
                    <td className="px-3 py-1 text-[var(--t-text)]">{inst.underlying}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.currency ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.tickSize ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.contractMultiplier ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.strikePrice ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.putOrCall ?? "—"}</td>
                  </tr>
                ))}
                {!instLoading && filteredInst.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-[var(--t-text-muted)]">
                      {instruments.length === 0
                        ? "Sin instruments para este CFI. ¿Corriste scripts.discovery_pyrofex tras el último deploy?"
                        : `Sin matches para "${search}"`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// El sub-tab BONOS (CARGAR / BONOS / REVISAR) y el editor de ONs que vivía
// adentro se ELIMINARON: lo que hacían lo hace hoy EL AV AGENT (`bono_sin_flujo`,
// `bono_sin_tasa`, `on_faltante` con sus arreglos `alta_bono`/`alta_flujos`/
// `alta_on`), que escribe por las MISMAS puertas del backend
// (`api/services/bonos_admin.upsert_bono` y `api/services/ons.upsert_on`) — esas
// puertas siguen existiendo, solo se fue la pantalla que las llamaba a mano.
// El check "Títulos sin flujo" sigue en VALIDACIONES (`/api/manager/bonos/sin-flujo`).

// Input de una celda editable. Lo usan BREAKEVENS y EMISORES: nació con el
// editor de ONs y sobrevive a su borrado.
const _onInput =
  "bg-[var(--t-surface-2)] border border-[var(--t-border)] px-1.5 py-0.5 text-[11px] w-full";

// ── Sub-tab: Renta Variable (CEDEARs — rubro + es_ia) ─────────────────────────
// Editor en grilla del catálogo de clasificación de CEDEARs. Espejo de la
// segmentación de clientes: el `rubro` NO se escribe libre — se elige del
// catálogo (/rubros) o se crea con POST /rubro. PATCH inmediato por fila.
// Endpoints (SQL-native, gate manager_titulos):
//   GET   /api/manager/renta-variable          → grid de CEDEARs
//   GET   /api/manager/renta-variable/rubros    → catálogo de rubros (dropdown)
//   POST  /api/manager/renta-variable/rubro     → crear rubro
//   PATCH /api/manager/renta-variable           → setear rubro/es_ia de un CEDEAR
interface CedearRow {
  ticker: string;            // ticker BYMA completo (PK)
  ticker_corto: string;
  underlying: string | null;
  activo: boolean | null;
  rubro: string | null;
  es_ia: boolean | null;
  ric: string | null;        // identidad Refinitiv del subyacente (ej. AAPL.O)
  ratio: number | null;      // CEDEARs por acción (ej. AAPL 10:1 → 10), para el CCL implícito
  nombre: string | null;
}
interface RubroRow { rubro: string; es_ia_def: boolean }

function TabRentaVariable() {
  const [rows, setRows] = useState<CedearRow[]>([]);
  const [rubros, setRubros] = useState<RubroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [q, setQ] = useState("");
  // Alta de rubro nuevo (input inline → POST /rubro)
  const [nuevoRubro, setNuevoRubro] = useState("");
  const [nuevoRubroIa, setNuevoRubroIa] = useState(false);
  const [creandoRubro, setCreandoRubro] = useState(false);
  const [rubroMsg, setRubroMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Borradores de los inputs RIC/RATIO por fila (se guardan al salir del campo / Enter).
  const [ricDrafts, setRicDrafts] = useState<Record<string, string>>({});
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string>>({});

  const fetchCedears = () => {
    setLoading(true);
    setError(null);
    fetch("/api/manager/renta-variable", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: CedearRow[]) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const fetchRubros = () => {
    fetch("/api/manager/renta-variable/rubros", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: RubroRow[]) => setRubros(Array.isArray(d) ? d : []))
      .catch(() => { /* silencioso */ });
  };

  useEffect(() => { fetchCedears(); fetchRubros(); }, []);

  // Filtro en cliente por ticker / nombre / rubro (lista de ~70-160 filas).
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((c) =>
      (c.ticker_corto ?? "").toLowerCase().includes(t) ||
      (c.nombre ?? "").toLowerCase().includes(t) ||
      (c.underlying ?? "").toLowerCase().includes(t) ||
      (c.rubro ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  // PATCH inmediato (optimista) de un campo de la fila.
  const patchRow = async (c: CedearRow, patch: { rubro?: string | null; es_ia?: boolean; ric?: string | null; ratio?: number | null }) => {
    setRowState((s) => ({ ...s, [c.ticker]: { kind: "saving" } }));
    // Optimista: aplicar local antes de la respuesta.
    setRows((prev) => prev.map((x) => (x.ticker === c.ticker ? { ...x, ...patch } : x)));
    try {
      const r = await fetch("/api/manager/renta-variable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: c.ticker, ...patch }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.ticker]: { kind: "idle" } })), 1500);
    } catch (e) {
      // Revertir el optimismo recargando del backend (estado real).
      fetchCedears();
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Borrar un CEDEAR del universo (deja de suscribirse). DELETE master Mongo + SQL.
  const borrarCedear = async (c: CedearRow) => {
    if (!window.confirm(
      `¿Sacar ${c.ticker_corto} del universo de Renta Variable?\n\n` +
      `Deja de suscribirse en el motor y se borra del master. ` +
      `Reversible solo volviéndolo a dar de alta.`)) return;
    setRowState((s) => ({ ...s, [c.ticker]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/renta-variable?ticker=${encodeURIComponent(c.ticker)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setRows((prev) => prev.filter((x) => x.ticker !== c.ticker));
    } catch (e) {
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const crearRubro = async () => {
    const rub = nuevoRubro.trim();
    if (!rub) return;
    setCreandoRubro(true);
    setRubroMsg(null);
    try {
      const r = await fetch("/api/manager/renta-variable/rubro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubro: rub, es_ia_def: nuevoRubroIa }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setNuevoRubro("");
      setNuevoRubroIa(false);
      setRubroMsg({ ok: true, text: `Rubro "${rub}" creado.` });
      fetchRubros();
    } catch (e) {
      setRubroMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreandoRubro(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">RENTA VARIABLE</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{filtered.length} de {rows.length} CEDEARs</span>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar ticker, nombre o rubro…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[210px]"
        />

        {/* Alta de rubro nuevo (igual que la segmentación: catálogo controlado). */}
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)] ml-2">+ CREAR RUBRO</span>
        <input
          value={nuevoRubro}
          onChange={(e) => setNuevoRubro(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") crearRubro(); }}
          placeholder="nombre del rubro…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[150px]"
        />
        <label className="flex items-center gap-1 text-[10px] text-[var(--t-text-muted)] cursor-pointer" title="Default es_ia del rubro nuevo">
          <input type="checkbox" checked={nuevoRubroIa} onChange={(e) => setNuevoRubroIa(e.target.checked)} />
          IA
        </label>
        <button onClick={crearRubro} disabled={creandoRubro || !nuevoRubro.trim()}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {creandoRubro ? "Creando…" : "+ Crear"}
        </button>

        <button onClick={fetchCedears} disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {rubroMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${rubroMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
          {rubroMsg.text}
          <button onClick={() => setRubroMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && filtered.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados.</div>}
        {filtered.length > 0 && (
          <table className="text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">TICKER</th>
                <th className="px-2 py-2">NOMBRE</th>
                <th className="px-2 py-2">UNDERLYING</th>
                <th className="px-2 py-2">RUBRO</th>
                <th className="px-2 py-2 text-center">ES IA</th>
                <th className="px-2 py-2" title="Identidad Refinitiv del subyacente (ej. AAPL.O) — la usan Research y el feed de precios en vivo">RIC</th>
                <th className="px-2 py-2" title="Ratio de conversión: cuántos CEDEARs equivalen a 1 acción (ej. 10). Insumo del CCL implícito.">RATIO</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const state: RowState = rowState[c.ticker] || { kind: "idle" };
                return (
                  <tr key={c.ticker} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-accent)] whitespace-nowrap">{c.ticker_corto}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[240px] truncate" title={c.nombre ?? ""}>{c.nombre ?? "—"}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text-dim)] whitespace-nowrap">{c.underlying ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.rubro ?? ""}
                        onChange={(e) => patchRow(c, { rubro: e.target.value || null })}
                        title={c.rubro ?? "sin rubro"}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none min-w-[150px]"
                      >
                        <option value="">— sin rubro —</option>
                        {/* Si la fila tiene un rubro que ya no está en el catálogo, igual lo mostramos. */}
                        {c.rubro && !rubros.some((r) => r.rubro === c.rubro) && (
                          <option value={c.rubro}>{c.rubro}</option>
                        )}
                        {rubros.map((r) => (
                          <option key={r.rubro} value={r.rubro}>{r.rubro}{r.es_ia_def ? " (IA)" : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => patchRow(c, { es_ia: !c.es_ia })}
                        className={`px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                          c.es_ia
                            ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                            : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                        }`}
                      >
                        {c.es_ia ? "SÍ" : "NO"}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={ricDrafts[c.ticker] ?? c.ric ?? ""}
                        onChange={(e) => setRicDrafts((d) => ({ ...d, [c.ticker]: e.target.value }))}
                        onBlur={() => {
                          const draft = ricDrafts[c.ticker];
                          if (draft === undefined) return;
                          setRicDrafts((d) => { const rest = { ...d }; delete rest[c.ticker]; return rest; });
                          const val = draft.trim() || null;
                          if (val !== (c.ric ?? null)) patchRow(c, { ric: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="AAPL.O"
                        spellCheck={false}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[90px]"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={ratioDrafts[c.ticker] ?? (c.ratio === null ? "" : String(c.ratio))}
                        onChange={(e) => setRatioDrafts((d) => ({ ...d, [c.ticker]: e.target.value }))}
                        onBlur={() => {
                          const draft = ratioDrafts[c.ticker];
                          if (draft === undefined) return;
                          setRatioDrafts((d) => { const rest = { ...d }; delete rest[c.ticker]; return rest; });
                          const txt = draft.trim().replace(",", ".");
                          const val = txt === "" ? null : Number(txt);
                          if (val !== null && (!isFinite(val) || val <= 0)) {
                            setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: "ratio inválido (número > 0)" } }));
                            return;
                          }
                          if (val !== (c.ratio ?? null)) patchRow(c, { ratio: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="10"
                        inputMode="decimal"
                        spellCheck={false}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] text-right focus:border-[var(--t-accent)] focus:outline-none w-[60px]"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-[10px] whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved" && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error" && <span className="text-red-400 cursor-help" title={state.msg}>✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}</span>}
                      <button
                        onClick={() => borrarCedear(c)}
                        title="Sacar del universo (deja de suscribirse)"
                        className="ml-2 px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-red-400 hover:text-red-400 transition-colors"
                      >
                        🗑
                      </button>
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

// TÍTULOS: Instrumentos (solo lectura) + Assets + Emisores + Breakevens +
// Renta Variable. Gate fino: INSTRUMENTOS → manager_instrumentos;
// el resto → manager_titulos.
// Así asistente_comercial (manager_instrumentos) ve solo Instrumentos.
// BREAKEVENS: curaduría de pares Lecap↔CER, partida al 50%.
//
// IZQUIERDA — los pares. El motor los empareja solo (CER de vto más cercano) y a
// veces se equivoca (par con BE absurdo) o directamente no arma uno que interesa.
// Dos acciones, las dos con efecto instantáneo en Renta Fija sin tocar el motor:
//   · EXCLUIR un par malo → el reader lo filtra al leer.
//   · "+" AGREGAR un par manual (elegís Lecap y CER a mano) → el BE se calcula en
//     la lectura con la misma función del motor. Fila marcada ✎.
//
// DERECHA — el diagnóstico de cobertura: por qué CADA bono tasa_fija del master
// entra o no entra a la matriz. Es el mismo dato que imprime
// `scripts/diag_breakevens_cobertura.py` (los dos leen el mismo endpoint), para
// no tener que entrar al Droplet a contestar "¿por qué no aparece este bono?".
interface BePar {
  lecap: string;
  cer: string;
  mes_inflacion?: string;
  dias?: number;
  breakeven_mensual?: number;
  excluido: boolean;
  manual?: boolean;
}

interface BeCandidato {
  ticker_corto: string;
  fecha_vencimiento: string | null;
  dias: number | null;
  apto: boolean;
}

interface BeDiagFila {
  lecap: string | null;
  vto: string | null;
  cer: string | null;
  diff: number | null;
  dias: number | null;
  estado: string;
  motivo: string;
}

interface BeDiag {
  hoy: string;
  ultimo_ipc: string | null;
  max_diff_dias: number;
  min_dias_plazo: number;
  master: Record<string, { n: number; vto_max: string | null; emision_max: string | null }>;
  filas: BeDiagFila[];
  n_par: number;
  n_lecaps: number;
  cer_sin_par: string[];
  publicado: {
    fecha: string | null;
    updated_at: string | null;
    n_pares: number;
    n_con_be: number;
    sin_be: { lecap: string; cer: string; falta: string[] }[];
  };
}

function fmtBe(n: number | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "--";
  return `${(n * 100).toFixed(2)}%`;
}

// El '+': dos listas (tasa_fija | CER) para elegir una de cada lado. No hay
// tolerancia de días acá a propósito — el motor ya filtra por ±20d y justamente
// esto existe para armar los pares que ese filtro deja afuera.
function BeAgregarManual({ onHecho }: { onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [cands, setCands] = useState<{ tasa_fija: BeCandidato[]; cer: BeCandidato[] } | null>(null);
  const [lecap, setLecap] = useState("");
  const [cer, setCer] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!abierto || cands) return;
    let alive = true;
    fetch("/api/manager/breakevens/candidatos")
      .then((r) => r.json())
      .then((d) => { if (alive) setCands({ tasa_fija: d.tasa_fija || [], cer: d.cer || [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [abierto, cands]);

  const guardar = async () => {
    if (!lecap || !cer) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/manager/breakevens/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap, cer, agregar: true }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || `HTTP ${r.status}`);
      }
      setLecap(""); setCer(""); setAbierto(false);
      onHecho();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "no se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const opt = (c: BeCandidato) => (
    <option key={c.ticker_corto} value={c.ticker_corto}>
      {c.ticker_corto} · {c.fecha_vencimiento || "sin vto"}
      {c.dias !== null ? ` (${c.dias}d)` : ""}{c.apto ? "" : " ⚠ sin dato"}
    </option>
  );

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className={_onInput + " w-auto"} title="Agregar un par Lecap↔CER a mano">
        + par manual
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={lecap} onChange={(e) => setLecap(e.target.value)}
        className={_onInput + " w-auto"} aria-label="Lecap/Boncap">
        <option value="">— tasa fija —</option>
        {(cands?.tasa_fija || []).map(opt)}
      </select>
      <span className="text-[11px] text-[var(--t-text-dim)]">↔</span>
      <select value={cer} onChange={(e) => setCer(e.target.value)}
        className={_onInput + " w-auto"} aria-label="CER">
        <option value="">— CER —</option>
        {(cands?.cer || []).map(opt)}
      </select>
      <button type="button" disabled={!lecap || !cer || busy} onClick={guardar}
        className={_onInput + " w-auto font-semibold"}>
        {busy ? "…" : "agregar"}
      </button>
      <button type="button" onClick={() => { setAbierto(false); setErr(""); }}
        className={_onInput + " w-auto"}>cancelar</button>
      {err && <span className="text-[10px] text-red-500">{err}</span>}
    </div>
  );
}

// Panel derecho: la cobertura. Un bono que no aparece en Renta Fija cae siempre
// en uno de estos motivos — mostrarlos evita el "¿está roto el motor o nadie dio
// de alta el bono?".
function BeDiagnostico() {
  const [d, setD] = useState<BeDiag | null>(null);
  const [loading, setLoading] = useState(false);
  const [soloFuera, setSoloFuera] = useState(true);

  const correr = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/breakevens/diagnostico")
      .then((r) => r.json())
      .then((x: BeDiag) => setD(x))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/breakevens/diagnostico")
      .then((r) => r.json())
      .then((x: BeDiag) => { if (alive) setD(x); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filas = useMemo(
    () => (d?.filas || []).filter((f) => (soloFuera ? f.estado !== "PAR" : true)),
    [d, soloFuera],
  );

  return (
    <div className="min-h-0 overflow-auto">
      <div className="flex items-center flex-wrap gap-2 mb-2">
        <span className={GROUP_TITLE}>COBERTURA</span>
        <button type="button" onClick={correr} className={_onInput + " w-auto"}>↻</button>
        <label className="flex items-center gap-1 text-[11px] text-[var(--t-text-dim)]">
          <input type="checkbox" checked={soloFuera} onChange={(e) => setSoloFuera(e.target.checked)} />
          solo los que NO entran
        </label>
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">corriendo…</span>}
      </div>

      {d && (
        <>
          <p className="text-[11px] text-[var(--t-text-dim)] mb-2">
            {d.n_par} pares de {d.n_lecaps} bonos tasa fija · tolerancia ±{d.max_diff_dias}d ·
            plazo mínimo {d.min_dias_plazo}d · último IPC {d.ultimo_ipc || "--"}
          </p>

          <div className="text-[11px] mb-2">
            <span className="text-[var(--t-text-dim)]">Master: </span>
            {Object.entries(d.master).map(([curva, m]) => (
              <span key={curva} className="mr-2">
                {curva} <b className="tabular-nums">{m.n}</b>
                <span className="text-[var(--t-text-muted)]"> (vto máx {m.vto_max || "--"})</span>
              </span>
            ))}
          </div>

          <table>
            <thead>
              <tr><th>Lecap</th><th>Vto</th><th>CER</th><th>Estado</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.lecap}|${f.vto}`}>
                  <td className="font-semibold">{f.lecap || "?"}</td>
                  <td className="tabular-nums">{f.vto || "--"}</td>
                  <td>{f.cer || "--"}</td>
                  <td className={f.estado === "PAR" ? "" : "text-amber-500"}>{f.estado}</td>
                  <td className="text-[10px] text-[var(--t-text-dim)]">{f.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length === 0 && (
            <p className="text-[11px] text-[var(--t-text-muted)] mt-2">
              Todos los bonos tasa fija del master entran a la matriz.
            </p>
          )}

          {d.cer_sin_par.length > 0 && (
            <p className="text-[11px] text-[var(--t-text-dim)] mt-2">
              <b>CER sin par:</b> {d.cer_sin_par.join(", ")} — candidatos para el “+ par manual”.
            </p>
          )}

          <p className="text-[11px] text-[var(--t-text-dim)] mt-3">
            <b>Publicado:</b> {d.publicado.fecha || "sin datos"} · {d.publicado.n_pares} pares
            ({d.publicado.n_con_be} con BE) · actualizado {d.publicado.updated_at || "--"}
          </p>
          {d.publicado.sin_be.map((s) => (
            <p key={`${s.lecap}|${s.cer}`} className="text-[10px] text-amber-500">
              {s.lecap} ↔ {s.cer} — falta {s.falta.join(", ") || "revisar rango del BE"}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function TabBreakevens() {
  const [pares, setPares] = useState<BePar[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [nExcl, setNExcl] = useState(0);

  const fetchPares = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/breakevens/pares")
      .then((r) => r.json())
      .then((d: { pares?: BePar[]; n_excluidos?: number }) => {
        setPares(d.pares || []);
        setNExcl(d.n_excluidos || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  // Carga al montar — fetch inline (setState solo en .then) para no disparar
  // setState sincrónico dentro del effect.
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/breakevens/pares")
      .then((r) => r.json())
      .then((d: { pares?: BePar[]; n_excluidos?: number }) => {
        if (!alive) return;
        setPares(d.pares || []);
        setNExcl(d.n_excluidos || 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const toggle = async (p: BePar) => {
    const key = `${p.lecap}|${p.cer}`;
    setBusy((b) => ({ ...b, [key]: true }));
    // Optimista: reflejo el cambio antes de la respuesta.
    setPares((prev) => prev.map((x) => (x.lecap === p.lecap && x.cer === p.cer ? { ...x, excluido: !x.excluido } : x)));
    try {
      const r = await fetch("/api/manager/breakevens/exclusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap: p.lecap, cer: p.cer, excluir: !p.excluido }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNExcl((n) => (p.excluido ? Math.max(0, n - 1) : n + 1));
    } catch {
      // revierto si falló
      setPares((prev) => prev.map((x) => (x.lecap === p.lecap && x.cer === p.cer ? { ...x, excluido: p.excluido } : x)));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  // Borrar un par MANUAL es distinto de excluir uno del motor: el manual no
  // existe sin la fila, así que se elimina en vez de ocultarse.
  const borrarManual = async (p: BePar) => {
    const key = `${p.lecap}|${p.cer}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const r = await fetch("/api/manager/breakevens/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap: p.lecap, cer: p.cer, agregar: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPares((prev) => prev.filter((x) => !(x.lecap === p.lecap && x.cer === p.cer)));
    } catch {
      /* si falló, el ↻ lo vuelve a traer */
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  return (
    <div className="h-full min-h-0 p-3 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start overflow-auto">
      {/* ── IZQUIERDA: los pares (motor + manuales) ── */}
      <div className="min-h-0 overflow-auto">
        <div className="flex items-center flex-wrap gap-2 mb-2">
          <span className={GROUP_TITLE}>PARES</span>
          <button type="button" onClick={fetchPares} className={_onInput + " w-auto"}>↻</button>
          <BeAgregarManual onHecho={fetchPares} />
        </div>
        <p className="text-[11px] text-[var(--t-text-dim)] mb-2">
          {pares.length} pares · {nExcl} excluidos · excluir un par lo oculta de Renta Fija
          al instante; los ✎ los agregaste a mano y el motor no los conoce
        </p>
        <table>
          <thead>
            <tr><th>Lecap/Boncap</th><th>CER</th><th>IPC mes</th><th>Días</th><th>BE mensual</th><th></th></tr>
          </thead>
          <tbody>
            {pares.map((p) => {
              const key = `${p.lecap}|${p.cer}`;
              const beRoto = p.breakeven_mensual !== undefined && (p.breakeven_mensual < 0 || p.breakeven_mensual > 0.15);
              return (
                <tr key={key} className={p.excluido ? "opacity-40" : ""}>
                  <td className="font-semibold">
                    {p.manual && <span title="par manual" className="mr-1">✎</span>}{p.lecap}
                  </td>
                  <td>{p.cer}</td>
                  <td className="tabular-nums">{p.mes_inflacion || "--"}</td>
                  <td className="tabular-nums text-right">{p.dias ?? "--"}</td>
                  <td className={"tabular-nums text-right " + (beRoto ? "text-red-500 font-semibold" : "")}>
                    {fmtBe(p.breakeven_mensual)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      disabled={busy[key]}
                      onClick={() => (p.manual ? borrarManual(p) : toggle(p))}
                      className={_onInput + " w-auto text-[10px]"}
                      title={p.manual
                        ? "Borrar este par manual"
                        : p.excluido ? "Volver a mostrar este par" : "Ocultar este par de Renta Fija"}
                    >
                      {busy[key] ? "…" : p.manual ? "borrar" : p.excluido ? "incluir" : "excluir"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">cargando…</p>}
        {!loading && pares.length === 0 && (
          <p className="text-[11px] text-[var(--t-text-muted)] mt-2">
            Sin pares — ¿el motor de breakevens está corriendo?
          </p>
        )}
      </div>

      {/* ── DERECHA: por qué un bono entra o no entra ── */}
      <BeDiagnostico />
    </div>
  );
}


// ── EMISORES — la INDUSTRIA vive acá, no en el bono ──────────────────────────
// Guardarla por bono es escribir el mismo dato N veces y esperar que nadie lo
// escriba distinto. Medido: 8 emisores tienen HOY sectores que se contradicen
// entre sus propios bonos (Pampa Energía tiene tres). Ninguna fila está "mal" —
// cada una suma bien por separado — y por eso agrupar da distinto según de dónde
// se lea. Acá el dato existe UNA vez.
interface EmisorRow { emisor: string; industria?: string | null; bonos?: number; editado_por?: string | null }
interface PendientesResp {
  sin_clasificar: { emisor: string; bonos: number; falta_en_catalogo: boolean }[];
  contradicciones: { emisor: string; bonos: number; sectores: string }[];
  n_sin_clasificar: number; n_contradicciones: number;
}

function TabEmisores() {
  const [rows, setRows] = useState<EmisorRow[]>([]);
  const [industrias, setIndustrias] = useState<string[]>([]);
  const [pend, setPend] = useState<PendientesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState("");

  const cargar = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/manager/emisores").then((r) => r.json()),
      fetch("/api/manager/emisores/industrias").then((r) => r.json()),
      fetch("/api/manager/emisores/pendientes").then((r) => r.json()),
    ])
      .then(([e, i, p]) => { setRows(e.emisores || []); setIndustrias(i.industrias || []); setPend(p); })
      .catch(() => setMsg({ kind: "err", text: "no se pudo cargar" }))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, []);

  const setIndustria = async (emisor: string, industria: string) => {
    setMsg(null);
    try {
      const r = await fetch("/api/manager/emisores", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // `""` (y no `undefined`) es la señal explícita de DEJAR SIN CLASIFICAR:
        // sin clasificar es un estado válido y visible, no un error.
        body: JSON.stringify({ emisor, industria }),
      });
      const txt = await r.text(); let d: { detail?: string } = {};
      try { d = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setRows((prev) => prev.map((x) => (x.emisor === emisor ? { ...x, industria: industria || null } : x)));
      fetch("/api/manager/emisores/pendientes").then((x) => x.json()).then(setPend).catch(() => {});
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }); }
  };

  const crearIndustria = async () => {
    const nombre = nueva.trim();
    if (!nombre) return;
    await fetch("/api/manager/emisores/industria", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industria: nombre }),
    }).catch(() => {});
    setNueva(""); cargar();
  };

  const filtradas = rows.filter((r) => !q || r.emisor.toLowerCase().includes(q.toLowerCase()));
  const sinIndustria = rows.filter((r) => !r.industria).length;

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input className={_onInput + " w-48"} placeholder="buscar emisor…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-[11px] text-[var(--t-text-2)]">
          {rows.length} emisores · {sinIndustria} sin industria
        </span>
        <div className="flex-1" />
        <input className={_onInput + " w-40"} placeholder="industria nueva…"
               value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button className={_onInput + " w-auto text-[10px]"} onClick={crearIndustria}>+ INDUSTRIA</button>
        <button className={_onInput + " w-auto text-[10px]"} onClick={cargar}>recargar</button>
      </div>
      {msg && <p className={`text-[11px] ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      {/* Los pendientes ARRIBA y no escondidos en otra pantalla: si hay que mirar
          una lista para enterarse, se vuelve el incidente del backfill que falló
          dos días sin que nadie lo viera. */}
      {pend && pend.n_contradicciones > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/5 rounded p-2">
          <div className="text-[11px] font-semibold text-amber-400 mb-1">
            ⚠ {pend.n_contradicciones} emisor(es) con sectores contradictorios entre sus propios bonos
          </div>
          <div className="text-[10px] text-[var(--t-text-2)] mb-1">
            Ninguno está mal: cada bono suma bien por separado, y por eso agrupar da
            distinto según de dónde se lea. Elegí vos cuál queda — por eso no se
            resolvieron solos.
          </div>
          {pend.contradicciones.map((c) => (
            <div key={c.emisor} className="text-[11px] flex gap-2">
              <span className="w-52 truncate">{c.emisor}</span>
              <span className="text-[var(--t-text-2)]">{c.bonos} bonos · {c.sectores}</span>
            </div>
          ))}
        </div>
      )}

      <table className="w-full text-[11px]">
        <thead className="text-[var(--t-text-2)]">
          <tr><th className="text-left">EMISOR</th><th className="text-right">BONOS</th>
              <th className="text-left pl-3">INDUSTRIA</th><th className="text-left">EDITÓ</th></tr>
        </thead>
        <tbody>
          {filtradas.map((r) => (
            <tr key={r.emisor} className={r.industria ? "" : "bg-amber-500/5"}>
              <td className="truncate max-w-[16rem]">{r.emisor}</td>
              <td className="text-right">{r.bonos ?? 0}</td>
              <td className="pl-3">
                <select className={_onInput + " w-44"} value={r.industria || ""}
                        onChange={(e) => setIndustria(r.emisor, e.target.value)}>
                  <option value="">— sin clasificar —</option>
                  {industrias.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </td>
              <td className="text-[10px] text-[var(--t-text-2)] truncate max-w-[12rem]">
                {r.editado_por || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="text-[11px] text-[var(--t-text-muted)]">cargando…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Catálogo vacío — corré <code>python -m scripts.sembrar_emisores --aplicar</code> en el Droplet.
        </p>
      )}
    </div>
  );
}

export function TitulosGroup({ modules }: { modules?: string[] | null }) {
  // "ons" y "bonos" se eliminaron como sub-tabs: la carga y el control de bonos
  // y ONs los hace EL AV AGENT. El persisted state viejo con cualquiera de los
  // dos cae al default vía subVisible — no hace falta migrar nada.
  const [sub, setSub] = usePersistedState<"instrumentos" | "assets" | "emisores" | "breakevens" | "renta_variable">("manager.titulos.sub", "instrumentos");
  const has = (m: string) => modules == null || modules.includes(m);
  const canInstr = has("manager") || has("manager_instrumentos");
  const canMaestro = has("manager") || has("manager_titulos");
  const subVisible = (sub === "instrumentos" && canInstr) || ((sub === "assets" || sub === "emisores" || sub === "breakevens" || sub === "renta_variable") && canMaestro);
  const eff = subVisible ? sub : (canInstr ? "instrumentos" : "assets");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>TÍTULOS</span>
        {canInstr && <Pill label="INSTRUMENTOS" active={eff === "instrumentos"} onClick={() => setSub("instrumentos")} />}
        {canMaestro && <Pill label="ASSETS" active={eff === "assets"} onClick={() => setSub("assets")} />}
        {canMaestro && <Pill label="EMISORES" active={eff === "emisores"} onClick={() => setSub("emisores")} />}
        {canMaestro && <Pill label="BREAKEVENS" active={eff === "breakevens"} onClick={() => setSub("breakevens")} />}
        {canMaestro && <Pill label="RENTA VARIABLE" active={eff === "renta_variable"} onClick={() => setSub("renta_variable")} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {eff === "instrumentos"   && canInstr && <div className="h-full overflow-y-auto p-3"><TabInstrumentos /></div>}
        {eff === "assets"         && canMaestro && <TabAssets />}
        {eff === "emisores"       && canMaestro && <TabEmisores />}
        {eff === "breakevens"     && canMaestro && <TabBreakevens />}
        {eff === "renta_variable" && canMaestro && <TabRentaVariable />}
      </div>
    </div>
  );
}
