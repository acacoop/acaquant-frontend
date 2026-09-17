// Los tipos del AV Agent. Espejan lo que devuelve `agente/vista.py`.
//
// ⚠️ El front **no deriva**: clase, estado, arreglo y nombre vienen resueltos
// del backend. Si acá aparece un cálculo, está en el lugar equivocado.

export type Severidad = "alta" | "media" | "baja";

export type Hallazgo = {
  id: number;
  habilidad: string;
  sujeto: string;
  regla: string;
  nombre: string;
  severidad: Severidad;
  problema: string;
  // El error CRUDO, tal cual. Es lo que dice de quién es el problema.
  detalle?: string;
  que_hacer: string;
  arreglo: string;
  arreglo_titulo?: string;
  arreglo_donde?: string;
  // ⚠️ El botón no escribe: ABRE EL LISTADO (la ficha, los CEDEARs, las ONs,
  // las contrapartes). Lo declara el arreglo en el backend — apretarlo sin
  // valores cargados devuelve «no se cargó ningún valor», así que sin este dato
  // el front dibujaba un botón que no podía funcionar nunca.
  arreglo_pide_datos?: boolean;
  // El sujeto es una FAMILIA (un campo de la ficha, no un título): aplicarlo de
  // nuevo es lo normal y no duplica nada.
  arreglo_repetible?: boolean;
  // ⚠️⚠️ **«ESPERANDO AL DETECTOR» ES UN HECHO MEDIDO, NO EL ESTADO.**
  // `en_curso` dice que se aplicó el arreglo; lo que no dice es si el detector
  // ya volvió a mirar. Para una familia vuelve cada hora, lo sigue viendo
  // —quedan otros títulos— y el estado no se mueve nunca: la tarjeta decía
  // «esperando que el detector confirme» durante semanas. Lo resuelve
  // `agente.v_encontro` comparando `visto_ultima_vez` con `arreglo_aplicado_at`
  // (el navegador no compara fechas — invariante 11).
  espera_al_detector?: boolean;
  arreglo_aplicado_at?: string | null;
  evidencia: Record<string, unknown>;
  detectado_at: string;
  visto_ultima_vez?: string;
  veces: number;
  estado?: string;
  dominio: string | null;
  accionable?: boolean;
  // ⚠️ CUÁNTAS VECES apareció ESTE MISMO problema en los últimos 30 días —
  // no cuántas veces se lo vio (eso es `veces`). Tres episodios son tres veces
  // que apareció, se fue y volvió: eso ya no es un incidente, es una
  // configuración mal puesta, y relanzar el job todas las veces es taparlo.
  //
  // `undefined`/`null` = el backend NO PUDO CONTARLO. **No es «primera vez»**:
  // se dibuja sin el indicador, no con un «1ª».
  episodios?: number | null;
  episodios_desde?: string | null;
  // Lo DERIVA el backend (ningún contador se suma en el navegador).
  cronico?: boolean;
};

export type Habilidad = {
  nombre: string;
  tipo: "detector" | "consulta" | "accion";
  dominio: string;
  que_mira: string;
  usa_ia: boolean;
  cada_segundos: number;
  ventana: string;
  activa: boolean;
  clase: "aviso" | "trabajo";
  arreglos: Record<string, string>;
  // Regla → por qué ESE arreglo puede aplicarse solo, sin que nadie apriete.
  automatico?: Record<string, string>;
  ultima_corrida_at: string | null;
  ultimo_resultado: "ok" | "sin_datos" | "error" | null;
  ultimo_error: string;
  ultima_duracion_ms: number | null;
  corridas_hoy: number;
  hallazgos_total: number;
  hallazgos_abiertos: number;
  ultimo_hallazgo_at: string | null;
  reincidencias: number;
};

export type Reincidencia = {
  id: number;
  habilidad: string;
  sujeto: string;
  regla: string;
  arreglo_aplicado: string;
  resuelto_at: string;
  volvio_at: string;
  dias_aguanto: number;
};

export type Vista = {
  ok: boolean;
  latido: { vivo: boolean; at?: string; hace_s: number | null;
            cada_s?: number | null };
  ahora: { total: number; filas: Hallazgo[] };
  encontro: { total: number; filas: Hallazgo[]; por_habilidad: Record<string, number> };
  // `total` son las ACTIVAS (su hallazgo sigue abierto) y `historicas` las
  // que ya se apagaron. La fila NUNCA se borra —«`alta_bono` aguantó 3,6 días»
  // es evidencia—, pero la alarma tiene que poder volver a cero: una tabla que
  // sólo crece deja el cartel rojo prendido para siempre y enseña a ignorarlo.
  reincidencias: { total: number; filas: Reincidencia[]; historicas?: number };
  habilidades: Habilidad[];
  // Cuánto hizo el agente SOLO, sin que nadie apretara. `null` es «no pude
  // contar» — distinto de 0, que es «contó y no hubo ninguna».
  solo?: { hoy: number | null; fallidas_hoy: number | null; ultima_at: string | null };
  // LO QUE PASA SIEMPRE. `activos` = pasó en los últimos `dias_activo`;
  // `historicos` = fue crónico y se cortó. Los umbrales viajan en el payload a
  // propósito: si el front los hardcodeara, el día que cambien la leyenda
  // mentiría sin que nada falle.
  cronicos?: {
    total: number;
    activos: Cronico[];
    historicos: Cronico[];
    ventana_dias: number;
    dias_activo: number;
    desde_episodios: number;
  };
};

export type Cronico = {
  habilidad: string;
  sujeto: string;
  regla: string;
  episodios: number;
  // MEDIANA de cuánto duró cada episodio, no promedio: uno de cuatro horas
  // entre cuarenta de tres minutos mueve el promedio y cuenta otra historia.
  mediana_s: number;
  peor_s: number;
  desde: string;
  ultima: string;
  abiertos: number;
  activo: boolean;
};

export type Accion = {
  id: number;
  at: string;
  arreglo: string;
  habilidad: string;
  sujeto: string;
  regla: string;
  hallazgo_id: number | null;
  por: string;
  donde: string;
  campo: string;
  antes: string;
  despues: string;
  ok: boolean;
  error: string;
  estado_hoy: string | null;
  // Lo aplicó el agente solo, sin que nadie apretara. Viene resuelto del
  // backend — acá no se deriva comparando `por` contra ningún string.
  automatico?: boolean;
};

export type Historial = {
  filas: Accion[];
  hay_mas: boolean;
  ultimo_id: number | null;
  limite: number;
};

// El sello de tiempo va en TODO lo que se muestra (invariante 3).
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function hace(segundos: number | null): string {
  if (segundos == null) return "—";
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}m`;
  return `${Math.round(segundos / 3600)}h`;
}

export const COLOR: Record<Severidad, string> = {
  alta: "var(--t-neg)",
  media: "var(--t-accent)",
  baja: "var(--t-text-muted)",
};

// ── SALUD DE UNA HABILIDAD ─────────────────────────────────────────────────
//
// CUATRO estados, no dos: la distinción que el agente viejo no hacía. Vive
// acá y no en el panel porque **la dibujan dos pantallas** —el listado y el
// mapa— y el criterio tiene que ser UNO. Con una copia en cada archivo, el
// día que cambie un color el mapa y la lista pintarían la misma habilidad de
// distinto y ninguno de los dos fallaría (REGLA #9).
export const ESTADO_HABILIDAD: Record<string, { color: string; txt: string }> = {
  ok: { color: "var(--t-pos)", txt: "miró y guardó lo que vio" },
  sin_datos: { color: "var(--t-accent)", txt: "NO PUDO MIRAR — no cerró nada" },
  error: { color: "var(--t-neg)", txt: "reventó — no cerró nada" },
};
export const NUNCA_CORRIO = {
  color: "var(--t-text-dim)", txt: "todavía no le tocó",
};

// ⚠️⚠️ **UNA HABILIDAD DADA DE BAJA NO SE PINTA CON EL COLOR DE SU ÚLTIMA
// CORRIDA.** Cuando una habilidad se saca del código, su fila queda
// `activa = false` para que los hallazgos históricos que la nombran se puedan
// leer — pero `ultimo_resultado` se congela en el `ok` de la última vez que
// corrió de verdad. Sin mirar `activa`, el panel la dibujaba VERDE, con el
// texto «miró y guardó lo que vio» y una fecha de hace una semana, en una
// lista donde todo lo demás decía hoy: **una luz verde sobre algo que no
// corre** (§0.ey).
//
// Va PRIMERO, antes de leer el resultado: la baja gana sobre cualquier estado.
export const DADA_DE_BAJA = {
  color: "var(--t-text-dim)",
  txt: "DADA DE BAJA — ya no está en el catálogo, no corre",
};

export function saludDe(h: Habilidad): { color: string; txt: string } {
  if (!h.activa) return DADA_DE_BAJA;
  if (!h.ultima_corrida_at) return NUNCA_CORRIO;
  return ESTADO_HABILIDAD[h.ultimo_resultado ?? ""] ?? NUNCA_CORRIO;
}

// El ritmo en la unidad que se lee. `cada_segundos` sale del catálogo.
export function ritmo(segundos: number): string {
  if (segundos < 3600) return `${Math.round(segundos / 60)}m`;
  const h = segundos / 3600;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

// ── EL LAB (el ASISTENTE) ──────────────────────────────────────────────────
//
// Una pregunta → el backend corre el grafo (`asistente/grafo.py`, doc
// `docs/AvAgentAI.md`): ruteo → agentes → junta. Vuelve la respuesta más
// cada paso. Un request y se espera.

// `agente` dice qué agente lo hizo (cartera, renta_fija, ruteo, junta).
// `ruteo` es el primer paso: a quiénes les tocó (`elegidos`) y por qué
// (`motivo`: una regla, el modelo, o que no se entendió y van todos).
export type EventoLab = { agente?: string; id?: number; ts?: string } & (
  | { tipo: "pregunta"; texto: string; herramientas: string[]; sesion?: string }
  | { tipo: "ruteo"; elegidos: string[]; motivo: string }
  | { tipo: "junta"; agentes: string[] }
  | { tipo: "vuelta"; n: number }
  | { tipo: "pide"; herramienta: string; argumentos: Record<string, unknown> | null }
  | { tipo: "resultado"; herramienta: string; resultado: unknown; acceso?: string; duracion_ms?: number }
  | { tipo: "texto"; texto: string }
  | { tipo: "corte"; motivo: string }
  // Cuánto se ACHICÓ (peso) y cuánto se PODÓ (cantidad) del historial viejo
  // antes de empezar. Lo que se poda se pierde para el modelo; lo que sabe
  // (el foco) vive en `estado` y no se toca.
  | { tipo: "achicado"; chars: number }
  | { tipo: "podado"; turnos: number; mensajes: number }
  // Cambió lo que queda en foco (backend: `asistente/estado.py`). Sale sólo
  // cuando cambia: en diez preguntas sobre la misma cuenta, aparece una vez.
  | { tipo: "estado"; estado: EstadoLab; antes: EstadoLab }
);

// Lo que el asistente SABE de la conversación, aparte de lo que se DIJO: hoy,
// la cuenta de la que se viene hablando. Vive en el backend con la
// conversación; acá solo se muestra. Qué claves acepta lo declara el backend.
export type EstadoLab = Record<string, string>;

// La conversación, con su costo hasta ahora. El `id` nace en el backend en la
// primera pregunta y acá se devuelve en las siguientes: es lo ÚNICO que viaja
// con la pregunta. Los números salen de `ia.llamadas` agrupado por ese id
// (backend: `asistente/panel.conversacion`): el front no suma nada. `usd` es
// null si a algún modelo de la charla le falta la tarifa — no es cero.
export type SesionLab = {
  id: string;
  error?: string;
  llamadas?: number;
  tokens_in?: number;
  tokens_out?: number;
  cache_pct?: number | null;
  usd?: number | null;
  sin_precio?: string[];
};

// ⚠️⚠️ **LA TABLA LA DECLARA LA HERRAMIENTA, NO LA ELIGE EL MODELO.**
//
// Hubo una versión donde el modelo nombraba qué campos dibujar; con tres
// disponibles nombró los tres y contestó «¿cuánto tengo?» con tres tablas del
// mismo total. Acá no hay elección: el resultado de la herramienta trae `_tabla`
// diciendo QUÉ campo suyo es una tabla y con qué columnas, y la pantalla la
// dibuja. Una herramienta nueva declara la suya y este archivo no cambia.
//
// El modelo NO recibe esta clave (el backend saca todo lo que empieza con `_`),
// así que no re-tipea un solo número: la tabla se dibuja leyendo el MISMO objeto
// que él leyó.
export type TablaDeclarada = {
  // Qué campo del resultado es la lista de filas.
  campo: string;
  // De QUÉ es esta tabla («Tenencia de la 805», «Próximos pagos del YM38O»).
  // Lo declara la herramienta: en un turno pueden salir dos tablas pegadas y
  // sin esto no se sabe cuál es de cuál.
  titulo?: string;
  // Qué columnas, en este orden. Salen del backend: una lista acá sería una
  // copia que queda vieja el día que la herramienta devuelva un campo más.
  columnas: string[];
  // Qué campo del resultado es el total que va abajo. El front NO suma.
  total?: string;
  moneda?: string;
};

export const ICONO_EVENTO: Record<EventoLab["tipo"], string> = {
  pregunta: "💬", vuelta: "↻", pide: "🔧", resultado: "📄",
  texto: "✅", corte: "⛔", estado: "📌", achicado: "🗜", podado: "✂️",
  ruteo: "🧭", junta: "🔗",
};

// El veredicto del control determinístico (`asistente/control.py`). Viaja AL
// LADO de la respuesta, no en vez de ella: avisa, no bloquea. Bloquear con una
// falsa alarma te deja sin una respuesta que estaba bien.
export type Control = {
  ok: boolean;
  hallazgos: {
    control: string;
    que_paso: string;
    detalle: string[];
    cuantos: number;
    // Qué significa y qué hacer los escribe el backend por tipo de hallazgo.
    // Antes la pantalla pegaba una frase fija («o los calculó él, o los
    // inventó») debajo de CUALQUIER aviso, aunque fuera de evidencia.
    significa?: string;
    que_hacer?: string;
  }[];
  // Las citas `[E:ref:campo]` que escribió el modelo. `respuesta` ya viene sin
  // ellas: son para auditar, no para leer. Se ven en el ciclo.
  citas?: { ref: string; campo: string }[];
};

export type RespuestaLab = {
  run_id?: string;
  respuesta: string | null;
  control?: Control;
  // ⚠️ `error` viaja aparte de `respuesta`: «no contestó» y «contestó vacío»
  // no se pueden dibujar iguales.
  error: string | null;
  vueltas: number;
  tokens_in: number;
  tokens_out: number;
  eventos: EventoLab[];
  // Qué agentes atendieron la pregunta.
  agentes?: string[];
  // Lo que quedó en foco después de esta pregunta. Se muestra, no se devuelve:
  // la memoria vive en `ia.conversaciones`.
  estado?: EstadoLab;
  // La conversación y su costo acumulado.
  sesion?: SesionLab;
  // El título de la conversación (la primera pregunta) y si quedó guardada.
  // `aviso` viene cuando la base no contestó y la pregunta salió sin memoria.
  titulo?: string;
  guardada?: boolean;
  aviso?: string | null;

  // Qué NO pudo contestar, dicho por el modelo (backend: `asistente/esquema.py`).
  // Vale tanto como la respuesta: es la única forma de enterarse de que la
  // pregunta tenía dos partes y sólo una tenía herramienta. Llega vacío cuando
  // el proveedor no soporta structured output (DeepSeek contesta HTTP 400 a
  // `json_schema`, medido) y la respuesta viene como prosa.
  falta?: string | null;
};

export type RunLab = {
  run_id: string;
  sesion: string;
  estado: "queued" | "running" | "waiting_approval" | "succeeded" | "failed"
    | "cancel_requested" | "cancelled" | "timed_out";
  resultado?: RespuestaLab | null;
  error?: string | null;
};

export type MetricasRuns = {
  dias: number;
  resumen: {
    total: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    timed_out: number;
    atascadas: number;
    control_fallido: number;
    p95_ms: number;
  };
};

// ── LAS CONVERSACIONES GUARDADAS (backend: `asistente/sesiones.py`) ────────
//
// Una conversación es del usuario que la empezó: la lista, la reapertura y el
// borrado los filtra el backend por email. El front no guarda nada: pide la
// lista, abre una por id y manda cada pregunta con ese id.

export type ConversacionResumen = {
  sesion: string;
  titulo: string;
  preguntas: number;
  creada_at: string;
  actualizada_at: string;
  // in + out de todas sus llamadas, sumado en el backend.
  tokens: number;
};

// Una tabla como la guardó el backend con el turno: columnas, filas y total
// salen del resultado de la herramienta (`_tabla`), igual que en vivo.
export type TablaGuardada = {
  // De qué es la tabla: lo arma el backend (`pantalla.para_dibujar`) con el
  // mismo criterio que la tabla en vivo, para que una conversación reabierta
  // se vea igual.
  titulo?: string;
  columnas: string[];
  filas: Record<string, unknown>[];
  cuantas: number;
  total: unknown;
  moneda?: string | null;
};

// Un turno como quedó guardado: lo que ve la persona, entero (el backend poda
// la memoria del modelo, no esto). Trae las tablas que declararon las
// herramientas; no trae el ciclo: los eventos se ven en el momento.
export type TurnoGuardado = {
  pregunta: string;
  respuesta: string | null;
  falta: string | null;
  error: string | null;
  agentes: string[];
  tablas?: TablaGuardada[];
  at: string;
};

export type ConversacionLab = {
  sesion: string;
  titulo: string;
  turnos: TurnoGuardado[];
  estado: EstadoLab;
  costo: SesionLab;
  aviso?: string | null;
};

// ── EL PANEL DEL LAB: qué gastamos y con qué modelo corremos ───────────────
//
// Sale de `asistente/panel.py`. Dos cosas que no son el chat: el libro de
// llamadas al modelo (`ia.llamadas`, que existía hace meses y no miraba nadie)
// y qué modelo cumple cada rol, que se elige acá y se guarda sin deploy.

export type GastoTarea = {
  tarea: string;
  modelo: string;
  llamadas: number;
  fallidas: number;
  tokens_in: number;
  tokens_out: number;
  cache_hit: number;
  cache_miss: number;
  // null = ese modelo no tiene tarifa cargada. NO es "no gastó".
  usd: number | null;
  ultima: string | null;
};

export type Gasto = {
  error?: string;
  dias: number;
  total: {
    llamadas: number; tokens_in: number; tokens_out: number;
    cache_hit: number; cache_miss: number; usd: number | null;
  };
  hoy: { llamadas: number; tokens: number };
  // De todo lo que ENTRÓ, qué % salió del caché del proveedor. El caché cuesta
  // una fracción, así que subir este número es la palanca más barata que hay.
  cache_pct: number | null;
  por_tarea: GastoTarea[];
  // Los modelos a los que les falta la tarifa. Sin esta lista, un `usd: null`
  // se lee como "no gastó".
  sin_precio: string[];
  // Todos los modelos que aparecieron en el libro, con su tarifa si la tiene.
  // Se listan también los que NO la tienen: son justamente los que hay que
  // cargar.
  tarifas: TarifaLab[];
};

// ⚠️ TRES precios, no dos — en USD por millón de tokens. El del caché es el que
// más cambia el número: la entrada que pega en el caché del proveedor cuesta
// una fracción (en gpt-5.6-luna, diez veces menos). Cobrar todo a precio de
// entrada infla la factura justo en la parte que venimos optimizando.
export type TarifaLab = {
  modelo: string;
  entrada: number | null;
  cache: number | null;
  salida: number | null;
};

export type ProveedorLab = {
  proveedor: string;
  configurado: boolean;
  // ¿se puede elegir? Lo decide el backend leyendo UNA constante
  // (`config.IA_PERMITE_PROVEEDOR_QUE_ENTRENA`): la pantalla no tiene criterio
  // propio, porque dos reglas para lo mismo terminan en una pantalla que deja
  // elegir algo que el gateway después rechaza.
  usable: boolean;
  // Qué implica elegirlo, cuando implica algo. No es lo mismo que `usable`:
  // un proveedor que entrena con lo que se le manda HOY se puede elegir, y
  // aun así hay que decir qué significa. Un permiso que no se explica se
  // vuelve un default que nadie recuerda haber decidido.
  aviso: string | null;
  modelos: string[];
};

// ⚠️ UNA FILA DE LA PANTALLA ES UNA TAREA: una cosa que corre. Antes era
// `proveedor × rol` —una abstracción interna— y el resultado fue un desplegable
// que no hacía nada: se configuraba «deepseek · pro» y el asistente seguía
// andando con openai, porque a esa tarea nunca le tocaba esa combinación.
export type TareaLab = {
  tarea: string;
  // Qué es, en criollo. Sale de `core/ai.py::_TAREAS`, no de una tabla de
  // nombres acá — una copia en el front queda vieja sin que nada falle.
  para_que: string;
  // Con qué corre HOY. Lo resuelve el backend aplicando su precedencia
  // (elegido > declarado > default): acá no se recalcula nada.
  proveedor: string;
  modelo: string;
  // ¿Viene de una elección en esta pantalla, o del default del código? Sin
  // esto, «lo configuré» y «viene así de fábrica» se ven igual.
  elegido: boolean;
  declarado: { proveedor: string; tier: string };
  // Si la tarea ofrece herramientas, el modelo que se elija tiene que saber
  // pedirlas — el backend lo prueba antes de guardar.
  usa_herramientas: boolean;
  datos_negocio: boolean;
};

export type PanelLab = {
  gasto: Gasto;
  tareas: TareaLab[];
  proveedores: ProveedorLab[];
};
