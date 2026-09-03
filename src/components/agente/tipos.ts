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
  evidencia: Record<string, unknown>;
  detectado_at: string;
  visto_ultima_vez?: string;
  veces: number;
  estado?: string;
  dominio: string | null;
  accionable?: boolean;
  // ¿El laboratorio sabe investigar esta habilidad? Lo decide el backend.
  investigable?: boolean;
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
  reincidencias: { total: number; filas: Reincidencia[] };
  habilidades: Habilidad[];
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
// El agente detecta y frena: 16 de sus 24 habilidades son avisos sin botón.
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
