"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/fmt-money";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

// CONTROL COMERCIAL (jefatura) — 3 bloques (ver docs/img_1.png):
//  1) Datos totales ALyC: períodos fijos (no usa Desde/Hasta).
//  2) Datos por operador: usa Desde/Hasta.
//  3) Objetivos: Actual (rango) vs Objetivo + % alcanzado, con editor inline.
// Es vista de jefatura → muestra TODA la mesa (no aplica los filtros madre operador/niveles).

type FilaTotal = {
  periodo: string;
  clientes_activos: number; clientes_activos_pct: number | null;
  volumen: number; volumen_pct: number | null;
  comisiones: number; comisiones_pct: number | null;
};
type FilaOperador = {
  operador_email: string; operador_nombre: string;
  clientes_activos: number; clientes_activos_pct: number | null;
  clientes_inactivos: number;
  volumen: number; volumen_pct: number | null;
  comisiones: number; comisiones_pct: number | null;
};
type FilaObjetivo = {
  operador_email: string; operador_nombre: string;
  volumen_actual: number; volumen_objetivo: number;
  comisiones_actual: number; comisiones_objetivo: number;
  pct_alcanzado: number | null;
};
type Operador = { operador_email: string; operador_nombre: string | null; n_cuentas: number };
type Objetivo = { operador_email: string; mes: number; volumen_objetivo: number | null; comisiones_objetivo: number | null };

const fmtN = (n: number) => Math.round(n).toLocaleString("es-AR");
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// Anchos fijos compartidos por las 3 tablas → la 1ª columna (Período/Comercial) mide
// igual en todas y las columnas de métricas arrancan en el MISMO x (alineadas).
const LABEL_W = 200;
const NUM_W = 120;

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? (await r.json()) as T : null; }
  catch { return null; }
}

// Celda de variación % (verde positivo, rojo negativo, gris sin base).
function Pct({ v }: { v: number | null }) {
  if (v == null) return <td className="px-2 py-1 text-right text-[var(--t-text-muted)]">—</td>;
  return (
    <td className={"px-2 py-1 text-right tabular-nums " + (v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
    </td>
  );
}

// colgroup con 1ª columna ancha fija + N columnas de métrica de ancho fijo.
function ColGroup({ nums }: { nums: number }) {
  return (
    <colgroup>
      <col style={{ width: LABEL_W }} />
      {Array.from({ length: nums }, (_, i) => <col key={i} style={{ width: NUM_W }} />)}
    </colgroup>
  );
}

// Definiciones de KPIs para el panel de ayuda (botón ?).
const KPIS: [string, string][] = [
  ["Clientes Activos", "Cuentas que operaron al menos 1 vez en el período (movimientos de negocio, categorías de volumen)."],
  ["Clientes Inactivos", "Comitentes en estado «Activa» del comercial que NO operaron en el período."],
  ["Volumen", "Suma pesificada de los movimientos de negocio (categorías de volumen). Excluye cash USD (USDL)."],
  ["Comisiones", "Suma de aranceles de operaciones del período (arancel > 0, excluye la etapa «solicitud»)."],
  ["% vs ant.", "Variación contra el período ANTERIOR inmediato de igual largo. En «Totales» es el período fijo equivalente (mes vs mes anterior, etc.); en «Por operador» es el rango [Desde, Hasta] anterior del mismo tamaño. «—» si no hay base de comparación."],
  ["% Alcanzado", "Promedio del avance de Volumen y Comisiones respecto de su objetivo. ≥100% = objetivo cumplido."],
  ["Períodos (Totales)", "Día / Semana / Mes / YTD / 12 Meses / 2025 / 2024 / Total, anclados a la última fecha con operaciones."],
  ["Objetivo", "Suma de los objetivos mensuales (cargados por el jefe) que caen dentro del rango elegido."],
  ["Moneda", "ARS o USD, según el toggle general de la vista."],
];

function AyudaKpis() {
  return (
    <div className="border border-[var(--t-border-2)] bg-[var(--t-surface)] p-3 text-[11px]">
      <div className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] font-semibold mb-2">
        Qué significa cada métrica
      </div>
      <dl className="space-y-1">
        {KPIS.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="font-semibold text-[var(--t-text)] w-[150px] shrink-0">{k}</dt>
            <dd className="text-[var(--t-text-dim)]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ComercialControlView({ moneda = "ARS" }: { moneda?: "ARS" | "USD" }) {
  const hoy = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [desde, setDesde] = useState(iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(iso(hoy));

  const [totales, setTotales] = useState<FilaTotal[]>([]);
  const [porOp, setPorOp] = useState<FilaOperador[]>([]);
  const [objetivos, setObjetivos] = useState<FilaObjetivo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Tabla 1 (no depende de Desde/Hasta, solo moneda).
  useEffect(() => {
    void getJson<{ filas: FilaTotal[] }>(`/api/operaciones/comercial/control/totales?moneda=${moneda}`)
      .then((d) => setTotales(d?.filas ?? []));
  }, [moneda]);

  // Tablas 2 y 3 (Desde/Hasta + moneda).
  const cargarRango = useCallback(async () => {
    if (!desde || !hasta) return;
    setLoading(true);
    const qs = `desde=${desde}&hasta=${hasta}&moneda=${moneda}`;
    const [op, obj] = await Promise.all([
      getJson<{ filas: FilaOperador[] }>(`/api/operaciones/comercial/control/por-operador?${qs}`),
      getJson<{ filas: FilaObjetivo[] }>(`/api/operaciones/comercial/control/objetivos-vs-actual?${qs}`),
    ]);
    setPorOp(op?.filas ?? []);
    setObjetivos(obj?.filas ?? []);
    setLoading(false);
  }, [desde, hasta, moneda]);
  useEffect(() => { void cargarRango(); }, [cargarRango]);

  // Descarga TODO en un solo Excel con 3 hojas (Totales / Por Operador / Objetivos).
  const dlTodo = () => void exportToXlsx({
    filename: `control-comercial-${timestampSuffix()}.xlsx`,
    sheets: [
      { name: "Totales ALyC", rows: totales, columns: [
        { header: "Período", key: "periodo", format: "text", width: 14 },
        { header: "Clientes Activos", key: "clientes_activos", format: "integer", width: 16 },
        { header: "% vs ant.", key: "clientes_activos_pct", format: "percent", width: 12 },
        { header: "Volumen", key: "volumen", format: "currency", width: 18 },
        { header: "% vs ant.", key: "volumen_pct", format: "percent", width: 12 },
        { header: "Comisiones", key: "comisiones", format: "currency", width: 16 },
        { header: "% vs ant.", key: "comisiones_pct", format: "percent", width: 12 },
      ] },
      { name: "Por Operador", rows: porOp, columns: [
        { header: "Comercial", key: "operador_nombre", format: "text", width: 28 },
        { header: "Clientes Activos", key: "clientes_activos", format: "integer", width: 16 },
        { header: "% vs ant.", key: "clientes_activos_pct", format: "percent", width: 12 },
        { header: "Clientes Inactivos", key: "clientes_inactivos", format: "integer", width: 16 },
        { header: "Volumen", key: "volumen", format: "currency", width: 18 },
        { header: "% vs ant.", key: "volumen_pct", format: "percent", width: 12 },
        { header: "Comisiones", key: "comisiones", format: "currency", width: 16 },
        { header: "% vs ant.", key: "comisiones_pct", format: "percent", width: 12 },
      ] },
      { name: "Objetivos", rows: objetivos, columns: [
        { header: "Comercial", key: "operador_nombre", format: "text", width: 28 },
        { header: "Volumen Actual", key: "volumen_actual", format: "currency", width: 18 },
        { header: "Volumen Objetivo", key: "volumen_objetivo", format: "currency", width: 18 },
        { header: "Comisiones Actual", key: "comisiones_actual", format: "currency", width: 18 },
        { header: "Comisiones Objetivo", key: "comisiones_objetivo", format: "currency", width: 18 },
        { header: "% Alcanzado", key: "pct_alcanzado", format: "percent", width: 12 },
      ] },
    ],
  });

  const barBtn = (active: boolean) =>
    "px-2 py-0.5 text-[10px] font-semibold border " +
    (active
      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
      : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]");

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Header: Desde/Hasta (afecta Tablas 2 y 3; la 1 es fija) + acciones (editar/ayuda/xlsx) */}
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] font-semibold mr-2">Control Comercial</span>
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Desde</span>
        <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Hasta</span>
        <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        <span className="text-[9px] text-[var(--t-text-muted)]">({moneda}) · afecta &laquo;Por operador&raquo; y &laquo;Objetivos&raquo;; la tabla de totales es fija</span>
        {loading && <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>}

        {/* Acciones a la derecha */}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setEditorOpen((o) => !o)} className={barBtn(editorOpen)}>
            {editorOpen ? "▼" : "▶"} Editar objetivos
          </button>
          <button type="button" onClick={() => setHelpOpen((o) => !o)} title="Qué significa cada métrica"
            className={barBtn(helpOpen) + " w-6 text-center"}>
            ?
          </button>
          <button type="button" onClick={dlTodo} title="Descargar las 3 tablas en un Excel (3 hojas)"
            className={barBtn(false)}>
            ⬇ XLSX
          </button>
        </div>
      </div>

      {/* Panel de ayuda (toggle ?) */}
      {helpOpen && <AyudaKpis />}

      {/* Editor de objetivos (toggle desde la barra) */}
      {editorOpen && <EditorObjetivos onSaved={cargarRango} />}

      {/* ── Tabla 1: Datos totales ALyC ── */}
      <Bloque titulo="Datos totales ALyC">
        <table className="w-full table-fixed text-[11px] tabular-nums">
          <ColGroup nums={6} />
          <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
            <tr><Th l>Período</Th><Th>Clientes Activos</Th><Th>% vs ant.</Th><Th>Volumen</Th><Th>% vs ant.</Th><Th>Comisiones</Th><Th>% vs ant.</Th></tr>
          </thead>
          <tbody>
            {totales.map((r) => (
              <tr key={r.periodo} className="border-t border-[var(--t-border)]">
                <td className="px-2 py-1 text-[var(--t-text)]">{r.periodo}</td>
                <td className="px-2 py-1 text-right">{fmtN(r.clientes_activos)}</td>
                <Pct v={r.clientes_activos_pct} />
                <td className="px-2 py-1 text-right font-semibold text-[var(--t-accent)]">{fmtMoney(r.volumen)}</td>
                <Pct v={r.volumen_pct} />
                <td className="px-2 py-1 text-right text-[#9fb8d0]">{fmtMoney(r.comisiones)}</td>
                <Pct v={r.comisiones_pct} />
              </tr>
            ))}
            {!totales.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-[var(--t-text-muted)]">sin datos</td></tr>}
          </tbody>
        </table>
      </Bloque>

      {/* ── Tabla 2: Datos por operador ── */}
      <Bloque titulo="Datos por operador">
        <table className="w-full table-fixed text-[11px] tabular-nums">
          <ColGroup nums={7} />
          <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
            <tr><Th l>Comercial</Th><Th>Clientes Activos</Th><Th>% vs ant.</Th><Th>Clientes Inactivos</Th><Th>Volumen</Th><Th>% vs ant.</Th><Th>Comisiones</Th><Th>% vs ant.</Th></tr>
          </thead>
          <tbody>
            {porOp.map((r) => (
              <tr key={r.operador_email} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                <td className="px-2 py-1 truncate" title={r.operador_nombre}>{r.operador_nombre}</td>
                <td className="px-2 py-1 text-right">{fmtN(r.clientes_activos)}</td>
                <Pct v={r.clientes_activos_pct} />
                <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmtN(r.clientes_inactivos)}</td>
                <td className="px-2 py-1 text-right font-semibold text-[var(--t-accent)]">{fmtMoney(r.volumen)}</td>
                <Pct v={r.volumen_pct} />
                <td className="px-2 py-1 text-right text-[#9fb8d0]">{fmtMoney(r.comisiones)}</td>
                <Pct v={r.comisiones_pct} />
              </tr>
            ))}
            {!porOp.length && <tr><td colSpan={8} className="px-2 py-3 text-center text-[var(--t-text-muted)]">sin datos en el rango</td></tr>}
          </tbody>
        </table>
      </Bloque>

      {/* ── Tabla 3: Objetivos comerciales ── */}
      <Bloque titulo="Objetivos comerciales">
        <table className="w-full table-fixed text-[11px] tabular-nums">
          <ColGroup nums={5} />
          <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
            <tr><Th l>Comercial</Th><Th>Volumen Actual</Th><Th>Volumen Objetivo</Th><Th>Comisiones Actual</Th><Th>Comisiones Objetivo</Th><Th>% Alcanzado</Th></tr>
          </thead>
          <tbody>
            {objetivos.map((r) => (
              <tr key={r.operador_email} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                <td className="px-2 py-1 truncate" title={r.operador_nombre}>{r.operador_nombre}</td>
                <td className="px-2 py-1 text-right font-semibold text-[var(--t-accent)]">{fmtMoney(r.volumen_actual)}</td>
                <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{r.volumen_objetivo ? fmtMoney(r.volumen_objetivo) : "—"}</td>
                <td className="px-2 py-1 text-right text-[#9fb8d0]">{fmtMoney(r.comisiones_actual)}</td>
                <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{r.comisiones_objetivo ? fmtMoney(r.comisiones_objetivo) : "—"}</td>
                <td className={"px-2 py-1 text-right font-semibold " + (r.pct_alcanzado == null ? "text-[var(--t-text-muted)]" : r.pct_alcanzado >= 100 ? "text-[var(--t-pos)]" : "text-[var(--t-text)]")}>
                  {r.pct_alcanzado == null ? "—" : `${r.pct_alcanzado.toFixed(0)}%`}
                </td>
              </tr>
            ))}
            {!objetivos.length && <tr><td colSpan={6} className="px-2 py-3 text-center text-[var(--t-text-muted)]">sin datos</td></tr>}
          </tbody>
        </table>
      </Bloque>
    </div>
  );
}

function Th({ children, l }: { children: React.ReactNode; l?: boolean }) {
  return <th className={"px-2 py-1.5 " + (l ? "text-left" : "text-right")}>{children}</th>;
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--t-border)] overflow-hidden">
      <div className="px-3 py-1.5 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold">{titulo}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

// Editor: el jefe carga el objetivo mensual (volumen + comisiones) por comercial → PATCH SQL.
// Controlado desde la barra superior (se monta solo cuando está abierto).
function EditorObjetivos({ onSaved }: { onSaved: () => void }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [objetivos, setObjetivos] = useState<Objetivo[]>([]);
  const [draft, setDraft] = useState<Record<string, { vol: string; com: string }>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);

  useEffect(() => {
    void getJson<Operador[]>("/api/operaciones/comercial/operadores").then((d) => setOperadores(d ?? []));
  }, []);

  const recargarObjetivos = useCallback(() => {
    void getJson<{ objetivos: Objetivo[] }>(`/api/operaciones/comercial/control/objetivos?anio=${anio}`)
      .then((d) => setObjetivos(d?.objetivos ?? []));
  }, [anio]);
  useEffect(() => { recargarObjetivos(); }, [recargarObjetivos]);

  // Prefill de los inputs con el objetivo del (anio, mes) elegido.
  const objMesActual = useMemo(() => {
    const m: Record<string, Objetivo> = {};
    for (const o of objetivos) if (o.mes === mes) m[o.operador_email] = o;
    return m;
  }, [objetivos, mes]);

  const getDraft = (email: string) => draft[email] ?? {
    vol: objMesActual[email]?.volumen_objetivo != null ? String(objMesActual[email].volumen_objetivo) : "",
    com: objMesActual[email]?.comisiones_objetivo != null ? String(objMesActual[email].comisiones_objetivo) : "",
  };

  const guardar = async (email: string) => {
    const d = getDraft(email);
    setSavingRow(email);
    try {
      await fetch("/api/operaciones/comercial/control/objetivos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operador_email: email, anio, mes,
          volumen_objetivo: d.vol.trim() === "" ? null : Number(d.vol),
          comisiones_objetivo: d.com.trim() === "" ? null : Number(d.com),
        }),
      });
      setDraft((p) => { const n = { ...p }; delete n[email]; return n; });
      recargarObjetivos();
      onSaved();
    } finally {
      setSavingRow(null);
    }
  };

  return (
    <div className="border border-[var(--t-border-2)] bg-[var(--t-surface)] p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] font-semibold mr-2">Editar objetivos</span>
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Año</span>
        <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))}
          className="w-[80px] bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 font-mono text-[var(--t-text)] outline-none" />
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Mes</span>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]">
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <span className="text-[9px] text-[var(--t-text-muted)]">cargá el objetivo mensual por comercial; la tabla de arriba suma por el rango elegido</span>
      </div>
      <table className="w-full text-[11px] tabular-nums">
        <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
          <tr><Th l>Comercial</Th><Th>Volumen Objetivo</Th><Th>Comisiones Objetivo</Th><Th> </Th></tr>
        </thead>
        <tbody>
          {operadores.map((o) => {
            const d = getDraft(o.operador_email);
            return (
              <tr key={o.operador_email} className="border-t border-[var(--t-border)]">
                <td className="px-2 py-1 truncate max-w-[220px]" title={o.operador_nombre ?? o.operador_email}>{o.operador_nombre || o.operador_email}</td>
                <td className="px-2 py-1 text-right">
                  <input type="number" value={d.vol}
                    onChange={(e) => setDraft((p) => ({ ...p, [o.operador_email]: { ...getDraft(o.operador_email), vol: e.target.value } }))}
                    className="w-[130px] bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-right font-mono text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]" />
                </td>
                <td className="px-2 py-1 text-right">
                  <input type="number" value={d.com}
                    onChange={(e) => setDraft((p) => ({ ...p, [o.operador_email]: { ...getDraft(o.operador_email), com: e.target.value } }))}
                    className="w-[130px] bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-right font-mono text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]" />
                </td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => guardar(o.operador_email)} disabled={savingRow === o.operador_email}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40">
                    {savingRow === o.operador_email ? "…" : "guardar"}
                  </button>
                </td>
              </tr>
            );
          })}
          {!operadores.length && <tr><td colSpan={4} className="px-2 py-3 text-center text-[var(--t-text-muted)]">cargando operadores…</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
