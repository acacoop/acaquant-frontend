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
import { fmt2, Panel } from "./ui/informe";

// ── Lo que devuelve el backend (espejo de api/services/ap5_posiciones.py) ────
type Fecha = { fecha: string; filas: number; cuentas: number };
type DifHoy = { moneda: string; familia: string; importe: number; cuentas: number };
// `importe` ES el acumulado (no la diferencia del día): es lo que el reporte
// de la mesa rankea. Se llama así porque el nombre del campo lo fija su rol.
type RankItem = {
  cuenta: string; nombre: string; moneda: string; familia: string; grupo: string;
  importe: number; diaria: number;
  semilla: number | null; semilla_cargada: boolean;
  desde_fecha: string | null; nota: string | null;
};
// `tab` y `lado` los decide el BACKEND. La vista no compara strings de grupo —
// que es exactamente donde se rompió el 2026-08-25: la base decía COOPERATIVAS,
// acá estaba escrito "Cooperativas", no matcheaba, y TODO caía en el bloque de
// "sin clasificar" con los rankings correctos y el título equivocado.
type Ranking = {
  tab: TabFam; grupo: string; lado: "izq" | "der" | "otro";
  positivos: RankItem[]; negativos: RankItem[];
  total_positivo: number; total_negativo: number;
  cuentas: number; sin_semilla: number;
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
  // Familias que NO entran en ninguna tab (hoy `otros`: el WTI, en barriles).
  fuera_de_tabs?: { familia: string; cuentas: number; simbolos: number }[];
  simbolos_sin_multiplicador?: { symbol: string; unidad: string | null; filas: number }[];
  cuentas_sin_nombre?: number; cuentas_sin_grupo?: number; cuentas?: number;
  cuentas_sin_semilla?: number;
};
type Vista = {
  fecha: string | null; fecha_anterior: string | null;
  fechas: Fecha[]; rankings: Ranking[]; grupos: string[];
  // El endpoint sigue trayendo estos tres bloques y la pantalla ya NO los
  // dibuja (2026-08-25: la vista es el reporte, y el reporte son los rankings).
  // Se tipan igual porque describen lo que la API devuelve de verdad — borrar el
  // tipo no borraría el campo, solo lo dejaría sin documentar.
  diferencias_hoy: DifHoy[]; por_instrumento: Instr[]; acumulado: Acum[];
  faltantes: Faltantes;
};

// El nombre de la familia, para los avisos. AGRO son trigo/soja/maíz (toneladas)
// y DÓLAR FUTURO el otro. `otros` (hoy el WTI, en barriles) NO tiene tab: se
// declara en la barra de faltantes, porque una posición sin pantalla es una
// posición que nadie mira.
const FAMILIA: Record<string, string> = { agro: "AGRO", dolar: "DÓLAR FUTURO", otros: "OTROS" };

// Las dos tabs del reporte. Qué familia cae en cuál lo decide el backend
// (`TAB_DE_FAMILIA`): `otros` —hoy el WTI, unidad `Bl`— va con AGRO pero
// conserva su etiqueta, para que se vea que no son toneladas.
type TabFam = "agro" | "dolar";
const TABS: { id: TabFam; label: string }[] = [
  { id: "agro", label: "FUTUROS AGRO" },
  { id: "dolar", label: "FUTUROS DÓLAR" },
];

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
  // La fecha y la tab persisten entre navegaciones: son ELECCIONES del usuario,
  // no data fetcheada (que es lo que usePersistedState no debe guardar).
  const [fecha, setFecha] = usePersistedState<string>("ap5.fecha", "");
  const [tab, setTab] = usePersistedState<TabFam>("ap5.tab", "agro");
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué (fecha, recarga) es lo que está DIBUJADO. `cargando` se DERIVA de
  // comparar eso contra lo pedido, en vez de ser un booleano que alguien prende
  // y apaga: así el indicador no puede quedar encendido tras un error ni
  // apagado durante un refetch — los dos bugs clásicos de un flag a mano.
  const [dibujado, setDibujado] = useState<string | null>(null);
  const [editar, setEditar] = useState<RankItem | null>(null);

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

  // Los bloques de ESTA tab, ya ordenados por el backend (izq · der · el resto).
  const bloques = v.rankings.filter((r) => r.tab === tab);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* ── Barra: día, tabs y lo que la vista no puede afirmar ─────────────
          Todo en UNA sola línea. La pantalla es el reporte y el reporte son los
          rankings: cualquier cosa que no sea eso les come alto. */}
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 text-[11px]">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`px-3 py-1 text-[11px] font-semibold tracking-wide border transition-colors ${
              tab === x.id
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {x.label}
          </button>
        ))}

        <span className="ml-2 text-[var(--t-text-muted)] uppercase tracking-wide text-[9px]">Día</span>
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
        {cargando && <span className="text-[var(--t-text-muted)]">actualizando…</span>}
        <div className="ml-auto"><Faltantes f={v.faltantes} /></div>
      </div>

      {/* ── Los rankings, y NADA más ────────────────────────────────────────
          Izquierda y derecha las decidió el backend (`lado`), no un match de
          strings acá. Cada panel se estira a lo alto: la pantalla completa es
          para las dos listas. */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 overflow-auto">
        {bloques.map((r) => (
          <Panel
            key={`${r.tab}-${r.grupo}`}
            titulo={r.grupo}
            className="min-h-0"
            extra={
              <span className="text-[10px] text-white/70">
                {r.cuentas} cuentas
              </span>
            }
          >
            <Ladrillo titulo="Ranking Top 10 +" items={r.positivos} total={r.total_positivo} onFila={setEditar} />
            <Ladrillo titulo="Ranking Top 10 −" items={r.negativos} total={r.total_negativo} onFila={setEditar} />
          </Panel>
        ))}

        {bloques.length === 0 && (
          <div className="text-[11px] text-[var(--t-text-dim)]">
            Ninguna cuenta tiene acumulado en {TABS.find((x) => x.id === tab)?.label.toLowerCase()}.
          </div>
        )}
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

/** Medio ranking (a favor / en contra).
 *
 *  ⚠️ **Acá NO se marca la cuenta sin semilla** (2026-08-25, pedido del user:
 *  esta vista se imprime como PDF para gerencia). El aviso sigue existiendo,
 *  pero UNA sola vez y en la barra de herramientas — que es de la mesa, no del
 *  informe. Ojo con lo que eso significa: sin semilla el acumulado arranca en
 *  nuestro primer día guardado y no es el arrastre real, así que el orden del
 *  top puede no ser el del mail. El cartel se sacó; el problema se cierra
 *  cargando las semillas, no escondiéndolas. El TOTAL es de TODAS las cuentas, no del
 *  top: el ranking recorta la LISTA, no la suma. Si el total saliera de las 10
 *  filas, mostrar 10 cambiaría el número y nadie lo notaría. */
function Ladrillo({ titulo, items, total, onFila }: {
  titulo: string; items: RankItem[]; total: number; onFila: (i: RankItem) => void;
}) {
  return (
    <div className="border-b border-[var(--t-border)] last:border-b-0">
      <div className="flex items-center justify-between px-2 py-1 bg-[var(--t-bg)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
        <span>{titulo}</span>
        <span className={`font-mono tabular-nums ${tono(total)}`} title="acumulado de TODAS las cuentas del grupo, no solo del top 10">
          {fmt2(total, 0)}
        </span>
      </div>
      <table className="w-full text-[11px] font-mono tabular-nums">
        <tbody>
          {items.map((i, n) => (
            <tr
              key={i.cuenta}
              onClick={() => onFila(i)}
              title="cargar grupo o semilla"
              className="border-b border-[var(--t-border-2)] last:border-b-0 cursor-pointer hover:bg-[var(--t-accent)]/5"
            >
              <td className="px-1 py-0.5 text-[9px] text-[var(--t-text-muted)] text-right w-6">{n + 1}</td>
              <td className="px-2 py-0.5 truncate max-w-0 w-full" title={`${i.nombre} (${i.cuenta})`}>
                {i.nombre}
              </td>
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
  const fuera = f.fuera_de_tabs ?? [];
  const avisos: string[] = [];
  // Lo primero: una posición que no se dibuja en ninguna tab. Es lo que más
  // fácil pasa desapercibido, justamente porque no está en pantalla.
  for (const x of fuera) {
    avisos.push(`${FAMILIA[x.familia] ?? x.familia}: ${x.cuentas} cuenta(s) fuera de las tabs`);
  }
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
  fila: RankItem; grupos: string[]; onCerrar: () => void; onGuardado: () => void;
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
