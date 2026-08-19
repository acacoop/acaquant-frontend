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

import { fetchJson } from "@/lib/fetch-json";

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
type Modo = "alta" | "flujos" | "arreglo" | "salud" | "sin_precio";
// Devuelve una PROMESA, no `void`. Con `void` el `await` del lote no esperaba
// nada y las 10 aplicaciones salían todas juntas: se pisan entre sí escribiendo
// en `mercado.curvas` y el error de una se pierde entre las otras nueve. El tipo
// es lo único que hace que el compilador sostenga esa garantía.
// Devuelve el RESULTADO, no `void`. Dos motivos y los dos se pagaron: con
// `void` el `await` del lote no esperaba nada (las 10 aplicaciones salían
// juntas y se pisaban escribiendo en `mercado.curvas`), y el resumen «8 de 10»
// no se puede armar leyendo `sims` dentro del loop — el estado de React se
// actualiza asincrónico y ahí adentro todavía tiene el valor viejo.
type ResSim = Record<string, unknown> & { ok?: boolean; aplicado?: boolean };
type Simular = (ticker: string, curva1816: string, aplicar?: boolean,
                extra?: Record<string, unknown>, modo?: Modo) => Promise<ResSim>;

type Hallazgo = {
  // QUÉ puede hacer el agente con este hallazgo. **Lo decide el backend** —
  // el front tenía la condición escrita a mano y comparaba contra la REGLA
  // (`flujos_vacios`) creyendo que era el TIPO (`sin_flujo`): el botón no
  // aparecía, sin error y sin nada que mirar.
  accion?: Modo | null;
  tipo: string; ticker: string; regla: string; severidad: string;
  motivo: string; evidencia: Record<string, unknown> | null;
};
type Pregunta = {
  id: number; clave: string; tipo: string; pregunta: string; opciones: string[];
  contexto: Record<string, unknown> | null;
};
type Decidida = {
  id: number; clave: string; tipo: string; pregunta: string;
  respuesta: string | null; nota: string | null; respondida_por: string | null;
  respondida_at: string | null; aplicada_at: string | null;
};
type Ignorado = { ticker: string; motivo: string; por: string | null; creado_at: string | null };
type Accion = {
  id: number; ts: string | null; accion: string; destino: string; objetivo: string;
  detalle: Record<string, unknown> | null; antes: Record<string, unknown> | null;
  origen: string; pregunta_id: number | null; por: string | null;
  ok: boolean; error: string | null;
};
type Pendiente = {
  id: number; clave: string; ticker: string; respuesta: string | null;
  nota: string | null; respondida_por: string | null; respondida_at: string | null;
};
// Un AVISO es trabajo MANUAL pendiente: el agente hizo todo salvo un dato que
// solo puede poner una persona. No es un error — es la parte que ninguna fuente
// tiene. Se DERIVA en el backend, así que desaparece solo al cargar el dato.
type Aviso = {
  id: number; ticker: string; clave: string; que_hacer: string;
  por_que: string; donde: string; creado_at: string | null;
  resuelto: boolean; resuelto_por: string | null; resuelto_at: string | null;
  // Cruce contra el master EN VIVO. `null` = no se sabe verificar. Es lo que
  // hace seguro el cierre manual: marcado hecho + dato ausente se canta.
  ya_cargado: boolean | null;
  // Si el dato se puede CARGAR desde acá mismo, el backend manda cómo pedirlo.
  // `null` = no hay recetario para esa clave → hay que ir a Manager.
  campo: { label: string; tipo: string; ayuda: string } | null;
};
type Vista = {
  corrida_at: string | null;
  avisos: Aviso[];
  hallazgos: Hallazgo[];
  por_tipo: Record<string, number>;
  por_regla: Record<string, number>;
  preguntas: Pregunta[];
  decisiones: Pregunta[];
  decididas: Decidida[];
  ignorados: Ignorado[];
  pendientes: Pendiente[];
  acciones: Accion[];
  capacidades: { puede_ignorar: boolean; puede_dar_de_alta: boolean; motivo_alta: string };
};

// EL TABLERO. Las fuentes usan el MISMO vocabulario de estados que el pre-flight
// (`ok` / `revisar` / `bloquea`) — no es reuso por pereza: que una fuente
// degradada y un paso de la cadena se pinten igual es lo que deja mirar toda la
// pantalla con una sola convención en la cabeza.
type Fuente = {
  clave: string; titulo: string; estado: string; detalle: string; para: string;
};
// EL DIAGNÓSTICO MASIVO. `informe` llega PARCIAL mientras corre — se puede
// mirar sin esperar el final, que es lo que deja abortar una corrida que ya se
// ve mal.
type FilaInforme = {
  sujeto: string; tipo?: string; regla?: string; estado: string;
  // QUÉ PUERTA abrir. Sin esto el informe era de solo lectura y había que
  // volver a buscar el bono en la lista para aplicarle lo que el informe ya
  // había dicho que estaba listo — o sea, el informe hacía el trabajo y
  // después te lo hacía repetir.
  accion?: Modo | null;
  causa?: string; veredicto?: string; detalle?: string;
  trabas?: { paso: string; estado: string; detalle: string }[];
};
type RunMasivo = {
  ok: boolean; id: number; estado: string; total: number; hechos: number;
  sin_red: boolean; creditos: number | null; error: string | null;
  informe: FilaInforme[];
  resumen: { por_estado: Record<string, number>; por_causa: Record<string, number>;
             segundos: number };
  texto: string;
};

// EL CENTINELA. `vivo` sale de la EDAD del último latido, no de que alguna vez
// haya corrido: un círculo verde que no puede apagarse solo no informa nada.
type Vigilado = {
  clave: string; tipo: string; sujeto: string; regla: string; severidad: string;
  motivo: string; abierto_at: string; ultimo_at: string; veces: number;
  visto_at: string | null; resuelto_at: string | null; resuelto_como: string | null;
};
// Un chequeo que se ROMPIÓ y este admin todavía no vio. Viene de SALUD, que
// sigue siendo el dueño de la evaluación — el agente solo es la puerta.
// (`Pendiente`, a secas, ya es el hallazgo pendiente del centinela.)
type SaludRoto = {
  id: number; chequeo_id: string; familia: string | null; titulo: string | null;
  de: string | null; a: string; motivo: string | null; evidencia: string | null;
  at: string | null;
};

type Centinela = {
  ok: boolean; vivo: boolean; sin_ver: number;
  latido: { at: string; hace_s: number; ciclo: number; en_rueda: boolean;
            abiertos: number; nuevos: number; duracion_ms: number | null;
            error: string | null;
            // El ritmo que el propio latido declara, y cuánto falta para que el
            // círculo se apague. Con el umbral fijo, fuera de rueda el daemon
            // latía cada 300s y lo dábamos por muerto a los 90.
            cadencia_s: number; muere_en_s: number } | null;
  abiertos: Vigilado[]; resueltos: Vigilado[];
};

type Control = {
  parada: { parada: boolean; motivo: string; por: string; cambiado_at: string | null };
  fuentes: Fuente[];
  resumen: { bloquea: number; revisar: number; ok: number };
};

const TIPO_LABEL: Record<string, string> = {
  hueco_de_curva: "Le falta al sistema (no es un dato mal cargado)",
  falta_en_base: "Están en 1816 y no en tu base",
  sin_flujo: "Tuyos sin cronograma de flujos",
  tasa_sospechosa: "Tasas que pueden estar mal",
  // SALUD deja de ser una pantalla aparte: un chequeo que no está en verde ES un
  // hallazgo del agente, con el mismo modal y las mismas lentes que un bono.
  salud: "Salud del sistema (jobs y datos que no están bien)",
  // EN RUEDA (2026-08-18). Estos dos no existen de noche: que un símbolo no
  // tenga precio a las 11 es un problema, a las 3 de la madrugada es lo normal.
  sin_precio: "En rueda: el motor no les está dando precio",
  precio_moneda: "En rueda: el precio llega en la moneda equivocada",
};

// El label del CHIP. Los de `TIPO_LABEL` son frases ("Están en 1816 y no en tu
// base") — buenas como encabezado de sección, imposibles en una fila de filtros.
// Son dos textos porque cumplen dos funciones: el chip identifica, el encabezado
// explica. El chip lleva el largo en `title`, así no se pierde nada.
const TIPO_CHIP: Record<string, string> = {
  sin_precio: "● SIN PRECIO",
  precio_moneda: "● MONEDA",
  salud: "SALUD",
  hueco_de_curva: "HUECOS",
  falta_en_base: "FALTAN",
  sin_flujo: "SIN FLUJO",
  tasa_sospechosa: "TASAS",
};

// Los huecos van PRIMEROS: un ajuste sin curva deja bonos invisibles, y arreglar
// un dato de un bono que igual no se ve es trabajo perdido.
// SALUD va ARRIBA de todo por el mismo criterio de «aguas arriba» que ordena las
// lentes: si el job que carga los precios no corrió, cualquier tasa sospechosa de
// abajo puede ser consecuencia de eso y no un dato mal cargado.
// Lo de RUEDA va primero de todo mientras el mercado está abierto: es lo único
// de esta pantalla que se puede perder si no se mira ahora. Un bono mal cargado
// sigue mal cargado mañana; un símbolo sin suscribir se arregla hoy o no se
// arregla.
const ORDEN_TIPO = ["sin_precio", "precio_moneda", "salud", "hueco_de_curva",
                    "falta_en_base", "sin_flujo", "tasa_sospechosa"];

const SEV_TINT: Record<string, string> = {
  alta: "var(--t-neg)",
  media: "var(--t-tint-amber)",
  baja: "var(--t-text-dim)",
};

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca corrió";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

// `control` es la SEXTA y la primera que no habla de un hallazgo sino del AGENTE
// (user, 2026-08-18: «quiero control total del agente desde el modal por las
// dudas»). Hasta acá las cinco tabs miraban el trabajo; ninguna miraba la
// herramienta.
// TRES, agrupadas por lo que hay que HACER con cada una — no por de dónde sale
// el dato. `control` existe pero no es una tab: vive en el ⚙ de la derecha.
type Tab = "ahora" | "hallazgos" | "sabe" | "historial" | "control";

// Una pregunta que el agente sabe contestar. Sale del backend, así que el día
// que se agregue una aparece sola: la pantalla no tiene su propia lista.
type Sabe = { id: string; pregunta: string; necesita: string; de_donde: string };

// Qué hizo cada acción, en castellano. El nombre técnico (`ignorar_ticker`) va
// igual en la fila: el libro tiene que servir para auditar, y para eso hace falta
// el nombre exacto que se busca en la base.
const ACCION_LABEL: Record<string, string> = {
  ignorar_ticker: "Marcó como «no nos interesa»",
  designorar: "Deshizo un «no nos interesa»",
  crear_curva: "Creó la curva",
  alta_bono: "Dio de alta el bono",
  completar_flujo: "Completó el cuadro de flujos",
  sembrar_especies: "Sembró las patas del papel",
  sembrar_tasa_1816: "Cargó la tasa y el margen de 1816",
};

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Hora de Buenos Aires: el libro se lee para reconstruir qué pasó a tal hora,
  // y esa hora es la del que operó, no la del servidor.
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const TITULO = "text-[10px] font-semibold tracking-widest text-[var(--t-accent)]";
const SUB = "text-[10px] text-[var(--t-text-dim)]";

export function AvAgentModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("ahora");
  const [subHist, setSubHist] = useState("hizo");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [notas, setNotas] = useState<Record<number, string>>({});
  // Simulaciones por ticker. `null` = corriendo. El resultado se guarda para que
  // uno pueda mirar el número antes de aplicar — que es todo el punto de E2.
  const [sims, setSims] = useState<Record<string, Record<string, unknown> | null>>({});
  // El TABLERO. Va en su propio estado y su propio request: es lo único de la
  // pantalla que tiene que seguir sirviendo cuando `/vista` falla — si el agente
  // está roto, el tablero que dice POR QUÉ no puede caerse con él.
  const [ctrl, setCtrl] = useState<Control | null>(null);

  // EL CENTINELA. Se pollea SIEMPRE —esté el modal abierto o no— porque el
  // círculo de la barra tiene que decir la verdad sin que nadie abra nada.
  const [cent, setCent] = useState<Centinela | null>(null);

  // VOLVER A MIRAR. El botón vive al lado de «última revisión hace 22 h» a
  // propósito: el reclamo y la solución tienen que estar en el mismo lugar.
  const [relevando, setRelevando] = useState(false);
  const [relevAviso, setRelevAviso] = useState("");

  const relevar = useCallback(async () => {
    setRelevando(true);
    setRelevAviso("censando 1816… ~1 min");
    try {
      const r = await fetchJson<{ ok: boolean; error?: string; aviso?: string }>(
        "/api/ia/av-agent/relevar", { method: "POST" });
      if (!r.ok) { setRelevAviso(r.error ?? "no se pudo"); setRelevando(false); }
    } catch (e) {
      setRelevAviso(e instanceof Error ? e.message : String(e));
      setRelevando(false);
    }
  }, []);

  const cargarCentinela = useCallback(async () => {
    try {
      setCent(await fetchJson<Centinela>("/api/ia/av-agent/centinela"));
    } catch {
      // Un poll que falla no apaga el círculo por su cuenta: lo apaga el LATIDO
      // viejo. Confundir «no pude preguntar» con «está muerto» daría una alarma
      // cada vez que se corta el wifi.
    }
  }, []);

  const marcarVisto = useCallback(async (claves: string[]) => {
    try {
      await fetchJson("/api/ia/av-agent/centinela/visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claves }),
      });
    } catch { /* ignorado: el próximo poll trae el estado real */ }
    await cargarCentinela();
  }, [cargarCentinela]);

  const cargarControl = useCallback(async () => {
    try {
      setCtrl(await fetchJson<Control>("/api/ia/av-agent/control"));
    } catch {
      setCtrl(null);
    }
  }, []);

  const cargar = useCallback(async () => {
    try {
      setData(await fetchJson<Vista>("/api/ia/av-agent/vista"));
      setError("");
    } catch (e) {
      // 403 = no es admin → el botón se apaga solo (gate estructural, mismo
      // criterio que el briefing: si el backend dice que no, no hay UI).
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Mientras releva, se pregunta si terminó. Cuando termina, se recarga la vista
  // sola: pedir «volver a mirar» y tener que apretar ↻ después sería la mitad
  // del trabajo.
  useEffect(() => {
    if (!relevando) return;
    let vivo = true;
    const id = setInterval(async () => {
      try {
        const e = await fetchJson<{ si: boolean }>("/api/ia/av-agent/relevar");
        if (!vivo || e.si) return;
        clearInterval(id);
        setRelevando(false);
        setRelevAviso("");
        await cargar();
      } catch { /* el próximo tick reintenta */ }
    }, 4000);
    return () => { vivo = false; clearInterval(id); };
  }, [relevando, cargar]);

  // Una sola carga al montar, para tener el contador en la barra sin abrir nada.
  // El tablero viene con ella: **la PARADA tiene que verse en la barra**, no
  // adentro de una tab que hay que ir a buscar. Un agente frenado del que uno se
  // entera abriendo el modal es un agente que va a quedar frenado tres días.
  useEffect(() => { void cargar(); void cargarControl(); }, [cargar, cargarControl]);

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
      const r = await fetchJson<{ pendientes?: SaludRoto[] }>(
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
  }, [cargar]);

  useEffect(() => {
    void mirarPendientes();
    const id = setInterval(() => void mirarPendientes(), 5 * 60_000);
    return () => clearInterval(id);
  }, [mirarPendientes]);

  const entendido = useCallback(async () => {
    try {
      await fetchJson("/api/ia/av-agent/salud/vistos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: rotos.map((r) => r.id) }),
      });
    } catch {
      /* si falla, vuelve a avisar en el próximo poll — que es lo correcto */
    }
    setRotos([]);
  }, [rotos]);

  const responder = useCallback(async (id: number, respuesta: string) => {
    setEnviando(id);
    try {
      await fetchJson("/api/ia/av-agent/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, respuesta, nota: notas[id] || "" }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(null);
    }
  }, [cargar, notas]);

  const setParada = useCallback(async (activa: boolean, motivo: string) => {
    try {
      const r = await fetchJson<{ ok: boolean; error?: string }>(
        "/api/ia/av-agent/control/parada", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activa, motivo }),
        });
      if (r.ok === false) setError(r.error ?? "no se pudo cambiar la parada");
      else setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await cargarControl();
  }, [cargarControl]);

  const resolverAviso = useCallback(async (id: number, deshacer: boolean) => {
    try {
      await fetchJson("/api/ia/av-agent/aviso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, deshacer }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

  const completarAviso = useCallback(async (id: number, valor: string) => {
    try {
      await fetchJson("/api/ia/av-agent/aviso/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, valor }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

  // «No me interesa» desde CUALQUIER hallazgo. Antes solo se podía ignorar
  // contestando una pregunta del agente, y solo valía para los faltantes.
  const ignorar = useCallback(async (ticker: string) => {
    try {
      await fetchJson("/api/ia/av-agent/ignorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

  const designorar = useCallback(async (ticker: string) => {
    try {
      // POST y no DELETE: el proxy catch-all de /api/ia expone solo GET y POST.
      await fetchJson("/api/ia/av-agent/designorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

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
    const ruta = modo === "sin_precio"
      ? "sin-precio"
      : modo === "salud"
      ? "salud"
      : modo === "flujos"
      ? (aplicar ? "aplicar-flujos" : "simular-flujos")
      : modo === "arreglo"
      ? (aplicar ? "aplicar-arreglo" : "simular-arreglo")
      : (aplicar ? "aplicar-alta" : "simular");
    try {
      const r = await fetchJson<Record<string, unknown>>(
        `/api/ia/av-agent/${ruta}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // SALUD habla de un CHEQUEO, no de un ticker: el sujeto del hallazgo es
          // el id del cron. El campo `ticker` del hallazgo lo transporta (ver el
          // comentario de `detectar_salud` en el backend).
          body: JSON.stringify(modo === "salud"
            ? { chequeo_id: ticker }
            : modo === "sin_precio"
            ? { ticker }
            : { ticker, curva_1816: curva1816, ...extra }),
        });
      setSims((s) => ({ ...s, [ticker]: r }));
      if (aplicar) await cargar();
      return r as ResSim;
    } catch (e) {
      const err = { ok: false, error: String(e) };
      setSims((s) => ({ ...s, [ticker]: err }));
      return err;
    }
  }, [cargar]);

  const porTipo = useMemo(() => {
    const g: Record<string, Hallazgo[]> = {};
    for (const h of data?.hallazgos ?? []) (g[h.tipo] ??= []).push(h);
    return g;
  }, [data]);

  // Sin datos (403 del backend / API caída) el botón NO se monta: un botón que
  // abre un modal vacío es peor que no tenerlo.
  if (!data && error) return null;

  const nPreg = (data?.preguntas.length ?? 0) + (data?.decisiones.length ?? 0);
  // Lo que espera una decisión: lo nuevo del centinela + las preguntas + los
  // avisos abiertos. Es UN número, y es el único que tiene que mirar el que
  // abre la pantalla para saber si hay algo que hacer.
  const nAhora = (cent?.sin_ver ?? 0) + nPreg
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
        {/* Lo NUEVO y sin ver, en la barra. Es la única señal que puede
            interrumpir: un hallazgo que apareció hace un minuto y que nadie
            miró. En rojo, separado del contador de preguntas. */}
        {(cent?.sin_ver ?? 0) > 0 && (
          <span className="px-1 rounded-sm bg-[var(--t-neg)] text-[var(--t-on-accent)] text-[9px] font-bold tabular-nums">
            {cent!.sin_ver}
          </span>
        )}
        {/* El contador es la única señal proactiva: si tiene preguntas, se ve
            desde cualquier pantalla sin abrir nada. */}
        {nPreg > 0 && (
          <span className="px-1 rounded-sm bg-[var(--t-accent)] text-[var(--t-on-accent)] text-[9px] font-bold tabular-nums">
            {nPreg}
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
              {/* Acá decía «integridad de renta fija · 1816 ↔ mercado.curvas».
                  Eso describe la IMPLEMENTACIÓN —contra qué fuente compara— y no
                  le sirve a nadie que abra la pantalla: el que la abre ya sabe
                  qué es el agente. Se reemplaza por lo único que cambia y que
                  hay que mirar: hace cuánto que miró. */}
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
                revisado {haceCuanto(data.corrida_at)}
              </span>
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
                ["sabe", "SABE", 0],
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
              {/* CONTROL, en un ⚙ a la derecha. Se toca una vez cada mucho —la
                  parada, el estado de las fuentes— y como tab competía con lo
                  que sí se mira todos los días. El contador solo aparece si hay
                  algo que no está en verde: un ⚙ con número pide atención, uno
                  sin número es una herramienta guardada. */}
              <button
                onClick={() => setTab(tab === "control" ? "ahora" : "control")}
                title="Control del agente: parada de emergencia y estado de las fuentes"
                className={`${error ? "" : "ml-auto "}px-3 text-[11px] border-b-2 -mb-px transition-colors ${
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
                  <TabCentinela cent={cent} marcarVisto={marcarVisto}
                                recargar={cargarCentinela} />
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
                <TabHallazgos porTipo={porTipo} data={data} sims={sims} simular={simular} ignorar={ignorar} />
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
                    : <TabDecidido data={data} designorar={designorar} />}
                </div>
              )}
              {tab === "control" && (
                <TabControl ctrl={ctrl} setParada={setParada} recargar={cargarControl} />
              )}
              {tab === "sabe" && (
                <TabSabe />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── TAB: LO QUE SABE CONTESTAR ─────────────────────────────────────────────
//
// Las ocho pantallas de Manager → VALIDACIONES eran preguntas de trader con
// nombre de programador («Debug TEA Curvas» = *¿por qué este bono rinde esto?*).
// Acá vuelven a ser lo que siempre fueron: preguntas.
//
// El user: *«quiero ir migrando funciones útiles al agent para que el día de
// mañana le hable y se lo pida»*. Por eso el catálogo lo manda el BACKEND — esta
// lista es, además, el menú de lo que va a entender cuando se le pueda hablar, y
// una capacidad nueva aparece sin tocar el front.
function TabSabe() {
  const [cat, setCat] = useState<Sabe[]>([]);
  const [elegido, setElegido] = useState<Sabe | null>(null);
  const [sujeto, setSujeto] = useState("");
  const [opciones, setOpciones] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState<{
    ok: boolean; error?: string; frase?: string; discrepancia?: string;
    pasos?: Paso[]; pregunta?: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetchJson<{ catalogo?: Sabe[] }>("/api/ia/av-agent/explicar");
        setCat(r.catalogo ?? []);
      } catch { /* sin catálogo: la tab queda vacía, no rota */ }
    })();
  }, []);

  const elegir = async (e: Sabe) => {
    setElegido(e);
    setRes(null);
    setSujeto("");
    setOpciones([]);
    if (!e.necesita) return;
    try {
      const r = await fetchJson<{ sugerencias?: string[] }>(
        `/api/ia/av-agent/explicar?explicador=${encodeURIComponent(e.id)}`);
      setOpciones(r.sugerencias ?? []);
    } catch { /* sin sugerencias se escribe a mano */ }
  };

  const preguntar = async () => {
    if (!elegido) return;
    setCargando(true);
    setRes(null);
    try {
      setRes(await fetchJson("/api/ia/av-agent/explicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explicador: elegido.id, sujeto }),
      }));
    } catch (e) {
      setRes({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    setCargando(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className={SUB}>
        Cosas que sé contestar. Los números los calculo yo, paso por paso, de la
        misma fuente que usa la app — <strong className="text-[var(--t-text)]">
        no son una opinión</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {cat.map((e) => (
          <button
            key={e.id}
            onClick={() => void elegir(e)}
            className={`text-left px-2.5 py-1.5 border transition-colors ${
              elegido?.id === e.id
                ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10"
                : "border-[var(--t-border)] hover:border-[var(--t-accent)]"
            }`}
          >
            <span className="text-[11px] text-[var(--t-text)]">{e.pregunta}</span>
            <span className="block text-[9px] text-[var(--t-text-dim)]">
              {e.de_donde}
            </span>
          </button>
        ))}
      </div>

      {elegido && (
        <div className="flex flex-wrap items-center gap-1.5">
          {elegido.necesita === "ticker" && (
            <input
              value={sujeto}
              onChange={(ev) => setSujeto(ev.target.value.toUpperCase())}
              list="av-sabe-opciones"
              placeholder="ticker (ej. AL30)"
              className="text-[10px] bg-transparent border border-[var(--t-border)] px-1.5 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none w-[150px]"
            />
          )}
          <datalist id="av-sabe-opciones">
            {opciones.map((o) => <option key={o} value={o} />)}
          </datalist>
          <button
            disabled={cargando || (!!elegido.necesita && !sujeto.trim())}
            onClick={() => void preguntar()}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
          >
            {cargando ? "calculando…" : "contestame"}
          </button>
        </div>
      )}

      {res && !res.ok && (
        <p className="text-[10px] text-[var(--t-neg)]">{res.error ?? "no pude"}</p>
      )}

      {res?.ok && (
        <div className="flex flex-col gap-2">
          {/* LA FRASE. La escribe el modelo sobre números que ya salieron del
              cálculo — si no hay modelo, no aparece y los pasos siguen ahí. */}
          {res.frase && (
            <p className="text-[12px] leading-snug text-[var(--t-text)] border-l-2 border-[var(--t-accent)] pl-2">
              {res.frase}
            </p>
          )}
          {/* LA DISCREPANCIA va SEPARADA y en rojo: es lo único de acá que no es
              una explicación sino un aviso, y la frase no la puede tapar. */}
          {res.discrepancia && (
            <p className="text-[11px] leading-snug text-[var(--t-neg)] border border-[var(--t-neg)] px-2 py-1">
              {res.discrepancia}
            </p>
          )}
          <Chequeos pasos={res.pasos ?? []} />
        </div>
      )}
    </div>
  );
}

// ── TAB 1: las preguntas ───────────────────────────────────────────────────

function TabPreguntas({ data, enviando, notas, setNota, responder, setTab }: {
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
function fichaDe(ctx: Record<string, unknown> | null): [string, string][] {
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

function Tarjeta({ p, enviando, nota, setNota, responder, compacta = false }: {
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

// ── TAB 2: lo que encontró ─────────────────────────────────────────────────

function TabHallazgos({ porTipo, data, sims, simular, ignorar }: {
  porTipo: Record<string, Hallazgo[]>;
  data: Vista;
  sims: Record<string, Record<string, unknown> | null>;
  simular: Simular;
  ignorar: (ticker: string) => void;
}) {
  // EL FILTRO. Con 84 hallazgos apilados en cinco secciones, la pantalla era un
  // scroll infinito donde para llegar a `tasa_sospechosa` había que pasar por
  // todo lo demás — y una vez abajo se perdía el contexto de cuánto quedaba.
  // Con un tipo por vez, la vista entra en una pantalla y el resto sigue contado
  // arriba: nada se esconde, solo deja de competir por el lugar.
  const [filtro, setFiltro] = useState<string>("todos");
  // La BÚSQUEDA es el otro camino: cuando uno ya sabe el ticker, filtrar por tipo
  // es el paso de más. Matchea sujeto, regla y motivo — los tres son cosas que
  // uno recuerda de un hallazgo.
  const [q, setQ] = useState("");
  // SEGUNDO NIVEL: la REGLA, o sea QUÉ error encontró dentro del tipo. El tipo
  // dice de qué familia es el problema («tasas que pueden estar mal»); la regla
  // dice cuál es —`moneda_flujo_contradice` no se parece en nada a `sin_ejes` y
  // se arreglan distinto—. Con 68 tasas mezcladas, filtrar por tipo dejaba
  // igual una lista que no se puede trabajar de corrido: **uno trabaja por
  // CAUSA, no por familia.**
  const [regla, setRegla] = useState<string>("todas");

  const tipos = useMemo(
    () => Object.keys(porTipo).sort(
      (a, b) => (ORDEN_TIPO.indexOf(a) + 1 || 99) - (ORDEN_TIPO.indexOf(b) + 1 || 99)),
    [porTipo]);

  // Los hallazgos que pasan TIPO + BÚSQUEDA. Es el paso previo a la regla, y se
  // calcula aparte a propósito: las chips de regla tienen que contar sobre ESTO
  // y no sobre el total, o mostrarían opciones que no van a devolver nada.
  const preFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out: [string, Hallazgo[]][] = [];
    for (const tipo of tipos) {
      if (filtro !== "todos" && filtro !== tipo) continue;
      const hs = t
        ? porTipo[tipo].filter((h) =>
            h.ticker.toLowerCase().includes(t) ||
            h.regla.toLowerCase().includes(t) ||
            h.motivo.toLowerCase().includes(t))
        : porTipo[tipo];
      if (hs.length) out.push([tipo, hs]);
    }
    return out;
  }, [porTipo, tipos, filtro, q]);

  // Las reglas presentes, con su cuenta, **ordenadas por cantidad**: la causa
  // que más aparece es la que conviene atacar primero, y es la que uno busca.
  const reglas = useMemo(() => {
    const n: Record<string, number> = {};
    for (const [, hs] of preFiltrados) for (const h of hs) n[h.regla] = (n[h.regla] ?? 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [preFiltrados]);

  // Una regla elegida que ya no existe en lo visible dejaría la lista vacía sin
  // motivo aparente (pasa al cambiar de tipo). Se cae sola a «todas».
  const reglaOk = regla !== "todas" && reglas.some(([r]) => r === regla) ? regla : "todas";

  const visibles = useMemo(() => {
    if (reglaOk === "todas") return preFiltrados;
    const out: [string, Hallazgo[]][] = [];
    for (const [tipo, hs] of preFiltrados) {
      const f = hs.filter((h) => h.regla === reglaOk);
      if (f.length) out.push([tipo, f]);
    }
    return out;
  }, [preFiltrados, reglaOk]);

  if (data.hallazgos.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        No encontré nada. Si todavía no corrí, la lista está vacía porque no miré —
        no porque esté todo bien.
      </p>
    );
  }

  const nVisibles = visibles.reduce((a, [, hs]) => a + hs.length, 0);
  const nVisiblesPre = preFiltrados.reduce((a, [, hs]) => a + hs.length, 0);

  // ── EL DIAGNÓSTICO MASIVO ─────────────────────────────────────────────────
  // Corre sobre LO FILTRADO, no sobre los 84: «diagnosticá los 30 de
  // moneda_flujo» es la operación real, y respetar el filtro es lo que la hace
  // posible sin un segundo selector.
  const [run, setRun] = useState<RunMasivo | null>(null);
  const [corriendo, setCorriendo] = useState(false);

  const planos = useMemo(
    () => visibles.flatMap(([, hs]) => hs), [visibles]);

  const lanzar = useCallback(async (sinRed: boolean) => {
    setCorriendo(true);
    try {
      const r = await fetchJson<{ ok: boolean; run_id?: number; error?: string }>(
        "/api/ia/av-agent/masivo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Se manda el hallazgo entero: el backend necesita la acción (qué
            // puerta abrir) y la evidencia (la curva de 1816, para un alta).
            casos: planos.map((h) => ({
              ticker: h.ticker, tipo: h.tipo, regla: h.regla,
              accion: h.accion, motivo: h.motivo, evidencia: h.evidencia,
            })),
            filtro: { tipo: filtro, regla: reglaOk, busqueda: q.trim() },
            sin_red: sinRed,
          }),
        });
      if (!r.ok) { setRun(null); setCorriendo(false); return; }
    } catch {
      setCorriendo(false);
    }
  }, [planos, filtro, reglaOk, q]);

  // El POLL. Arranca cuando hay una corrida y se apaga sola al terminar — un
  // poll que sigue después del final es tráfico que nadie mira.
  useEffect(() => {
    if (!corriendo) return;
    let vivo = true;
    const tick = async () => {
      try {
        const r = await fetchJson<RunMasivo>("/api/ia/av-agent/masivo");
        if (!vivo) return;
        setRun(r);
        if (r.estado !== "corriendo") setCorriendo(false);
      } catch { /* un poll que falla no puede romper la pantalla */ }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => { vivo = false; clearInterval(id); };
  }, [corriendo]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── LA BARRA ─────────────────────────────────────────────────────
          Antes eran TRES renglones: chips de tipo, chips de regla, y una línea
          de texto explicando el throttle de 1816. Para 75 hallazgos, la mitad
          de la pantalla era el filtro.

          Ahora es UNO: dos desplegables (el tipo y el error), la búsqueda, y el
          botón. Un `select` con 9 opciones ocupa lo mismo que un chip y no
          crece con los datos — que es exactamente lo que hacía que la fila de
          reglas se fuera a dos líneas apenas aparecía una regla nueva. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 px-4 pt-4 pb-2 bg-[var(--t-panel)] border-b border-[var(--t-border)] flex flex-wrap items-center gap-2">
        <select
          value={filtro}
          onChange={(e) => { setFiltro(e.target.value); setRegla("todas"); }}
          className="bg-transparent border border-[var(--t-border)] px-2 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
        >
          <option value="todos">Todo ({data.hallazgos.length})</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {TIPO_CHIP[t] ?? t.replace(/_/g, " ")} ({porTipo[t].length})
            </option>
          ))}
        </select>

        {/* El segundo nivel solo existe si hay más de una regla: con una sola no
            ofrece ninguna decisión y sería un desplegable de un solo ítem. */}
        {reglas.length > 1 && (
          <select
            value={reglaOk}
            onChange={(e) => setRegla(e.target.value)}
            className="bg-transparent border border-[var(--t-border)] px-2 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          >
            <option value="todas">Cualquier error ({nVisiblesPre})</option>
            {reglas.map(([rg, n]) => (
              <option key={rg} value={rg}>{rg.replace(/_/g, " ")} ({n})</option>
            ))}
          </select>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar…"
          className="w-40 bg-transparent border border-[var(--t-border)] px-2 py-1 text-[10px] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] outline-none focus:border-[var(--t-accent)]"
        />

        {(q.trim() || filtro !== "todos" || reglaOk !== "todas") && (
          <button
            onClick={() => { setFiltro("todos"); setQ(""); setRegla("todas"); }}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {nVisibles} de {data.hallazgos.length} ✕
          </button>
        )}

        {/* El botón, a la derecha y con el número adentro. La explicación del
            throttle («con 1816 son ~2 min, 1 pedido por segundo, es el límite
            del plan») ocupaba un renglón entero para decir algo que solo
            importa una vez: pasa al `title`. */}
        <button
          disabled={corriendo || nVisibles === 0}
          onClick={() => void lanzar(false)}
          title={`Diagnostica los ${nVisibles} contra 1816. Tarda ~${Math.ceil(nVisibles * 1.4 / 60)} min: el plan permite 1 pedido por segundo.`}
          className="ml-auto text-[9px] font-semibold uppercase tracking-widest px-3 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--t-accent)]"
        >
          {corriendo ? "diagnosticando…" : `⚑ Diagnosticar ${nVisibles}`}
        </button>
        {/* «SIN RED» no le decía nada a nadie: nombraba la IMPLEMENTACIÓN (que
            no sale a internet) en vez de lo que uno gana (que vuelve en
            segundos). Ahora dice RÁPIDO, que es la razón para elegirlo. */}
        <button
          disabled={corriendo || nVisibles === 0}
          onClick={() => void lanzar(true)}
          title="Solo lo que se puede saber sin consultar a 1816: vuelve en segundos y no gasta créditos. Algunos casos quedan sin diagnosticar."
          className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-30"
        >
          rápido
        </button>
      </div>

      {run && <InformeMasivo run={run} simular={simular} sims={sims} />}

      {visibles.length === 0 && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Ningún hallazgo coincide con {q.trim() ? `«${q}»` : "el filtro puesto"}.
          Los {data.hallazgos.length} siguen ahí — es el filtro, no la lista.
        </p>
      )}

      {visibles.map(([tipo, hs]) => (
        <section key={tipo}>
          <div className="flex items-baseline gap-2 mb-1.5">
            <h3 className={TITULO}>{(TIPO_LABEL[tipo] ?? tipo).toUpperCase()}</h3>
            <span className={SUB}>{hs.length}</span>
          </div>
          {/* Tabla y no lista: son filas homogéneas (ticker · regla · motivo) y
              alinearlas deja comparar de un vistazo, que es justo lo que uno hace
              con 38 tasas sospechosas. */}
          {/* **Un BONO, un diagnóstico.** Un mismo ticker puede disparar VARIAS
              reglas —CO3D7 sale por `sin_tea_con_precio` Y por
              `paridad_fuera_de_rango`, y son 5 de los 38— pero el bono es uno
              solo y la propuesta de arreglo también. Sin esto la cadena entera
              se renderiza dos veces para el mismo instrumento, y como el estado
              de la simulación se guarda POR TICKER las dos filas mostrarían
              exactamente el mismo resultado: el que mira cree que son dos cosas
              distintas y son la misma. La acción va en la PRIMERA aparición; las
              otras siguen mostrando su motivo, que es lo que las distingue. */}
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {(() => { const vistos = new Set<string>(); return hs.map((h, i) => {
              const primera = !vistos.has(h.ticker);
              vistos.add(h.ticker);
              // El SUJETO de un hallazgo de SALUD no es un ticker de 4 letras
              // sino el id del chequeo (`job:mercado_1816_series`): en la columna
              // de 72px entraba «job:merc» y las filas quedaban indistinguibles.
              // Misma tabla, primera columna más ancha.
              const esSalud = h.tipo === "salud";
              return (
              <div
                key={`${h.ticker}-${h.regla}-${i}`}
                className={`grid ${esSalud
                  ? "grid-cols-[3px_190px_150px_1fr_auto]"
                  : "grid-cols-[3px_72px_150px_1fr_auto]"} items-baseline gap-2 px-2 py-1 hover:bg-[var(--t-surface)]`}
              >
                <span className="self-stretch" style={{ background: SEV_TINT[h.severidad] }}
                      title={`severidad ${h.severidad}`} />
                <span className="text-[11px] font-bold text-[var(--t-text)] tabular-nums truncate"
                      title={h.ticker}>
                  {h.ticker}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                      title={h.regla}>
                  {h.regla.replace(/_/g, " ")}
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--t-text-muted)] leading-snug">
                    {h.motivo}
                  </span>
                  {/* ENCONTRÓ deja de ser solo un comentario: donde hay algo que
                      el agente PUEDE hacer, el botón está en la misma fila. Un
                      hallazgo accionable que obliga a irse a otra pantalla es un
                      hallazgo que no se acciona. */}
                  {/* ENCONTRÓ deja de ser solo un comentario: donde el agente
                      PUEDE hacer algo, el botón está en la misma fila. **Qué
                      puede hacer lo dice el backend** (`h.accion`) — replicar
                      acá la lista de tipos accionables es cómo se consigue un
                      botón que no aparece y no avisa por qué. */}
                  {primera && (h.accion === "alta" || h.accion === "flujos"
                    || h.accion === "arreglo" || h.accion === "salud"
                    || h.accion === "sin_precio") && (
                    <AccionCadena h={h} sim={sims[h.ticker]} simular={simular}
                                  modo={h.accion} />
                  )}
                </div>
                {/* IGNORAR vive en TODA fila, no solo donde hay una acción: el
                    valor de la lista depende de poder sacarle lo que no importa.
                    Reversible desde la tab DECIDIDO. */}
                <button
                  onClick={() => ignorar(h.ticker)}
                  title="No me interesa: no vuelve a aparecer (reversible en DECIDIDO)"
                  className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 self-center border border-transparent text-[var(--t-text-dim)] hover:border-[var(--t-neg)] hover:text-[var(--t-neg)]"
                >
                  Ignorar
                </button>
              </div>
            ); }); })()}
          </div>
        </section>
      ))}
    </div>
  );
}

// LA CADENA ACCIONABLE — **una sola** para las dos puertas del agente.
//
// Acá vivían DOS componentes casi idénticos (`AccionAlta` y `AccionFlujos`) que
// se diferenciaban en tres strings. El costo de esa copia se cobró enseguida: el
// bloque que PIDE el dato faltante (el CER de emisión, tipeado en la propia
// cadena) se escribió solo en el alta, así que en COMPLETAR CRONOGRAMA el paso
// llegaba con su `pide` y **no se renderizaba nada** — misma familia de bug que
// el botón que no aparecía por comparar la REGLA en vez del TIPO: en silencio.
//
// Lo que cambia entre las dos puertas son las ETIQUETAS y de dónde sale la curva
// de 1816; todo el resto —el veredicto que habilita aplicar, los datos tipeados
// que viajan igual a simular y a aplicar, el paso a paso— es el mismo criterio y
// ahora está escrito una sola vez.
const COPY = {
  alta: {
    simular: "Simular", aplicar: "Aplicar", hecho: "✔ DADO DE ALTA · ",
    // Un alta INFIERE el CER de emisión de la serie macro; un completar lo lee
    // del master. Decir cuál de las dos cosas pasó es la diferencia entre un
    // número que se puede auditar y uno que hay que creer.
    cer: "inferido",
  },
  flujos: {
    simular: "Simular flujos", aplicar: "Completar cronograma",
    hecho: "✔ CRONOGRAMA ESCRITO · ", cer: "del master",
  },
  // La ÚNICA que pisa un dato existente — por eso el verbo es «arreglar» y no
  // «aplicar»: lo que se hace acá es distinto y el botón tiene que decirlo.
  arreglo: {
    simular: "Diagnosticar", aplicar: "Arreglar",
    hecho: "✔ ARREGLADO · ", cer: "del master",
  },
  // SOLO LECTURA: no hay `aplicar` porque el agente todavía no toca SALUD —
  // relanzar un job tiene efectos afuera de `mercado.curvas` y se habilita cuando
  // el eval set diga que el diagnóstico acierta.
  salud: {
    simular: "Analizar", aplicar: "", hecho: "", cer: "",
  },
  // SOLO LECTURA, igual que SALUD: el agente explica POR QUÉ no hay precio
  // —sin símbolo · fuera de Primary · pata equivocada · nunca operó· sin
  // actividad hoy— y no toca nada. Dos de esas cinco ni siquiera son nuestras.
  sin_precio: {
    simular: "¿Por qué?", aplicar: "", hecho: "", cer: "",
  },
} as const;

function AccionCadena({ h, sim, simular, modo }: {
  h: Hallazgo;
  sim: Record<string, unknown> | null | undefined;
  simular: Simular;
  modo: Modo;
}) {
  // Lo que el user tipeó EN la cadena. Vive acá —y no en el padre— porque es de
  // ESTE hallazgo: un estado compartido haría que el CER de un bono se filtrara
  // al siguiente que se simule.
  const [pedido, setPedido] = useState<Record<string, string>>({});
  const [rechequeando, setRechequeando] = useState(false);
  const [rechequeo, setRechequeo] = useState("");

  const rechequear = async (chequeoId: string) => {
    setRechequeando(true);
    setRechequeo("");
    try {
      const r = await fetchJson<{ ok: boolean; texto?: string; error?: string }>(
        `/api/ia/av-agent/salud/recontrolar?control_id=${encodeURIComponent(chequeoId)}`,
        { method: "POST" });
      setRechequeo(r.ok ? (r.texto ?? "listo") : `✘ ${r.error ?? "falló"}`);
    } catch (e) {
      setRechequeo(`✘ ${e instanceof Error ? e.message : String(e)}`);
    }
    setRechequeando(false);
  };
  const copy = COPY[modo];
  // El alta necesita la curva de 1816 (el bono todavía no existe, así que no hay
  // de dónde deducirla); el completar NO — el bono ya está y su rama sale del
  // doc que cargó la mesa.
  const curva = modo === "alta" ? String((h.evidencia ?? {}).curva_1816 ?? "") : "";
  if (modo === "alta" && !curva) return null;
  const corriendo = sim === null;
  const r = sim as Record<string, unknown> | undefined;
  const ok = r?.ok === true;
  const aplicable = r?.aplicable === true;
  const aplicado = r?.aplicado === true;
  const tea = typeof r?.tea === "number" ? (r.tea as number) : null;
  const pasos: Paso[] = Array.isArray(r?.chequeos) ? (r.chequeos as Paso[]) : [];
  const veredicto = r?.veredicto as Veredicto | undefined;
  // **UNA sola fuente decide si se puede aplicar: el veredicto del backend.**
  // Acá convivían dos condiciones distintas (`aplicable`, que miraba la rama, y
  // `bloqueado`, que miraba los pasos) y se contradecían entre sí: GD46 mostraba
  // APLICAR con el cronograma probadamente equivocado, y TMG27 escondía el botón
  // con la cadena entera en verde. Y sumarle un AND «por las dudas» es lo que
  // escondió el botón en TZXA7 — el gate real pasa a ser el más restrictivo, que
  // nadie está mirando. El fallback local es solo para un deploy desparejo.
  // En SALUD **no hay nada que aplicar**: la puerta es de solo lectura. No es un
  // permiso que falta, es que el agente todavía no escribe de ese lado.
  const puedeAplicar = (modo === "salud" || modo === "sin_precio")
    ? false
    : veredicto
    ? veredicto.puede_aplicar !== false
    : !pasos.some((p) => p.estado === "bloquea");

  // Los datos tipeados viajan IGUAL a SIMULAR y a APLICAR: lo que se aplica es
  // exactamente lo que se vio simulado. Si fueran dos payloads distintos, el
  // bono podría escribirse con insumos que nadie miró.
  const extra: Record<string, unknown> = {};
  for (const k of Object.keys(pedido)) {
    // Coma decimal: se tipea «12,3456» y el backend espera un número.
    const crudo = (pedido[k] ?? "").trim();
    const n = Number(crudo.replace(",", "."));
    if (crudo && Number.isFinite(n) && n > 0) extra[k] = n;
  }
  // Los pasos que PIDEN un dato. **Se listan por `pide`, NO por si ya se tipeó
  // algo** — y esa diferencia era un bug que hacía la función inusable: el filtro
  // era `p.pide && !extra[p.pide.campo]`, así que al escribir el PRIMER carácter
  // `extra` se llenaba, la lista quedaba vacía y **el input se desmontaba a mitad
  // del tipeo**. Solo se podía pegar el valor entero de una sola vez, que es
  // exactamente lo que había pasado las veces que "funcionó".
  //
  // Quién pide el dato es el BACKEND (el paso trae su `pide`); que el user haya
  // empezado a escribir no es una respuesta a esa pregunta.
  const piden = pasos.filter((p) => p.pide);
  const faltan = piden.filter((p) => !extra[p.pide!.campo]);
  const cerNota = r?.cer_manual === true ? "cargado a mano" : copy.cer;
  // El ANTES → DESPUÉS del arreglo, como texto plano y FUERA del JSX. En el
  // ARREGLO lo que importa es la comparación —ver solo el resultado no dice si
  // mejoró algo, que es toda la pregunta de esa puerta— y armarla acá evita un
  // ternario sobre `unknown` embebido en el markup, que se lee peor y es justo
  // donde el compilador se pone quisquilloso.
  const a0 = (r?.antes ?? null) as { tea?: unknown; paridad?: unknown } | null;
  const antesTxt = modo === "arreglo" && a0
    ? `HOY: TEA ${typeof a0.tea === "number" ? `${(a0.tea * 100).toFixed(2)}%` : "sin TEA"}`
      + ` · paridad ${typeof a0.paridad === "number" ? `${a0.paridad.toFixed(1)}%` : "—"} → `
    : "";

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {!aplicado && (
        <button
          disabled={corriendo}
          onClick={() => simular(h.ticker, curva, false, extra, modo)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {corriendo ? "…" : copy.simular}
        </button>
      )}
      {ok && puedeAplicar && !aplicado && (
        <button
          onClick={() => simular(h.ticker, curva, true, extra, modo)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]"
        >
          {copy.aplicar}
        </button>
      )}
      {/* Un botón que DESAPARECE no explica nada: el que mira no sabe si falta
          cargar algo o si el agente lo frenó. Cuando la cadena bloquea, en su
          lugar va el motivo. */}
      {/* En SALUD no va: ahí `puedeAplicar` es false porque la puerta es de solo
          lectura, no porque el agente haya frenado nada. Pintarlo en rojo diría
          que el chequeo está trabado cuando el diagnóstico salió bien. */}
      {ok && !puedeAplicar && !aplicado && modo !== "salud"
        && modo !== "sin_precio" && (
        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-neg)] text-[var(--t-neg)]">
          ✘ Bloqueado
        </span>
      )}
      {/* VOLVER A CHEQUEAR — corre ESE control en el momento. Un tablero que
          dice «la última comprobación fue hace 1 día» y no ofrece rehacerla
          deja al que mira sin saber si el problema sigue existiendo. */}
      {modo === "salud" && h.ticker.startsWith("control:") && (
        <button
          disabled={rechequeando}
          onClick={() => void rechequear(h.ticker)}
          title="Corre este control ahora y dice cuántos siguen"
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {rechequeando ? "chequeando…" : "↻ chequear ahora"}
        </button>
      )}
      {rechequeo && (
        <span className="text-[9px] text-[var(--t-accent)]">{rechequeo}</span>
      )}
      {r && (
        <span className={`text-[9px] ${r.ok === false ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>
          {r.ok === false && String(r.error ?? "falló")}
          {/* Acá se repetía «assets sin cartera · 8 anomalías sin resolver»,
              que es LITERAL lo que ya dice la fila dos centímetros arriba. Tres
              veces el mismo texto en la misma tarjeta (fila, resumen, veredicto)
              no informa: cansa y hace dudar de si son cosas distintas. */}
          {ok && modo === "sin_precio" && (
            // La CAUSA y de quién es. «No es un bug nuestro» es la mitad del
            // valor del diagnóstico: evita perseguir un problema que no existe.
            <>
              {String(r.titulo ?? "")}
              {r.nuestro === false ? " · no es un bug nuestro" : ""}
              {r.simbolo ? ` · pide «${String(r.simbolo).split(" - ")[2] ?? r.simbolo}»` : ""}
            </>
          )}
          {ok && modo !== "salud" && modo !== "sin_precio" && (
            <>
              {aplicado ? copy.hecho : ""}
              {/* En el ARREGLO lo que importa es el ANTES → DESPUÉS: ver solo el
                  resultado no dice si mejoró algo, que es toda la pregunta. */}
              {antesTxt}
              {`${r.cupones ?? 0} cupones`}
              {/* Los YA PAGADOS, separados. 1816 manda el cronograma completo
                  desde la emisión, así que un bono de 2004 trae 60 cupones y de
                  los 60 se valúan 6: sin partir el número, el cuadro parece
                  otro bono. */}
              {typeof r.cupones_pagados === "number" && (r.cupones_pagados as number) > 0
                ? ` (${String(r.cupones_pagados)} ya pagados · ${String(r.cupones_futuros ?? 0)} futuros)`
                : ""}
              {` · vence ${String(r.vencimiento ?? "—")} · escala ${String(r.escala ?? "—")}`}
              {typeof r.cer_emision === "number"
                ? ` · CER emisión ${(r.cer_emision as number).toFixed(4)} (${cerNota})`
                : ""}
              {r.nota_cer ? ` · ${String(r.nota_cer)}` : ""}
              {tea !== null ? ` · TEA simulada ${(tea * 100).toFixed(2)}%` : ""}
              {/* De dónde salió el precio con el que se calculó esa TEA. Un bono
                  nuevo nunca tiene snapshot, así que sin decirlo el número se
                  leería como si viniera del mercado. */}
              {r.precio_fuente === "1816" ? " (precio de referencia 1816)" : ""}
              {r.nota_tasa ? ` · ${String(r.nota_tasa)}` : ""}
              {modo === "alta" && !aplicable && r.motivo_no_aplicable
                ? ` · ${String(r.motivo_no_aplicable)}`
                : ""}
              {aplicado && r.aviso ? ` · ${String(r.aviso)}` : ""}
            </>
          )}
        </span>
      )}
      {/* EL DATO QUE FALTA, PEDIDO ACÁ MISMO (user, 2026-08-17): «no podría ser
          acá mismo interactivo y que me pida el CER de emisión para continuar, y
          que rehaga la simulación con ese dato y si va todo bien ya lo aplique
          con eso». Antes había que aplicar a ciegas, ir a AVISOS, cargar el
          número y recién ahí enterarse de si la tasa cerraba. */}
      {ok && !aplicado && piden.length > 0 && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-1.5 border-l-2 border-[#f59e0b] pl-2 py-1">
          {piden.map((p) => (
            <div key={p.clave} className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-widest text-[#f59e0b]">
                {p.pide!.label}
              </span>
              <input
                value={pedido[p.pide!.campo] ?? ""}
                onChange={(e) => setPedido((v) => ({ ...v, [p.pide!.campo]: e.target.value }))}
                onKeyDown={(e) => {
                  const n = Number(String((e.target as HTMLInputElement).value).replace(",", "."));
                  if (e.key === "Enter" && Number.isFinite(n) && n > 0) {
                    simular(h.ticker, curva, false, { [p.pide!.campo]: n }, modo);
                  }
                }}
                placeholder="0,0000"
                title={p.pide!.ayuda}
                inputMode={p.pide!.tipo === "numero" ? "decimal" : "text"}
                className="w-24 bg-transparent border border-[#f59e0b] px-1 py-0.5 text-[10px] text-[var(--t-text)] outline-none"
              />
              <span className="text-[9px] text-[var(--t-text-dim)]">{p.pide!.ayuda}</span>
              {faltan.includes(p) && (
                <span className="text-[9px] text-[#f59e0b]">← falta</span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Con el dato ya escrito, el botón deja de ser «simular» a secas: dice
          que va a rehacer la cuenta CON ese número. */}
      {ok && !aplicado && Object.keys(extra).length > 0 && (
        <button
          disabled={corriendo}
          onClick={() => simular(h.ticker, curva, false, extra, modo)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b] hover:text-black disabled:opacity-40"
        >
          {corriendo ? "…" : faltan.length ? "Simular con lo cargado" : "Simular con este dato"}
        </button>
      )}
      {/* El PASO A PASO. Aplicar sin ver la cadena entera es firmar a ciegas: el
          bono queda escrito y el síntoma de que algo faltó es una celda vacía
          tres días después. */}
      {ok && pasos.length > 0 && (
        <Chequeos
          pasos={pasos}
          veredicto={veredicto}
          calculo={Array.isArray(r?.calculo) ? (r.calculo as Insumo[]) : []}
        />
      )}
    </div>
  );
}

// ── El PRE-FLIGHT: la cadena completa antes de escribir ────────────────────
//
// Se muestran TODOS los pasos, también los que están en verde. Mostrar solo lo
// que falla obliga a confiar en que el resto se chequeó, que es exactamente lo
// que este cuadro viene a reemplazar.

type Paso = {
  n: number; clave: string; titulo: string; estado: string;
  detalle: string; tabla?: string; accion?: string;
  // Resueltos por el backend: `frena` = no se puede aplicar ni a mano;
  // `frena_auto` = no puede aplicarse SOLO. El front no reimplementa el criterio.
  frena?: boolean; frena_auto?: boolean;
  // Trabajo MANUAL que queda pendiente después de aplicar. No es un error.
  aviso?: string;
  // El dato se puede TIPEAR en la propia cadena y volver a simular con él, en
  // vez de aplicar a ciegas e ir a cargarlo a otra pantalla.
  pide?: { campo: string; label: string; tipo: string; ayuda: string } | null;
  // LO QUE EL AGENTE SABE HACER con este control. Viene RESUELTO del backend
  // (qué control tiene qué acción) — así una acción nueva aparece sola, sin
  // tocar el front.
  hacer?: { accion: string; titulo: string; campo: string; casos: number;
            pendientes: number } | null;
};

// Una propuesta esperando OK. `propuesto` puede venir VACÍO a propósito (el ping
// a una persona: a quién avisarle no lo puede adivinar el nombre del caso).
type Propuesta = {
  id: number; accion: string; sujeto: string; campo: string;
  antes?: string | null; propuesto: string; porque: string;
  fuente: string; confianza?: number | null;
  extra?: { elige_destinatario?: boolean; n?: number } | null;
};

// El veredicto trae la DECISIÓN ya tomada, no los insumos para tomarla.
// `puede_aplicar` es para el humano; `puede_auto` es lo que va a leer la lane
// automática el día que exista — dos preguntas distintas y por eso dos campos.
type Veredicto = {
  estado: string; texto: string;
  puede_aplicar?: boolean; puede_auto?: boolean;
  conteo?: { ok: number; info: number; revisar: number; bloquea: number; no_se: number };
};

// Un insumo del cálculo: el número Y de dónde salió. El "de dónde" pesa tanto
// como el valor — cuando dos cuentas no coinciden, lo que hay que mirar es
// justamente el insumo que difiere.
type Insumo = { campo: string; valor: unknown; fuente: string };

// LOS CINCO ESTADOS, y cada uno significa UNA cosa (rediseño 2026-08-17). El
// modelo viejo metía en el mismo ámbar «la paridad se contradice» y «el alta va
// a sembrar la especie» — una prueba de que el bono está mal y un aviso de
// rutina, con el mismo triángulo. Ahora `info` es GRIS y deliberadamente
// apagado: no es un aviso, es contexto, y no debe competir por la atención con
// lo que sí decide.
const PASO_ICONO: Record<string, string> = {
  ok: "✔", bloquea: "✘", revisar: "▲", info: "○", no_se_puede_saber: "?",
};
const PASO_COLOR: Record<string, string> = {
  ok: "var(--t-pos)", bloquea: "var(--t-neg)", revisar: "#f59e0b",
  info: "var(--t-text-dim)", no_se_puede_saber: "var(--t-text-dim)",
};

// ── LO QUE EL AGENTE SABE HACER ────────────────────────────────────────────
//
// *«Que el mismo agent aprenda a sugerir y que, si le das OK, actualice en el
// momento y luego controle que lo hizo bien en el mismo proceso»* (user).
//
// Tres estados y nada más: **no hay nada** → botón. **Propuso** → la lista con
// el valor editable. **Aplicó** → el resultado, uno por uno, verificado.
//
// El valor es un input y no un texto fijo por una razón concreta: ante una
// sugerencia casi buena, sin poder corregirla solo queda descartarla e ir a
// Manager a mano — o sea, todo el trabajo del agente a la basura por una letra.
type Respuesta = { ok?: boolean; error?: string; pendientes?: Propuesta[] };

function PanelHacer({ h }: { h: NonNullable<Paso["hacer"]> }) {
  const [props, setProps] = useState<Propuesta[] | null>(null);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>({});
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState("");
  const [resultados, setResultados] = useState<
    { id: number; sujeto: string; ok: boolean; detalle?: string; error?: string }[]
  >([]);

  const cargar = async (proponer: boolean) => {
    setOcupado(proponer ? "proponiendo" : "cargando");
    setMsg("");
    try {
      // Un solo tipo para las dos rutas: PROPONER agrega `ok`/`error`, LISTAR no
      // los manda. Tipar la unión obligaba a estrechar por `"ok" in r`, y ahí
      // TypeScript pierde `error` — un tipo con los dos campos opcionales dice
      // lo mismo y se lee.
      const r = await (proponer
        ? fetchJson<Respuesta>(
            "/api/ia/av-agent/hacer/proponer",
            { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accion: h.accion }) })
        : fetchJson<Respuesta>(
            `/api/ia/av-agent/hacer?accion=${encodeURIComponent(h.accion)}`));
      // El mensaje se arma en una variable LOCAL y se setea una sola vez al
      // final: `msg` leído acá dentro sería el del render anterior (el estado no
      // se actualiza en el medio de la función), y con eso un error viejo tapaba
      // el «no encontré nada» del pedido nuevo.
      let aviso = r.ok === false ? `✘ ${r.error ?? "falló"}` : "";
      const lista = r.pendientes ?? [];
      setProps(lista);
      // Todas marcadas por default: el caso normal es aceptar lo que propuso, y
      // obligar a tildar veinte casillas convierte una acción de un clic en
      // trabajo manual — justo lo que esto vino a sacar.
      setMarcadas(Object.fromEntries(lista.map((p) => [p.id, true])));
      setValores(Object.fromEntries(lista.map((p) => [p.id, p.propuesto])));
      if (proponer && lista.length === 0 && !aviso) {
        aviso = "no encontré nada que pueda proponer con certeza.";
      }
      setMsg(aviso);
    } catch (e) {
      setMsg(`✘ ${e instanceof Error ? e.message : String(e)}`);
    }
    setOcupado("");
  };

  const elegidas = (props ?? []).filter((p) => marcadas[p.id]);

  const mandar = async (ruta: "aplicar" | "rechazar") => {
    setOcupado(ruta);
    setMsg("");
    try {
      const body: Record<string, unknown> = { ids: elegidas.map((p) => p.id) };
      if (ruta === "aplicar") {
        body.valores = Object.fromEntries(
          elegidas.map((p) => [String(p.id), (valores[p.id] ?? "").trim()]));
      }
      const r = await fetchJson<{
        ok: boolean; error?: string; texto?: string;
        resultados?: { id: number; sujeto: string; ok: boolean;
                       detalle?: string; error?: string }[];
      }>(`/api/ia/av-agent/hacer/${ruta}`,
         { method: "POST", headers: { "Content-Type": "application/json" },
           body: JSON.stringify(body) });
      setMsg(r.ok ? (r.texto ?? "listo") : `✘ ${r.error ?? "falló"}`);
      setResultados(r.resultados ?? []);
      if (r.ok) await cargar(false);   // la lista se relee: lo aplicado ya no espera OK
    } catch (e) {
      setMsg(`✘ ${e instanceof Error ? e.message : String(e)}`);
    }
    setOcupado("");
  };

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          disabled={!!ocupado}
          onClick={() => void cargar(true)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
        >
          {ocupado === "proponiendo" ? "pensando…" : "qué proponés"}
        </button>
        {h.pendientes > 0 && props === null && (
          <button
            disabled={!!ocupado}
            onClick={() => void cargar(false)}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            ver las {h.pendientes} de antes
          </button>
        )}
        {msg && (
          <span className={`text-[9px] ${msg.startsWith("✘")
            ? "text-[var(--t-neg)]" : "text-[var(--t-accent)]"}`}>{msg}</span>
        )}
      </div>

      {props !== null && props.length > 0 && (
        <div className="mt-1 border border-[var(--t-border)]">
          {props.map((p) => (
            <div key={p.id}
                 className="grid grid-cols-[16px_1fr_130px] gap-1.5 px-1.5 py-1 items-baseline border-b border-[var(--t-border)] last:border-b-0">
              <input type="checkbox" checked={!!marcadas[p.id]}
                     onChange={(e) => setMarcadas((m) => ({ ...m, [p.id]: e.target.checked }))}
                     className="translate-y-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] text-[var(--t-text)] break-words">
                  {p.sujeto}
                </span>
                {/* De dónde salió. **Cambia cuánto hay que mirarla**: una regla
                    se audita leyendo el código una vez, una del modelo hay que
                    mirarla caso por caso. */}
                {p.fuente === "ia" && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-widest"
                        style={{ color: "#f59e0b" }}>lo dedujo la IA</span>
                )}
                <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                  {p.porque}
                </p>
              </div>
              <input
                value={valores[p.id] ?? ""}
                placeholder={p.extra?.elige_destinatario ? "email@aca" : p.campo}
                onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
                className="text-[10px] bg-transparent border border-[var(--t-border)] px-1 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
            <button
              disabled={!!ocupado || elegidas.length === 0}
              onClick={() => void mandar("aplicar")}
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
            >
              {ocupado === "aplicar" ? "aplicando…" : `aplicar ${elegidas.length}`}
            </button>
            <button
              disabled={!!ocupado || elegidas.length === 0}
              onClick={() => void mandar("rechazar")}
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-neg)] hover:text-[var(--t-neg)] disabled:opacity-40"
            >
              descartar
            </button>
            {/* Escribir y verificar es UN paso: decirlo acá es lo que hace que
                apretar el botón no sea un acto de fe. */}
            <span className={SUB}>
              escribo en {h.titulo.toLowerCase()} y releo para confirmar
            </span>
          </div>
        </div>
      )}

      {/* El resultado, uno por uno. Un «10 aplicadas» sin detalle obliga a ir a
          Manager a comprobar — que es exactamente el viaje que esto elimina. */}
      {resultados.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {resultados.map((r) => (
            <li key={r.id} className="text-[10px] leading-snug"
                style={{ color: r.ok ? "var(--t-pos)" : "var(--t-neg)" }}>
              {r.ok ? "✔" : "✘"} {r.sujeto} — {r.ok ? r.detalle : (r.error ?? "falló")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chequeos({ pasos, veredicto, calculo }: {
  pasos: Paso[];
  veredicto?: Veredicto;
  calculo?: Insumo[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [verCalculo, setVerCalculo] = useState(false);
  // El RESUMEN lo cuenta el backend (`veredicto.conteo`) — contarlo acá otra vez
  // sería la tercera copia del mismo criterio, que es cómo nacieron las dos
  // contradicciones que este rediseño arregla. El fallback local existe solo por
  // si el front queda deployado antes que el backend.
  const c = veredicto?.conteo ?? {
    ok: pasos.filter((p) => p.estado === "ok").length,
    info: pasos.filter((p) => p.estado === "info").length,
    revisar: pasos.filter((p) => p.estado === "revisar").length,
    bloquea: pasos.filter((p) => p.estado === "bloquea").length,
    no_se: pasos.filter((p) => p.estado === "no_se_puede_saber").length,
  };

  return (
    <div className="basis-full mt-1">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-baseline gap-1.5 text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
      >
        <span>{abierto ? "▾" : "▸"} Cadena completa</span>
        <span className="tabular-nums normal-case tracking-normal">
          <span style={{ color: "var(--t-pos)" }}>{c.ok} ok</span>
          {c.bloquea > 0 && <span className="text-[var(--t-neg)]"> · {c.bloquea} bloquea</span>}
          {c.revisar > 0 && <span style={{ color: "#f59e0b" }}> · {c.revisar} a revisar</span>}
          {c.no_se > 0 && <span className="text-[var(--t-text-dim)]"> · {c.no_se} sin verificar</span>}
          {c.info > 0 && <span className="text-[var(--t-text-dim)]"> · {c.info} informativos</span>}
        </span>
      </button>

      {veredicto && (
        <p className="text-[10px] leading-snug mt-0.5"
           style={{ color: PASO_COLOR[veredicto.estado] ?? "var(--t-text-muted)" }}>
          {veredicto.texto}
        </p>
      )}

      {/* CÓMO SE CALCULÓ. Una tasa sin su memoria de cálculo no se puede
          auditar: solo se puede creer o no creer. Acá está cada insumo con su
          fuente — que es lo que permite explicar una divergencia en vez de
          quedarse con "202 bps y no sé por qué". */}
      {(calculo?.length ?? 0) > 0 && (
        <div className="mt-0.5">
          <button
            onClick={() => setVerCalculo((v) => !v)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verCalculo ? "▾" : "▸"} Cómo se calculó
          </button>
          {verCalculo && (
            <div className="mt-1 border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
              {calculo!.map((i) => (
                <div key={i.campo} className="grid grid-cols-[110px_1fr] gap-2 px-2 py-1 items-baseline">
                  <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">
                    {i.campo}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[10px] text-[var(--t-text)] tabular-nums">
                      {typeof i.valor === "number" ? i.valor.toLocaleString("es-AR", {
                        maximumFractionDigits: 6 }) : String(i.valor ?? "—")}
                    </span>
                    <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                      {i.fuente}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {abierto && (
        <ol className="mt-1 border-l border-[var(--t-border)] pl-2 space-y-1">
          {pasos.map((p) => (
            <li key={p.clave} className="grid grid-cols-[14px_1fr] gap-1.5 items-baseline">
              <span className="text-[10px] font-bold" style={{ color: PASO_COLOR[p.estado] }}>
                {PASO_ICONO[p.estado] ?? "·"}
              </span>
              <div className="min-w-0">
                <span className="text-[10px] text-[var(--t-text)]">{p.titulo}</span>
                {p.tabla && (
                  <span className="ml-1.5 text-[9px] font-mono text-[var(--t-text-dim)]">
                    {p.tabla}
                  </span>
                )}
                {/* `whitespace-pre-wrap`: el backend manda los casos UNO POR
                    LÍNEA y el CSS los estaba colapsando en un párrafo separado
                    por «·». Los 8 casos eran una lista y se veían como un
                    chorizo — el user: «necesito que estén en modo listado, no
                    tirados así uno al lado del otro que no entiendo nada». */}
                <p className="text-[10px] leading-snug text-[var(--t-text-muted)] whitespace-pre-wrap">
                  {p.detalle}
                </p>
                {/* `accion` en un paso de SALUD es una URL: el ATAJO para ir a
                    arreglarlo. Decir «se corrige en Manager → TÍTULOS» y hacer
                    que el otro navegue a mano es media solución. */}
                {p.accion && (p.accion.startsWith("/") ? (
                  <a href={p.accion}
                     className="inline-block mt-0.5 text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]">
                    ir a arreglarlo →
                  </a>
                ) : (
                  <p className="text-[10px] leading-snug" style={{ color: "#f59e0b" }}>
                    → {p.accion}
                  </p>
                ))}
                {/* El aviso se distingue de la acción a propósito: la acción es
                    algo que hay que resolver ANTES, el aviso queda pendiente
                    DESPUÉS y se sigue desde la tab AVISOS. */}
                {p.aviso && (
                  <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                    ✎ queda en AVISOS: {p.aviso}
                  </p>
                )}
                {p.hacer && <PanelHacer h={p.hacer} />}
              </div>
            </li>
          ))}
        </ol>
      )}
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
function TabAvisos({ avisos, resolver, completar }: {
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
function FilaAviso({ a, resolver, completar }: {
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

function TabHizo({ acciones }: { acciones: Accion[] }) {
  if (acciones.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        Todavía no escribí nada. Acá va a quedar cada cosa que toque, con la fecha,
        la hora, la tabla y quién me lo pidió.
      </p>
    );
  }
  return (
    <div>
      {/* Acá había un párrafo explicando que el libro incluye los intentos que
          fallaron. Es cierto y no le sirve a nadie que ya lo tiene delante: la
          tabla se explica sola, y el renglón se lo comía la pantalla. */}
      <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        <div className="grid grid-cols-[110px_170px_90px_1fr] gap-2 px-2 py-1 bg-[var(--t-surface)] text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
          <span>Cuándo</span><span>Qué hizo</span><span>Sobre</span><span>Dónde escribió</span>
        </div>
        {acciones.map((a) => (
          <div
            key={a.id}
            className={`grid grid-cols-[110px_170px_90px_1fr] gap-2 px-2 py-1 items-baseline ${
              a.ok ? "" : "bg-[var(--t-surface)]"}`}
          >
            <span className="text-[10px] tabular-nums text-[var(--t-text-muted)]">
              {fechaHora(a.ts)}
            </span>
            <span className="text-[10px] text-[var(--t-text)]">
              {!a.ok && <span className="text-[var(--t-neg)] font-bold">✘ </span>}
              {ACCION_LABEL[a.accion] ?? a.accion}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-[var(--t-text)]">
              {a.objetivo}
            </span>
            <div className="min-w-0">
              {/* La TABLA que se tocó, en crudo: es lo que uno necesita para ir a
                  mirarla, y traducirla a lenguaje humano la haría inservible
                  para eso. */}
              <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
                {a.destino}
              </span>
              <div className="text-[9px] text-[var(--t-text-dim)] truncate"
                   title={JSON.stringify(a.detalle ?? {})}>
                {a.por || "—"}
                {a.pregunta_id ? ` · pregunta #${a.pregunta_id}` : ""}
                {a.error ? ` · ${a.error}` : ""}
                {a.detalle && Object.keys(a.detalle).length > 0
                  ? ` · ${JSON.stringify(a.detalle)}`
                  : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TAB 4: lo ya decidido (y cómo deshacerlo) ──────────────────────────────

function TabDecidido({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  // Lo contestado que todavía NO surtió efecto va PRIMERO y a lo ancho: es la
  // pregunta que el user se hace al volver ("¿qué pasó con las altas que
  // contesté?"), y estaba solo como una línea gris en el historial.
  const pend = data.pendientes ?? [];
  const porResp: Record<string, Pendiente[]> = {};
  for (const p of pend) (porResp[p.respuesta ?? "?"] ??= []).push(p);
  return (
    <div className="flex flex-col gap-5">
      {pend.length > 0 && (
        <section className="border border-[var(--t-tint-amber)] bg-[var(--t-surface)] px-3 py-2">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={TITULO}>ESPERANDO QUE PUEDA APLICARLAS</h3>
            <span className={SUB}>{pend.length} · ya las contestaste</span>
          </div>
          {Object.entries(porResp).map(([resp, filas]) => (
            <div key={resp} className="mt-1">
              <div className="text-[10px] text-[var(--t-text)]">
                <strong className="uppercase tracking-widest">{resp}</strong>
                <span className="text-[var(--t-text-dim)]"> ({filas.length}): </span>
                <span className="tabular-nums">
                  {filas.map((f) => f.ticker).sort().join(", ")}
                </span>
              </div>
              {resp === "alta" && (
                <p className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
                  Falta E2: dar de alta necesita bajar el cuadro de flujos de 1816 y
                  simular la TEA antes de escribir. Estas son las que va a procesar.
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className={TITULO}>NO TE INTERESAN</h3>
          <span className={SUB}>{data.ignorados.length} · no los vuelvo a proponer</span>
        </div>
        {data.ignorados.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">Ninguno todavía.</p>
        ) : (
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {data.ignorados.map((ig) => (
              <div key={ig.ticker} className="flex items-center gap-2 px-2 py-1">
                {/* `w-16` eran 4rem para un ticker de 4 letras, pero acá también
                    entran ids de chequeo («JOB:MERCADO_1816_SERIES»): el texto se
                    salía de la caja y se montaba sobre el motivo de al lado. Ancho
                    mayor + `truncate` para que corte en vez de desbordar. */}
                <span className="text-[11px] font-bold text-[var(--t-text)] tabular-nums w-40 shrink-0 truncate"
                      title={ig.ticker}>
                  {ig.ticker}
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)] flex-1 min-w-0 truncate"
                      title={ig.motivo}>
                  {ig.motivo}
                </span>
                {/* Sin este botón, `ignorar` es irreversible desde la app → la
                    respuesta segura pasa a ser no contestar nada, y el canal de
                    preguntas entero deja de usarse. */}
                <button
                  onClick={() => designorar(ig.ticker)}
                  className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors shrink-0"
                >
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className={TITULO}>HISTORIAL</h3>
          <span className={SUB}>{data.decididas.length} respuestas</span>
        </div>
        {data.decididas.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">Todavía no contestaste nada.</p>
        ) : (
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {data.decididas.map((d) => (
              <div key={d.id} className="px-2 py-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--t-accent)] w-16 shrink-0">
                    {d.respuesta}
                  </span>
                  <span className="text-[10px] text-[var(--t-text-muted)] truncate">
                    {d.pregunta}
                  </span>
                </div>
                <div className="text-[9px] text-[var(--t-text-dim)] pl-[72px]">
                  {d.respondida_por || "—"} · {haceCuanto(d.respondida_at)}
                  {/* aplicada_at NULL = se guardó pero no surtió efecto todavía.
                      Decirlo evita que uno crea que un bono ya está dado de alta
                      cuando no lo está. */}
                  {!d.aplicada_at && " · guardado, sin aplicar"}
                  {d.nota && ` · «${d.nota}»`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    </div>
  );
}

// ── LA TAB CONTROL ──────────────────────────────────────────────────────────
//
// La primera pantalla del agente que no habla de un hallazgo sino de la
// HERRAMIENTA. Contesta tres preguntas que hasta acá no tenían dónde: ¿puedo
// frenarlo?, ¿de qué está leyendo?, ¿en qué estado está cada cosa.
//
// Diseñada para COMODIDAD, no para lucir: lo que se necesita en una emergencia
// va arriba y sin scroll, y cada fuente dice PARA QUÉ sirve — «1816 está sin
// token» no significa nada si uno no sabe que de ahí sale el cronograma.

const FUENTE_ICONO: Record<string, string> = {
  ok: "✔", revisar: "▲", bloquea: "✘",
};
const FUENTE_COLOR: Record<string, string> = {
  ok: "var(--t-pos)", revisar: "#f59e0b", bloquea: "var(--t-neg)",
};

function TabControl({ ctrl, setParada, recargar }: {
  ctrl: Control | null;
  setParada: (activa: boolean, motivo: string) => void | Promise<void>;
  recargar: () => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const frenado = ctrl?.parada.parada ?? false;

  if (!ctrl) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[var(--t-neg)]">
          No se pudo leer el tablero de control.
        </span>
        <button
          onClick={() => void recargar()}
          className="self-start text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── LA PARADA ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline gap-2 mb-1.5">
          <h3 className={TITULO}>PARADA DE EMERGENCIA</h3>
          <span className={SUB}>
            {frenado ? "el agente NO está escribiendo" : "el agente puede escribir"}
          </span>
        </div>
        <div className={`border p-3 flex flex-col gap-2 ${
          frenado ? "border-[var(--t-neg)]" : "border-[var(--t-border)]"}`}>
          {frenado ? (
            <>
              <span className="text-[11px] text-[var(--t-neg)] font-semibold">
                ■ FRENADO{ctrl.parada.por ? ` por ${ctrl.parada.por}` : ""}
                {ctrl.parada.cambiado_at
                  ? ` · ${haceCuanto(ctrl.parada.cambiado_at)}`
                  : ""}
              </span>
              <span className="text-[11px] text-[var(--t-text-muted)]">
                {ctrl.parada.motivo}
              </span>
              <button
                onClick={() => void setParada(false, "")}
                className="self-start text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]"
              >
                Reanudar el agente
              </button>
            </>
          ) : (
            <>
              {/* El MOTIVO es obligatorio y lo exige el backend, no el front:
                  la regla es de negocio y tiene que valer también para quien
                  llame al endpoint directo. Acá solo se pide antes para no
                  mandar un request que ya sabemos que va a ser rechazado. */}
              <div className="flex items-center gap-2">
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && motivo.trim()) {
                      void setParada(true, motivo.trim());
                      setMotivo("");
                    }
                  }}
                  placeholder="¿Por qué lo frenás? (obligatorio)"
                  className="flex-1 bg-transparent border border-[var(--t-border)] px-2 py-1 text-[11px] text-[var(--t-text)] outline-none focus:border-[var(--t-neg)]"
                />
                <button
                  disabled={!motivo.trim()}
                  onClick={() => { void setParada(true, motivo.trim()); setMotivo(""); }}
                  className="shrink-0 text-[9px] uppercase tracking-widest px-3 py-1 border border-[var(--t-neg)] text-[var(--t-neg)] hover:bg-[var(--t-neg)] hover:text-[var(--t-on-accent)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--t-neg)]"
                >
                  ■ Frenar
                </button>
              </div>
              <span className="text-[10px] text-[var(--t-text-dim)] leading-relaxed">
                Sin el motivo no se puede frenar: el que se lo encuentre parado
                tiene que poder decidir si lo reanuda sin ir a preguntar.
              </span>
            </>
          )}
          {/* QUÉ cubre exactamente. Una parada de alcance ambiguo es peor que
              ninguna: uno no sabe si puede seguir trabajando. */}
          <div className="text-[10px] text-[var(--t-text-dim)] leading-relaxed border-t border-[var(--t-border)] pt-2">
            <span className="text-[var(--t-text-muted)]">Frena</span> el alta de un
            bono, completar flujos, arreglar un insumo y crear una curva — todo lo
            que escribe datos de mercado.{" "}
            <span className="text-[var(--t-text-muted)]">No frena</span> los
            diagnósticos, ignorar un ticker ni cerrar un aviso: con la mano frenada
            se tiene que poder seguir mirando y triando, o el primer reflejo ante
            una duda sería quedarse sin la herramienta.
          </div>
        </div>
      </section>

      {/* ── LAS FUENTES ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline gap-2 mb-1.5">
          <h3 className={TITULO}>DE DÓNDE LEE</h3>
          <span className={SUB}>
            {ctrl.resumen.bloquea + ctrl.resumen.revisar === 0
              ? "todo en verde"
              : `${ctrl.resumen.bloquea} caídas · ${ctrl.resumen.revisar} a revisar`}
          </span>
          <button
            onClick={() => void recargar()}
            title="Releer el tablero (no gasta créditos de 1816)"
            className="ml-auto text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
          >
            ↻
          </button>
        </div>
        <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
          {ctrl.fuentes.map((f) => (
            <div key={f.clave}
                 className="grid grid-cols-[16px_190px_1fr] items-baseline gap-2 px-2 py-1.5">
              <span className="text-[11px]" style={{ color: FUENTE_COLOR[f.estado] }}>
                {FUENTE_ICONO[f.estado] ?? "·"}
              </span>
              <span className="text-[11px] font-bold text-[var(--t-text)] truncate"
                    title={f.titulo}>
                {f.titulo}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] text-[var(--t-text-muted)] leading-snug">
                  {f.detalle}
                </div>
                {/* PARA QUÉ sirve esta fuente. «1816 sin token» no dice nada si
                    uno no sabe que de ahí sale el cronograma del bono — y el que
                    mira el tablero en una emergencia no tiene por qué saberlo. */}
                {f.para && (
                  <div className="text-[9px] text-[var(--t-text-dim)] leading-snug">
                    alimenta: {f.para}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── EL INFORME MASIVO ───────────────────────────────────────────────────────
//
// Lo que hace útil a este panel no es el detalle —ese ya está fila por fila— es
// el AGREGADO: 68 casos que resultan ser 4 causas dicen que el trabajo real es
// mucho más chico de lo que parece, y 9 que fallan con la misma excepción son UN
// bug de código disfrazado de 9 hallazgos.
//
// El bloque de TEXTO lo arma el backend, no acá: el que lo lee (una persona o un
// modelo) tiene que ver exactamente lo mismo que la pantalla, y dos renderizados
// del mismo informe se desincronizan al primer cambio.

const EST_MASIVO: Record<string, { label: string; color: string }> = {
  // Los que EXPLOTARON primero y en rojo: son bugs del agente, no bonos mal
  // cargados, y son lo único de este informe que hay que arreglar en el código.
  error: { label: "explotaron", color: "var(--t-neg)" },
  no_pudo: { label: "sin diagnóstico", color: "#f59e0b" },
  bloqueado: { label: "bloqueados", color: "#f59e0b" },
  sin_puerta: { label: "sin puerta", color: "var(--t-text-dim)" },
  listo: { label: "listos", color: "var(--t-pos)" },
};
const ORDEN_MASIVO = ["error", "no_pudo", "bloqueado", "sin_puerta", "listo"];

function InformeMasivo({ run, simular, sims }: {
  run: RunMasivo;
  simular: Simular;
  sims: Record<string, Record<string, unknown> | null>;
}) {
  const [copiado, setCopiado] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  // El PROGRESO del lote. Sin esto el botón aplicaba los 10 —y funcionaba— pero
  // el panel no decía nada: el resultado aparecía en las filas de abajo, fuera
  // de la vista. Una acción que no confirma en el lugar donde se apretó se lee
  // como que no pasó nada, y se vuelve a apretar.
  const [lote, setLote] = useState<{ i: number; ticker: string } | null>(null);
  const [hechoLote, setHechoLote] = useState<{ ok: number; mal: string[] } | null>(null);
  // EL ANÁLISIS con la IA propia. Es una capa ARRIBA del informe determinista,
  // nunca un reemplazo: si el LLM no está, el informe queda igual de completo.
  const [ia, setIa] = useState<string>("");
  const [pensando, setPensando] = useState(false);

  const analizar = async () => {
    setPensando(true);
    try {
      const r = await fetchJson<{ ok: boolean; analisis?: string; error?: string }>(
        `/api/ia/av-agent/masivo/analizar?run_id=${run.id}`, { method: "POST" });
      setIa(r.ok ? (r.analisis ?? "") : `⚠ ${r.error ?? "no se pudo analizar"}`);
    } catch (e) {
      setIa(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    }
    setPensando(false);
  };

  const listos = run.informe.filter((f) => f.estado === "listo" && f.accion);

  // SECUENCIAL y no en paralelo: cada aplicación escribe en `mercado.curvas` y
  // vuelve a leer la vista. En paralelo se pisan entre sí y el error de uno se
  // pierde entre los otros nueve.
  const aplicarLote = async () => {
    setHechoLote(null);
    const mal: string[] = [];
    let ok = 0;
    for (let i = 0; i < listos.length; i++) {
      const f = listos[i];
      setLote({ i: i + 1, ticker: f.sujeto });
      const r = await simular(f.sujeto, "", true, {}, f.accion as Modo);
      // El RESULTADO de cada uno se cuenta acá y no se deduce de `sims`: el
      // estado de React se actualiza asincrónico y leerlo dentro del loop
      // devolvía el valor viejo — el resumen habría contado mal.
      if (r?.aplicado) ok++;
      else mal.push(f.sujeto);
    }
    setLote(null);
    setHechoLote({ ok, mal });
  };
  const corriendo = run.estado === "corriendo";
  const pct = run.total ? Math.round((run.hechos / run.total) * 100) : 0;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(run.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles: queda el <pre> para seleccionar */ }
  };

  return (
    <div className="border border-[var(--t-border)] p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className={TITULO}>INFORME #{run.id}</h3>
        <span className={SUB}>
          {run.hechos}/{run.total}
          {corriendo ? ` · ${pct}%` : ` · ${run.estado}`}
          {run.sin_red ? " · sin red" : ""}
          {run.creditos !== null ? ` · ${run.creditos} créditos` : ""}
          {run.resumen?.segundos ? ` · ${run.resumen.segundos}s` : ""}
        </span>
        {/* EL LOTE. Aplicar de a uno los 10 que el informe ya declaró listos es
            trabajo que el informe vino a evitar. No saltea nada: cada uno pasa
            por su propia cadena server-side, uno detrás de otro. */}
        {listos.length > 0 && (
          <button
            disabled={!!lote}
            onClick={() => void aplicarLote()}
            className="ml-auto text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
          >
            {lote
              ? `aplicando ${lote.i}/${listos.length} · ${lote.ticker}`
              : `aplicar los ${listos.length} listos`}
          </button>
        )}
        {/* ANALIZAR CON IA — para no tener que sacar el informe de la app. Lo que
            se le pide es el PATRÓN: qué causas dominan, qué huele a bug del
            agente, en qué orden atacar. Los diagnósticos ya están hechos y son
            deterministas; la IA no los toca ni inventa números. */}
        {run.estado !== "corriendo" && (
          <button
            disabled={pensando}
            onClick={() => void analizar()}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            {pensando ? "analizando…" : "◆ analizar con IA"}
          </button>
        )}
        <button
          onClick={() => void copiar()}
          className={`${listos.length ? "" : "ml-auto "}text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]`}
        >
          {copiado ? "✔ copiado" : "copiar informe"}
        </button>
      </div>

      {/* La BARRA de progreso. Con 2-3 minutos de corrida, un spinner sin número
          no distingue «avanzando despacio» de «colgado». */}
      {corriendo && (
        <div className="h-[3px] bg-[var(--t-surface)]">
          <div className="h-full bg-[var(--t-accent)] transition-all"
               style={{ width: `${pct}%` }} />
        </div>
      )}

      {run.error && (
        <span className="text-[10px] text-[var(--t-neg)]">⚠ {run.error}</span>
      )}

      {/* EL RESULTADO DEL LOTE, en el panel donde se apretó. Y NOMBRA a los que
          fallaron: «8 de 10» sin decir cuáles dos obliga a leer las 16 filas de
          abajo para encontrarlos. */}
      {hechoLote && (
        <div className={`border-l-2 pl-3 py-1 ${
          hechoLote.mal.length ? "border-[#f59e0b]" : "border-[var(--t-pos)]"}`}>
          <span className="text-[11px] text-[var(--t-text)]">
            <span className="text-[var(--t-pos)]">✔ {hechoLote.ok} aplicados</span>
            {hechoLote.mal.length > 0 && (
              <span className="text-[#f59e0b]">
                {" · "}{hechoLote.mal.length} no: {hechoLote.mal.join(", ")}
              </span>
            )}
          </span>
          {/* Los motores leen `mercado.curvas` AL ARRANCAR: escribir el dato no
              alcanza para que la mesa vea el número nuevo. Decirlo acá evita la
              conclusión equivocada de que el arreglo no funcionó. */}
          {hechoLote.ok > 0 && (
            <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
              Los motores leen `mercado.curvas` al arrancar: la tasa nueva llega a
              la vista cuando se reinicie `motor_curvas` (fuera de rueda).
            </div>
          )}
        </div>
      )}

      {/* ── EL AGREGADO ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {ORDEN_MASIVO.filter((e) => run.resumen?.por_estado?.[e]).map((e) => (
          <button
            key={e}
            onClick={() => setAbierto(abierto === e ? null : e)}
            className={`text-[9px] uppercase tracking-widest px-2 py-1 border transition-colors ${
              abierto === e ? "border-[var(--t-accent)]" : "border-[var(--t-border)]"}`}
            style={{ color: EST_MASIVO[e].color }}
          >
            {run.resumen.por_estado[e]} {EST_MASIVO[e].label}
          </button>
        ))}
      </div>

      {/* EL ANÁLISIS. Va ARRIBA de los agregados: si uno pidió que la IA lea el
          informe, lo que quiere leer primero es la conclusión. */}
      {ia && (
        <div className="border-l-2 border-[var(--t-accent)] pl-3 py-1">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
            ◆ análisis
          </span>
          {/* `whitespace-pre-wrap`: el modelo devuelve texto plano con saltos, y
              renderizarlo sin respetarlos lo convierte en un párrafo ilegible. */}
          <p className="mt-1 text-[11px] text-[var(--t-text-muted)] leading-relaxed whitespace-pre-wrap">
            {ia}
          </p>
        </div>
      )}

      {/* POR CAUSA — el número que contesta «cuánto trabajo hay de verdad». */}
      {run.resumen?.por_causa && Object.keys(run.resumen.por_causa).length > 0 && (
        <div>
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
            {Object.keys(run.resumen.por_causa).length} causas para {run.hechos} casos
          </span>
          <div className="mt-1 flex flex-col gap-0.5">
            {Object.entries(run.resumen.por_causa).map(([c, n]) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-[var(--t-text)] w-8 text-right">
                  {n}
                </span>
                {/* Barra proporcional: qué causa domina se ve antes de leer. */}
                <span className="h-[6px] bg-[var(--t-accent)] opacity-60"
                      style={{ width: `${(n / Math.max(1, run.hechos)) * 200}px` }} />
                <span className="text-[10px] text-[var(--t-text-muted)]">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* El DETALLE del grupo abierto. Cerrado por default: el informe entero es
          para copiar, la pantalla es para decidir dónde mirar. */}
      {abierto && (
        <div className="border-t border-[var(--t-border)] pt-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
          {run.informe.filter((f) => f.estado === abierto).map((f, i) => (
            <div key={`${f.sujeto}-${i}`} className="text-[10px] leading-snug">
              <span className="font-bold text-[var(--t-text)]">{f.sujeto}</span>
              <span className="text-[var(--t-text-dim)]"> · {f.regla ?? f.tipo}</span>
              {f.causa && <span className="text-[var(--t-accent)]"> → {f.causa}</span>}
              {/* APLICAR desde el informe. El backend RE-SIMULA y vuelve a correr
                  la cadena entera antes de escribir, así que esto no es un
                  atajo que saltea el pre-flight: es el mismo camino, sin
                  obligar a volver a buscar el bono en la lista. */}
              {f.estado === "listo" && f.accion && (
                <button
                  disabled={sims[f.sujeto] === null}
                  onClick={() => simular(f.sujeto, "", true, {}, f.accion as Modo)}
                  className="ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
                >
                  {sims[f.sujeto] === null ? "…" : "aplicar"}
                </button>
              )}
              {(sims[f.sujeto] as Record<string, unknown> | undefined)?.aplicado === true && (
                <span className="ml-2 text-[9px] text-[var(--t-pos)]">✔ aplicado</span>
              )}
              {(sims[f.sujeto] as Record<string, unknown> | undefined)?.ok === false && (
                <span className="ml-2 text-[9px] text-[var(--t-neg)]">
                  ✘ {String((sims[f.sujeto] as Record<string, unknown>).error ?? "")}
                </span>
              )}
              {f.detalle && (
                <div className="text-[var(--t-text-muted)] pl-3">{f.detalle}</div>
              )}
              {(f.trabas ?? []).slice(0, 3).map((t, j) => (
                <div key={j} className="text-[var(--t-text-dim)] pl-3">
                  · {t.paso}: {t.detalle}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LA TAB EN VIVO ──────────────────────────────────────────────────────────
//
// Lo que hace distinta a esta pantalla del resto del modal es que acá **el
// tiempo importa**: no es una foto de anoche, es lo que está pasando. Por eso
// cada fila lleva DESDE CUÁNDO y CUÁNTAS VECES, y lo nuevo sin ver va arriba.
//
// `veces` no es decoración: separa un problema que apareció una vez (puede ser
// un instante del mercado) de uno que lleva 200 ciclos (es un dato roto).

function edad(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

const SEV_COLOR: Record<string, string> = {
  alta: "var(--t-neg)", media: "#f59e0b", baja: "var(--t-text-dim)",
};

// SE ROMPIÓ ALGO — lo que antes te frenaba con un modal propio.
//
// Muestra el chequeo, el motivo y la evidencia CONGELADA del momento en que se
// rompió: una vez que el job vuelve a correr, el motivo ya no existe y sin la
// foto no queda nada que mirar.
//
// SILENCIAR **no lo esconde**: sigue en la lista de SALUD con su estado real,
// solo deja de interrumpir. Un chequeo que desaparece al silenciarlo es un
// problema que se te olvida.
function Rotos({ items, entendido }: {
  items: SaludRoto[];
  entendido: () => void;
}) {
  const [silenciando, setSilenciando] = useState("");
  const silenciar = async (chequeoId: string) => {
    setSilenciando(chequeoId);
    try {
      await fetchJson("/api/ia/av-agent/salud/silenciar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chequeo_id: chequeoId, alertar: false }),
      });
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

function TabCentinela({ cent, marcarVisto, recargar }: {
  cent: Centinela | null;
  marcarVisto: (claves: string[]) => Promise<void>;
  recargar: () => void | Promise<void>;
}) {
  const [verResueltos, setVerResueltos] = useState(false);

  if (!cent) {
    return <p className="text-[11px] text-[var(--t-text-muted)]">Cargando…</p>;
  }

  const sinVer = cent.abiertos.filter((f) => !f.visto_at);

  return (
    <div className="flex flex-col gap-4">
      {/* El estado, en castellano. Acá decía «VIGILANDO · latió hace 32s ·
          ciclo 10 · fuera de rueda · late cada 5 min · se apaga en 867s si no
          vuelve · 2038 ms». Siete datos, cuatro de ellos sobre el MECANISMO
          (latir, ciclos, cuándo se apagaría) que no cambian nada de lo que uno
          hace. Quedan dos: si está funcionando, y desde cuándo no da señales
          cuando no. El resto vive en el `title`. */}
      <div className={`border p-3 flex flex-wrap items-center gap-3 ${
        cent.vivo ? "border-[var(--t-border)]" : "border-[var(--t-neg)]"}`}>
        <span className="inline-flex items-center gap-2"
              title={cent.latido
                ? `Revisa cada ${cent.latido.cadencia_s}s · ${cent.latido.ciclo} revisiones · última hace ${cent.latido.hace_s}s`
                : "sin datos"}>
          <span className={`inline-block w-[8px] h-[8px] rounded-full ${
            cent.vivo && cent.latido?.en_rueda ? "animate-pulse" : ""}`}
                style={{ background: cent.vivo ? "var(--t-pos)" : "var(--t-neg)" }} />
          <span className="text-[11px] font-semibold tracking-widest"
                style={{ color: cent.vivo ? "var(--t-pos)" : "var(--t-neg)" }}>
            {cent.vivo ? "REVISANDO" : "SIN REVISAR"}
          </span>
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">
          {cent.vivo
            ? `cada ${cent.latido && cent.latido.cadencia_s >= 60
                ? `${Math.round(cent.latido.cadencia_s / 60)} min` : "30s"}`
              + `${cent.latido?.en_rueda ? "" : " · mercado cerrado"}`
            : `sin señales desde hace ${cent.latido ? Math.round(cent.latido.hace_s / 60) : "?"} min`}
        </span>
        {!cent.vivo && (
          <span className="text-[10px] text-[var(--t-neg)] w-full">
            En el Droplet: <span className="font-mono">systemctl status av_agent_centinela</span>
          </span>
        )}
        {cent.latido?.error && (
          <span className="text-[10px] text-[var(--t-neg)] w-full">
            último error: {cent.latido.error}
          </span>
        )}
        <button
          onClick={() => void recargar()}
          className="ml-auto text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
        >
          ↻
        </button>
      </div>

      {/* ── LO NUEVO ────────────────────────────────────────────────────── */}
      {sinVer.length > 0 && (
        <div className="flex items-baseline gap-2">
          <h3 className={TITULO}>NUEVO, SIN VER</h3>
          <span className={SUB}>{sinVer.length}</span>
          {/* Marcar todo visto es una sola acción porque revisar 30 casillas es
              la forma más rápida de que nadie marque nada. NO los resuelve ni
              los esconde: solo dejan de ser «nuevos». */}
          <button
            onClick={() => void marcarVisto(sinVer.map((f) => f.clave))}
            className="ml-auto text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            marcar los {sinVer.length} como vistos
          </button>
        </div>
      )}

      {cent.abiertos.length === 0 ? (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          {cent.vivo
            ? "Nada abierto. El centinela está mirando y no encuentra nada."
            : "Nada abierto — pero el centinela está apagado, así que esto no "
              + "significa que todo esté bien."}
        </p>
      ) : (
        <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
          {cent.abiertos.map((f) => (
            <div key={f.clave}
                 className={`grid grid-cols-[3px_120px_170px_1fr_auto] items-baseline gap-2 px-2 py-1 hover:bg-[var(--t-surface)] ${
                   f.visto_at ? "opacity-60" : ""}`}>
              <span className="self-stretch" style={{ background: SEV_COLOR[f.severidad] }} />
              <span className="text-[11px] font-bold text-[var(--t-text)] truncate"
                    title={f.sujeto}>
                {!f.visto_at && <span className="text-[var(--t-neg)]">• </span>}
                {f.sujeto}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                    title={f.regla}>
                {f.regla.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-[var(--t-text-muted)] leading-snug min-w-0">
                {f.motivo}
              </span>
              {/* DESDE CUÁNDO y CUÁNTAS VECES. `veces` separa un problema que
                  apareció una vez —puede ser un instante del mercado— de uno que
                  lleva 200 ciclos, que es un dato roto. */}
              <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums whitespace-nowrap self-center"
                    title={`apareció ${f.abierto_at} · visto ${f.veces} veces`}>
                hace {edad(f.abierto_at)} · ×{f.veces}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── LO QUE SE ARREGLÓ SOLO ──────────────────────────────────────── */}
      {cent.resueltos.length > 0 && (
        <div>
          <button
            onClick={() => setVerResueltos(!verResueltos)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verResueltos ? "▾" : "▸"} se arreglaron solos ({cent.resueltos.length})
          </button>
          {/* No se borran a propósito: «se arregló solo» es información, y ver
              los que van y vienen es cómo se detecta un intermitente. */}
          {verResueltos && (
            <div className="mt-1 flex flex-col gap-0.5">
              {cent.resueltos.map((f) => (
                <div key={f.clave} className="text-[10px] text-[var(--t-text-dim)]">
                  <span className="text-[var(--t-pos)]">✔</span> {f.sujeto}
                  {" · "}{f.regla.replace(/_/g, " ")}
                  {" · duró "}{edad(f.abierto_at)}{" · ×"}{f.veces}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
