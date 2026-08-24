"use client";

// Tab AHORA: lo del día + la interrupción de SALUD + preguntas y avisos.
import { useState } from "react";
import { useDatos } from "@/components/av-agent/datos";
import { Marcado } from "@/components/av-agent/piezas";
import { Pregunta, Aviso, Vista, Vigilado, SaludRoto,
         Centinela, Tab, TITULO, SUB, SEV_COLOR,
         hora, Hallazgo, fechaHora } from "@/components/av-agent/tipos";

// ── NOTICIAS DE LA BASE (§0.cx) — el noticiero, no la lista de trabajo ──────
//
// El user, mirando «LA BASE CAMBIÓ: 34» adentro de ENCONTRÓ: *«este tipo de
// cosas son AVISOS — no tienen que estar en ENCONTRÓ, que es accionable. Y
// además está sin fecha ni hora»*. Son observaciones sin botón (una tabla
// nueva, una que creció, una que dejó de escribir): se ENTERAN, no se
// arreglan. Su casa es AHORA, cada una con su fecha y hora.
export function Noticias({ filas }: { filas: Hallazgo[] }) {
  if (!filas.length) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className={TITULO}>NOTICIAS DE LA BASE</h3>
        <span className={SUB}>{filas.length}</span>
        <span className="text-[9px] text-[var(--t-text-dim)]">
          observaciones, no problemas — nada que apretar; se renuevan con cada
          relevada
        </span>
      </div>
      <div className="mt-1 border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {filas.map((h, i) => (
          <div key={`${h.ticker}-${h.regla}-${i}`} className="px-2 py-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
              <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap"
                    title={h.abierto_at
                      ? `visto desde ${fechaHora(h.abierto_at)}` : "sin registrar"}>
                {fechaHora(h.abierto_at ?? null)}
              </span>
              <span className="text-[11px] font-bold text-[var(--t-text)] min-w-0 break-all"
                    title={h.ticker}>
                {h.nombre || h.ticker}
              </span>
            </div>
            <div className="text-[10px] text-[var(--t-text-muted)] break-words">
              {h.motivo}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TAB 1: las preguntas ───────────────────────────────────────────────────

export function TabPreguntas({ data, enviando, notas, setNota, responder, setTab }: {
  data: Vista;
  enviando: number | null;
  notas: Record<number, string>;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
  setTab: (t: Tab) => void;
}) {
  // Los que la casa YA TIENE van primero: son los únicos donde no contestar
  // tiene un costo hoy (esa posición no valúa). Marcarlos y dejarlos en la
  // tarjeta 18 es lo mismo que no marcarlos.
  const ordenadas = [...data.preguntas].sort((a, b) => {
    const ca = a.contexto?.en_cartera === true ? 0 : 1;
    const cb = b.contexto?.en_cartera === true ? 0 : 1;
    return ca - cb || a.id - b.id;
  });

  if (data.preguntas.length === 0 && data.decisiones.length === 0) {
    // "No tengo preguntas" NO es "no pasa nada". Con 0 preguntas y 38 hallazgos
    // de severidad alta, un tab vacío hace creer que el agente no encontró nada
    // — y el trabajo que SÍ hizo queda a un click que nadie da.
    const urgentes = data.hallazgos.filter((h) => h.severidad === "alta").length;
    return (
      <div className="text-[11px] text-[var(--t-text-muted)]">
        <p>
          No tengo nada que preguntarte: contestaste todo. Cuando encuentre un bono
          nuevo y no sepa si te interesa, te lo voy a preguntar acá.
        </p>
        {urgentes > 0 && (
          <p className="mt-2">
            Eso sí — <strong className="text-[var(--t-text)]">encontré {urgentes} cosa(s)
            de severidad alta</strong> que no son preguntas para vos, son trabajo
            pendiente. Están en el tab{" "}
            <button
              onClick={() => setTab("hallazgos")}
              className="underline text-[var(--t-accent)] hover:opacity-80"
            >
              ENCONTRÓ
            </button>
            .
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {data.decisiones.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className={TITULO}>CÓMO QUERÉS QUE TRABAJE</h3>
            <span className={SUB}>
              definen mi comportamiento · sin respuesta uso el default
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {data.decisiones.map((p) => (
              <Tarjeta key={p.id} p={p} enviando={enviando} nota={notas[p.id] ?? ""}
                       setNota={setNota} responder={responder} />
            ))}
          </div>
        </section>
      )}

      {data.preguntas.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={TITULO}>SOBRE LO QUE ENCONTRÉ</h3>
            <span className={SUB}>
              lo que no contestes queda abierto — no te lo vuelvo a preguntar
            </span>
          </div>
          {!data.capacidades.puede_dar_de_alta && (
            <p className="mb-2 px-2 py-1 text-[10px] text-[var(--t-text-muted)] border-l-2 border-[var(--t-tint-amber)] bg-[var(--t-surface)]">
              <strong className="text-[var(--t-text)]">«Alta» todavía no da de alta nada.</strong>{" "}
              {data.capacidades.motivo_alta}
            </p>
          )}
          {/* Dos columnas: son 24 preguntas cortas y todas iguales. En una sola
              columna hay que scrollear tres pantallas para verlas; en dos entran
              de a doce y se contestan de arriba abajo. */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {ordenadas.map((p) => (
              <Tarjeta key={p.id} p={p} enviando={enviando} nota={notas[p.id] ?? ""}
                       setNota={setNota} responder={responder} compacta />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Los campos de la ficha que el backend manda en `contexto`. El front NO los
// deriva ni los completa: si 1816 no mandó el emisor, la fila no aparece — una
// celda vacía es honesta, un "—" inventado no.
export function fichaDe(ctx: Record<string, unknown> | null): [string, string][] {
  if (!ctx) return [];
  const s = (k: string) => (typeof ctx[k] === "string" ? (ctx[k] as string).trim() : "");
  const filas: [string, string][] = [];
  if (s("emisor")) filas.push(["Emisor", s("emisor")]);
  if (s("denominacion")) filas.push(["Instrumento", s("denominacion")]);
  const cur = s("curva_1816");
  if (cur) filas.push(["Curva 1816", cur + (s("moneda") ? ` · ${s("moneda")}` : "")]);
  const vto = s("vencimiento_1816");
  if (vto) filas.push(["Vence", vto.slice(0, 10)]);
  return filas;
}

export function Tarjeta({ p, enviando, nota, setNota, responder, compacta = false }: {
  p: Pregunta;
  enviando: number | null;
  nota: string;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
  compacta?: boolean;
}) {
  const ocupado = enviando === p.id;
  const ctx = p.contexto ?? null;
  const ficha = fichaDe(ctx);
  const enCartera = ctx?.en_cartera === true;
  // Darlo de alta NO alcanza para verlo si su ajuste no tiene curva.
  const sinCurva = ctx?.ajuste_sin_curva === true;
  const ajuste = String((ctx?.ejes_sugeridos as Record<string, unknown> | undefined)
    ?.ajuste ?? "").toUpperCase();
  // El TICKER se separa del resto de la pregunta: es lo que uno busca con la
  // vista cuando recorre 21 tarjetas, y perdido dentro de un párrafo no se
  // encuentra.
  const ticker = (p.clave || "").startsWith("falta:") ? p.clave.slice(6) : "";
  return (
    <div className={`border bg-[var(--t-surface)] px-3 py-2 ${
      enCartera ? "border-[var(--t-neg)]" : "border-[var(--t-border)]"} ${
      ocupado ? "opacity-50" : ""}`}>
      {ticker ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold tracking-wide text-[var(--t-text)] tabular-nums">
              {ticker}
            </span>
            {/* Un bono en la tenencia que no está en mercado.curvas NO VALÚA:
                eso no es una preferencia, es un arreglo pendiente, y tiene que
                verse antes que el resto. */}
            {enCartera && (
              <span className="px-1 text-[9px] font-bold tracking-widest text-[var(--t-neg)] border border-[var(--t-neg)]">
                EN CARTERA · NO VALÚA
              </span>
            )}
            {/* Sin pill no hay curva, y sin curva el bono queda cargado y no
                aparece en ninguna pantalla. Decirlo ANTES del alta es la
                diferencia entre una decisión informada y cargar diez bonos que
                no se van a poder mirar. */}
            {sinCurva && (
              <span
                className="px-1 text-[9px] font-bold tracking-widest text-[var(--t-tint-amber)] border border-[var(--t-tint-amber)]"
                title={`El ajuste ${ajuste} todavía no tiene tabla en la app: si lo das de alta, no va a aparecer en ninguna vista.`}
              >
                {ajuste} SIN CURVA
              </span>
            )}
          </div>
          {/* La ficha en filas etiquetadas y no en prosa: con 21 tarjetas
              iguales, alinear "Emisor" a la misma altura deja barrer la columna
              con la vista en vez de leer 21 oraciones. */}
          <dl className="mt-1 grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5">
            {ficha.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] pt-px">
                  {k}
                </dt>
                <dd className="text-[10px] text-[var(--t-text)] leading-snug truncate" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className={`${compacta ? "text-[11px]" : "text-[12px]"} text-[var(--t-text)] leading-snug`}>
          {p.pregunta}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.opciones.map((o) => (
          <button
            key={o}
            disabled={ocupado}
            onClick={() => responder(p.id, o)}
            className="text-[9px] font-semibold uppercase tracking-widest px-2.5 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40 transition-colors"
          >
            {o}
          </button>
        ))}
        {/* El POR QUÉ no es burocracia: es lo que el agente usa para dejar de
            proponer cosas parecidas. Por eso está al lado de los botones y no
            escondido detrás de un "agregar nota". */}
        <input
          value={nota}
          onChange={(e) => setNota(p.id, e.target.value)}
          placeholder="¿por qué? (me sirve para aprender)"
          className="flex-1 min-w-[140px] text-[10px] px-2 py-1 bg-transparent border border-[var(--t-border)] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] focus:border-[var(--t-accent)] outline-none"
        />
      </div>
    </div>
  );
}
// ── TAB 3: el LIBRO — qué escribió, cuándo y dónde ─────────────────────────

// AVISOS — la contrapartida de "el agente hace el 95% y te deja el 5%".
//
// **Por qué esta tab existe** (user, 2026-08-17): el CER de emisión BLOQUEABA el
// alta. Era la decisión equivocada — el agente igual baja los flujos, resuelve
// los ejes, completa la ficha y siembra las especies; negarse a todo eso porque
// falta un número que ninguna fuente publica es tirar el trabajo hecho. *«A los
// CER les perdonamos: me lo deja sencillo, solo poner el CER de emisión y nada
// más.»*
//
// La lista se DERIVA en el backend contra el estado actual del master: cargás el
// dato y la fila se va sola. Sin botón de "resuelto", que es lo que convierte a
// toda lista de pendientes en un cementerio.
export function TabAvisos({ avisos, resolver, completar }: {
  avisos: Aviso[];
  resolver: (id: number, deshacer: boolean) => void;
  completar: (id: number, valor: string) => void;
}) {
  const abiertos = avisos.filter((a) => !a.resuelto);
  const hechos = avisos.filter((a) => a.resuelto);

  if (avisos.length === 0) {
    return (
      <p className={SUB}>
        No hay nada pendiente de carga manual. Los avisos aparecen cuando doy de
        alta un bono al que le falta un dato que no puedo sacar de ningún lado.
      </p>
    );
  }

  const fila = (a: Aviso) => (
    <FilaAviso key={a.id} a={a} resolver={resolver} completar={completar} />
  );

  return (
    <div className="space-y-2">
      <p className={SUB}>
        Di de alta estos bonos, pero les falta un dato que ninguna fuente publica.
        <strong className="text-[var(--t-text)]"> Cargalo acá mismo</strong> y el
        aviso se cierra solo — el valor va al master y queda listo para simular.
      </p>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
            <th className="py-1 pr-3">Bono</th>
            <th className="py-1 pr-3">Qué hacer</th>
            <th className="py-1 pr-3">Cargar el dato</th>
            <th className="py-1 pr-3">Por qué importa</th>
            <th />
          </tr>
        </thead>
        <tbody>{abiertos.map(fila)}</tbody>
      </table>
      {hechos.length > 0 && (
        <>
          <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] pt-2">
            Ya hechos ({hechos.length})
          </p>
          <table className="w-full text-[10px]"><tbody>{hechos.map(fila)}</tbody></table>
        </>
      )}
    </div>
  );
}

// UNA fila = un pendiente + su formulario. El input vive acá y no en el padre
// para que cada aviso tenga su propio estado: un solo `valor` compartido haría
// que escribir en uno pisara lo tipeado en otro.
export function FilaAviso({ a, resolver, completar }: {
  a: Aviso;
  resolver: (id: number, deshacer: boolean) => void;
  completar: (id: number, valor: string) => void;
}) {
  const [valor, setValor] = useState("");
  return (
    <tr className={`border-t border-[var(--t-border)] ${a.resuelto ? "opacity-45" : ""}`}>
      <td className="py-1 pr-3 font-semibold text-[var(--t-text)]">{a.ticker}</td>
      <td className="py-1 pr-3" style={{ color: a.resuelto ? undefined : "#f59e0b" }}>
        {a.que_hacer}
        {/* El contraste con el master. Marcar hecho es una afirmación del user;
            esto dice si el dato REALMENTE está. Sin este cruce, un aviso cerrado
            sobre un dato ausente mentiría en silencio — que es exactamente el
            riesgo de dejar que el cierre sea manual. */}
        {a.resuelto && a.ya_cargado === false && (
          <span className="ml-1.5 text-[var(--t-neg)]">⚠ el dato sigue faltando</span>
        )}
        {!a.resuelto && a.ya_cargado === true && (
          <span className="ml-1.5" style={{ color: "var(--t-pos)" }}>
            ✔ ya está cargado — podés marcarlo
          </span>
        )}
      </td>
      <td className="py-1 pr-3 text-[var(--t-text-muted)]">
        {/* El dato se escribe DONDE se lee el aviso. Antes esta celda decía
            «Manager → Títulos» y te mandaba a otra pantalla a buscar el bono:
            el agente hacía el 95% y el 5% quedaba a tres clics de distancia. */}
        {a.campo && !a.resuelto ? (
          <div className="flex items-center gap-1">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valor.trim()) completar(a.id, valor.trim());
              }}
              placeholder={a.campo.label}
              title={a.campo.ayuda}
              inputMode={a.campo.tipo === "numero" ? "decimal" : "text"}
              className="w-28 bg-transparent border border-[var(--t-border)] px-1 py-0.5 text-[10px] text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
            />
            <button
              disabled={!valor.trim()}
              onClick={() => completar(a.id, valor.trim())}
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] disabled:opacity-30 disabled:border-[var(--t-border)] disabled:text-[var(--t-text-dim)]"
            >
              Guardar
            </button>
          </div>
        ) : (
          a.donde
        )}
      </td>
      <td className="py-1 pr-3 text-[var(--t-text-dim)]">{a.por_que}</td>
      <td className="py-1 text-right whitespace-nowrap">
        <button
          onClick={() => resolver(a.id, a.resuelto)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          {a.resuelto ? "Reabrir" : "Marcar hecho"}
        </button>
      </td>
    </tr>
  );
}

// SE ROMPIÓ ALGO — lo que antes te frenaba con un modal propio.
//
// Muestra el chequeo, el motivo y la evidencia CONGELADA del momento en que se
// rompió: una vez que el job vuelve a correr, el motivo ya no existe y sin la
// foto no queda nada que mirar.
//
// SILENCIAR **no lo esconde**: sigue en la lista de SALUD con su estado real,
// solo deja de interrumpir. Un chequeo que desaparece al silenciarlo es un
// problema que se te olvida.
export function Rotos({ items, entendido }: {
  items: SaludRoto[];
  entendido: () => void;
}) {
  const { escribir } = useDatos();
  const [silenciando, setSilenciando] = useState("");
  const silenciar = async (chequeoId: string) => {
    setSilenciando(chequeoId);
    try {
      // Muta `salud_config`; nada de lo que el modal dibuja lo lee, así que la
      // declaración honesta es «no releo nada»: el poll de pendientes ya no lo
      // va a traer.
      await escribir("/api/ia/av-agent/salud/silenciar",
                     { chequeo_id: chequeoId, alertar: false }, []);
    } catch {
      /* si falla, sigue avisando — que es el lado seguro del error */
    }
    setSilenciando("");
  };
  return (
    <div className="border border-[var(--t-neg)]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--t-neg)]/10">
        <span className="text-[10px] font-semibold tracking-widest text-[var(--t-neg)]">
          SE ROMPIÓ ALGO · {items.length}
        </span>
        <button
          onClick={entendido}
          className="ml-auto text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          Entendido
        </button>
      </div>
      <ul className="divide-y divide-[var(--t-border)]">
        {items.map((r) => (
          <li key={r.id} className="px-3 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] text-[var(--t-text)]">
                {r.titulo ?? r.chequeo_id}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
                {r.familia}
              </span>
              <button
                disabled={silenciando === r.chequeo_id}
                onClick={() => void silenciar(r.chequeo_id)}
                title="Deja de interrumpir con este chequeo (sigue en la lista)"
                className="ml-auto text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40"
              >
                {silenciando === r.chequeo_id ? "…" : "silenciar"}
              </button>
            </div>
            {r.motivo && (
              <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                {r.motivo}
              </p>
            )}
            {r.evidencia && (
              <p className="text-[10px] leading-snug text-[var(--t-text-dim)] whitespace-pre-wrap">
                {r.evidencia}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


// ══ AHORA — EL DÍA DE HOY, Y NADA MÁS ══════════════════════════════════════
//
// ⚠️⚠️ **AHORA Y ENCONTRÓ ERAN LOS DOS UN BACKLOG.** Por eso nadie podía decir
// en qué se diferencian. La tab decía **AHORA 1** y abajo mostraba un control
// abierto hacía 21 horas, con 131 filas plegadas, 40 resueltas y el
// seguimiento de arreglos viejos. El user, 2026-08-22:
//
//   *«AHORA es para lo que está pasando EXCLUSIVAMENTE en el día de hoy…
//    ENCONTRÓ es donde está toda la cocina para solucionar cosas. AHORA es
//    solamente informativo y JUSTAMENTE NO PUEDE FALLAR.»*
//
// La jerarquía que queda:
//
//   AHORA      informa. Las tres novedades del día y el latido. Cero botones
//              de trabajo, cero listas plegadas, cero backlog.
//   ENCONTRÓ   la cocina: todo lo abierto, con sus herramientas.
//
// Lo que se fue de acá: «qué pide algo hoy», «¿los arreglos aguantan?», «viene
// de antes sin ver», «ya vistos» y «se arreglaron solos». **Ninguna era del
// día** — todas eran el acumulado con otro nombre.
//
// Y el latido pasa a ser UNA LÍNEA. El título REVISANDO + la cadencia ocupaban
// más que las novedades que tenían que anunciar, y repetían lo que ya dice la
// barra de arriba («censo hace 52 min · vigilando cada 30s»).
export function TabCentinela({ cent, recargar }: {
  cent: Centinela | null;
  recargar: () => void | Promise<void>;
}) {
  if (!cent) {
    return <p className="text-[11px] text-[var(--t-text-muted)]">Cargando…</p>;
  }

  const hoy = cent.hoy;
  // ⚠️ **SIN EL CORTE DEL DÍA NO SE INVENTA UN DÍA.** Si el backend viene viejo
  // (deploy desparejo), decir «hoy no pasó nada» sería justo la falla que esta
  // tab no puede tener: afirmar calma sin haber podido mirar.
  const nada = !!hoy && hoy.novedades === 0 && hoy.se_arreglo.length === 0
    && !(hoy.roto ?? []).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── EL LATIDO, EN UNA LÍNEA ─────────────────────────────────────────
          El punto verde y listo. La cadencia, los ciclos y cuándo se apagaría
          son datos del MECANISMO y viven en el `title`: no cambian nada de lo
          que uno hace. Lo único que sube a la línea es lo que sí cambia algo —
          que esté APAGADO, porque entonces el silencio de abajo no vale. */}
      <div className="flex items-center gap-2">
        <span className={`inline-block w-[7px] h-[7px] rounded-full ${
          cent.vivo && cent.latido?.en_rueda ? "animate-pulse" : ""}`}
              style={{ background: cent.vivo ? "var(--t-pos)" : "var(--t-neg)" }}
              title={cent.latido
                ? `Revisa cada ${cent.latido.cadencia_s}s · ${cent.latido.ciclo} revisiones · última hace ${cent.latido.hace_s}s`
                : "sin datos"} />
        {!cent.vivo && (
          <span className="text-[10px] font-semibold tracking-widest text-[var(--t-neg)]">
            SIN REVISAR
            <span className="ml-2 font-normal tracking-normal">
              hace {cent.latido ? Math.round(cent.latido.hace_s / 60) : "?"} min
            </span>
          </span>
        )}
        <button
          onClick={() => void recargar()}
          className="ml-auto text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
        >
          ↻
        </button>
      </div>

      {!cent.vivo && (
        <p className="text-[10px] text-[var(--t-neg)]">
          En el Droplet: <span className="font-mono">systemctl status av_agent_centinela</span>
        </p>
      )}

      {/* ── EL DÍA NO HÁBIL, DICHO (user, 2026-08-22: «hoy es SÁBADO, el
          mercado no abre — no puede pasar que un día no hábil se rompa
          algo»). Sin este renglón, un sábado tranquilo y un lunes roto se
          dibujan igual — y lo que quedó del viernes parece de hoy. */}
      {cent.habil === false && (
        <p className="text-[10px] text-[var(--t-text-muted)] border-l-2 border-[var(--t-border)] pl-2">
          <b className="text-[var(--t-text)]">Hoy no es día hábil</b> — el
          mercado no abre: los motores están apagados a propósito y nada de
          rueda se re-evalúa hasta el próximo hábil (lo que quede abajo con
          fecha de ayer quedó del último día de mercado). Lo único que{" "}
          <b>no puede pasar</b> hoy es actividad de mercado: si un motor
          escribe o un cron corre, lo canto acá como ROTO AHORA.
        </p>
      )}
      {cent.latido?.error && (
        <p className="text-[10px] text-[var(--t-neg)]">
          último error: {cent.latido.error}
        </p>
      )}

      {!hoy && (
        <p className="text-[11px] text-[var(--t-neg)]">
          No puedo separar lo de hoy — el backend todavía no manda el corte del
          día. Esto NO quiere decir que no haya pasado nada: mirá ENCONTRÓ.
        </p>
      )}

      {nada && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          {cent.vivo
            ? "Hoy no pasó nada nuevo. Lo que sigue abierto de antes está en ENCONTRÓ."
            : "Hoy no apareció nada — pero el agente está apagado, así que esto "
              + "no quiere decir que todo esté bien."}
        </p>
      )}

      {/* El orden es el de lo que informa, no el del alfabeto: un arreglo que
          falló es la única fila que cambia lo que uno pensaba que sabía. */}
      {hoy && (
        <>
          {/* ⚠️⚠️ **PRIMERO LO QUE ESTÁ ROTO AHORA.** El user: *«¿que estas
              alertas no estén en el AHORA?? ¿Cómo no me va a avisar justo de
              los motores en el AHORA?»*. Va arriba de las novedades porque un
              motor caído le corta el feed de precios a la mesa: no hay nada en
              esta pantalla que importe más. Y NO se filtra por día — con el
              corte por novedad, cuanto más tiempo llevaba roto menos se veía. */}
          <Novedad titulo="ROTO AHORA" filas={hoy.roto ?? []} tono="neg"
                   ayuda="confirmado recién: está roto en este momento" />
          {/* ⚠️⚠️ **LO QUE NO SE PUDO CONFIRMAR** (2026-08-24). El user, con
              cuatro motores en ROTO AHORA fechados tres días antes: *«es
              inaceptable que AHORA muestre cosas que no sean del día actual»*.
              Un detector que no corre no cierra lo suyo —correcto— pero la
              fila quedaba acá arriba afirmando «está roto AHORA» cuando lo
              único cierto era «estaba roto la última vez que alguien miró».
              No se esconde: el silencio se lee igual que un verde. Baja acá,
              plegado, diciendo hace cuánto que nadie la mira. */}
          <Novedad titulo="NO LO PUDE VERIFICAR" filas={hoy.sin_confirmar ?? []}
                   tono="texto" plegado
                   ayuda="sigue abierto, pero su detector no da señales — no sé si sigue pasando" />
          <Novedad titulo="VOLVIÓ" filas={hoy.volvio} tono="neg"
                   ayuda="se había arreglado y volvió" />
          <Novedad titulo="APARECIÓ HOY" filas={hoy.aparecio} tono="texto"
                   ayuda="no estaba ayer" />
          {/* PLEGADO: lo que se arregló no pide nada, y mezclado con lo que
              sí pide era lo que confundía. Se anuncia con su número y se abre
              si a alguien le interesa. */}
          <Novedad titulo="SE ARREGLÓ" filas={hoy.se_arreglo} tono="pos"
                   ayuda="cerró solo — no pide nada, es para que lo sepas"
                   plegado />
        </>
      )}
    </div>
  );
}


// Un bloque de novedad del día. **El mismo formato para las tres**: lo que
// cambia es el rótulo y el color, no la forma. Tres layouts distintos para tres
// listas de lo mismo es parte de lo que hacía ilegible la pantalla anterior.
export function Novedad({ titulo, filas, tono, ayuda, plegado = false }: {
  titulo: string;
  filas: Vigilado[];
  tono: "neg" | "pos" | "texto";
  ayuda: string;
  /** Arranca cerrado: el bloque se anuncia con su número y se abre con la
   *  flechita. Es para lo que **no pide nada** — el user: *«que venga como
   *  filtrado, si no confunde»*. Lo que hay que hacer NUNCA va plegado. */
  plegado?: boolean;
}) {
  const [abierto, setAbierto] = useState(!plegado);
  if (!filas.length) return null;
  const color = tono === "neg" ? "var(--t-neg)"
    : tono === "pos" ? "var(--t-pos)" : "var(--t-text)";
  return (
    <div>
      <div className="flex items-baseline gap-2">
        {plegado ? (
          <button onClick={() => setAbierto((v) => !v)}
                  className="flex items-baseline gap-2 hover:opacity-80">
            <span className="text-[9px] text-[var(--t-text-dim)] w-2 inline-block">
              {abierto ? "\u25be" : "\u25b8"}
            </span>
            <h3 className="text-[10px] font-semibold tracking-widest" style={{ color }}>
              {titulo}
            </h3>
            <span className={SUB}>{filas.length}</span>
          </button>
        ) : (
          <>
            <h3 className="text-[10px] font-semibold tracking-widest" style={{ color }}>
              {titulo}
            </h3>
            <span className={SUB}>{filas.length}</span>
          </>
        )}
        {abierto && (
          <span className="text-[9px] text-[var(--t-text-dim)]">{ayuda}</span>
        )}
      </div>
      {abierto && (
      <div className="mt-1 border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {filas.map((f, i) => (
          <div key={f.clave}
               className="grid grid-cols-[3px_minmax(120px,auto)_150px_1fr_auto] items-baseline gap-2 px-2 py-1">
            <span className="self-stretch" style={{ background: SEV_COLOR[f.severidad] }} />
            {/* ⚠️ **NO SE TRUNCA.** El user: *«los títulos no pueden estar así
                cortados, no se entiende nada»* — y tenía razón:
                `control:patas_equiv…` no dice absolutamente nada. Dos cambios:
                el backend manda el nombre SIN el prefijo de familia (que ya se
                lee en la columna de al lado) y la columna deja de tener ancho
                fijo. El sujeto crudo queda en el `title`: para buscarlo en la
                base hace falta el nombre exacto. */}
            <span className="text-[11px] font-bold text-[var(--t-text)] whitespace-nowrap"
                  title={f.sujeto}>
              {f.nombre || f.sujeto}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                  title={f.regla}>
              {f.regla.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-[var(--t-text-muted)] leading-snug min-w-0">
              <Motivo f={f} anterior={filas[i - 1]} />
            </span>
            {/* ⚠️ La HORA, no «hace 21 h». En una lista que YA es del día, «hace
                cuánto» obliga a hacer la resta para ubicar el hecho — y era
                justamente lo que dejaba pasar una fila vieja por nueva. */}
            <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums whitespace-nowrap self-center"
                  title={`confirmado ${f.ultimo_at}`}>
              {f.cuando_dice ? `${f.cuando_dice} ` : ""}
              {hora(f.cuando ?? f.vuelto_at ?? f.resuelto_at ?? f.abierto_at)}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}


// El MOTIVO de una fila, sin repetirlo y con el contexto que ya existía.
//
// ⚠️ **DOS QUEJAS, UNA SOLA CAUSA: el renglón no distingue lo que se repite de
// lo que es propio de esa fila.**
//
// (1) *«nuevamente lo que te dije mil veces»* — tres filas seguidas de
//     `sin_tea_con_precio` escribían las MISMAS dos líneas de texto («tiene
//     precio y flujo pero el motor no persiste TEA…»). El motivo es de la
//     REGLA, no del bono: repetirlo por fila ocupa tres renglones para decir
//     una sola cosa, y encima esconde lo que sí cambia, que es el ticker. Se
//     escribe UNA vez y las siguientes muestran «↑ mismo motivo».
//
// (2) *«sin información, sin contexto… si tenemos los logs tenemos los datos»* —
//     al revés en los motores: ahí el texto largo (`evidencia.texto`, con QUÉ
//     PASÓ · A QUÉ AFECTA · SI SIGUE) **ya venía del backend desde siempre** y
//     la pantalla dibujaba solo el título recortado. Los datos estaban; no se
//     mostraban.
//
// Las dos se arreglan con la misma regla: **mostrar lo que esta fila agrega**.
export function Motivo({ f, anterior }: { f: Vigilado; anterior?: Vigilado }) {
  const repetido = !!anterior && anterior.motivo === f.motivo;
  return (
    <>
      {repetido ? (
        <span className="text-[var(--t-text-dim)]" title={f.motivo}>
          ↑ mismo motivo
        </span>
      ) : (
        <span>{f.motivo}</span>
      )}
      {/* El contexto propio de ESTA fila. Va siempre —también cuando el motivo
          se repite— porque es justamente lo que la distingue. */}
      {f.detalle && (
        <span className="block text-[9px] text-[var(--t-text-dim)] leading-snug whitespace-pre-wrap">
          <Marcado t={f.detalle} />
        </span>
      )}
      {/* La línea de log CRUDA, detrás de un `title`: es la evidencia, y quien
          la necesita la busca — ocupando cero renglones para el que no. */}
      {f.muestra && (
        <span className="block text-[9px] font-mono text-[var(--t-text-dim)] truncate"
              title={f.muestra}>
          {f.muestra.split("\n")[0]}
        </span>
      )}
    </>
  );
}
