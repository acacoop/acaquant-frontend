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
  // ¿El laboratorio sabe investigar esta habilidad? Lo decide el backend.
  investigable?: boolean;
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

// ── EL LAB (el INVESTIGADOR) ───────────────────────────────────────────────
//
// El agente detecta y frena: la mayoría de sus habilidades son avisos sin botón.
// El investigador averigua POR QUÉ y propone qué hacer.
//
// ⚠️ **No se pide y se espera: se pide y se pregunta.** Una investigación son
// uno o dos minutos y el proxy corta a los 30 s — ese corte se ve idéntico a
// un backend caído. Por eso hay un PEDIDO con estado, y los pasos van
// apareciendo mientras corre.

export type PasoClase =
  | "pide" | "trajo" | "repetido" | "freno" | "corte" | "antecedentes" | "error";

export type Paso = { clase: PasoClase; que: string; detalle: string };

export type EstadoPedido = "pendiente" | "corriendo" | "listo" | "error";

export type Pedido = {
  id: number;
  at: string;
  tipo: string;
  caso: string;
  por: string;
  estado: EstadoPedido;
  arrancado_at: string | null;
  terminado_at: string | null;
  pasos: Paso[];
  investigacion_id: number | null;
  error: string;
  // El veredicto, cuando ya terminó. Viene del JOIN con el diario.
  //
  // ⚠️ Los campos que ENUMERAN son listas, no texto. El modelo está obligado
  // por el esquema: un párrafo de ochenta palabras no se lee, y el arreglo va
  // en el lugar donde se decide qué devolver, no en el que dibuja.
  titulo?: string | null;
  de_quien_es?: "nuestro" | "dato" | "proveedor" | "no_se" | null;
  que_paso?: string[] | null;
  por_que?: string[] | null;
  que_haria?: string[] | null;
  lo_que_no_se?: string[] | null;
  de_donde?: string[] | null;
};

// Un caso que se PUEDE investigar ahora mismo. Sale de los hallazgos y las
// reincidencias abiertas del agente — no es una lista de ejemplos.
export type CasoInvestigable = {
  // De QUÉ vista salió — la misma que dibuja cada tab del modal, así que el
  // desplegable no puede ofrecer algo que la pantalla no muestre.
  origen: "reincidencia" | "encontro" | "ahora";
  sujeto: string;
  habilidad: string;
  regla: string;
  cuando: string;
  que: string;
  tipo: string;
};

export type TipoInvestigacion = {
  nombre: string;
  que_es: string;
  // Lo que hay que haber mirado antes de poder concluir. Se muestra porque es
  // lo que distingue «se le ocurrió mirar eso» de «tuvo que mirarlo».
  piso: string[];
};

export type Lab = {
  ok: boolean;
  // ⚠️ `error` viaja aparte de la lista: una lista vacía y una lectura fallida
  // NO se pueden dibujar iguales.
  error: string;
  pedidos: Pedido[];
  // Lo que se puede investigar AHORA. Reemplaza al campo de texto libre donde
  // había que adivinar qué escribir.
  casos: CasoInvestigable[];
  casos_error: string;
  tipos: TipoInvestigacion[];
};

// El ícono de cada paso. La CLASE la decide el backend (`servicio.pasos_de`),
// que es la misma que alimenta la terminal: acá sólo se elige el dibujo.
export const ICONO_PASO: Record<PasoClase, string> = {
  pide: "🔧", trajo: "📄", repetido: "♻", freno: "⛔",
  corte: "⏳", antecedentes: "📚", error: "⚠",
};
