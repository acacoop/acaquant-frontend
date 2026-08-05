"use client";

// MESA DE DINERO (NEGOCIO → /mesa-dinero) — registro manual de la mesa.
// Layout: IZQ 50% tabla de operaciones (compra+venta por registro, estilo
// planilla "MESA ACA VALORES") + formulario de alta/edición (solo escritores).
// DER 50%: arriba RESULTADO diario (Σ resultado de las ops + TC manual →
// USD + acumulado) / abajo gráfico de barras por fecha (toggle ARS/USD).
// Backend: /api/mesa-dinero/* (lectura módulo `operaciones`; escritura
// allowlist per-usuario gestionada en Manager → MESA). Derivados (monto,
// resultado, %) los calcula el backend — acá solo se muestran.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJson as getJson } from "@/lib/fetch-json";

// ── Types (contrato /api/mesa-dinero) ─────────────────────────────────────
type Op = {
  id: number;
  fecha: string;
  trader: string;
  activo: string | null;
  vn_compra: number | null; px_compra: number | null; monto_compra: number | null;
  vn_venta: number | null; px_venta: number | null; monto_venta: number | null;
  resultado: number; pct: number | null;
  cliente: string | null; observacion: string | null;
};
type Dia = {
  fecha: string;
  resultado_ars: number; tc: number | null; resultado_usd: number | null;
  acumulado_ars: number; acumulado_usd: number | null;
};
type Resumen = { dias: Dia[]; total_ars: number; total_usd: number };
type PorCliente = { cliente: string; resultado_ars: number; resultado_usd: number; n: number };
type PorComercial = { observacion: string; resultado_ars: number; resultado_usd: number; n: number };
type Resultados = {
  por_cliente: PorCliente[]; por_comercial: PorComercial[];
  total_ars: number; total_usd: number; n_total: number; dias_sin_tc: number;
};
type Opciones = { traders: string[]; observaciones: string[]; clientes: string[]; puede_escribir: boolean };
// ACA VALORES RETORNO TOTAL — filas crudas del período (se agregan en el cliente
// para el cross-filter interactivo: tocar un agente/operación/papel/día filtra el resto).
// La métrica `cash` = columna "Moneda de Concertación Bruto" del informe.
type RetFila = { fecha: string | null; operacion: string; agente: string; papel: string; cash: number };
type Retorno = { periodos: string[]; periodo: string | null; filas: RetFila[] };
type RetGrupo = { clave: string; cash: number; n: number; share: number };

// ── Helpers ────────────────────────────────────────────────────────────────
const INPUT =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 " +
  "text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none";

const fmt2 = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmt0 = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("es-AR");
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : (n * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const fmtFechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const signClass = (n: number | null | undefined) =>
  n == null ? "" : n < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]";
// Abreviado para labels del chart: 19.696.422 → "19,7M"; 12.970 → "13k".
const fmtAbrev = (n: number) => {
  const a = Math.abs(n);
  const f = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  if (a >= 1e9) return f(n / 1e9) + "B";
  if (a >= 1e6) return f(n / 1e6) + "M";
  if (a >= 1e3) return f(n / 1e3) + "k";
  return f(n);
};

const mesActual = () => new Date().toISOString().slice(0, 7); // YYYY-MM
const rangoDeMes = (mes: string): { desde: string; hasta: string } => {
  const [y, m] = mes.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(last).padStart(2, "0")}` };
};

// Inputs numéricos: el estado guarda el crudo con coma decimal ("1234567,89").
// El usuario puede tipear coma O punto y ambos significan lo MISMO (decimal) —
// distintos teclados. Se muestra el crudo tal cual (sin separador de miles
// mientras se tipea) para que no haya ambigüedad punto-miles vs punto-decimal.
// El SEGUNDO separador que se tipee se ignora (ya hay decimal).
const normalizarNumeroInput = (s: string) => {
  const src = (s ?? "").replace(/\s/g, "");
  if (!src) return "";

  const neg = src.startsWith("-");
  // Todo lo que no sea dígito o separador se descarta. El PRIMER separador
  // (coma o punto) es el decimal; los siguientes se ignoran.
  const clean = src.replace(/[^\d.,]/g, "");
  const sepIdx = clean.search(/[.,]/);

  if (sepIdx < 0) {
    return (neg ? "-" : "") + clean.replace(/\D/g, "");
  }

  const ints = clean.slice(0, sepIdx).replace(/\D/g, "");
  const decs = clean.slice(sepIdx + 1).replace(/\D/g, "");
  return (neg ? "-" : "") + ints + "," + decs;
};

// ── Formulario de alta/edición ─────────────────────────────────────────────
type FormState = {
  fecha: string; trader: string; activo: string;
  vn: string; px_compra: string; px_venta: string;
  resultado: string; cliente: string; observacion: string;
};
const FORM_VACIO: FormState = {
  fecha: new Date().toISOString().slice(0, 10), trader: "", activo: "",
  vn: "", px_compra: "", px_venta: "",
  resultado: "", cliente: "", observacion: "Mesa",
};

const aCrudo = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");

function opAForm(op: Op): FormState {
  return {
    fecha: op.fecha, trader: op.trader, activo: op.activo ?? "",
    vn: aCrudo(op.vn_compra ?? op.vn_venta),
    px_compra: aCrudo(op.px_compra),
    px_venta: aCrudo(op.px_venta),
    resultado: op.resultado != null && op.monto_compra == null ? aCrudo(op.resultado) : "",
    cliente: op.cliente ?? "", observacion: op.observacion ?? "",
  };
}

function OpForm({ opciones, editando, onGuardado, onCancelar, onBorrar }: {
  opciones: Opciones;
  editando: Op | null;
  onGuardado: () => void;
  onCancelar: () => void;
  onBorrar: () => void;
}) {
  const [f, setF] = useState<FormState>(editando ? opAForm(editando) : FORM_VACIO);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));
  // Inputs numéricos: acepta coma o punto decimal, guarda crudo normalizado.
  const setNum = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = normalizarNumeroInput(e.target.value);
    setF((prev) => ({ ...prev, [k]: raw }));
  };

  // Preview de derivados (informativo — la fuente de verdad es el backend).
  const num = (s: string) => {
    const raw = normalizarNumeroInput(s);
    if (raw === "" || raw === "-" || raw === "," || raw === "-,") return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const montoC = num(f.vn) != null && num(f.px_compra) != null
    ? (num(f.vn)! * num(f.px_compra)!) / 100 : null;
  const montoV = num(f.vn) != null && num(f.px_venta) != null
    ? (num(f.vn)! * num(f.px_venta)!) / 100 : null;
  const resultado = montoC != null && montoV != null ? montoV - montoC : num(f.resultado);
  const sinPatas = montoC == null || montoV == null;

  const guardar = async () => {
    setBusy(true); setErr(null);
    try {
      const body = {
        fecha: f.fecha, trader: f.trader, activo: f.activo || null,
        // Un solo VN para las dos patas (siempre se opera el mismo nominal).
        vn_compra: num(f.vn), px_compra: num(f.px_compra),
        vn_venta: num(f.vn), px_venta: num(f.px_venta),
        resultado: sinPatas ? num(f.resultado) : null,
        cliente: f.cliente || null, observacion: f.observacion || null,
      };
      const r = await fetch(editando ? `/api/mesa-dinero/ops/${editando.id}` : "/api/mesa-dinero/ops", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
      onGuardado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">FECHA
          <input type="date" value={f.fecha} onChange={set("fecha")} className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">TRADER
          <select value={f.trader} onChange={set("trader")} className={INPUT}>
            <option value="">— elegir —</option>
            {opciones.traders.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">ACTIVO
          <input value={f.activo}
            onChange={(e) => setF((prev) => ({ ...prev, activo: e.target.value.toUpperCase() }))}
            placeholder="TZXD6…" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">CLIENTE
          <input value={f.cliente} onChange={set("cliente")} placeholder="elegir o tipear nuevo…"
            list="mesa-dinero-clientes" className={INPUT} />
          <datalist id="mesa-dinero-clientes">
            {opciones.clientes.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">VN OPERACIÓN
          <input value={f.vn} onChange={setNum("vn")} inputMode="decimal" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">PX COMPRA
          <input value={f.px_compra} onChange={setNum("px_compra")} inputMode="decimal" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">PX VENTA
          <input value={f.px_venta} onChange={setNum("px_venta")} inputMode="decimal" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">OBSERVACIÓN
          <select value={f.observacion} onChange={set("observacion")} className={INPUT}>
            <option value="">—</option>
            {opciones.observaciones.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        {sinPatas && (
          <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">RESULTADO (sin patas)
            <input value={f.resultado} onChange={setNum("resultado")} inputMode="decimal"
              placeholder="ej. Pase OPS" className={INPUT} />
          </label>
        )}
        <div className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)] justify-end">
          <span>RESULTADO CALC.</span>
          <span className={`text-[11px] font-mono font-semibold ${signClass(resultado)}`}>{fmt2(resultado)}</span>
        </div>
      </div>
      {err && <div className="text-[10px] text-[var(--t-neg)]">{err}</div>}
      <div className="flex items-center gap-2">
        <button onClick={guardar} disabled={busy || !f.trader || !f.fecha}
          className="px-3 py-1 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40">
          {busy ? "…" : editando ? "GUARDAR CAMBIOS" : "REGISTRAR"}
        </button>
        <button onClick={onCancelar}
          className="px-3 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]">
          Cancelar
        </button>
        {editando && (
          <button onClick={onBorrar}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-neg)] text-[var(--t-neg)] hover:bg-[var(--t-neg)] hover:text-white">
            BORRAR
          </button>
        )}
        <span className="text-[9px] text-[var(--t-text-muted)] ml-auto">
          Monto = VN × Px / 100 · Resultado = Venta − Compra · % = Resultado / Monto compra
        </span>
      </div>
    </div>
  );
}

// ── Celda de TC editable (resumen) ─────────────────────────────────────────
function TcCell({ dia, editable, onSet }: { dia: Dia; editable: boolean; onSet: (fecha: string, tc: number) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [v, setV] = useState(aCrudo(dia.tc));
  const [busy, setBusy] = useState(false);
  if (!editable) return <span className="font-mono">{fmt2(dia.tc)}</span>;
  if (!editando) {
    return (
      <button onClick={() => { setV(aCrudo(dia.tc)); setEditando(true); }}
        className="font-mono hover:text-[var(--t-accent)] underline decoration-dotted underline-offset-2"
        title="Editar TC del día (carga manual)">
        {dia.tc != null ? fmt2(dia.tc) : "cargar"}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus value={v} inputMode="decimal"
        onChange={(e) => {
          setV(normalizarNumeroInput(e.target.value));
        }}
        className={`${INPUT} w-20 text-right`}
        onKeyDown={async (e) => {
          if (e.key === "Escape") setEditando(false);
          if (e.key === "Enter") {
            const raw = normalizarNumeroInput(v);
            const n = Number(raw.replace(",", "."));
            if (!Number.isFinite(n) || n <= 0) return;
            setBusy(true);
            try { await onSet(dia.fecha, n); setEditando(false); } finally { setBusy(false); }
          }
        }} />
      {busy && <span className="text-[9px]">…</span>}
    </span>
  );
}

// ── Vista principal ────────────────────────────────────────────────────────
export function MesaDineroView() {
  const [mes, setMes] = usePersistedState<string>("mesaDinero.mes", mesActual());
  const [tab, setTab] = usePersistedState<"operaciones" | "resultados" | "retorno">("mesaDinero.tab", "operaciones");
  const [ops, setOps] = useState<Op[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resultados, setResultados] = useState<Resultados | null>(null);
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [retPeriodo, setRetPeriodo] = usePersistedState<string>("mesaDinero.retPeriodo", "");
  // Cross-filter de la tab: null = sin filtro en esa dimensión. Tocar una fila
  // togglea el filtro de SU dimensión; los demás paneles se recalculan.
  const [fOp, setFOp] = useState<string | null>(null);
  const [fAg, setFAg] = useState<string | null>(null);
  const [fPa, setFPa] = useState<string | null>(null);
  const [fFecha, setFFecha] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<Opciones>({ traders: [], observaciones: [], clientes: [], puede_escribir: false });
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD">("mesaDinero.moneda", "ARS");
  const [filtroTrader, setFiltroTrader] = useState<string>("");
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Op | null>(null);
  const [loading, setLoading] = useState(false);

  const { desde, hasta } = useMemo(() => rangoDeMes(mes), [mes]);

  const cargar = useCallback(() => {
    setLoading(true);
    const qs = `?desde=${desde}&hasta=${hasta}` +
      (filtroTrader ? `&trader=${encodeURIComponent(filtroTrader)}` : "");
    Promise.all([
      getJson<{ operaciones: Op[] }>(`/api/mesa-dinero/ops${qs}`),
      getJson<Resumen>(`/api/mesa-dinero/resumen${qs}`),
      getJson<Resultados>(`/api/mesa-dinero/resultados${qs}`),
    ])
      .then(([o, r, res]) => { setOps(o.operaciones); setResumen(r); setResultados(res); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [desde, hasta, filtroTrader]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    getJson<Opciones>("/api/mesa-dinero/opciones").then(setOpciones).catch(console.error);
  }, []);

  // ACA VALORES RETORNO TOTAL — se carga solo al entrar a la tab / cambiar período.
  // El período (YYYY-MM) es el del archivo Excel importado, independiente del
  // selector de mes de la vista de operaciones.
  useEffect(() => {
    if (tab !== "retorno") return;
    const qs = retPeriodo ? `?periodo=${retPeriodo}` : "";
    getJson<Retorno>(`/api/mesa-dinero/retorno${qs}`)
      .then((r) => { setRetorno(r); if (!retPeriodo && r.periodo) setRetPeriodo(r.periodo); })
      .catch(console.error);
  }, [tab, retPeriodo, setRetPeriodo]);

  // Al cambiar de período se limpian los filtros cruzados.
  useEffect(() => { setFOp(null); setFAg(null); setFPa(null); setFFecha(null); }, [retPeriodo]);

  // Agrupa Σ cash por `campo` sobre un subconjunto de filas.
  const agrupar = useCallback((filas: RetFila[], campo: keyof RetFila): RetGrupo[] => {
    const map = new Map<string, { cash: number; n: number }>();
    for (const f of filas) {
      const k = String(f[campo] ?? "(sin dato)");
      const cur = map.get(k) ?? { cash: 0, n: 0 };
      cur.cash += f.cash; cur.n += 1; map.set(k, cur);
    }
    const total = filas.reduce((s, f) => s + f.cash, 0) || 0;
    return [...map.entries()]
      .map(([clave, v]) => ({ clave, cash: v.cash, n: v.n, share: total ? v.cash / total : 0 }))
      .sort((a, b) => b.cash - a.cash);
  }, []);

  // Cross-filter: cada panel se filtra por las OTRAS dimensiones (no la propia),
  // así siempre podés cambiar la selección dentro de ese panel.
  // El CASH se toma en valor absoluto: no distinguimos compra/venta (el signo
  // solo le importa al fondo, a nosotros nos distorsiona los totales).
  const filas = useMemo(
    () => (retorno?.filas ?? []).map((f) => ({ ...f, cash: Math.abs(f.cash) })),
    [retorno],
  );
  const pasa = (f: RetFila, excl: "op" | "ag" | "pa" | "fe") =>
    (excl === "op" || !fOp || f.operacion === fOp) &&
    (excl === "ag" || !fAg || f.agente === fAg) &&
    (excl === "pa" || !fPa || f.papel === fPa) &&
    (excl === "fe" || !fFecha || f.fecha === fFecha);

  const porOperacion = useMemo(() => agrupar(filas.filter((f) => pasa(f, "op")), "operacion"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, fAg, fPa, fFecha, agrupar]);
  const porAgente = useMemo(() => agrupar(filas.filter((f) => pasa(f, "ag")), "agente"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, fOp, fPa, fFecha, agrupar]);
  const porPapel = useMemo(() => agrupar(filas.filter((f) => pasa(f, "pa")), "papel"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, fOp, fAg, fFecha, agrupar]);
  const porDia = useMemo(() => {
    const grupos = agrupar(filas.filter((f) => pasa(f, "fe")), "fecha");
    return grupos
      .filter((g) => g.clave && g.clave !== "(sin dato)")
      .sort((a, b) => a.clave.localeCompare(b.clave))
      .map((g) => ({ fecha: g.clave, label: fmtFechaCorta(g.clave), valor: g.cash }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, fOp, fAg, fPa, agrupar]);

  // Total del slice actualmente seleccionado (todos los filtros activos).
  const retTotal = useMemo(
    () => filas
      .filter((f) => (!fOp || f.operacion === fOp) && (!fAg || f.agente === fAg)
        && (!fPa || f.papel === fPa) && (!fFecha || f.fecha === fFecha))
      .reduce((s, f) => s + f.cash, 0),
    [filas, fOp, fAg, fPa, fFecha],
  );
  const hayFiltro = fOp != null || fAg != null || fPa != null || fFecha != null;
  const limpiarFiltros = () => { setFOp(null); setFAg(null); setFPa(null); setFFecha(null); };
  const toggle = (cur: string | null, v: string, set: (x: string | null) => void) =>
    set(cur === v ? null : v);

  const borrar = async (op: Op) => {
    if (!window.confirm(`¿Borrar el registro de ${op.activo ?? "—"} del ${fmtFecha(op.fecha)}? Queda auditado.`)) return false;
    await fetch(`/api/mesa-dinero/ops/${op.id}`, { method: "DELETE" });
    cargar();
    return true;
  };

  const setTc = async (fecha: string, tc: number) => {
    const r = await fetch("/api/mesa-dinero/tc", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, tc }),
    });
    if (!r.ok) throw new Error(await r.text());
    cargar();
  };

  const chartData = useMemo(
    () => (resumen?.dias ?? []).map((d) => ({
      fecha: fmtFechaCorta(d.fecha),
      valor: moneda === "ARS" ? d.resultado_ars : (d.resultado_usd ?? 0),
    })),
    [resumen, moneda],
  );

  // Tabla RESULTADO: más reciente arriba. El acumulado se calcula cronológico
  // en el backend; acá solo invertimos para mostrar (el chart sigue viejo→nuevo).
  const diasDesc = useMemo(() => [...(resumen?.dias ?? [])].reverse(), [resumen]);

  const puedeEscribir = opciones.puede_escribir;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">MESA DE DINERO</span>
        <div className="flex gap-1">
          {([["operaciones", "OPERACIONES"], ["resultados", "RESULTADOS"], ["retorno", "ACA VALORES RETORNO TOTAL"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-2 py-0.5 text-[10px] font-semibold border ${
                tab === id
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesActual())} className={INPUT} />
        <select value={filtroTrader} onChange={(e) => setFiltroTrader(e.target.value)}
          className={INPUT} title="Filtrar toda la vista por trader">
          <option value="">Todos los traders</option>
          {opciones.traders.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-[10px] text-[var(--t-text-muted)]">{ops.length} registros</span>
        {puedeEscribir && !formAbierto && tab === "operaciones" && (
          <button onClick={() => { setEditando(null); setFormAbierto(true); }}
            className="px-3 py-1 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)]">
            + NUEVA OPERACIÓN
          </button>
        )}
        <button onClick={cargar} disabled={loading}
          className="ml-auto px-2 py-0.5 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40">
          {loading ? "…" : "↻"}
        </button>
      </div>

      {tab === "operaciones" && (
      <div className="flex-1 min-h-0 grid grid-cols-[55fr_45fr] gap-3 p-3">
        {/* IZQUIERDA: operaciones */}
        <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
          <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
            <span className="text-[11px] font-semibold text-[var(--t-text)]">OPERACIONES</span>
          </div>
          {formAbierto && (
            <OpForm key={editando?.id ?? "nueva"} opciones={opciones} editando={editando}
              onGuardado={() => { setFormAbierto(false); setEditando(null); cargar(); }}
              onCancelar={() => { setFormAbierto(false); setEditando(null); }}
              onBorrar={async () => {
                if (editando && await borrar(editando)) { setFormAbierto(false); setEditando(null); }
              }} />
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            {ops.length === 0 ? (
              <div className="p-3 text-[10px] text-[var(--t-text-muted)]">Sin operaciones en el período.</div>
            ) : (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                    <th className="px-2 py-1">FECHA</th><th>TRADER</th><th>ACTIVO</th><th>LADO</th>
                    <th className="text-right">VN</th><th className="text-right">PX</th>
                    <th className="text-right">MONTO</th><th className="text-right">RESULTADO</th>
                    <th className="text-right">%</th><th className="pl-2">CLIENTE</th><th>OBS</th>
                    {puedeEscribir && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op) => {
                    const conPatas = op.monto_compra != null || op.monto_venta != null;
                    return (
                      <Rows key={op.id} op={op} conPatas={conPatas} puedeEscribir={puedeEscribir}
                        onEditar={() => { setEditando(op); setFormAbierto(true); }} />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* DERECHA: resultado + gráfico */}
        <div className="grid grid-rows-2 gap-3 min-h-0">
          {/* Arriba: resultado diario */}
          <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--t-text)]">RESULTADO</span>
              <span className="text-[9px] text-[var(--t-text-muted)]">Σ de las operaciones · TC manual{puedeEscribir ? " (click para editar)" : ""}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                    <th className="px-2 py-1">FECHA</th>
                    <th className="text-right">RESULTADO EN $</th>
                    <th className="text-right">TC</th>
                    <th className="text-right">RESULTADO EN U$S</th>
                    <th className="text-right pr-2">ACUM $</th>
                  </tr>
                </thead>
                <tbody>
                  {diasDesc.map((d) => (
                    <tr key={d.fecha} className="border-t border-[var(--t-border)]">
                      <td className="px-2 py-0.5 font-mono">{fmtFecha(d.fecha)}</td>
                      <td className={`text-right font-mono ${signClass(d.resultado_ars)}`}>{fmt2(d.resultado_ars)}</td>
                      <td className="text-right">
                        <TcCell dia={d} editable={puedeEscribir} onSet={setTc} />
                      </td>
                      <td className={`text-right font-mono ${signClass(d.resultado_usd)}`}>{fmt2(d.resultado_usd)}</td>
                      <td className="text-right font-mono pr-2 text-[var(--t-text-muted)]">{fmt0(d.acumulado_ars)}</td>
                    </tr>
                  ))}
                </tbody>
                {resumen && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                      <td className="px-2 py-1">TOTAL</td>
                      <td className={`text-right font-mono ${signClass(resumen.total_ars)}`}>{fmt2(resumen.total_ars)}</td>
                      <td></td>
                      <td className={`text-right font-mono ${signClass(resumen.total_usd)}`}>{fmt2(resumen.total_usd)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Abajo: gráfico de barras */}
          <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[var(--t-text)]">RESULTADO POR DÍA</span>
              <div className="ml-auto flex gap-1">
                {(["ARS", "USD"] as const).map((m) => (
                  <button key={m} onClick={() => setMoneda(m)}
                    className={`px-2 py-0.5 text-[10px] font-semibold border ${
                      moneda === m
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                        : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => fmt0(v)} width={70} />
                  <Tooltip
                    formatter={(v) => [fmt2(Number(v)) + (moneda === "USD" ? " U$S" : " $"), "Resultado"]}
                    contentStyle={{ fontSize: 10, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
                  <Bar dataKey="valor">
                    <LabelList dataKey="valor" position="top" fontSize={8} fill="var(--t-text-dim)"
                      formatter={(v) => fmtAbrev(Number(v))} />
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.valor < 0 ? "var(--t-neg)" : "var(--t-pos)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      )}

      {tab === "resultados" && (
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
        {/* IZQUIERDA: resultado por cliente */}
        <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
          <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--t-text)]">RESULTADO POR CLIENTE</span>
            {(resultados?.dias_sin_tc ?? 0) > 0 && (
              <span className="text-[9px] text-[var(--t-warn,orange)]">U$S parcial: {resultados!.dias_sin_tc} día(s) sin TC</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                  <th className="px-2 py-1">CLIENTE</th>
                  <th className="text-right">RESULTADO EN $</th>
                  <th className="text-right pr-2">RESULTADO EN U$S</th>
                </tr>
              </thead>
              <tbody>
                {(resultados?.por_cliente ?? []).map((c) => (
                  <tr key={c.cliente} className="border-t border-[var(--t-border)]">
                    <td className="px-2 py-0.5">{c.cliente}</td>
                    <td className={`text-right font-mono ${signClass(c.resultado_ars)}`}>{fmt2(c.resultado_ars)}</td>
                    <td className={`text-right font-mono pr-2 ${signClass(c.resultado_usd)}`}>{fmt2(c.resultado_usd)}</td>
                  </tr>
                ))}
              </tbody>
              {resultados && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                    <td className="px-2 py-1">TOTAL</td>
                    <td className={`text-right font-mono ${signClass(resultados.total_ars)}`}>{fmt2(resultados.total_ars)}</td>
                    <td className={`text-right font-mono pr-2 ${signClass(resultados.total_usd)}`}>{fmt2(resultados.total_usd)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* DERECHA: por comercial (arriba) + n° de operaciones (abajo), 50/50 */}
        <div className="grid grid-rows-2 gap-3 min-h-0">
          <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
              <span className="text-[11px] font-semibold text-[var(--t-text)]">RESULTADO POR COMERCIAL</span>
              <span className="ml-2 text-[9px] text-[var(--t-text-muted)]">según observación de cada operación</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                    <th className="px-2 py-1">COMERCIAL</th>
                    <th className="text-right">RESULTADO EN $</th>
                    <th className="text-right pr-2">RESULTADO EN U$S</th>
                  </tr>
                </thead>
                <tbody>
                  {(resultados?.por_comercial ?? []).map((c) => (
                    <tr key={c.observacion} className="border-t border-[var(--t-border)]">
                      <td className="px-2 py-0.5">{c.observacion}</td>
                      <td className={`text-right font-mono ${c.n === 0 ? "text-[var(--t-text-muted)]" : signClass(c.resultado_ars)}`}>
                        {c.n === 0 ? "—" : fmt2(c.resultado_ars)}
                      </td>
                      <td className={`text-right font-mono pr-2 ${c.n === 0 ? "text-[var(--t-text-muted)]" : signClass(c.resultado_usd)}`}>
                        {c.n === 0 ? "—" : fmt2(c.resultado_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {resultados && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                      <td className="px-2 py-1">TOTAL</td>
                      <td className={`text-right font-mono ${signClass(resultados.total_ars)}`}>{fmt2(resultados.total_ars)}</td>
                      <td className={`text-right font-mono pr-2 ${signClass(resultados.total_usd)}`}>{fmt2(resultados.total_usd)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
            <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
              <span className="text-[11px] font-semibold text-[var(--t-text)]">N° DE OPERACIONES</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                    <th className="px-2 py-1">COMERCIAL</th>
                    <th className="text-right pr-2">OPERACIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {(resultados?.por_comercial ?? []).map((c) => (
                    <tr key={c.observacion} className="border-t border-[var(--t-border)]">
                      <td className="px-2 py-0.5">{c.observacion}</td>
                      <td className="text-right font-mono pr-2">{c.n}</td>
                    </tr>
                  ))}
                </tbody>
                {resultados && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                      <td className="px-2 py-1">TOTAL</td>
                      <td className="text-right font-mono pr-2">{resultados.n_total}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
      )}

      {tab === "retorno" && (
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
        {/* Toolbar: período + total del slice + chips de filtro activo */}
        <div className="shrink-0 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-[var(--t-text-muted)]">PERÍODO</span>
          <select value={retPeriodo} onChange={(e) => setRetPeriodo(e.target.value)} className={INPUT}
            title="Período del informe Excel importado">
            {(retorno?.periodos ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            {(retorno?.periodos ?? []).length === 0 && <option value="">— sin datos —</option>}
          </select>
          <span className="text-[10px] text-[var(--t-text-muted)]">
            Σ CASH{hayFiltro ? " (filtrado)" : ""}:{" "}
            <span className="font-mono text-[var(--t-text)]">{fmt0(retTotal)}</span>
          </span>
          {([["Op", fOp, setFOp], ["Agente", fAg, setFAg], ["Papel", fPa, setFPa],
             ["Día", fFecha, setFFecha]] as const).map(([lbl, val, set]) =>
            val ? (
              <button key={lbl} onClick={() => set(null)}
                className="px-2 py-0.5 text-[9px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-surface)]"
                title="Quitar este filtro">
                {lbl}: {lbl === "Día" ? fmtFechaCorta(String(val)) : val} ✕
              </button>
            ) : null,
          )}
          {hayFiltro && (
            <button onClick={limpiarFiltros}
              className="px-2 py-0.5 text-[9px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">
              limpiar todo
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
          {/* IZQUIERDA: tabla por operación (arriba) + chart por día (abajo) */}
          <div className="grid grid-rows-2 gap-3 min-h-0">
            <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
              <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                <span className="text-[11px] font-semibold text-[var(--t-text)]">CASH POR OPERACIÓN</span>
                <span className="ml-2 text-[9px] text-[var(--t-text-muted)]">tocá una fila para filtrar</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                      <th className="px-2 py-1">OPERACIÓN</th>
                      <th className="text-right">N°</th>
                      <th className="text-right pr-2">CASH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porOperacion.map((g) => (
                      <tr key={g.clave} onClick={() => toggle(fOp, g.clave, setFOp)}
                        className={`border-t border-[var(--t-border)] cursor-pointer ${
                          fOp === g.clave ? "bg-[var(--t-surface)] text-[var(--t-accent)] font-semibold" : "hover:bg-[var(--t-surface)]"}`}>
                        <td className="px-2 py-0.5">{g.clave}</td>
                        <td className="text-right font-mono text-[var(--t-text-dim)]">{g.n}</td>
                        <td className="text-right font-mono pr-2">{fmt0(g.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                      <td className="px-2 py-1">TOTAL</td>
                      <td></td>
                      <td className="text-right font-mono pr-2">{fmt0(porOperacion.reduce((s, g) => s + g.cash, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
              <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                <span className="text-[11px] font-semibold text-[var(--t-text)]">CASH POR DÍA</span>
                <span className="ml-2 text-[9px] text-[var(--t-text-muted)]">tocá una barra para filtrar por día</span>
              </div>
              <div className="flex-1 min-h-0 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porDia} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => fmtAbrev(v)} width={56} />
                    <Tooltip
                      formatter={(v) => [fmt0(Number(v)), "Cash"]}
                      contentStyle={{ fontSize: 10, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
                    <Bar dataKey="valor" cursor="pointer"
                      onClick={(data) => {
                        const fecha = (data as unknown as { payload?: { fecha?: string } })?.payload?.fecha;
                        if (fecha) toggle(fFecha, fecha, setFFecha);
                      }}>
                      <LabelList dataKey="valor" position="top" fontSize={8} fill="var(--t-text-dim)"
                        formatter={(v) => fmtAbrev(Number(v))} />
                      {porDia.map((d) => (
                        <Cell key={d.fecha}
                          fill={fFecha && fFecha !== d.fecha ? "var(--t-border-2)" : "var(--t-accent)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* DERECHA: por agente + share (arriba) + por papel (abajo) */}
          <div className="grid grid-rows-2 gap-3 min-h-0">
            <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
              <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                <span className="text-[11px] font-semibold text-[var(--t-text)]">CASH POR AGENTE</span>
                <span className="ml-2 text-[9px] text-[var(--t-text-muted)]">tocá una fila para filtrar</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                      <th className="px-2 py-1">AGENTE</th>
                      <th className="text-right">N°</th>
                      <th className="text-right">CASH</th>
                      <th className="text-right pr-2">SHARE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porAgente.map((g) => (
                      <tr key={g.clave} onClick={() => toggle(fAg, g.clave, setFAg)}
                        className={`border-t border-[var(--t-border)] cursor-pointer ${
                          fAg === g.clave ? "bg-[var(--t-surface)] text-[var(--t-accent)] font-semibold" : "hover:bg-[var(--t-surface)]"}`}>
                        <td className="px-2 py-0.5">{g.clave}</td>
                        <td className="text-right font-mono text-[var(--t-text-dim)]">{g.n}</td>
                        <td className="text-right font-mono">{fmt0(g.cash)}</td>
                        <td className="text-right font-mono pr-2 text-[var(--t-accent)]">{fmtPct(g.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                      <td className="px-2 py-1">TOTAL</td>
                      <td></td>
                      <td className="text-right font-mono">{fmt0(porAgente.reduce((s, g) => s + g.cash, 0))}</td>
                      <td className="text-right font-mono pr-2">{porAgente.length ? "100,00%" : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
              <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                <span className="text-[11px] font-semibold text-[var(--t-text)]">CASH POR PAPEL</span>
                <span className="ml-2 text-[9px] text-[var(--t-text-muted)]">tocá una fila para filtrar</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[var(--t-text-muted)] text-left sticky top-0 bg-[var(--t-panel)] z-10">
                      <th className="px-2 py-1">PAPEL</th>
                      <th className="text-right">N°</th>
                      <th className="text-right pr-2">CASH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porPapel.map((g) => (
                      <tr key={g.clave} onClick={() => toggle(fPa, g.clave, setFPa)}
                        className={`border-t border-[var(--t-border)] cursor-pointer ${
                          fPa === g.clave ? "bg-[var(--t-surface)] text-[var(--t-accent)] font-semibold" : "hover:bg-[var(--t-surface)]"}`}>
                        <td className="px-2 py-0.5">{g.clave}</td>
                        <td className="text-right font-mono text-[var(--t-text-dim)]">{g.n}</td>
                        <td className="text-right font-mono pr-2">{fmt0(g.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--t-border-2)] font-semibold sticky bottom-0 bg-[var(--t-surface)]">
                      <td className="px-2 py-1">TOTAL</td>
                      <td></td>
                      <td className="text-right font-mono pr-2">{fmt0(porPapel.reduce((s, g) => s + g.cash, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// Registro = 2 filas (Compra / Venta) con celdas compartidas (rowSpan), como la
// planilla original. Los registros sin patas (Pase OPS) van en una sola fila.
function Rows({ op, conPatas, puedeEscribir, onEditar }: {
  op: Op; conPatas: boolean; puedeEscribir: boolean;
  onEditar: () => void;
}) {
  const span = conPatas ? 2 : 1;
  const acciones = puedeEscribir && (
    <td rowSpan={span} className="text-right pr-2 whitespace-nowrap">
      <button onClick={onEditar} className="text-[9px] text-[var(--t-accent)] hover:underline">editar</button>
    </td>
  );
  return (
    <>
      <tr className="border-t border-[var(--t-border-2)]">
        <td rowSpan={span} className="px-2 py-0.5 font-mono text-[var(--t-text-dim)]">{fmtFecha(op.fecha)}</td>
        <td rowSpan={span}>{op.trader}</td>
        <td rowSpan={span} className="font-mono text-[var(--t-text)]">{op.activo ?? "—"}</td>
        {conPatas ? (
          <>
            <td className="text-[var(--t-text-muted)]">Compra</td>
            <td className="text-right font-mono">{fmt0(op.vn_compra)}</td>
            <td className="text-right font-mono">{fmt2(op.px_compra)}</td>
            <td className="text-right font-mono">{fmt2(op.monto_compra)}</td>
          </>
        ) : (
          <>
            <td className="text-[var(--t-text-muted)]">—</td>
            <td className="text-right font-mono">—</td>
            <td className="text-right font-mono">—</td>
            <td className="text-right font-mono">—</td>
          </>
        )}
        <td rowSpan={span} className={`text-right font-mono font-semibold ${signClass(op.resultado)}`}>{fmt2(op.resultado)}</td>
        <td rowSpan={span} className={`text-right font-mono ${signClass(op.pct)}`}>{fmtPct(op.pct)}</td>
        <td rowSpan={span} className="pl-2">{op.cliente ?? "—"}</td>
        <td rowSpan={span}>{op.observacion ?? "—"}</td>
        {acciones}
      </tr>
      {conPatas && (
        <tr>
          <td className="text-[var(--t-text-muted)]">Venta</td>
          <td className="text-right font-mono">{fmt0(op.vn_venta)}</td>
          <td className="text-right font-mono">{fmt2(op.px_venta)}</td>
          <td className="text-right font-mono">{fmt2(op.monto_venta)}</td>
        </tr>
      )}
    </>
  );
}
