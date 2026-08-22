"use client";

// AV AGENT — botón en la barra inferior + MODAL (docs/AV_AGENT.md en el backend).
//
// El agente compara `mercado.curvas` contra 1816, encuentra huecos y errores, y
// PREGUNTA lo que no puede decidir solo. Acá pasa esa conversación.
//
// **Por qué modal y no vista** (decisión del user 2026-08-16): el AV Agent no es
// una vista de datos que se consulta, es algo que INTERRUMPE cuando tiene algo
// que preguntar. Una vista en el nav compite con RENTA FIJA y TRADING —
// pantallas que se abren para trabajar— y pierde: nadie navega a un agente. Un
// botón en la barra de estado, al lado de BRIEFING y SALUD, dice lo que es: un
// canal siempre presente que no ocupa lugar hasta que lo abrís.
//
// **ADMIN-ONLY, decidido en el server** (layout.tsx, igual que SALUD): sin el
// módulo el componente NO EXISTE en el HTML, no pollea y no puede mostrar nada.
// El gate real es el backend (require_admin); esto es defensa en profundidad.
//
// Tres decisiones del contenido, ninguna cosmética:
//
// 1. LAS PREGUNTAS SON EL TAB DEFAULT. Los hallazgos son informativos; las
//    preguntas son lo único que el agente no puede resolver solo. Abrir en la
//    lista de 64 problemas deja las 27 preguntas sin contestar, y sin respuestas
//    el agente no aprende.
// 2. EL AGENTE HABLA EN PRIMERA PERSONA. La diferencia entre "hallazgos: 24" y
//    "encontré 24 bonos que no tenés, ¿cuáles te interesan?" es si se entiende
//    que a uno le toca hacer algo. Un tablero no se contesta; una pregunta sí.
// 3. DICE LO QUE NO PUEDE HACER. `capacidades.puede_dar_de_alta` viene del
//    backend: hoy «alta» GUARDA la decisión pero no da de alta nada (eso es E2).
//    Sin decirlo, el botón se lee como roto.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// LA CAPA DE DATOS (src/components/av-agent/datos.tsx) es el ÚNICO lugar del
// modal que habla con la red — acá no se importa fetch-json (lo garantiza
// eslint). Tres verbos: leer (GET) · llamar (POST que calcula) · escribir
// (POST que muta y DECLARA qué recursos relee). Ver el porqué en el header de
// ese archivo y en docs/AV_AGENT.md §0.cj.
import { DatosProvider, useDatos } from "@/components/av-agent/datos";
import { Rotos, TabCentinela, TabPreguntas, TabAvisos } from "@/components/av-agent/tab-ahora";
import { TabHallazgos } from "@/components/av-agent/tab-hallazgos";
import { TabHizo, TabMando, TabDecidido } from "@/components/av-agent/tab-historial";
import { TabAgenda } from "@/components/av-agent/tab-agenda";
import { TabSkills } from "@/components/av-agent/tab-skills";
import { TabControl } from "@/components/av-agent/tab-control";
import { Modo, ResSim, Hallazgo, Vista,
         SaludRoto, Centinela, Control, haceCuanto, Tab,
         AgendaVista } from "@/components/av-agent/tipos";

// ── Contrato GET /api/ia/av-agent/vista ────────────────────────────────────
// La firma de `simular`, **escrita UNA vez**. Estaba duplicada en tres lugares
// (el `useCallback` que la crea y los dos componentes que la reciben como prop) y
// al sumar el modo `arreglo` quedó actualizada en dos de los tres: el build de
// Vercel falló con «Type "arreglo" is not assignable to "alta" | "flujos"».
//
// Es el MISMO patrón que venimos persiguiendo todo el día —un criterio copiado
// que nada obliga a mantener de acuerdo— solo que en TypeScript el compilador sí
// avisa. Con un alias, agregar un modo es una línea y no puede quedar a medias.
// `salud` es la CUARTA puerta y la única de SOLO LECTURA: diagnostica un chequeo
// del sistema (un cron, una tabla que quedó vieja) con las mismas ocho lentes que
// un bono, y no escribe nada. Comparte el componente a propósito — que SALUD y un
// bono se lean IGUAL es lo que permite que una sola cabeza mire las dos cosas.

// El export es el PROVIDER + la implementación: la capa tiene que envolver
// también al botón de la barra (el centinela se pollea con el modal cerrado).
export function AvAgentModal() {
  return (
    <DatosProvider>
      <ModalImpl />
    </DatosProvider>
  );
}

function ModalImpl() {
  const { datos, errores, recargar, leer, llamar, escribir } = useDatos();
  const [open, setOpen] = useState(false);
  // Los RECURSOS del servidor viven en la capa (sobreviven a cualquier
  // desmontaje y tienen UN dueño); acá quedan solo los alias tipados.
  const data = (datos.vista ?? null) as Vista | null;
  const ctrl = (datos.control ?? null) as Control | null;
  const cent = (datos.centinela ?? null) as Centinela | null;
  const agenda = (datos.agenda ?? null) as AgendaVista | null;
  // Errores de ESCRITURA (estado de pantalla). El de LECTURA de la vista viene
  // de la capa: 403 = no es admin → el botón se apaga solo (gate estructural).
  const [error, setError] = useState("");
  const errorVista = errores.vista ?? "";
  const [tab, setTab] = useState<Tab>("ahora");
  const [subHist, setSubHist] = useState("hizo");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [notas, setNotas] = useState<Record<number, string>>({});
  // Simulaciones por ticker. `null` = corriendo. El resultado se guarda para que
  // uno pueda mirar el número antes de aplicar — que es todo el punto de E2.
  const [sims, setSims] = useState<Record<string, Record<string, unknown> | null>>({});

  // VOLVER A MIRAR. El botón vive al lado de «última revisión hace 22 h» a
  // propósito: el reclamo y la solución tienen que estar en el mismo lugar.
  const [relevando, setRelevando] = useState(false);
  const [relevAviso, setRelevAviso] = useState("");

  const relevar = useCallback(async () => {
    setRelevando(true);
    setRelevAviso("censando 1816… ~1 min");
    try {
      const r = await llamar<{ ok: boolean; error?: string; aviso?: string }>(
        "/api/ia/av-agent/relevar");
      if (!r.ok) { setRelevAviso(r.error ?? "no se pudo"); setRelevando(false); }
    } catch (e) {
      setRelevAviso(e instanceof Error ? e.message : String(e));
      setRelevando(false);
    }
  }, [llamar]);

  // EL CENTINELA se pollea SIEMPRE —esté el modal abierto o no— porque el
  // círculo de la barra tiene que decir la verdad sin que nadie abra nada.
  // Un poll que falla no apaga el círculo por su cuenta (la capa conserva el
  // dato viejo): lo apaga el LATIDO viejo. Confundir «no pude preguntar» con
  // «está muerto» daría una alarma cada vez que se corta el wifi.
  const cargarCentinela = useCallback(() => recargar("centinela"), [recargar]);

  const marcarVisto = useCallback(async (claves: string[]) => {
    try {
      await escribir("/api/ia/av-agent/centinela/visto", { claves },
                     ["centinela"]);
    } catch { /* ignorado: el próximo poll trae el estado real */ }
  }, [escribir]);

  const cargarControl = useCallback(() => recargar("control"), [recargar]);
  const cargarAgenda = useCallback(() => recargar("agenda"), [recargar]);
  const cargar = useCallback(() => recargar("vista"), [recargar]);

  // Mientras releva, se pregunta si terminó. Cuando termina, se recarga la vista
  // sola: pedir «volver a mirar» y tener que apretar ↻ después sería la mitad
  // del trabajo.
  useEffect(() => {
    if (!relevando) return;
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const e = await leer<{ si: boolean }>("/api/ia/av-agent/relevar");
        if (!vivo || e.si) return;
        clearInterval(id);
        setRelevando(false);
        setRelevAviso("");
        await cargar();
      } catch { /* el próximo tick reintenta */ }
    }, 4000);
    return () => { vivo = false; clearInterval(id); };
  }, [relevando, cargar, leer]);

  // Una sola carga al montar, para tener el contador en la barra sin abrir nada.
  // El tablero viene con ella: **la PARADA tiene que verse en la barra**, no
  // adentro de una tab que hay que ir a buscar. Un agente frenado del que uno se
  // entera abriendo el modal es un agente que va a quedar frenado tres días.
  useEffect(() => { void cargar(); void cargarControl(); void cargarAgenda(); },
            [cargar, cargarControl, cargarAgenda]);

  // El latido es de 30s: pollear cada 20 deja el círculo como mucho un ciclo
  // atrasado. Es UN request chico y es lo que sostiene la afirmación «prendido».
  useEffect(() => {
    void cargarCentinela();
    const id = setInterval(() => void cargarCentinela(), 20_000);
    return () => clearInterval(id);
  }, [cargarCentinela]);

  // ── LA INTERRUPCIÓN ────────────────────────────────────────────────────────
  //
  // Esto vivía en un modal aparte (`SaludAlertasModal`), que se dio de baja el
  // 2026-08-19 junto con toda la pantalla de SALUD: *«todo pasa 100% por el
  // agent»*. Pero **la capacidad no se podía perder**, y es la razón por la que
  // SALUD existe: el backfill de tenencias falló dos días y nadie se enteró
  // porque la señal ESPERABA en una pantalla en vez de buscar al admin. Un
  // tablero que hay que abrir para enterarse es un tablero que no se abre.
  //
  // Se mantienen las reglas que la hacían tolerable, porque son las que evitan
  // que uno aprenda a cerrarla sin leer:
  //  - solo ante una transición NUEVA a problema **que este admin no vio**;
  //  - que algo se ARREGLE nunca abre nada (lo filtra el backend);
  //  - **nunca en intervalo fijo**: si ya está abierto, no se toca.
  const [rotos, setRotos] = useState<SaludRoto[]>([]);
  const yaAvisado = useRef(false);

  const mirarPendientes = useCallback(async () => {
    try {
      const r = await leer<{ pendientes?: SaludRoto[] }>(
        "/api/ia/av-agent/salud/pendientes");
      const p = r.pendientes ?? [];
      setRotos(p);
      // Abre UNA vez por tanda. Sin el flag, cada poll de 5' reabriría lo mismo
      // sobre alguien que ya lo estaba mirando.
      if (p.length && !yaAvisado.current) {
        yaAvisado.current = true;
        setOpen(true);
        setTab("ahora");
        void cargar();
      }
      if (!p.length) yaAvisado.current = false;
    } catch {
      /* 403 (no admin) o backend caído: la barra sigue andando, sin interrumpir */
    }
  }, [cargar, leer]);

  useEffect(() => {
    void mirarPendientes();
    const id = setInterval(() => void mirarPendientes(), 5 * 60_000);
    return () => clearInterval(id);
  }, [mirarPendientes]);

  const entendido = useCallback(async () => {
    try {
      await escribir("/api/ia/av-agent/salud/vistos",
                     { ids: rotos.map((r) => r.id) }, []);
    } catch {
      /* si falla, vuelve a avisar en el próximo poll — que es lo correcto */
    }
    setRotos([]);
  }, [rotos, escribir]);

  const responder = useCallback(async (id: number, respuesta: string) => {
    setEnviando(id);
    try {
      await escribir("/api/ia/av-agent/responder",
                     { id, respuesta, nota: notas[id] || "" }, ["vista"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(null);
    }
  }, [escribir, notas]);

  const setParada = useCallback(async (activa: boolean, motivo: string) => {
    try {
      const r = await escribir<{ ok: boolean; error?: string }>(
        "/api/ia/av-agent/control/parada", { activa, motivo }, ["control"]);
      if (r.ok === false) setError(r.error ?? "no se pudo cambiar la parada");
      else setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [escribir]);

  const resolverAviso = useCallback(async (id: number, deshacer: boolean) => {
    try {
      await escribir("/api/ia/av-agent/aviso", { id, deshacer }, ["vista"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [escribir]);

  const completarAviso = useCallback(async (id: number, valor: string) => {
    try {
      await escribir("/api/ia/av-agent/aviso/completar", { id, valor },
                     ["vista"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [escribir]);

  // «No me interesa» desde CUALQUIER hallazgo. Antes solo se podía ignorar
  // contestando una pregunta del agente, y solo valía para los faltantes.
  const ignorar = useCallback(async (ticker: string) => {
    try {
      await escribir("/api/ia/av-agent/ignorar", { ticker }, ["vista"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [escribir]);

  const designorar = useCallback(async (ticker: string) => {
    try {
      // POST y no DELETE: el proxy catch-all de /api/ia expone solo GET y POST.
      await escribir("/api/ia/av-agent/designorar", { ticker }, ["vista"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [escribir]);

  // `extra` lleva los datos que el user tipeó EN la cadena (hoy: el CER de
  // emisión). Viajan igual a SIMULAR y a APLICAR, así que lo que se aplica es
  // exactamente lo que se vio simulado — no una segunda cuenta con otros
  // insumos.
  const simular = useCallback(async (ticker: string, curva1816: string,
                                     aplicar = false,
                                     extra: Record<string, unknown> = {},
                                     modo: Modo = "alta") => {
    setSims((s) => ({ ...s, [ticker]: null }));
    // Dos rutas porque son dos escrituras DISTINTAS: el alta crea el bono entero;
    // `flujos` completa el cronograma de uno que ya existe y no toca nada más.
    // Tres puertas, tres escrituras DISTINTAS: el alta crea el bono entero,
    // `flujos` completa un cronograma vacío y `arreglo` PISA un insumo que ya
    // está. Compartir ruta las haría indistinguibles en el libro de acciones.
    const ruta = modo === "apuntar"
      // ⚠️ **EL BOTÓN QUE FALTABA, Y POR ESO VOLVÍAN 17 VECES.** `pata/pedir`
      // trae una pata que YA cotizaba y deja `mercado.curvas` apuntando a la de
      // pesos: el user apretaba, salía «✔ pedida» y a la rueda siguiente estaban
      // todos de nuevo. Esto corrige el master (columna + blob) **y** pide la
      // pata, así se ve en 5s sin reiniciar el motor.
      ? "pata/apuntar"
      : modo === "pata"
      // La ÚNICA puerta de rueda que además escribe. `pata` busca (solo lectura)
      // y `pata/pedir` siembra la especie si falta y la suscribe — el motor la
      // levanta en 5s, sin reiniciar y en plena rueda.
      ? (aplicar ? "pata/pedir" : "pata")
      : modo === "sin_precio"
      ? "sin-precio"
      // ⚠️ **NO ES LA CADENA DE CURVAS.** `sin_espejo_en_assets` se emite con
      // tipo `tasa_sospechosa`, así que sin este desvío DIAGNOSTICAR abría el
      // arreglo de curvas y mostraba veinte pasos de 1816, paridad y XIRR sobre
      // un bono cuyo problema es una fila de catálogo. El user: *«¿qué tiene que
      // ver la paridad y la valuación? Justamente no tiene nada que ver con
      // 1816»*. El desvío lo decide el BACKEND (`ACCION_POR_REGLA`); acá solo se
      // enruta.
      : modo === "espejo"
      ? "espejo"
      : modo === "salud"
      ? "salud"
      : modo === "flujos"
      ? (aplicar ? "aplicar-flujos" : "simular-flujos")
      : modo === "arreglo"
      ? (aplicar ? "aplicar-arreglo" : "simular-arreglo")
      : (aplicar ? "aplicar-alta" : "simular");
    try {
      // SALUD habla de un CHEQUEO, no de un ticker: el sujeto del hallazgo es
      // el id del cron. El campo `ticker` del hallazgo lo transporta (ver el
      // comentario de `detectar_salud` en el backend).
      const body = modo === "salud"
        ? { chequeo_id: ticker }
        : modo === "apuntar"
        // El backend NO escribe sin `aplicar`: sin él devuelve qué haría.
        ? { ticker, aplicar }
        : (modo === "sin_precio" || modo === "pata" || modo === "espejo")
        ? { ticker }
        : { ticker, curva_1816: curva1816, ...extra };
      // Simular CALCULA (llamar); aplicar MUTA y por contrato relee la vista.
      const url = `/api/ia/av-agent/${ruta}`;
      const r = aplicar
        ? await escribir<Record<string, unknown>>(url, body, ["vista"])
        : await llamar<Record<string, unknown>>(url, body);
      setSims((s) => ({ ...s, [ticker]: r }));
      return r as ResSim;
    } catch (e) {
      const err = { ok: false, error: String(e) };
      setSims((s) => ({ ...s, [ticker]: err }));
      return err;
    }
  }, [llamar, escribir]);

  const porTipo = useMemo(() => {
    const g: Record<string, Hallazgo[]> = {};
    for (const h of data?.hallazgos ?? []) (g[h.tipo] ??= []).push(h);
    return g;
  }, [data]);

  // Sin datos (403 del backend / API caída) el botón NO se monta: un botón que
  // abre un modal vacío es peor que no tenerlo.
  if (!data && errorVista) return null;

  const nPreg = (data?.preguntas.length ?? 0) + (data?.decisiones.length ?? 0);
  // Lo que espera una decisión: lo nuevo del centinela + las preguntas + los
  // avisos abiertos. Es UN número, y es el único que tiene que mirar el que
  // abre la pantalla para saber si hay algo que hacer.
  // ⚠️ **EL CONTADOR TIENE QUE CONTAR LO QUE LA TAB MUESTRA** (§0.bo). Decía
  // `cent.sin_ver`, o sea el BACKLOG sin ver — por eso ponía «AHORA 1» y abajo
  // salía un control de hacía 21 horas: el número y la lista hablaban de cosas
  // distintas. Ahora cuenta las novedades del DÍA, que es lo único que la tab
  // dibuja. Las preguntas y los avisos siguen sumando: también esperan algo.
  const nAhora = (cent?.hoy?.novedades ?? 0) + nPreg
    + (data?.avisos ?? []).filter((a) => !a.resuelto).length;

  return (
    <>
      <button
        onClick={() => { void cargar(); setOpen(true); }}
        title={cent?.vivo
          ? `El agente está revisando cada ${cent.latido?.cadencia_s}s`
          + ` (última hace ${cent.latido?.hace_s}s)`
          : "El agente NO está revisando"}
        className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
      >
        {/* EL CÍRCULO. Verde = el centinela está vigilando AHORA; gris = nadie
            está mirando. Lo decide la EDAD del último latido, no que alguna vez
            haya corrido — un verde que no se puede apagar solo no informa nada.
            Late mientras está en rueda: el pulso distingue de un vistazo
            «vigilando» de «prendido pero dormido». */}
        <span
          aria-hidden
          className={`inline-block w-[6px] h-[6px] rounded-full ${
            cent?.vivo
              ? (cent.latido?.en_rueda ? "animate-pulse" : "")
              : ""}`}
          style={{ background: cent?.vivo ? "var(--t-pos)" : "var(--t-text-dim)" }}
        />
        <span className="tracking-widest">AV AGENT</span>
        {/* ⚠️ **EL BADGE CUENTA LO MISMO QUE LA TAB QUE ABRE** (user,
            2026-08-22: «abajo me marca 7 y entrás y son 10»). Acá había DOS
            badges con OTROS números: el rojo era `cent.sin_ver` (el backlog
            sin ver, que vive en ENCONTRÓ → VIGILANCIA) y el otro las
            preguntas — ninguno era lo que AHORA muestra. Es la misma regla de
            §0.bo aplicada un nivel más arriba: un contador que no cierra con
            la lista que abre hace dudar de los dos. Ahora es UN badge =
            `nAhora`, exactamente el número que la tab AHORA lleva en su
            pestaña. */}
        {nAhora > 0 && (
          <span className="px-1 rounded-sm bg-[var(--t-neg)] text-[var(--t-on-accent)] text-[9px] font-bold tabular-nums">
            {nAhora}
          </span>
        )}
      </button>

      {open && data && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl bg-[var(--t-panel)] border border-[var(--t-accent)] flex flex-col overflow-hidden"
          >
            {/* ── Header: identidad + estado de la última revisión ────────── */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--t-border)]">
              <span className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                ◆ AV AGENT
              </span>
              {/* ⚠️ **DOS RELOJES, DOS VERBOS** (user, 2026-08-19: *«es raro,
                  dice REVISANDO cada 30 seg y arriba dice revisado hace 8 min»*).
                  Tenía razón y no era un bug: son dos cosas distintas que se
                  llamaban igual.

                    CENSO       contra 1816 — cuesta ~29 créditos, corre de noche
                                o cuando apretás VOLVER A MIRAR. Es lo que llena
                                ENCONTRÓ.
                    VIGILANCIA  local, cada 30s en rueda, cero créditos. Es lo
                                que llena AHORA.

                  Con las dos diciendo «revisado» la pantalla se contradecía sola.
                  Ahora cada una usa su palabra y acá se muestran JUNTAS: el que
                  mira ve los dos ritmos de una y no tiene que deducir cuál es
                  cuál. */}
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]"
                    title="El censo completo contra 1816: es el que llena ENCONTRÓ.">
                censo {haceCuanto(data.corrida_at)}
              </span>
              {cent && (
                <span className="text-[10px] font-mono"
                      style={{ color: cent.vivo ? "var(--t-text-dim)" : "var(--t-neg)" }}
                      title={cent.vivo
                        ? "La vigilancia en vivo, local y sin créditos: es la que llena AHORA."
                        : "El centinela no está dando señales."}>
                  · {cent.vivo
                      ? `vigilando cada ${cent.latido && cent.latido.cadencia_s >= 60
                          ? `${Math.round(cent.latido.cadencia_s / 60)} min` : "30s"}`
                      : "sin vigilar"}
                </span>
              )}
              {/* VOLVER A MIRAR — censa 1816 de nuevo. Va pegado al «hace 22 h»
                  porque es la respuesta a lo que ese texto está diciendo. El ↻
                  de al lado NO es lo mismo y por eso los dos llevan su título:
                  uno relee lo guardado, el otro sale a preguntar. */}
              <button
                disabled={relevando}
                onClick={() => void relevar()}
                title="Volver a mirar AHORA: censa 1816 (~29 créditos, ~1 min)"
                className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
              >
                {relevando ? "mirando…" : "↻ volver a mirar"}
              </button>
              {relevAviso && (
                <span className="text-[9px] text-[var(--t-text-dim)]">{relevAviso}</span>
              )}
              <button
                onClick={() => void cargar()}
                title="Releer lo guardado (NO vuelve a censar 1816)"
                className="text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
              >
                ↻
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[14px] leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* ── LA PARADA, si está puesta ───────────────────────────────
                Va ACÁ y no adentro de la tab CONTROL a propósito: el agente
                frenado tiene que gritarlo desde cualquier pantalla. Si hubiera
                que abrir una tab para enterarse, la parada de un martes se
                descubre el viernes cuando alguien se pregunta por qué el botón
                APLICAR devuelve un error raro. */}
            {ctrl?.parada.parada && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--t-neg)]/15 border-b border-[var(--t-neg)]">
                <span className="text-[10px] font-semibold tracking-widest text-[var(--t-neg)]">
                  ■ AGENTE FRENADO
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)] truncate">
                  {ctrl.parada.motivo}
                  {ctrl.parada.por ? ` · la puso ${ctrl.parada.por}` : ""}
                </span>
                <button
                  onClick={() => void setParada(false, "")}
                  className="ml-auto shrink-0 text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-neg)] text-[var(--t-neg)] hover:bg-[var(--t-neg)] hover:text-[var(--t-on-accent)]"
                >
                  Reanudar
                </button>
              </div>
            )}

            {/* ── Tabs ───────────────────────────────────────────────────── */}
            <div className="flex items-stretch border-b border-[var(--t-border)] bg-[var(--t-surface)]">
              {/* SIETE tabs era un menú, no una jerarquía: ME PREGUNTA · AVISOS ·
                  ENCONTRÓ · HIZO · YA DECIDIDO · CONTROL · EN VIVO, todas al
                  mismo peso, y el que abre no sabe por dónde empezar.
                  Quedan TRES, agrupadas por lo que hay que HACER con cada una:

                    AHORA      → algo espera una decisión tuya
                    ENCONTRÓ   → la lista de trabajo
                    HISTORIAL  → lo que ya pasó (no se acciona)

                  y CONTROL pasa a un ⚙ a la derecha: se toca una vez cada mucho
                  y no compite con lo que sí se mira todos los días. */}
              {([
                ["ahora", "AHORA", nAhora],
                ["hallazgos", "ENCONTRÓ", data.hallazgos.length],
                ["historial", "HISTORIAL",
                  (data.acciones ?? []).length + data.decididas.length],
              ] as [Tab, string, number][]).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-4 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px transition-colors ${
                    tab === k
                      ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                      : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
                </button>
              ))}
              {error && (
                <span className="ml-auto self-center px-3 text-[10px] text-[var(--t-neg)] truncate max-w-[40%]">
                  {error}
                </span>
              )}
              {/* SKILLS va A LA DERECHA y SIN contador, separada de las otras
                  tres. Las de la izquierda son una BANDEJA —lo que hay para
                  hacer hoy, y por eso llevan número—; SKILLS es el catálogo de
                  lo que el agente sabe hacer: no se «atiende», se consulta. Y el
                  contador estaba clavado en 0, que además de inútil se leía como
                  «no tiene ninguna». */}
              {/* CONTROL — *«qué estoy haciendo»*. Va PEGADA a SKILLS porque son
                  las dos caras de lo mismo y se leen juntas: SKILLS dice **qué
                  sé hacer** y CONTROL dice **si lo estoy haciendo**. Un catálogo
                  sin la segunda pregunta promete capacidades sin decir cuáles
                  corren de verdad, que es justo lo que el user quiere poder
                  mostrarle a alguien de afuera. El número solo aparece si hay
                  algo atrasado o sin poder juzgar: un contador que siempre está
                  se deja de mirar. */}
              <button
                onClick={() => setTab("agenda")}
                title="Todo lo que el agente monitorea durante el día, con su ritmo y su última corrida"
                className={`${error ? "" : "ml-auto "}px-4 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px border-l border-l-[var(--t-border)] transition-colors ${
                  tab === "agenda"
                    ? "border-b-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-b-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
              >
                CONTROL
                {(agenda?.atrasados ?? 0) + (agenda?.sin_juzgar ?? 0) > 0 && (
                  <span className="ml-1.5 tabular-nums text-[#f59e0b]">
                    {(agenda?.atrasados ?? 0) + (agenda?.sin_juzgar ?? 0)}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab("skills")}
                title="Todo lo que el agente sabe hacer, y cuáles usan IA"
                className={`px-4 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px border-l border-l-[var(--t-border)] transition-colors ${
                  tab === "skills"
                    ? "border-b-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-b-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
              >
                SKILLS
              </button>
              {/* CONTROL, en un ⚙ a la derecha. Se toca una vez cada mucho —la
                  parada, el estado de las fuentes— y como tab competía con lo
                  que sí se mira todos los días. El contador solo aparece si hay
                  algo que no está en verde: un ⚙ con número pide atención, uno
                  sin número es una herramienta guardada. */}
              <button
                onClick={() => setTab(tab === "control" ? "ahora" : "control")}
                title="Parada de emergencia y estado de las fuentes"
                className={`px-3 text-[11px] border-b-2 -mb-px transition-colors ${
                  tab === "control"
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
              >
                ⚙
                {(ctrl?.resumen.bloquea ?? 0) + (ctrl?.resumen.revisar ?? 0) > 0 && (
                  <span className="ml-1 text-[9px] tabular-nums text-[#f59e0b]">
                    {(ctrl?.resumen.bloquea ?? 0) + (ctrl?.resumen.revisar ?? 0)}
                  </span>
                )}
              </button>
            </div>

            {/* ── Cuerpo ─────────────────────────────────────────────────── */}
            <div className="overflow-y-auto max-h-[74vh] p-4">
              {/* AHORA junta lo que espera una decisión: el centinela en vivo,
                  las preguntas y los avisos. Eran tres tabs que uno tenía que
                  recorrer para saber si había algo que hacer. */}
              {tab === "ahora" && (
                <div className="flex flex-col gap-5">
                  {/* SE ROMPIÓ ALGO — va PRIMERO y por encima de todo. Es lo
                      único que abre el modal solo, así que si abrió por esto y
                      el motivo quedara a mitad de la pantalla, la interrupción
                      no se explicaría a sí misma. */}
                  {rotos.length > 0 && (
                    <Rotos items={rotos} entendido={entendido} />
                  )}
                  <TabCentinela cent={cent} recargar={cargarCentinela} />
                  {nPreg > 0 && (
                    <TabPreguntas
                      data={data} enviando={enviando} notas={notas}
                      setNota={(id, v) => setNotas((n) => ({ ...n, [id]: v }))}
                      responder={responder}
                      setTab={setTab}
                    />
                  )}
                  {(data.avisos ?? []).some((a) => !a.resuelto) && (
                    <TabAvisos avisos={data.avisos ?? []} resolver={resolverAviso}
                               completar={completarAviso} />
                  )}
                </div>
              )}
              {tab === "hallazgos" && (
                <TabHallazgos porTipo={porTipo} data={data} sims={sims}
                              simular={simular} ignorar={ignorar}
                              cent={cent} marcarVisto={marcarVisto} />
              )}
              {/* HISTORIAL: lo que ya pasó. No se acciona, así que no merece dos
                  tabs — se lee de arriba abajo y listo. */}
              {/* UNA cosa por vez. Apilar «lo que hice» y «lo ya decidido» en la
                  misma pantalla dejaba dos tablas y cuatro listas encimadas — el
                  user: «no puede estar todo junto como si nada, la vista es para
                  una sola cosa». El selector va donde estaba el párrafo que se
                  fue: mismo lugar, ahora sirve para algo. */}
              {tab === "historial" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {([["hizo", "LO QUE HIZO", (data.acciones ?? []).length],
                       ["mensajes", "MANDÓ", (data.mensajes ?? []).length],
                       ["decidido", "YA DECIDIDO", data.decididas.length]] as
                       [string, string, number][]).map(([k, label, n]) => (
                      <button
                        key={k}
                        onClick={() => setSubHist(k)}
                        className={`text-[9px] font-semibold uppercase tracking-widest px-2 py-1 border transition-colors ${
                          subHist === k
                            ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                            : "border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
                      >
                        {label} <span className="tabular-nums opacity-70">{n}</span>
                      </button>
                    ))}
                  </div>
                  {subHist === "hizo"
                    ? <TabHizo acciones={data.acciones ?? []} />
                    : subHist === "mensajes"
                    ? <TabMando mensajes={data.mensajes ?? []} />
                    : <TabDecidido data={data} designorar={designorar} />}
                </div>
              )}
              {tab === "control" && (
                <TabControl ctrl={ctrl} setParada={setParada} recargar={cargarControl} />
              )}
              {tab === "agenda" && (
                <TabAgenda v={agenda} recargar={cargarAgenda} />
              )}
              {tab === "skills" && (
                <TabSkills />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
