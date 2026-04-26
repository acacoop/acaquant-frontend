"use client";

/**
 * Tab "SIMULAR CARTERA" — calculadora de cartera manual sobre el universo
 * de Valuaciones.Assets. El usuario arma posiciones (ticker + importe) y
 * el backend devuelve cashflows + composición + métricas ponderadas.
 *
 * Layout:
 *   [Sidebar carteras guardadas] [Editor de posiciones] [Analytics]
 *
 * Endpoints (route handlers Next /api/simulaciones/*):
 *   GET   /api/simulaciones           → lista del user
 *   POST  /api/simulaciones           → crear
 *   GET   /api/simulaciones/{id}      → leer
 *   PUT   /api/simulaciones/{id}      → actualizar nombre + posiciones
 *   DELETE /api/simulaciones/{id}     → borrar
 *   POST  /api/simulaciones/calcular  → analytics live
 *   GET   /api/simulaciones/tickers   → universo para autocomplete
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (sincronizados con api/services/simulaciones.py)
// ─────────────────────────────────────────────────────────────────────────────

interface Posicion {
  ticker: string;
  importe: number;
}

interface Simulacion {
  id: string;
  user_email: string;
  nombre: string;
  posiciones: Posicion[];
  creado: string;
  actualizado: string;
}

interface TickerInfo {
  ticker: string;
  clase_activo: string | null;
  emisor: string | null;
  calificacion: string | null;
  cartera: string | null;
  tipo: string | null;
  curva: string | null;
  vencimiento: string | null;
}

interface PosicionEnriquecida {
  ticker_corto: string;
  ticker_largo?: string;
  importe: number;
  precio: number | null;
  cantidad_nominal: number | null;
  curva: string | null;
  tipo: string | null;
  clase_activo: string | null;
  emisor: string | null;
  calificacion: string | null;
  moneda: string | null;
  cartera: string | null;
  fecha_vencimiento: string | null;
  tea: number | null;
  duration: number | null;
}

interface ComposicionItem {
  valor: string;
  importe: number;
  pct: number;
}

interface GrupoCartera {
  cartera: string;
  monto_total: number;
  posiciones: PosicionEnriquecida[];
  cashflows: { mes: string; monto: number }[];
  composicion: {
    por_curva: ComposicionItem[];
    por_clase_activo: ComposicionItem[];
    por_emisor: ComposicionItem[];
  };
  metricas: {
    duration_ponderada: number | null;
    tea_ponderada: number | null;
  };
}

interface Analytics {
  grupos: GrupoCartera[];
  alertas: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils de formato
// ─────────────────────────────────────────────────────────────────────────────

function fmtImporte(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return Math.round(n).toString();
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return (n * 100).toFixed(decimals) + "%";
}

function fmtNumber(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(decimals);
}

function fmtMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const mes = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(m, 10) - 1] ?? m;
  return `${mes}/${y.slice(2)}`;
}

const NOMBRE_DEFAULT = "Cartera sin nombre";

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function SimularCarteraView() {
  const [simulaciones, setSimulaciones] = useState<Simulacion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string>(NOMBRE_DEFAULT);
  const [posiciones, setPosiciones] = useState<Posicion[]>([]);
  const [tickers, setTickers] = useState<TickerInfo[]>([]);
  const [analyticsFetched, setAnalyticsFetched] = useState<Analytics | null>(null);
  const [calculando, setCalculando] = useState(false);
  // Cuando no hay posiciones no mostramos analytics — derivado para evitar
  // un setState dentro del effect (regla react-hooks/set-state-in-effect).
  const analytics = posiciones.length === 0 ? null : analyticsFetched;
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Cargar lista de simulaciones al montar.
  useEffect(() => {
    fetch("/api/simulaciones", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j: Simulacion[]) => setSimulaciones(j))
      .catch(() => setError("No se pudieron cargar las simulaciones guardadas."));
  }, []);

  // Cargar universo de tickers al montar.
  useEffect(() => {
    fetch("/api/simulaciones/tickers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j: TickerInfo[]) => setTickers(j))
      .catch(() => {
        // Sin universo no se rompe, solo no hay autocomplete.
      });
  }, []);

  // Recalcular analytics cuando cambian posiciones (debounce 400ms).
  // Si posiciones queda vacío no hace falta resetear: `analytics` se deriva
  // a null arriba.
  useEffect(() => {
    if (posiciones.length === 0) return;
    const handle = setTimeout(async () => {
      setCalculando(true);
      try {
        const res = await fetch("/api/simulaciones/calcular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posiciones }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: Analytics = await res.json();
        setAnalyticsFetched(j);
      } catch {
        setError("Error calculando la cartera.");
      } finally {
        setCalculando(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [posiciones]);

  const handleSelect = useCallback(async (id: string) => {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Descartar?")) return;
    try {
      const res = await fetch(`/api/simulaciones/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("not found");
      const sim: Simulacion = await res.json();
      setActiveId(sim.id);
      setNombre(sim.nombre);
      setPosiciones(sim.posiciones);
      setDirty(false);
      setError(null);
    } catch {
      setError("No se pudo cargar la simulación.");
    }
  }, [dirty]);

  const handleNueva = useCallback(() => {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Descartar?")) return;
    setActiveId(null);
    setNombre(NOMBRE_DEFAULT);
    setPosiciones([]);
    setDirty(false);
    setError(null);
  }, [dirty]);

  const handleEliminar = useCallback(async (id: string) => {
    if (!confirm("¿Eliminar esta simulación?")) return;
    try {
      const res = await fetch(`/api/simulaciones/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("");
      setSimulaciones((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) handleNueva();
    } catch {
      setError("No se pudo eliminar la simulación.");
    }
  }, [activeId, handleNueva]);

  const handleGuardar = useCallback(async () => {
    setGuardando(true);
    setError(null);
    try {
      const body = JSON.stringify({ nombre, posiciones });
      const res = activeId
        ? await fetch(`/api/simulaciones/${activeId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await fetch("/api/simulaciones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sim: Simulacion = await res.json();
      setActiveId(sim.id);
      setSimulaciones((prev) => {
        const otros = prev.filter((s) => s.id !== sim.id);
        return [sim, ...otros];
      });
      setDirty(false);
    } catch {
      setError("No se pudo guardar la simulación.");
    } finally {
      setGuardando(false);
    }
  }, [activeId, nombre, posiciones]);

  const handleAddPosicion = useCallback((ticker: string, importe: number) => {
    setPosiciones((prev) => {
      const i = prev.findIndex((p) => p.ticker === ticker);
      if (i >= 0) {
        // Si ya existe, sumamos al importe en lugar de duplicar.
        const next = [...prev];
        next[i] = { ...next[i], importe: next[i].importe + importe };
        return next;
      }
      return [...prev, { ticker, importe }];
    });
    setDirty(true);
  }, []);

  const handleEditImporte = useCallback((ticker: string, importe: number) => {
    setPosiciones((prev) => prev.map((p) => (p.ticker === ticker ? { ...p, importe } : p)));
    setDirty(true);
  }, []);

  const handleRemove = useCallback((ticker: string) => {
    setPosiciones((prev) => prev.filter((p) => p.ticker !== ticker));
    setDirty(true);
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        simulaciones={simulaciones}
        activeId={activeId}
        onSelect={handleSelect}
        onNueva={handleNueva}
        onEliminar={handleEliminar}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <EditorHeader
          nombre={nombre}
          onNombreChange={(n) => { setNombre(n); setDirty(true); }}
          dirty={dirty}
          guardando={guardando}
          onGuardar={handleGuardar}
        />
        {error && (
          <div className="px-3 py-2 text-[11px] text-[#ff6666] bg-[#1a0808] border-b border-[#3a1010]">
            {error}
          </div>
        )}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          <div className="border-r border-[#1a1a1a] flex flex-col min-h-0">
            <PosicionesTable
              posiciones={posiciones}
              enriquecidas={analytics?.grupos.flatMap((g) => g.posiciones) ?? []}
              tickers={tickers}
              onAdd={handleAddPosicion}
              onEdit={handleEditImporte}
              onRemove={handleRemove}
            />
          </div>
          <div className="overflow-auto">
            <AnalyticsPanel analytics={analytics} calculando={calculando} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — carteras guardadas
// ─────────────────────────────────────────────────────────────────────────────

function Sidebar({
  simulaciones, activeId, onSelect, onNueva, onEliminar,
}: {
  simulaciones: Simulacion[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNueva: () => void;
  onEliminar: (id: string) => void;
}) {
  return (
    <aside className="w-56 shrink-0 border-r border-[#1a1a1a] flex flex-col bg-[#0a0a0a]">
      <div className="px-3 py-2 border-b border-[#1a1a1a]">
        <button
          onClick={onNueva}
          className="w-full px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-[#ff9900] text-black hover:bg-[#ffaa22]"
        >
          + NUEVA CARTERA
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {simulaciones.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-[#555]">
            Sin carteras guardadas.
          </div>
        )}
        {simulaciones.map((s) => (
          <div
            key={s.id}
            className={`group flex items-center px-3 py-2 border-b border-[#1a1a1a] cursor-pointer ${
              activeId === s.id ? "bg-[#1a1a1a]" : "hover:bg-[#121212]"
            }`}
            onClick={() => onSelect(s.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-[#ddd] truncate">
                {s.nombre}
              </div>
              <div className="text-[10px] text-[#666]">
                {s.posiciones.length} pos · {new Date(s.actualizado).toLocaleDateString("es-AR")}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onEliminar(s.id); }}
              className="opacity-0 group-hover:opacity-100 px-1.5 text-[12px] text-[#888] hover:text-[#ff6666]"
              title="Eliminar"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header del editor (nombre + botón guardar)
// ─────────────────────────────────────────────────────────────────────────────

function EditorHeader({
  nombre, onNombreChange, dirty, guardando, onGuardar,
}: {
  nombre: string;
  onNombreChange: (n: string) => void;
  dirty: boolean;
  guardando: boolean;
  onGuardar: () => void;
}) {
  return (
    <div className="flex items-center px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] gap-2">
      <input
        type="text"
        value={nombre}
        onChange={(e) => onNombreChange(e.target.value)}
        className="flex-1 bg-transparent text-[12px] font-semibold text-[#ddd] outline-none border-b border-transparent focus:border-[#ff9900] py-0.5"
      />
      <button
        onClick={onGuardar}
        disabled={guardando || !dirty}
        className={`px-3 py-1 text-[11px] font-semibold tracking-wide border ${
          dirty
            ? "bg-[#ff9900] text-black border-[#ff9900] hover:bg-[#ffaa22]"
            : "bg-transparent text-[#444] border-[#2a2a2a] cursor-not-allowed"
        }`}
      >
        {guardando ? "GUARDANDO..." : dirty ? "GUARDAR" : "GUARDADO"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla de posiciones (con autocomplete para agregar)
// ─────────────────────────────────────────────────────────────────────────────

function PosicionesTable({
  posiciones, enriquecidas, tickers, onAdd, onEdit, onRemove,
}: {
  posiciones: Posicion[];
  enriquecidas: PosicionEnriquecida[];
  tickers: TickerInfo[];
  onAdd: (ticker: string, importe: number) => void;
  onEdit: (ticker: string, importe: number) => void;
  onRemove: (ticker: string) => void;
}) {
  const enriqMap = useMemo(() => {
    const m = new Map<string, PosicionEnriquecida>();
    for (const e of enriquecidas) m.set(e.ticker_corto, e);
    return m;
  }, [enriquecidas]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-[#666] border-b border-[#1a1a1a] bg-[#0a0a0a]">
        Posiciones
      </div>
      <AgregarPosicionForm tickers={tickers} onAdd={onAdd} />
      <div className="flex-1 overflow-auto">
        {posiciones.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-[#666]">
            Agregá un ticker arriba para empezar.
          </div>
        )}
        {posiciones.length > 0 && (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0a0a0a]">
              <tr className="text-[10px] uppercase tracking-wider text-[#666]">
                <th className="text-left px-3 py-1.5 font-medium">Ticker</th>
                <th className="text-left px-3 py-1.5 font-medium">Cartera</th>
                <th className="text-right px-3 py-1.5 font-medium">Importe</th>
                <th className="text-right px-3 py-1.5 font-medium">VN</th>
                <th className="text-right px-3 py-1.5 font-medium">Precio</th>
                <th className="text-left px-3 py-1.5 font-medium">Curva</th>
                <th className="text-right px-3 py-1.5 font-medium">TEA</th>
                <th className="text-right px-3 py-1.5 font-medium">Dur</th>
                <th className="px-3 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {posiciones.map((p) => {
                const meta = enriqMap.get(p.ticker);
                return (
                  <tr key={p.ticker} className="border-t border-[#151515]">
                    <td className="px-3 py-1.5 text-[#ddd] font-mono">{p.ticker}</td>
                    <td className="px-3 py-1.5 text-[#888] truncate max-w-[140px]">
                      {meta?.cartera ?? "—"}
                    </td>
                    <td className="px-3 py-1 text-right">
                      <input
                        type="number"
                        value={p.importe}
                        min={0}
                        step={1000}
                        onChange={(e) => onEdit(p.ticker, parseFloat(e.target.value) || 0)}
                        className="bg-transparent text-right text-[#ddd] w-24 outline-none border-b border-transparent focus:border-[#ff9900]"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right text-[#999]">
                      {meta?.cantidad_nominal != null ? fmtCompact(meta.cantidad_nominal) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[#999]">
                      {meta?.precio != null ? meta.precio.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[#888]">{meta?.curva ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-[#999]">{fmtPct(meta?.tea ?? null)}</td>
                    <td className="px-3 py-1.5 text-right text-[#999]">{fmtNumber(meta?.duration ?? null, 2)}</td>
                    <td className="px-3 py-1 text-right">
                      <button
                        onClick={() => onRemove(p.ticker)}
                        className="text-[#666] hover:text-[#ff6666] px-1"
                        title="Eliminar"
                      >×</button>
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

// ─────────────────────────────────────────────────────────────────────────────
// Form para agregar posición (autocomplete + importe)
// ─────────────────────────────────────────────────────────────────────────────

function AgregarPosicionForm({
  tickers, onAdd,
}: {
  tickers: TickerInfo[];
  onAdd: (ticker: string, importe: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [importe, setImporte] = useState<string>("");
  const [showOpts, setShowOpts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sugerencias = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return tickers
      .filter((t) =>
        t.ticker.toLowerCase().includes(q) ||
        (t.emisor ?? "").toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [query, tickers]);

  function trySubmit(ticker?: string) {
    const tk = (ticker ?? query).trim().toUpperCase();
    const imp = parseFloat(importe.replace(/[^\d.]/g, "")) || 0;
    if (!tk || imp <= 0) return;
    onAdd(tk, imp);
    setQuery("");
    setImporte("");
    setShowOpts(false);
    inputRef.current?.focus();
  }

  return (
    <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowOpts(true); }}
            onFocus={() => setShowOpts(true)}
            onBlur={() => setTimeout(() => setShowOpts(false), 200)}
            placeholder="Ticker (ej. TZX26)"
            className="w-full bg-[#0f0f0f] border border-[#222] px-2 py-1 text-[11px] text-[#ddd] outline-none focus:border-[#ff9900]"
          />
          {showOpts && sugerencias.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0a0a0a] border border-[#2a2a2a] max-h-60 overflow-auto z-10">
              {sugerencias.map((s) => (
                <div
                  key={s.ticker}
                  onClick={() => trySubmit(s.ticker)}
                  className="px-2 py-1 text-[11px] hover:bg-[#1a1a1a] cursor-pointer flex justify-between gap-2"
                >
                  <span className="text-[#ddd] font-mono">{s.ticker}</span>
                  <span className="text-[#666] text-[10px] truncate">
                    {s.clase_activo ?? ""} {s.emisor ? `· ${s.emisor}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          type="number"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") trySubmit(); }}
          placeholder="Importe"
          min={0}
          step={1000}
          className="w-32 bg-[#0f0f0f] border border-[#222] px-2 py-1 text-[11px] text-right text-[#ddd] outline-none focus:border-[#ff9900]"
        />
        <button
          onClick={() => trySubmit()}
          disabled={!query.trim() || !importe}
          className="px-3 py-1 text-[11px] font-semibold bg-[#ff9900] text-black hover:bg-[#ffaa22] disabled:bg-[#2a2a2a] disabled:text-[#555]"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de analytics (cashflow + métricas + composición)
// ─────────────────────────────────────────────────────────────────────────────

function AnalyticsPanel({
  analytics, calculando,
}: {
  analytics: Analytics | null;
  calculando: boolean;
}) {
  if (!analytics) {
    return (
      <div className="p-4 text-[11px] text-[#555]">
        Agregá posiciones para ver analytics.
      </div>
    );
  }
  return (
    <div className={`p-3 space-y-4 ${calculando ? "opacity-60" : ""}`}>
      {analytics.alertas.length > 0 && (
        <div className="border border-[#3a3010] bg-[#1a1408] p-2 text-[11px] text-[#ffcc66]">
          <div className="font-semibold mb-1">Alertas</div>
          <ul className="list-disc ml-4 space-y-0.5">
            {analytics.alertas.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
      {analytics.grupos.length === 0 && (
        <div className="text-[11px] text-[#555]">
          Sin grupos calculados.
        </div>
      )}
      {analytics.grupos.map((g) => (
        <GrupoCard key={g.cartera} grupo={g} />
      ))}
    </div>
  );
}

function GrupoCard({ grupo }: { grupo: GrupoCartera }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#0a0a0a] flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-widest text-[#ff9900] uppercase">
          {grupo.cartera}
        </span>
        <span className="text-[10px] text-[#666]">
          {grupo.posiciones.length} posición{grupo.posiciones.length === 1 ? "" : "es"}
        </span>
      </div>
      <div className="p-2 space-y-3">
        <MetricasCards
          monto={grupo.monto_total}
          duration={grupo.metricas.duration_ponderada}
          tea={grupo.metricas.tea_ponderada}
        />
        <CashflowChart cashflows={grupo.cashflows} />
        <div className="grid grid-cols-2 gap-2">
          <ComposicionTabla titulo="Por curva"        items={grupo.composicion.por_curva} />
          <ComposicionTabla titulo="Por clase activo" items={grupo.composicion.por_clase_activo} />
          <ComposicionTabla titulo="Por emisor"       items={grupo.composicion.por_emisor} />
        </div>
      </div>
    </div>
  );
}

function MetricasCards({
  monto, duration, tea,
}: {
  monto: number;
  duration: number | null;
  tea: number | null;
}) {
  const items = [
    { label: "Monto total", value: fmtImporte(monto) },
    { label: "Duration",    value: fmtNumber(duration, 2) },
    { label: "TEA",         value: fmtPct(tea) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((m) => (
        <div key={m.label} className="border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2">
          <div className="text-[9px] uppercase tracking-widest text-[#666]">{m.label}</div>
          <div className="text-[14px] font-semibold text-[#ff9900] mt-0.5">{m.value}</div>
        </div>
      ))}
    </div>
  );
}

function CashflowChart({ cashflows }: { cashflows: GrupoCartera["cashflows"] }) {
  if (cashflows.length === 0) {
    return (
      <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 text-[11px] text-[#666]">
        Sin cashflows proyectados (los instrumentos seleccionados no tienen flujos modelados).
      </div>
    );
  }
  const data = cashflows.map((c) => ({ mes: fmtMes(c.mes), monto: c.monto }));
  return (
    <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-2">
      <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1 px-1">
        Cashflow mes a mes
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
            <XAxis
              dataKey="mes"
              stroke="#666"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#666"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => fmtCompact(v as number)}
              width={50}
            />
            <Tooltip
              contentStyle={{ background: "#0a0a0a", border: "1px solid #2a2a2a", fontSize: 11 }}
              labelStyle={{ color: "#999" }}
              formatter={(v) => [fmtImporte(typeof v === "number" ? v : 0), "Monto"]}
            />
            <Bar dataKey="monto" fill="#ff9900" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ComposicionTabla({
  titulo, items,
}: {
  titulo: string;
  items: ComposicionItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="border border-[#1a1a1a] bg-[#0a0a0a]">
      <div className="text-[10px] uppercase tracking-widest text-[#666] px-2 py-1.5 border-b border-[#1a1a1a]">
        {titulo}
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {items.map((it) => (
            <tr key={it.valor} className="border-t border-[#151515] first:border-t-0">
              <td className="px-2 py-1 text-[#ddd] truncate">{it.valor}</td>
              <td className="px-2 py-1 text-right text-[#999]">{fmtCompact(it.importe)}</td>
              <td className="px-2 py-1 text-right text-[#ff9900] font-semibold w-12">
                {it.pct.toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
