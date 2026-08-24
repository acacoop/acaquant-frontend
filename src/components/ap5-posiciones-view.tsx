"use client";

// NEGOCIO → POSICIONES Y DIFERENCIAS.
//
// El reporte que la mesa manda por mail todos los días ("RESUMEN POSICIONES
// AGRO Y DÓLAR FUTURO"), servido desde lo que dice **la CÁMARA** (A3/ACyRSA).
//
// REEMPLAZA a la vieja tab DIFERENCIAS DIARIAS, que leía el TEXTO de
// `negocio_movimientos`. Eran los mismos pesos por otro camino: ahí la
// diferencia aparecía porque alguien la había registrado como movimiento, acá
// porque la cámara la liquidó. Cuando los dos no coincidían, no había forma de
// saber cuál mandaba.
//
// ⚠️ **ACÁ NO SE DERIVA NADA.** Ni un total, ni un neto, ni el acumulado: todo
// viene calculado del backend, de la misma query que dibuja cada lista. Es la
// misma regla que rige en el modal del AV AGENT, y por el mismo motivo — un
// contador sumado en el navegador no se puede verificar del lado del servidor.
//
// UN SOLO REQUEST (`/api/ap5/vista`) para toda la pantalla. No es ahorro de
// red: es que los bloques tienen que hablar de la MISMA fecha. Con llamadas
// separadas, el job corriendo en el medio dejaría el resumen en un día y el
// ranking en otro **sin que nada falle**.

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Dato, fmt0, fmt2, Panel } from "./ui/informe";

// ── Lo que devuelve el backend (espejo de api/services/ap5_posiciones.py) ────
type Fecha = { fecha: string; filas: number; cuentas: number };
type DifHoy = { moneda: string; familia: string; importe: number; cuentas: number };
type RankItem = { cuenta: string; nombre: string; moneda: string; importe: number };
type Ranking = {
  familia: string; grupo: string;
  positivos: RankItem[]; negativos: RankItem[];
  total_positivo: number; total_negativo: number; cuentas: number;
};
type Instr = {
  familia: string; producto: string; etiqueta: string;
  unidad: string | null; moneda: string | null;
  compra: number | null; venta: number | null; neta: number | null;
  compra_contratos: number; venta_contratos: number; sin_multiplicador: number;
  acum_hoy: number; acum_ayer: number; diaria: number;
  acumulado_desde: string | null; fecha_anterior: string | null;
};
type Acum = {
  cuenta: string; nombre: string; grupo: string; moneda: string; familia: string;
  semilla: number | null; semilla_cargada: boolean;
  desde_fecha: string | null; nota: string | null;
  movimiento: number; acumulado: number; diaria: number;
};
type Faltantes = {
  simbolos_sin_multiplicador?: { symbol: string; unidad: string | null; filas: number }[];
  cuentas_sin_nombre?: number; cuentas_sin_grupo?: number; cuentas?: number;
  cuentas_sin_semilla?: number;
};
type Vista = {
  fecha: string | null; fecha_anterior: string | null;
  fechas: Fecha[]; diferencias_hoy: DifHoy[]; rankings: Ranking[];
  por_instrumento: Instr[]; acumulado: Acum[]; grupos: string[];
  faltantes: Faltantes;
};

// El nombre de la familia para mostrar. `otros` NO se esconde ni se mete dentro
// del agro: una unidad nueva (hoy `Bl`, el WTI) tiene que VERSE, o infla
// toneladas que no son toneladas.
const FAMILIA: Record<string, string> = { agro: "AGRO", dolar: "DÓLAR FUTURO", otros: "OTROS" };

// Verde a favor, rojo en contra. Mismos tokens que el resto de la app.
const tono = (n: number) => (n > 0 ? "text-[var(--t-pos)]" : n < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]");

/** Fecha ISO → "21 ago 2026". Por regex y NO con `new Date(iso)`: eso es
 *  medianoche UTC y en ART (UTC−3) mostraba el día anterior. */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : iso;
}

export function Ap5PosicionesView() {
  // La fecha elegida persiste entre navegaciones (elección del usuario, no data).
  const [fecha, setFecha] = usePersistedState<string>("ap5.fecha", "");
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué (fecha, recarga) es lo que está DIBUJADO. `cargando` se DERIVA de
  // comparar eso contra lo pedido, en vez de ser un booleano que alguien prende
  // y apaga: así el indicador no puede quedar encendido tras un error ni
  // apagado durante un refetch — los dos bugs clásicos de un flag a mano.
  const [dibujado, setDibujado] = useState<string | null>(null);
  const [editar, setEditar] = useState<Acum | null>(null);

  // `recarga` es el disparador explícito del botón Reintentar y del guardado del
  // modal. Un contador y no una función: así el efecto tiene UNA sola razón de
  // correr (cambió la fecha, o alguien pidió recargar) y no hay que acordarse de
  // cancelar una respuesta vieja a mano en dos lugares distintos.
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const pedido = `${fecha}|${recarga}`;
  const cargando = dibujado !== pedido;

  useEffect(() => {
    // La guarda de carrera: si cambia la fecha mientras vuela un request, la
    // respuesta vieja NO puede pisar a la nueva. Sin esto, tocar dos veces el
    // selector deja en pantalla el día equivocado y nada falla.
    let cancelado = false;
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    // fetchJson TIRA con el detalle del backend: un 403 y "no hay datos" NO se
    // pueden dibujar igual (así se perdió una semana la tab ESTRATEGIA).
    fetchJson<Vista>(`/api/ap5/vista${qs}`)
      .then((d) => { if (!cancelado) { setV(d); setError(null); } })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelado) setDibujado(pedido); });
    return () => { cancelado = true; };
  }, [fecha, recarga, pedido]);

  if (error) {
    return (
      <div className="p-4 text-[12px]">
        <div className="border border-[var(--t-neg)] bg-[var(--t-neg)]/10 px-3 py-2 text-[var(--t-neg)]">
          No se pudo cargar POSICIONES Y DIFERENCIAS — {error}
        </div>
        <button onClick={recargar}
          className="mt-2 px-3 py-1 text-[11px] border border-[var(--t-border)] hover:border-[var(--t-accent)]">
          Reintentar
        </button>
      </div>
    );
  }

  if (!v && cargando) return <div className="p-4 text-[12px] text-[var(--t-text-dim)]">Cargando…</div>;
  if (!v) return null;

  if (!v.fecha) {
    return (
      <div className="p-4 text-[12px] text-[var(--t-text-dim)]">
        Todavía no hay posición guardada. La trae <code>jobs.ap5_portfolio</code> (9:00 ART).
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* ── Barra: fecha, contra qué día se compara, y lo que falta ────────── */}
      <div className="flex items-center flex-wrap gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 text-[11px]">
        <span className="text-[var(--t-text-muted)] uppercase tracking-wide text-[9px]">Día</span>
        <select
          value={v.fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[11px]"
        >
          {v.fechas.map((f) => (
            <option key={f.fecha} value={f.fecha}>
              {fmtFecha(f.fecha)} · {f.cuentas} cuentas
            </option>
          ))}
        </select>
        {/* El día anterior NO es "ayer": es el hábil previo CON POSICIÓN. Se
            muestra porque toda la columna "acum. al día ant." depende de él. */}
        <span className="text-[var(--t-text-muted)]">
          compara contra <b className="text-[var(--t-text-dim)]">{fmtFecha(v.fecha_anterior)}</b>
        </span>
        {cargando && <span className="text-[var(--t-text-muted)]">actualizando…</span>}
        <div className="ml-auto"><Faltantes f={v.faltantes} /></div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {/* ── Diferencias del día, POR MONEDA ─────────────────────────────── */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
            Diferencias ACA hoy — las monedas NO se suman (el agro liquida en Dólar MtR y el dólar futuro en Pesos)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {v.diferencias_hoy.map((d) => (
              <Dato
                key={`${d.familia}-${d.moneda}`}
                label={`${FAMILIA[d.familia] ?? d.familia} · ${d.moneda}`}
                valor={fmt2(d.importe, 0)}
                sub={`${d.cuentas} cuentas`}
                tono={d.importe > 0 ? "pos" : d.importe < 0 ? "neg" : null}
              />
            ))}
            {v.diferencias_hoy.length === 0 && (
              <div className="text-[11px] text-[var(--t-text-dim)]">Sin diferencias liquidadas este día.</div>
            )}
          </div>
        </div>

        {/* ── Posición por instrumento (CANTIDADES, no importes) ───────────── */}
        <Panel titulo="POR INSTRUMENTO — posición en su unidad">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
                <th className="text-left px-2 py-1 font-normal">Producto</th>
                <th className="text-left px-2 py-1 font-normal">Un.</th>
                <th className="text-right px-2 py-1 font-normal">Compra</th>
                <th className="text-right px-2 py-1 font-normal">Venta</th>
                <th className="text-right px-2 py-1 font-normal">Neta</th>
                <th className="text-right px-2 py-1 font-normal">Dif. del día</th>
                <th className="text-right px-2 py-1 font-normal">Acum. día ant.</th>
                <th className="text-right px-2 py-1 font-normal">Acum. al día</th>
              </tr>
            </thead>
            <tbody>
              {v.por_instrumento.map((r) => (
                <tr key={`${r.familia}-${r.producto}`} className="border-b border-[var(--t-border-2)]">
                  <td className="px-2 py-1">
                    {r.etiqueta}
                    <span className="ml-1 text-[9px] text-[var(--t-text-muted)]">{FAMILIA[r.familia] ?? r.familia}</span>
                  </td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{r.unidad ?? "—"}</td>
                  {/* Sin multiplicador la cantidad en unidad NO se puede afirmar:
                      se muestran los CONTRATOS crudos y se marca, en vez de
                      dibujar un número 100 veces más chico que parece bien. */}
                  {r.sin_multiplicador > 0 ? (
                    <td colSpan={3} className="px-2 py-1 text-[var(--t-neg)]" title={`${r.sin_multiplicador} filas sin multiplicador conocido`}>
                      {fmt0(r.compra_contratos)} / {fmt0(r.venta_contratos)} contratos · sin multiplicador
                    </td>
                  ) : (
                    <>
                      <td className="px-2 py-1 text-right">{fmt0(r.compra)}</td>
                      <td className="px-2 py-1 text-right">{fmt0(r.venta)}</td>
                      <td className={`px-2 py-1 text-right font-semibold ${tono(r.neta ?? 0)}`}>{fmt0(r.neta)}</td>
                    </>
                  )}
                  <td className={`px-2 py-1 text-right ${tono(r.diaria)}`}>{fmt2(r.diaria, 0)}</td>
                  <td className={`px-2 py-1 text-right ${tono(r.acum_ayer)}`}>{fmt2(r.acum_ayer, 0)}</td>
                  <td className={`px-2 py-1 text-right font-semibold ${tono(r.acum_hoy)}`}>{fmt2(r.acum_hoy, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Un acumulado sin decir DESDE CUÁNDO se lee como histórico completo,
              y no lo es: la cámara manda la diferencia diaria, no el arrastre. */}
          {v.por_instrumento[0]?.acumulado_desde && (
            <div className="px-2 py-1 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
              El acumulado por producto arranca en {fmtFecha(v.por_instrumento[0].acumulado_desde)} — es
              nuestro primer día guardado, no el arrastre histórico. El arrastre vive en la semilla por cuenta.
            </div>
          )}
        </Panel>

        {/* ── Rankings ± por familia × grupo ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {v.rankings.map((r) => (
            <Panel
              key={`${r.familia}-${r.grupo}`}
              titulo={`${FAMILIA[r.familia] ?? r.familia} · ${r.grupo}`}
              extra={<span className="text-[10px] text-white/70">{r.cuentas} cuentas</span>}
            >
              <Ladrillo titulo="A favor" items={r.positivos} total={r.total_positivo} />
              <Ladrillo titulo="En contra" items={r.negativos} total={r.total_negativo} />
            </Panel>
          ))}
          {v.rankings.length === 0 && (
            <div className="text-[11px] text-[var(--t-text-dim)]">Sin cuentas con diferencia este día.</div>
          )}
        </div>

        {/* ── Acumulado por cuenta ────────────────────────────────────────── */}
        <Panel
          titulo="ACUMULADO POR CUENTA"
          extra={<span className="text-[10px] text-white/70">click en una fila para cargar semilla o grupo</span>}
        >
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
                <th className="text-left px-2 py-1 font-normal">Cuenta</th>
                <th className="text-left px-2 py-1 font-normal">Grupo</th>
                <th className="text-left px-2 py-1 font-normal">Moneda</th>
                <th className="text-right px-2 py-1 font-normal">Dif. del día</th>
                <th className="text-right px-2 py-1 font-normal">Semilla</th>
                <th className="text-right px-2 py-1 font-normal">Movimiento</th>
                <th className="text-right px-2 py-1 font-normal">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {v.acumulado.map((a) => (
                <tr
                  key={`${a.cuenta}-${a.moneda}`}
                  onClick={() => setEditar(a)}
                  className="border-b border-[var(--t-border-2)] cursor-pointer hover:bg-[var(--t-accent)]/5"
                >
                  <td className="px-2 py-1">
                    {a.nombre}
                    <span className="ml-1 text-[9px] text-[var(--t-text-muted)]">{a.cuenta}</span>
                  </td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{a.grupo}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{a.moneda}</td>
                  <td className={`px-2 py-1 text-right ${tono(a.diaria)}`}>{fmt2(a.diaria, 0)}</td>
                  {/* `semilla = null` NO es cero: es "nadie cargó el arrastre".
                      El acumulado de esa cuenta está INCOMPLETO y tiene que
                      decirlo, no mostrar un número que parece completo. */}
                  <td className="px-2 py-1 text-right">
                    {a.semilla_cargada
                      ? fmt2(a.semilla, 0)
                      : <span className="text-[var(--t-neg)]" title="sin semilla: el acumulado está incompleto">sin cargar</span>}
                  </td>
                  <td className={`px-2 py-1 text-right ${tono(a.movimiento)}`}>{fmt2(a.movimiento, 0)}</td>
                  <td className={`px-2 py-1 text-right font-semibold ${a.semilla_cargada ? tono(a.acumulado) : "text-[var(--t-text-muted)]"}`}>
                    {fmt2(a.acumulado, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {editar && (
        <ModalCuenta
          fila={editar}
          grupos={v.grupos}
          onCerrar={() => setEditar(null)}
          onGuardado={() => { setEditar(null); recargar(); }}
        />
      )}
    </div>
  );
}

/** Medio ranking (a favor / en contra). El TOTAL es de TODAS las cuentas, no del
 *  top: el ranking recorta la LISTA, no la suma. Si el total saliera de las 10
 *  filas, mostrar 10 cambiaría el número y nadie lo notaría. */
function Ladrillo({ titulo, items, total }: { titulo: string; items: RankItem[]; total: number }) {
  return (
    <div className="border-b border-[var(--t-border)] last:border-b-0">
      <div className="flex items-center justify-between px-2 py-1 bg-[var(--t-bg)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
        <span>{titulo}</span>
        <span className={`font-mono tabular-nums ${tono(total)}`} title="total de TODAS las cuentas, no solo del top 10">
          {fmt2(total, 0)}
        </span>
      </div>
      <table className="w-full text-[11px] font-mono tabular-nums">
        <tbody>
          {items.map((i) => (
            <tr key={i.cuenta} className="border-b border-[var(--t-border-2)] last:border-b-0">
              <td className="px-2 py-0.5 truncate max-w-0 w-full" title={`${i.nombre} (${i.cuenta})`}>{i.nombre}</td>
              <td className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)] whitespace-nowrap">{i.moneda}</td>
              <td className={`px-2 py-0.5 text-right whitespace-nowrap ${tono(i.importe)}`}>{fmt2(i.importe, 0)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td className="px-2 py-1 text-[var(--t-text-muted)]">—</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Lo que la vista NO puede afirmar. Se declara, no se esconde: omitirlo daría
 *  un total plausible al que le falta algo. */
function Faltantes({ f }: { f: Faltantes }) {
  const sinMult = f.simbolos_sin_multiplicador ?? [];
  const avisos: string[] = [];
  if (sinMult.length) avisos.push(`${sinMult.length} símbolo(s) sin multiplicador`);
  if (f.cuentas_sin_grupo) avisos.push(`${f.cuentas_sin_grupo} sin grupo`);
  if (f.cuentas_sin_nombre) avisos.push(`${f.cuentas_sin_nombre} sin nombre`);
  if (f.cuentas_sin_semilla) avisos.push(`${f.cuentas_sin_semilla} sin semilla`);
  if (!avisos.length) return <span className="text-[10px] text-[var(--t-text-muted)]">sin faltantes</span>;
  return (
    <span
      className="text-[10px] text-[var(--t-neg)] border border-[var(--t-neg)]/40 px-2 py-0.5"
      title={sinMult.map((s) => `${s.symbol} (${s.filas} filas)`).join("\n") || undefined}
    >
      ⚠ {avisos.join(" · ")}
    </span>
  );
}

/** Las DOS cosas que ninguna fuente sabe y carga una persona: el GRUPO (parte
 *  los rankings; la cámara no lo sabe y no se deduce del nombre — REGLA #9) y
 *  la SEMILLA del acumulado (la cámara manda la diferencia del día, no el
 *  arrastre). */
function ModalCuenta({ fila, grupos, onCerrar, onGuardado }: {
  fila: Acum; grupos: string[]; onCerrar: () => void; onGuardado: () => void;
}) {
  const [grupo, setGrupo] = useState(fila.grupo === "(sin grupo)" ? "" : fila.grupo);
  const [semilla, setSemilla] = useState(fila.semilla == null ? "" : String(fila.semilla));
  const [desde, setDesde] = useState(fila.desde_fecha ?? "");
  const [nota, setNota] = useState(fila.nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setErr(null);
    try {
      // Dos recursos distintos → dos llamadas. Solo se manda lo que cambió.
      if (grupo !== (fila.grupo === "(sin grupo)" ? "" : fila.grupo)) {
        await fetchJson("/api/ap5/cuentas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ account: fila.cuenta, grupo }),
        });
      }
      if (semilla !== "" && desde !== "") {
        await fetchJson("/api/ap5/semilla", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account: fila.cuenta,
            // La moneda viaja SIEMPRE y no tiene default: una semilla sin
            // moneda es justo el error que la PK viene a impedir.
            currency: fila.moneda,
            semilla: Number(semilla),
            desde_fecha: desde,
            nota,
          }),
        });
      }
      onGuardado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCerrar}>
      <div
        className="w-[480px] max-w-[92vw] border border-[var(--t-border)] bg-[var(--t-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-brand)]">
          <div className="text-[11px] font-semibold text-white">{fila.nombre}</div>
          <div className="text-[9px] text-white/70">cuenta {fila.cuenta} · {fila.moneda}</div>
        </div>

        <div className="p-3 space-y-3 text-[11px]">
          <label className="block">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Grupo</span>
            <input
              list="ap5-grupos" value={grupo} onChange={(e) => setGrupo(e.target.value)}
              placeholder="Cooperativas / MUNDO ACA"
              className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1"
            />
            <datalist id="ap5-grupos">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
            <span className="text-[9px] text-[var(--t-text-muted)]">
              Es lo que parte los rankings. La cámara no lo sabe. Vacío lo saca.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Semilla</span>
              <input
                value={semilla} onChange={(e) => setSemilla(e.target.value)} inputMode="decimal"
                className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 font-mono tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Desde (inclusive)</span>
              <input
                type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1"
              />
            </label>
          </div>
          <div className="text-[9px] text-[var(--t-text-muted)] -mt-2">
            La semilla YA contiene el arrastre hasta ese día: se suman los días POSTERIORES.
            Incluirlo lo contaría dos veces.
          </div>

          <label className="block">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Nota</span>
            <input
              value={nota} onChange={(e) => setNota(e.target.value)}
              className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1"
            />
          </label>

          {err && <div className="text-[var(--t-neg)]">{err}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar}
              className="px-3 py-1 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
              Cancelar
            </button>
            <button onClick={() => void guardar()} disabled={guardando}
              className="px-3 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
