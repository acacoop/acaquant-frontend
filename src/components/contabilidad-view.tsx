"use client";

import { useCallback, useEffect, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { fetchJson } from "@/lib/fetch-json";
import { exportToXlsx } from "@/lib/xlsx-export";

/**
 * Back Office → CONTABILIDAD. Resultado MENSUAL por título de las cuentas
 * propias: TENENCIA (lo que rindió lo que ya se tenía) + INTERMEDIACIÓN (lo
 * realizado comprando y vendiendo, por FIFO) + RENTAS. El total es la SUMA de
 * los tres.
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
  compras: number; ventas: number; rentas: number;
  // La cadena del RxT, tal cual la planilla del back office:
  // G no entran = fin − ini · H mantenida = min(ini, fin) · I monto ini =
  // H×(D/C) · J monto fin = H×(F/E) · K rxt = J − I · L variación = K/I.
  no_entran_rxt: number; tenencia_mantenida: number;
  monto_rxt_ini: number; monto_rxt_fin: number; variacion_rxt: number | null;
  rxt: number; intermediacion: number; total: number;
  estado: "alta" | "baja" | "sin_operar" | "operado";
  n_boletos: number; cuadre_nominales: number; cuadra: boolean;
  mep_faltantes: number; sin_costo: number;
};
type Resumen = {
  id_cuenta: string; mes: string;
  cierre_ini: { fecha_objetivo: string; fecha_usada: string | null };
  cierre_fin: { fecha_objetivo: string; fecha_usada: string | null };
  titulos: TituloRow[];
  altas: TituloRow[];
  ignorados: Record<string, number>;
  totales: {
    v_ini: number; v_fin: number; compras: number; ventas: number;
    rentas: number; rxt: number; intermediacion: number; total: number;
    descuadres: number; mep_faltantes: number; sin_costo: number;
  };
  n_boletos: number;
};
type Boleto = {
  fecha: string; categoria: string | null; op: string; cantidad: number | null;
  importe: number | null; moneda: string | null;
  mep: number | null; comprobante: string; importe_ars: number;
  sin_mep: boolean; direccion: "compra" | "venta" | "renta" | "otro";
  nominales_acum: number; pnl_acum: number; sin_costo?: boolean;
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
/** "2026-08" → "08/26". El mes va en el encabezado de cada columna de foto
 *  para que se lea de un vistazo cuál es el cierre inicial y cuál el final. */
const mmaa = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(2, 4)}`;
const mmaaPrevio = (mes: string) => {
  const y = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${String(pm).padStart(2, "0")}/${String(py).slice(2)}`;
};

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

  const exportar = () => {
    if (!vigente) return;
    void exportToXlsx({
      filename: `contabilidad-${vigente.id_cuenta}-${vigente.mes}.xlsx`,
      sheets: [{
        name: "Resultado",
        title: `Cuenta ${vigente.id_cuenta} · ${vigente.mes} · cierres ${vigente.cierre_ini.fecha_usada ?? "—"} → ${vigente.cierre_fin.fecha_usada ?? "—"}`,
        rows: vigente.titulos,
        columns: [
          { header: "Título", key: "titulo", format: "text", width: 16 },
          { header: `Nominales ${mmaaPrevio(vigente.mes)}`, key: "qty_ini", format: "number" },
          { header: `Nominales ${mmaa(vigente.mes)}`, key: "qty_fin", format: "number" },
          { header: `Valuación ${mmaaPrevio(vigente.mes)}`, key: "v_ini", format: "number", width: 18 },
          { header: `Valuación ${mmaa(vigente.mes)}`, key: "v_fin", format: "number", width: 18 },
          { header: "Compras", key: "compras", format: "number", width: 16 },
          { header: "Ventas", key: "ventas", format: "number", width: 16 },
          { header: "No entran en RxT", key: "no_entran_rxt", format: "number", width: 16 },
          { header: "Misma tenencia mantenida", key: "tenencia_mantenida", format: "number", width: 22 },
          { header: `Monto RxT ${mmaaPrevio(vigente.mes)}`, key: "monto_rxt_ini", format: "number", width: 18 },
          { header: `Monto RxT ${mmaa(vigente.mes)}`, key: "monto_rxt_fin", format: "number", width: 18 },
          { header: "Tenencia (RxT)", key: "rxt", format: "number", width: 16 },
          { header: "Intermediación", key: "intermediacion", format: "number", width: 16 },
          { header: "Total", key: "total", format: "number", width: 16 },
          { header: "Estado", key: "estado", format: "text" },
          { header: "Cuadre nominales", key: "cuadre_nominales", format: "number" },
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
          className="bg-transparent border border-[var(--t-border)] px-2 py-0.5 text-xs" />
        <div className="ml-auto flex items-center gap-2">
          {vigente && <button className={BTN} onClick={exportar}>Descargar</button>}
          <button className={BTN} onClick={() => setGestionar(true)}>Gestionar cuentas</button>
        </div>
      </div>

      {vigente && (
        <div className="px-3 py-2 flex items-center gap-5 flex-wrap border-b border-[var(--t-border)] shrink-0">
          <Kpi label="Tenencia (RxT)" v={tot!.rxt} />
          <Kpi label="Intermediación" v={tot!.intermediacion} />
          <Kpi label="Total del mes" v={tot!.total} grande />
          <span className="text-[var(--t-text-dim)]">
            cierres {fmtFecha(vigente.cierre_ini.fecha_usada)} → {fmtFecha(vigente.cierre_fin.fecha_usada)}
            {cierreRaro && " ⚠"} · {vigente.n_boletos} boletos
          </span>
          {Object.keys(vigente.ignorados ?? {}).length > 0 && (
            <span className="text-[var(--t-text-dim)]"
              title={Object.entries(vigente.ignorados).map(([k, n]) => `${k}: ${n}`).join(" · ")}>
              ({Object.values(vigente.ignorados).reduce((a, b) => a + b, 0)} boletos no mueven posición: caución/futuros/otros)
            </span>
          )}
          {tot!.rentas !== 0 && (
            <Kpi label="Rentas (suman al total)" v={tot!.rentas} />
          )}
          {tot!.descuadres > 0 && (
            <span className="text-[var(--t-text)]">
              ⚠ {tot!.descuadres} título{tot!.descuadres > 1 ? "s" : ""} con nominales sin explicar por boletos
            </span>
          )}
          {tot!.mep_faltantes > 0 && (
            <span className="text-[var(--t-text)]">⚠ {tot!.mep_faltantes} boletos sin MEP</span>
          )}
          {tot!.sin_costo > 0 && (
            <span className="text-[var(--t-text)]"
              title="El FIFO no encontró lote que costear para esas ventas (posición vendida sin haberla comprado en el libro): su intermediación está incompleta">
              ⚠ {tot!.sin_costo} venta{tot!.sin_costo > 1 ? "s" : ""} sin costo
            </span>
          )}
        </div>
      )}
      {cierreRaro && vigente && (
        <div className="px-3 py-1 text-[11px] text-[var(--t-text)] border-b border-[var(--t-border)] shrink-0">
          El cierre usado no es el último hábil del mes (falta el snapshot de ese día en la tenencia):
          objetivo {fmtFecha(vigente.cierre_ini.fecha_objetivo)} → usado {fmtFecha(vigente.cierre_ini.fecha_usada)} ·
          objetivo {fmtFecha(vigente.cierre_fin.fecha_objetivo)} → usado {fmtFecha(vigente.cierre_fin.fecha_usada)}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {loading && <div className="p-4 text-[var(--t-text-dim)]">Calculando…</div>}
        {error && <div className="p-4 text-[var(--t-neg,#f87171)]">Error: {error}</div>}
        {!loading && !error && vigente && !vigente.titulos.length && (
          <div className="p-4 text-[var(--t-text-dim)]">Sin títulos ni boletos en el período.</div>
        )}
        {!loading && !error && vigente && vigente.titulos.length > 0 && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr>
                <th className={`${TH_TIT} ${SEP}`}>Título</th>
                <th className={TH}>Nominales {mmaaPrevio(vigente.mes)}</th>
                <th className={TH}>Nominales {mmaa(vigente.mes)}</th>
                <th className={TH}>No entran en RxT</th>
                <th className={`${TH} ${SEP}`}>Misma tenencia mantenida</th>
                <th className={TH}>Valuación {mmaaPrevio(vigente.mes)}</th>
                <th className={`${TH} ${SEP}`}>Valuación {mmaa(vigente.mes)}</th>
                <th className={TH}>Compras {mmaa(vigente.mes)}</th>
                <th className={`${TH} ${SEP}`}>Ventas {mmaa(vigente.mes)}</th>
                <th className={TH}>Tenencia (RxT)</th>
                <th className={TH}>Var. período</th>
                <th className={TH}>Intermediación</th>
                <th className={TH}>Total {mmaa(vigente.mes)}</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {vigente.titulos.map((t) => (
                <tr key={t.key} onClick={() => setDetalleKey(t)}
                  className="border-t border-[var(--t-border)]/50 hover:bg-[var(--t-accent)]/5 cursor-pointer">
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
                  <td className={TD}>{t.compras ? fmt$(t.compras) : "—"}</td>
                  <td className={`${TD} ${SEP}`}>{t.ventas ? fmt$(t.ventas) : "—"}</td>
                  <td className={`${TD} ${neg(t.rxt)}`}
                    title={`Misma tenencia mantenida ${fmtNom(t.tenencia_mantenida)} · monto ${mmaaPrevio(vigente.mes)} ${fmt$(t.monto_rxt_ini)} → monto ${mmaa(vigente.mes)} ${fmt$(t.monto_rxt_fin)} · RxT = la diferencia`}>
                    {fmt$(t.rxt)}
                  </td>
                  <td className={`${TD} ${neg(t.variacion_rxt ?? 0)}`}>{fmtPct(t.variacion_rxt)}</td>
                  <td className={`${TD} ${neg(t.intermediacion)}`}>
                    {fmt$(t.intermediacion)}
                    {t.sin_costo > 0 && (
                      <span className="ml-1" title={`${t.sin_costo} venta(s) sin costo en el libro: no había lote que costear, así que la intermediación de esta fila está incompleta`}>⚠</span>
                    )}
                  </td>
                  <td className={`${TD} font-medium ${neg(t.total)}`}>{fmt$(t.total)}</td>
                  <td className={TD}><Estado t={t} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--t-border)] font-medium bg-[var(--t-accent)]/5">
                <td className={`${TD_TIT} ${SEP}`}>TOTAL</td>
                <td className={`${TD} ${SEP}`} colSpan={4} />
                <td className={TD}>{fmt$(tot!.v_ini)}</td>
                <td className={`${TD} ${SEP}`}>{fmt$(tot!.v_fin)}</td>
                <td className={TD}>{fmt$(tot!.compras)}</td>
                <td className={`${TD} ${SEP}`}>{fmt$(tot!.ventas)}</td>
                <td className={`${TD} ${neg(tot!.rxt)}`}>{fmt$(tot!.rxt)}</td>
                <td className={TD} />
                <td className={`${TD} ${neg(tot!.intermediacion)}`}>{fmt$(tot!.intermediacion)}</td>
                <td className={`${TD} ${neg(tot!.total)}`}>{fmt$(tot!.total)}</td>
                <td className={TD} />
              </tr>
            </tfoot>
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

function Kpi({ label, v, grande }: { label: string; v: number; grande?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">{label}</span>
      <span className={`tabular-nums ${grande ? "text-sm font-semibold" : ""} ${neg(v)}`}>{fmt$(v)}</span>
    </span>
  );
}

function Estado({ t }: { t: TituloRow }) {
  if (t.estado === "alta") return <span>ALTA</span>;
  if (t.estado === "baja") return <span>BAJA</span>;
  if (t.estado === "sin_operar") return <span className="text-[var(--t-text-dim)]">sin operar</span>;
  return <span>{t.n_boletos} boletos</span>;
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
                    {b.sin_costo && <span className="ml-1" title="Venta sin costo conocido: excede lo comprado en el libro">⚠</span>}
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
