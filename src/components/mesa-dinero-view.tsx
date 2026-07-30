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

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// Inputs numéricos es-AR: estado guarda el crudo ("1234567,89"), se muestra
// con separador de miles ("1.234.567,89") mientras se tipea.
const desformatear = (s: string) => s.replace(/\./g, "");
const conMiles = (s: string) => {
  if (!s) return "";
  const neg = s.startsWith("-");
  const [int, dec] = (neg ? s.slice(1) : s).split(",");
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + (dec !== undefined ? `${intF},${dec}` : intF);
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
  // Inputs numéricos: acepta dígitos + coma decimal, guarda crudo, muestra con miles.
  const setNum = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = desformatear(e.target.value);
    if (raw !== "" && !/^-?\d*(,\d*)?$/.test(raw)) return;
    setF((prev) => ({ ...prev, [k]: raw }));
  };

  // Preview de derivados (informativo — la fuente de verdad es el backend).
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
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
          <input value={conMiles(f.vn)} onChange={setNum("vn")} inputMode="decimal" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">PX COMPRA
          <input value={conMiles(f.px_compra)} onChange={setNum("px_compra")} inputMode="decimal" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">PX VENTA
          <input value={conMiles(f.px_venta)} onChange={setNum("px_venta")} inputMode="decimal" className={INPUT} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">OBSERVACIÓN
          <select value={f.observacion} onChange={set("observacion")} className={INPUT}>
            <option value="">—</option>
            {opciones.observaciones.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        {sinPatas && (
          <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)]">RESULTADO (sin patas)
            <input value={conMiles(f.resultado)} onChange={setNum("resultado")} inputMode="decimal"
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
      <input autoFocus value={conMiles(v)} inputMode="decimal"
        onChange={(e) => {
          const raw = desformatear(e.target.value);
          if (raw !== "" && !/^\d*(,\d*)?$/.test(raw)) return;
          setV(raw);
        }}
        className={`${INPUT} w-20 text-right`}
        onKeyDown={async (e) => {
          if (e.key === "Escape") setEditando(false);
          if (e.key === "Enter") {
            const n = Number(v.replace(",", "."));
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
  const [tab, setTab] = usePersistedState<"operaciones" | "resultados">("mesaDinero.tab", "operaciones");
  const [ops, setOps] = useState<Op[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resultados, setResultados] = useState<Resultados | null>(null);
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
          {([["operaciones", "OPERACIONES"], ["resultados", "RESULTADOS"]] as const).map(([id, label]) => (
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
                    <LabelList dataKey="valor" position="top" fontSize={8} fill="var(--t-text-muted)"
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
