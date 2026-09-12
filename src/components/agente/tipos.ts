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
  // ⚠️ **EL PISO Y LO DEL MODELO SON DOS CAMPOS, NO UNO.**
  // `que_hacer` es el texto determinista que escribe el detector; `ia_texto`
  // es el que redactó el modelo con la evidencia adelante (backend:
  // `agente/redactar.py`). Vienen separados a propósito: si el gateway no
  // contesta, si no hay presupuesto o si la validación del backend rechazó lo
  // que escribió, `ia_texto` llega vacío y la fila muestra el piso — nunca
  // queda muda. El front NO elige cuál es mejor ni deriva nada: dibuja el del
  // modelo si vino, y el piso queda en el `title` para poder comparar.
  ia_texto?: string | null;
  ia_at?: string | null;
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
  tiene_traceback?: boolean;
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

// «Explicámelo» (AGENT.md §0.dh): lo que contesta POST /api/agente/explicar.
export type Explicacion = {
  ok: boolean;
  error?: string;
  cacheada?: boolean;
  respuesta?: {
    de_quien: "nuestro" | "dato" | "proveedor" | "no_se";
    explicacion: string;
    afecta?: string;
    que_hacer?: string;
    test?: string;
    tarea?: { titulo?: string; prompt?: string };
  };
  fuentes?: string[];
  modelo?: string;
  por?: string;
  at?: string | null;
};

// ── EL LAB (el ASISTENTE conversacional) ──────────────────────────────────
//
// Una pregunta en castellano → el backend corre el ciclo (`asistente/ciclo.py`:
// el modelo pide herramientas, el backend las ejecuta, y así hasta que
// contesta) → vuelve la respuesta MÁS todo lo que pasó por el camino.
//
// ⚠️ **UN request y se espera**: está medido en 4,5 s con una herramienta, y el
// techo de vueltas del backend deja el peor caso por debajo de los 30 s del
// proxy. Por eso acá no hay pedido con estado ni poll — hay un `await`.

// Cada paso del ciclo, tal cual lo va contando el backend. El `tipo` lo decide
// `ciclo.py`; acá sólo se elige cómo se dibuja.
export type EventoLab =
  | { tipo: "pregunta"; texto: string; herramientas: string[] }
  | { tipo: "vuelta"; n: number }
  | { tipo: "pide"; herramienta: string; argumentos: Record<string, unknown> }
  | { tipo: "resultado"; herramienta: string; resultado: unknown }
  | { tipo: "texto"; texto: string }
  | { tipo: "corte"; motivo: string };

export const ICONO_EVENTO: Record<EventoLab["tipo"], string> = {
  pregunta: "💬", vuelta: "↻", pide: "🔧", resultado: "📄",
  texto: "✅", corte: "⛔",
};

export type RespuestaLab = {
  respuesta: string | null;
  // ⚠️ `error` viaja aparte de `respuesta`: «no contestó» y «contestó vacío»
  // no se pueden dibujar iguales.
  error: string | null;
  vueltas: number;
  tokens_in: number;
  tokens_out: number;
  eventos: EventoLab[];
  // Los mensajes de esta pregunta y las anteriores. Se devuelven tal cual en la
  // pregunta siguiente: el modelo no recuerda nada, la conversación la sostiene
  // la pantalla.
  mensajes: Record<string, unknown>[];
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
};

export type ProveedorLab = {
  proveedor: string;
  configurado: boolean;
  // false = puede entrenar con lo que se le manda → no puede ver datos del
  // negocio. Se muestra igual, deshabilitado y con el motivo: si desapareciera,
  // dentro de seis meses alguien lo "arregla" sin saber qué rompe.
  usable: boolean;
  motivo: string | null;
  modelos: string[];
  roles: Record<string, { elegido: string | null; default: string }>;
};

export type PanelLab = {
  gasto: Gasto;
  proveedores: ProveedorLab[];
  // Con qué corre HOY el asistente. Lo resuelve el backend aplicando su propia
  // precedencia (elección > env > default) — acá no se recalcula nada.
  asistente: { tarea: string; proveedor: string; modelo: string };
};
