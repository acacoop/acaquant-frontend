"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { fetchJson } from "@/lib/fetch-json";
import { exportToXlsx } from "@/lib/xlsx-export";

/**
 * Back Office → CONTABILIDAD. Resultado MENSUAL por título de las cuentas
 * propias: TENENCIA (lo que rindió lo que ya se tenía, por la cadena de la
 * planilla) + INTERMEDIACIÓN (la SUMATORIA de los boletos: compra negativa,
 * venta positiva) — y nada más. NO HAY RENTAS: cupones, dividendos y
 * amortizaciones no entran al informe (regla del back office, 2026-09-02); el
 * canal se sacó entero del backend, no es que esté escondido acá.
 *
 * ⚠️ Lo que se compró y NO se vendió no es resultado del mes: su valuación
 * final no entra en ninguna columna de resultado — es el saldo inicial del mes
 * siguiente. Las columnas VALUACIÓN llevan el mes en el encabezado justamente
 * para que se lea cuál es la foto inicial y cuál la final.
 *
 * TODO lo calcula el backend (`/api/back-office/contabilidad/*`): acá no se
 * deriva ni se suma nada — los totales viajan en la respuesta. La fila marca
 * su CUADRE de nominales (fin − ini − Δ boletos): ⚠ = faltan boletos o hubo
 * un evento corporativo, o sea que su intermediación no es confiable.
 * Click en una fila → los boletos del mes que componen el número (mismo
 * insumo del resumen, no otra query).
 *
 * Las cuentas del proceso las gestiona el equipo desde la propia vista
 * (patrón Interbanking/Tesorería): el permiso real lo aplica el backend
 * (allowlist de Tesorería + admin) — acá el botón se muestra siempre y un 403
 * se informa, no se esconde.
 */

type CuentaRow = { id_cuenta: string; etiqueta: string | null };
type TituloRow = {
  titulo: string; key: string; unidades: string[];
  qty_ini: number; qty_fin: number; v_ini: number; v_fin: number;
  px_ini: number | null; px_fin: number | null;
  compras: number; ventas: number;
  // La cadena del RxT, tal cual la planilla del back office:
  // G no entran = fin − ini · H mantenida = min(ini, fin) · I monto ini =
  // H×(D/C) · J monto fin = H×(F/E) · K rxt = J − I · L variación = K/I.
  no_entran_rxt: number; tenencia_mantenida: number;
  monto_rxt_ini: number; monto_rxt_fin: number; variacion_rxt: number | null;
  // La tenencia tiene DOS partes: lo mantenido (la cadena de arriba) y —si la
  // posición creció— lo comprado y retenido, a valor de cierre menos su costo.
  rxt_mantenida: number; rxt_nueva: number;
  qty_entraron: number; qty_salieron: number;
  costo_nuevo: number; costo_salida: number;
  // Los manda el backend YA calculados: la vista no deriva ni un número.
  valor_nuevo: number; neto_boletos: number;
  rxt: number; intermediacion: number; total: number;
  estado: "alta" | "baja" | "sin_operar" | "operado";
  n_boletos: number; cuadre_nominales: number; cuadra: boolean;
  mep_faltantes: number;
};
type Resumen = {
  id_cuenta: string; mes: string;
  cierre_ini: { fecha_objetivo: string; fecha_usada: string | null };
  cierre_fin: { fecha_objetivo: string; fecha_usada: string | null };
  titulos: TituloRow[];
  altas: TituloRow[];
  // Filas cuyos boletos NO explican los nominales del cierre: la TENENCIA
  // manda, así que se muestran aparte y no suman al total del mes.
  sin_conciliar: TituloRow[];
  ignorados: Record<string, number>;
  totales: {
    v_ini: number; v_fin: number; compras: number; ventas: number;
    rxt: number; intermediacion: number; total: number;
    descuadres: number; sin_conciliar_total: number; mep_faltantes: number;
  };
  n_boletos: number;
};
type Boleto = {
  fecha: string; categoria: string | null; op: string; cantidad: number | null;
  importe: number | null; moneda: string | null;
  mep: number | null; comprobante: string; importe_ars: number;
  sin_mep: boolean; direccion: "compra" | "venta" | "otro";
  nominales_acum: number; pnl_acum: number;
};

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";
const TH = "px-2 py-1 text-center text-[10px] uppercase tracking-wide text-[var(--t-text-dim)] font-normal whitespace-nowrap";
const TD = "px-2 py-1 text-center whitespace-nowrap tabular-nums";
// TÍTULO: a la izquierda y encogida al contenido (`w-px` en una tabla
// `w-full`), así el ancho sobrante se lo reparten los números.
const TH_TIT = "px-2 py-1 text-left w-px text-[10px] uppercase tracking-wide text-[var(--t-text-dim)] font-normal whitespace-nowrap";
const TD_TIT = "px-2 py-1 text-left w-px";
/** El título largo se corta acá y el completo va al tooltip. */
const TIT_MAX = "max-w-[13rem] truncate min-w-0";
/** Cierra un grupo de columnas (nominales · valuación · compras+ventas). */
const SEP = "border-r border-[var(--t-border-2)]";
const ACUM = "bg-[var(--t-accent)]/10";
const BTN = "text-[11px] uppercase tracking-wide px-2 py-1 border border-[var(--t-border)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]";

const fmt$ = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("es-AR");
const fmtNom = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fmtFecha = (s: string | null | undefined) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return d ? `${d}/${m}/${y.slice(2)}` : s;
};
const neg = (v: number) => (v < 0 ? "text-[var(--t-neg,#f87171)]" : "");

type EstadoTitulo = TituloRow["estado"];
type Orden = { col: keyof TituloRow; dir: "asc" | "desc" } | null;
const ESTADOS: { v: EstadoTitulo; label: string }[] = [
  { v: "operado", label: "Operado" }, { v: "sin_operar", label: "Sin operar" },
  { v: "alta", label: "Alta" }, { v: "baja", label: "Baja" },
];
/** "2026-07-31" → "07/26". Rótulo de las columnas de foto.
 *
 * Toma la fecha de cierre QUE MANDA EL BACKEND (`cierre_ini`/`cierre_fin`), no
 * la calcula: cuál es el mes inicial es una decisión del modelo contable (hoy
 * el último hábil del mes anterior) y derivarla acá sería una segunda copia de
 * esa regla, que el día que cambie va a quedar desincronizada en silencio —
 * REGLA #9. El front rotula lo que el backend dice que usó. */
const mmaaDe = (fecha: string | null | undefined) =>
  fecha ? `${fecha.slice(5, 7)}/${fecha.slice(2, 4)}` : "";

function mesPasado(): string {
  const hoy = new Date();
  const y = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();
  const m = hoy.getMonth() === 0 ? 12 : hoy.getMonth();
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function ContabilidadView() {
  const [cuentas, setCuentas] = useState<CuentaRow[]>([]);
  const [cuenta, setCuenta] = usePersistedState<string>("contabilidad.cuenta", "");
  const [mes, setMes] = usePersistedState<string>("contabilidad.mes", mesPasado());
  const [data, setData] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalleKey, setDetalleKey] = useState<TituloRow | null>(null);
  const [gestionar, setGestionar] = useState(false);
  // ESTADO dejó de ser columna (repetía el mismo valor en decenas de filas) y
  // pasó a ser FILTRO. `null` = todos.
  const [filtroEstado, setFiltroEstado] = usePersistedState<EstadoTitulo | "">("contabilidad.estado", "");
  // Orden por columna: desc → asc → sin orden (vuelve al del backend, por
  // impacto). Es estado de PANTALLA: no recalcula ni deriva ningún número.
  const [orden, setOrden] = useState<Orden>(null);

  const cargarCuentas = useCallback(async () => {
    try {
      const r = await fetchJson<{ cuentas: CuentaRow[] }>("/api/back-office/contabilidad/cuentas");
      setCuentas(r.cuentas);
      return r.cuentas;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetchJson<{ cuentas: CuentaRow[] }>("/api/back-office/contabilidad/cuentas")
      .then((r) => {
        if (!vivo) return;
        setCuentas(r.cuentas);
        // Si la cuenta persistida ya no está en el proceso, caer a la primera.
        setCuenta((prev) =>
          r.cuentas.length && !r.cuentas.some((c) => c.id_cuenta === prev)
            ? r.cuentas[0].id_cuenta : prev);
      })
      .catch(() => { /* sin lista: la barra muestra "sin cuentas" */ });
    return () => { vivo = false; };
  }, [setCuenta]);

  useEffect(() => {
    if (!cuenta || !/^\d{4}-\d{2}$/.test(mes)) return;
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) { setLoading(true); setError(null); } });
    fetchJson<Resumen>(
      `/api/back-office/contabilidad/resumen?id_cuenta=${encodeURIComponent(cuenta)}&mes=${mes}`)
      .then((r) => { if (vivo) { setData(r); setError(null); } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [cuenta, mes]);

  // Nunca dibujar el resumen de OTRA (cuenta, mes) que la elegida: si el fetch
  // nuevo todavía no volvió, se muestra "Calculando…" en vez de data vieja.
  const vigente = data && data.id_cuenta === cuenta && data.mes === mes ? data : null;
  const tot = vigente?.totales;
  const cierreRaro = vigente && (
    !vigente.cierre_ini.fecha_usada || !vigente.cierre_fin.fecha_usada ||
    vigente.cierre_ini.fecha_usada !== vigente.cierre_ini.fecha_objetivo ||
    vigente.cierre_fin.fecha_usada !== vigente.cierre_fin.fecha_objetivo);

  // Filtrar y ordenar es PRESENTACIÓN: no se calcula ni se suma nada — los
  // totales del pie siguen siendo los que manda el backend, y por eso cuando
  // hay un filtro activo la fila se rotula «TOTAL DE LA CUENTA»: mostrar el
  // total de todo debajo de un subconjunto, sin decirlo, sería mentir.
  const filas = useMemo(() => {
    let f = vigente?.titulos ?? [];
    if (filtroEstado) f = f.filter((t) => t.estado === filtroEstado);
    if (orden) {
      const { col, dir } = orden;
      f = [...f].sort((a, b) => {
        const va = a[col], vb = b[col];
        const cmp = typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb, "es")
          : Number(va ?? 0) - Number(vb ?? 0);
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return f;
  }, [vigente, filtroEstado, orden]);

  const exportar = () => {
    if (!vigente) return;
    void exportToXlsx({
      filename: `contabilidad-${vigente.id_cuenta}-${vigente.mes}.xlsx`,
      sheets: [{
        name: "Resultado",
        title: `Cuenta ${vigente.id_cuenta} · ${vigente.mes} · cierres ${vigente.cierre_ini.fecha_usada ?? "—"} → ${vigente.cierre_fin.fecha_usada ?? "—"}`,
        rows: filas,
        columns: [
          { header: "Título", key: "titulo", format: "text", width: 16 },
          { header: `Nominales ${mmaaDe(vigente.cierre_ini.fecha_objetivo)}`, key: "qty_ini", format: "number" },
          { header: `Nominales ${mmaaDe(vigente.cierre_fin.fecha_objetivo)}`, key: "qty_fin", format: "number" },
          { header: `Valuación ${mmaaDe(vigente.cierre_ini.fecha_objetivo)}`, key: "v_ini", format: "number", width: 18 },
          { header: `Valuación ${mmaaDe(vigente.cierre_fin.fecha_objetivo)}`, key: "v_fin", format: "number", width: 18 },
          { header: "Compras", key: "compras", format: "number", width: 16 },
          { header: "Ventas", key: "ventas", format: "number", width: 16 },
          { header: "No entran en RxT", key: "no_entran_rxt", format: "number", width: 16 },
          { header: "Misma tenencia mantenida", key: "tenencia_mantenida", format: "number", width: 22 },
          { header: `Monto RxT ${mmaaDe(vigente.cierre_ini.fecha_objetivo)}`, key: "monto_rxt_ini", format: "number", width: 18 },
          { header: `Monto RxT ${mmaaDe(vigente.cierre_fin.fecha_objetivo)}`, key: "monto_rxt_fin", format: "number", width: 18 },
          { header: "Tenencia (RxT)", key: "rxt", format: "number", width: 16 },
          { header: "Intermediación", key: "intermediacion", format: "number", width: 16 },
          { header: "Total", key: "total", format: "number", width: 16 },
          { header: "Estado", key: "estado", format: "text" },
          { header: "Cuadre nominales", key: "cuadre_nominales", format: "number" },
        ],
      }, {
        name: "Sin conciliar",
        title: "La tenencia manda: los boletos no explican los nominales del cierre — no suman al total",
        rows: vigente.sin_conciliar,
        columns: [
          { header: "Título", key: "titulo", format: "text", width: 16 },
          { header: `Nominales ${mmaaDe(vigente.cierre_ini.fecha_objetivo)}`, key: "qty_ini", format: "number" },
          { header: `Nominales ${mmaaDe(vigente.cierre_fin.fecha_objetivo)}`, key: "qty_fin", format: "number" },
          { header: "Nominales sin explicar", key: "cuadre_nominales", format: "number" },
          { header: "Compras", key: "compras", format: "number", width: 16 },
          { header: "Ventas", key: "ventas", format: "number", width: 16 },
          { header: "Total (no suma)", key: "total", format: "number", width: 16 },
        ],
      }, {
        name: "Altas del período",
        title: "Comprado para dejar en cartera — su resultado entra al mes siguiente",
        rows: vigente.altas,
        columns: [
          { header: "Título", key: "titulo", format: "text", width: 16 },
          { header: "Nominales comprados", key: "qty_fin", format: "number" },
          { header: "Invertido", key: "compras", format: "number", width: 16 },
          { header: "Valuación al cierre", key: "v_fin", format: "number", width: 16 },
        ],
      }],
    });
  };

  return (
    <div className="h-full min-h-0 flex flex-col text-xs">
      <div className={HDR}>
        <span className="text-[11px] uppercase tracking-wide text-[var(--t-text-dim)]">Cuenta</span>
        {cuentas.map((c) => (
          <button key={c.id_cuenta} onClick={() => setCuenta(c.id_cuenta)}
            className={`${BTN} ${cuenta === c.id_cuenta ? "border-[var(--t-accent)] text-[var(--t-accent)]" : ""}`}
            title={c.etiqueta ?? undefined}>
            {c.id_cuenta}
          </button>
        ))}
        {!cuentas.length && (
          <span className="text-[var(--t-text-dim)]">sin cuentas — agregalas con GESTIONAR</span>
        )}
        <span className="ml-2 text-[11px] uppercase tracking-wide text-[var(--t-text-dim)]">Mes</span>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
          className="w-[6.75rem] bg-[var(--t-panel)] border border-[var(--t-border)] px-1.5 py-0.5 text-xs" />
        {vigente && (
          <>
            <span className="ml-2 text-[11px] uppercase tracking-wide text-[var(--t-text-dim)]">Estado</span>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoTitulo | "")}
              className="bg-[var(--t-panel)] border border-[var(--t-border)] px-1.5 py-0.5 text-xs">
              <option value="">Todos</option>
              {ESTADOS.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
            </select>
            <span className="w-px self-stretch bg-[var(--t-border)] mx-1" />
            <Kpi label="Tenencia (RxT)" v={tot!.rxt} />
            <Kpi label="Intermediación" v={tot!.intermediacion} />
            <Kpi label="Total del mes" v={tot!.total} fuerte />
            {tot!.descuadres > 0 && (
              <span className="text-[10px] uppercase tracking-wide"
                title="Títulos cuyos boletos no explican los nominales del cierre. La tenencia manda: se listan abajo y NO suman al total.">
                ⚠ {tot!.descuadres} sin conciliar · {fmt$(tot!.sin_conciliar_total)} afuera
              </span>
            )}
            {tot!.mep_faltantes > 0 && (
              <span className="text-[10px] uppercase tracking-wide">⚠ {tot!.mep_faltantes} sin MEP</span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {vigente && <button className={BTN} onClick={exportar}>Descargar</button>}
          <button className={BTN} onClick={() => setGestionar(true)}>Gestionar cuentas</button>
        </div>
      </div>
      {cierreRaro && vigente && (
        <div className="px-3 py-1 text-[11px] text-[var(--t-text)] border-b border-[var(--t-border)] shrink-0">
          El cierre usado no es el último hábil del mes (falta el snapshot de ese día en la tenencia):
          objetivo {fmtFecha(vigente.cierre_ini.fecha_objetivo)} → usado {fmtFecha(vigente.cierre_ini.fecha_usada)} ·
          objetivo {fmtFecha(vigente.cierre_fin.fecha_objetivo)} → usado {fmtFecha(vigente.cierre_fin.fecha_usada)}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto bg-[var(--t-panel)]">
        {loading && <div className="p-4 text-[var(--t-text-dim)]">Calculando…</div>}
        {error && <div className="p-4 text-[var(--t-neg,#f87171)]">Error: {error}</div>}
        {!loading && !error && vigente && !filas.length && !vigente.sin_conciliar.length && (
          <div className="p-4 text-[var(--t-text-dim)]">
            {filtroEstado ? "Ningún título con ese estado en el período."
                          : "Sin títulos ni boletos en el período."}
          </div>
        )}
        {!loading && !error && vigente && (filas.length > 0 || vigente.sin_conciliar.length > 0) && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] shadow-[0_1px_0_var(--t-border)]">
              <tr>
                <Th col="titulo" orden={orden} set={setOrden} tit sep>Título</Th>
                <Th col="qty_ini" orden={orden} set={setOrden}>Nominales {mmaaDe(vigente.cierre_ini.fecha_objetivo)}</Th>
                <Th col="qty_fin" orden={orden} set={setOrden}>Nominales {mmaaDe(vigente.cierre_fin.fecha_objetivo)}</Th>
                <Th col="no_entran_rxt" orden={orden} set={setOrden}>No entran en RxT</Th>
                <Th col="tenencia_mantenida" orden={orden} set={setOrden} sep>Misma tenencia mantenida</Th>
                <Th col="v_ini" orden={orden} set={setOrden}>Valuación {mmaaDe(vigente.cierre_ini.fecha_objetivo)}</Th>
                <Th col="v_fin" orden={orden} set={setOrden} sep>Valuación {mmaaDe(vigente.cierre_fin.fecha_objetivo)}</Th>
                <Th col="rxt" orden={orden} set={setOrden}>Tenencia (RxT)</Th>
                <Th col="intermediacion" orden={orden} set={setOrden}>Intermediación</Th>
                <Th col="total" orden={orden} set={setOrden}>Total {mmaaDe(vigente.cierre_fin.fecha_objetivo)}</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => <FilaTitulo key={t.key} t={t} onClick={() => setDetalleKey(t)} />)}
              {/* El TOTAL va adentro del tbody y no en un tfoot: el navegador
                  dibuja tfoot al final de la tabla, y el bloque SIN CONCILIAR
                  tiene que quedar DEBAJO del total, no arriba. */}
              <tr className="border-t-2 border-[var(--t-border)] font-medium bg-[var(--t-accent)]/5">
                <td className={`${TD_TIT} ${SEP}`}>{filtroEstado ? "TOTAL DE LA CUENTA" : "TOTAL"}</td>
                <td className={`${TD} ${SEP}`} colSpan={4} />
                <td className={TD}>{fmt$(tot!.v_ini)}</td>
                <td className={`${TD} ${SEP}`}>{fmt$(tot!.v_fin)}</td>
                <td className={`${TD} ${neg(tot!.rxt)}`}>{fmt$(tot!.rxt)}</td>
                <td className={`${TD} ${neg(tot!.intermediacion)}`}>{fmt$(tot!.intermediacion)}</td>
                <td className={`${TD} ${neg(tot!.total)}`}>{fmt$(tot!.total)}</td>
              </tr>
            </tbody>
            {/* PARTIDAS SIN CONCILIAR: la tenencia manda. Se ven con las mismas
                columnas, pero afuera del total — el número de arriba es solo lo
                que la foto respalda. */}
            {vigente.sin_conciliar.length > 0 && (
              <tbody>
                <tr>
                  <td colSpan={10} className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
                    ⚠ Sin conciliar · {vigente.sin_conciliar.length} · los boletos no explican los
                    nominales del cierre — la tenencia manda y estas filas NO suman al total
                    ({fmt$(tot!.sin_conciliar_total)} afuera)
                  </td>
                </tr>
                {vigente.sin_conciliar.map((t) => (
                  <FilaTitulo key={t.key} t={t} onClick={() => setDetalleKey(t)} apagada />
                ))}
              </tbody>
            )}
          </table>
        )}
      </div>

      {detalleKey && vigente && (
        <DetalleModal cuenta={vigente.id_cuenta} mes={vigente.mes} fila={detalleKey}
          onClose={() => setDetalleKey(null)} />
      )}
      {gestionar && (
        <GestionarModal cuentas={cuentas} onClose={() => setGestionar(false)}
          onCambio={() => void cargarCuentas()} />
      )}
    </div>
  );
}

/** El DESGLOSE del título: todo lo que dejó de ser columna. La tabla muestra
 *  el resultado; acá está de dónde sale, paso por paso. Sacar `Compras`,
 *  `Ventas`, `Var. período` y `Estado` de la grilla no puede significar
 *  perderlos — significa que viven donde se los va a buscar. */
function Desglose({ t }: { t: TituloRow }) {
  const bloques: { titulo: string; datos: [string, string, string?][] }[] = [
    { titulo: "Posición", datos: [
      ["Nominales al inicio", fmtNom(t.qty_ini)],
      ["Nominales al cierre", fmtNom(t.qty_fin)],
      ["No entran en RxT", fmtNom(t.no_entran_rxt)],
      ["Misma tenencia mantenida", fmtNom(t.tenencia_mantenida)],
      ["Estado", ESTADOS.find((e) => e.v === t.estado)?.label ?? t.estado],
      ...(t.cuadra ? [] : [["Nominales sin explicar", fmtNom(t.cuadre_nominales), "alerta"] as [string, string, string]]),
    ] },
    { titulo: "Operado en el mes", datos: [
      ["Compras", t.compras ? fmt$(t.compras) : "—"],
      ["Ventas", t.ventas ? fmt$(t.ventas) : "—"],
      ["Boletos", String(t.n_boletos)],
      ["Ventas − compras", fmt$(t.neto_boletos)],
    ] },
    { titulo: "Tenencia (RxT)", datos: [
      ["Monto al inicio", fmt$(t.monto_rxt_ini)],
      ["Monto al cierre", fmt$(t.monto_rxt_fin)],
      ["Resultado de lo mantenido", fmt$(t.rxt_mantenida)],
      ["Variación del período", fmtPct(t.variacion_rxt)],
      ...(t.qty_entraron ? [
        ["Nominales nuevos retenidos", fmtNom(t.qty_entraron)],
        ["Valen al cierre", fmt$(t.valor_nuevo)],
        ["Costaron", fmt$(t.costo_nuevo)],
        ["Resultado de lo nuevo", fmt$(t.rxt_nueva)],
      ] as [string, string][] : []),
      ["TENENCIA", fmt$(t.rxt), "fuerte"],
    ] },
    { titulo: "Intermediación", datos: [
      ["Ventas − compras", fmt$(t.neto_boletos)],
      ...(t.costo_salida ? [
        [`Menos lo que salió (${fmtNom(t.qty_salieron)} al precio del cierre anterior)`, fmt$(-t.costo_salida)],
      ] as [string, string][] : []),
      ...(t.costo_nuevo ? [
        ["Sin el costo de lo que quedó en cartera (se lo lleva la tenencia)", fmt$(t.costo_nuevo)],
      ] as [string, string][] : []),
      ["INTERMEDIACIÓN", fmt$(t.intermediacion), "fuerte"],
    ] },
  ];
  return (
    <div className="mb-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 pb-3 border-b border-[var(--t-border)]">
      {bloques.map((b) => (
        <div key={b.titulo}>
          <div className="text-[10px] uppercase tracking-wide text-[var(--t-accent)] mb-0.5">{b.titulo}</div>
          {b.datos.map(([k, v, estilo]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-[var(--t-text-dim)]">{k}</span>
              <span className={`tabular-nums whitespace-nowrap ${estilo === "fuerte" ? "font-semibold" : ""} ${estilo === "alerta" ? "text-[var(--t-text)]" : ""}`}>{v}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="col-span-2 lg:col-span-4 flex justify-end gap-3 pt-1">
        <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)] self-center">Total del mes</span>
        <span className={`tabular-nums text-sm font-semibold ${neg(t.total)}`}>{fmt$(t.total)}</span>
      </div>
    </div>
  );
}

/** Una fila del informe. `apagada` = partida sin conciliar: mismas columnas,
 *  atenuada, para que se lea que está afuera del total. */
function FilaTitulo({ t, onClick, apagada }: { t: TituloRow; onClick: () => void; apagada?: boolean }) {
  return (
    <tr onClick={onClick}
      className={`hover:bg-[var(--t-accent)]/10 cursor-pointer ${apagada ? "opacity-60" : ""}`}>
      <td className={`${TD_TIT} ${SEP} font-medium`}>
        <span className="flex items-center gap-1">
          <span className={TIT_MAX} title={t.titulo}>{t.titulo}</span>
          {!t.cuadra && (
            <span className="shrink-0 text-[var(--t-text)]"
              title={`Nominales sin explicar por boletos: ${fmtNom(t.cuadre_nominales)} (¿falta boleto / amortización / canje?)`}>⚠</span>
          )}
        </span>
      </td>
      <td className={TD}>{fmtNom(t.qty_ini)}</td>
      <td className={TD}>{fmtNom(t.qty_fin)}</td>
      <td className={`${TD} ${neg(t.no_entran_rxt)}`}>{fmtNom(t.no_entran_rxt)}</td>
      <td className={`${TD} ${SEP}`}>{fmtNom(t.tenencia_mantenida)}</td>
      <td className={TD}>{fmt$(t.v_ini)}</td>
      <td className={`${TD} ${SEP}`}>{fmt$(t.v_fin)}</td>
      <td className={`${TD} ${neg(t.rxt)}`}>{fmt$(t.rxt)}</td>
      <td className={`${TD} ${neg(t.intermediacion)}`}>{fmt$(t.intermediacion)}</td>
      <td className={`${TD} font-medium ${neg(t.total)}`}>{fmt$(t.total)}</td>
    </tr>
  );
}

/** Encabezado que ordena. Click cicla desc → asc → sin orden, y «sin orden»
 *  devuelve el que manda el backend (por impacto). La flecha dice cuál rige. */
function Th({ col, orden, set, sep, tit, children }: {
  col: keyof TituloRow; orden: Orden; set: (o: Orden) => void;
  sep?: boolean; tit?: boolean; children: React.ReactNode;
}) {
  const activo = orden?.col === col;
  return (
    <th
      className={`${tit ? TH_TIT : TH} ${sep ? SEP : ""} cursor-pointer select-none hover:text-[var(--t-accent)] ${activo ? "text-[var(--t-accent)]" : ""}`}
      onClick={() => set(!activo ? { col, dir: "desc" }
                        : orden!.dir === "desc" ? { col, dir: "asc" } : null)}
      title="Ordenar por esta columna">
      {children}{activo && (orden!.dir === "desc" ? " ↓" : " ↑")}
    </th>
  );
}

/** Etiqueta y número EN LA MISMA LÍNEA: apilados hacían que los totales
 *  costaran una franja entera de pantalla arriba de la tabla. */
function Kpi({ label, v, fuerte }: { label: string; v: number; fuerte?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">{label}</span>
      <span className={`tabular-nums ${fuerte ? "font-semibold" : ""} ${neg(v)}`}>{fmt$(v)}</span>
    </span>
  );
}

/** Drill-down auditable: los boletos del mes que componen la fila. */
function DetalleModal({ cuenta, mes, fila, onClose }: {
  cuenta: string; mes: string; fila: TituloRow; onClose: () => void;
}) {
  const [boletos, setBoletos] = useState<Boleto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchJson<{ boletos: Boleto[] }>(
      `/api/back-office/contabilidad/detalle?id_cuenta=${encodeURIComponent(cuenta)}&mes=${mes}&key=${encodeURIComponent(fila.key)}`)
      .then((r) => setBoletos(r.boletos))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [cuenta, mes, fila.key]);
  return (
    <Modal onClose={onClose} titulo={`${fila.titulo} · ${mes}`} ancho="max-w-[1500px]">
      <Desglose t={fila} />
      {error && <div className="text-[var(--t-neg,#f87171)]">Error: {error}</div>}
      {!boletos && !error && <div className="text-[var(--t-text-dim)]">Cargando…</div>}
      {boletos && !boletos.length && (
        <div className="text-[var(--t-text-dim)]">Sin movimientos en el mes: todo el resultado es tenencia.</div>
      )}
      {boletos && boletos.length > 0 && (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                <th className={TH}>Fecha</th><th className={TH}>Operación</th>
                <th className={`${TH} text-right`}>Cantidad</th>
                <th className={`${TH} text-right`}>Importe</th>
                <th className={TH}>Mon.</th>
                <th className={`${TH} text-right`}>Importe ARS</th>
                <th className={`${TH} text-right ${ACUM}`}>Nominales acum.</th>
                <th className={`${TH} text-right ${ACUM}`}>PnL acum.</th>
                <th className={TH}>Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {boletos.map((b, i) => (
                <tr key={i}
                  className={`border-t border-[var(--t-border)]/50 ${b.categoria === "saldo_inicial" ? "italic text-[var(--t-text-dim)]" : ""}`}>
                  <td className={TD}>{fmtFecha(b.fecha)}</td>
                  <td className={TD}>
                    <span className={b.direccion === "compra" ? "text-[var(--t-neg,#f87171)]"
                      : b.direccion === "venta" ? "text-[var(--t-pos,#4ade80)]" : ""}>
                      {b.op || b.categoria}
                    </span>
                  </td>
                  <td className={`${TD} text-right`}>{fmtNom(b.cantidad)}</td>
                  <td className={`${TD} text-right`}>{fmt$(b.importe)}</td>
                  <td className={TD}>{b.moneda ?? "—"}{b.sin_mep && <span className="text-[var(--t-text)]" title="Boleto en moneda extranjera sin MEP: el importe quedó sin pesificar">⚠</span>}</td>
                  <td className={`${TD} text-right`}>{fmt$(b.importe_ars)}</td>
                  <td className={`${TD} text-right ${ACUM}`}>{fmtNom(b.nominales_acum)}</td>
                  <td className={`${TD} text-right font-medium ${ACUM} ${neg(b.pnl_acum ?? 0)}`}>{fmt$(b.pnl_acum)}</td>
                  <td className={`${TD} text-[var(--t-text-dim)]`}>{b.comprobante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

/** ABM de las cuentas del proceso. El permiso real es del backend (allowlist de
 *  Tesorería + admin): acá un 403 se muestra, no se adivina. */
function GestionarModal({ cuentas, onClose, onCambio }: {
  cuentas: CuentaRow[]; onClose: () => void; onCambio: () => void;
}) {
  const [idNueva, setIdNueva] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const alta = async () => {
    if (!idNueva.trim() || ocupado) return;
    setOcupado(true); setMsg(null);
    try {
      await fetchJson("/api/back-office/contabilidad/cuentas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id_cuenta: idNueva.trim(), etiqueta: etiqueta.trim() || null }),
      });
      setIdNueva(""); setEtiqueta("");
      onCambio();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setOcupado(false); }
  };

  const baja = async (id: string) => {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try {
      await fetchJson(`/api/back-office/contabilidad/cuentas/${encodeURIComponent(id)}`, { method: "DELETE" });
      onCambio();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setOcupado(false); }
  };

  return (
    <Modal onClose={onClose} titulo="Cuentas del proceso">
      <div className="mb-3 text-[var(--t-text-dim)]">
        Las cuentas propias cuyo resultado mensual muestra esta tab. Editarlas requiere el
        permiso de escritura de Tesorería (se gestiona en Manager → MESA).
      </div>
      {cuentas.map((c) => (
        <div key={c.id_cuenta} className="flex items-center gap-2 py-1 border-t border-[var(--t-border)]/50">
          <span className="font-medium w-16">{c.id_cuenta}</span>
          <span className="flex-1 text-[var(--t-text-dim)] truncate">{c.etiqueta}</span>
          <button className={BTN} onClick={() => void baja(c.id_cuenta)}>Quitar</button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-3">
        <input value={idNueva} onChange={(e) => setIdNueva(e.target.value)} placeholder="id cuenta"
          className="bg-transparent border border-[var(--t-border)] px-2 py-1 w-24" />
        <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="etiqueta (opcional, default: nombre en tenencia)"
          className="bg-transparent border border-[var(--t-border)] px-2 py-1 flex-1" />
        <button className={BTN} onClick={() => void alta()} disabled={ocupado}>Agregar</button>
      </div>
      {msg && <div className="mt-2 text-[var(--t-neg,#f87171)]">{msg}</div>}
    </Modal>
  );
}

function Modal({ titulo, children, onClose, ancho = "max-w-4xl" }: {
  titulo: string; children: React.ReactNode; onClose: () => void; ancho?: string;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onClose}>
      <div className={`bg-[var(--t-panel)] border border-[var(--t-border)] ${ancho} w-full max-h-[85vh] overflow-auto p-4 text-xs`}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-2">
          <span className="text-sm font-semibold uppercase tracking-wide">{titulo}</span>
          <button className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-text)] px-2" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
