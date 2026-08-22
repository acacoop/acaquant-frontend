// Tipos, mapas de labels y helpers PUROS del AV Agent — sin React y sin red.
// El contrato de la vista vive UNA vez acá; las tabs lo importan.


export type Modo = "alta" | "flujos" | "arreglo" | "salud" | "sin_precio" | "espejo" | "pata"
  | "apuntar";
// Devuelve una PROMESA, no `void`. Con `void` el `await` del lote no esperaba
// nada y las 10 aplicaciones salían todas juntas: se pisan entre sí escribiendo
// en `mercado.curvas` y el error de una se pierde entre las otras nueve. El tipo
// es lo único que hace que el compilador sostenga esa garantía.
// Devuelve el RESULTADO, no `void`. Dos motivos y los dos se pagaron: con
// `void` el `await` del lote no esperaba nada (las 10 aplicaciones salían
// juntas y se pisaban escribiendo en `mercado.curvas`), y el resumen «8 de 10»
// no se puede armar leyendo `sims` dentro del loop — el estado de React se
// actualiza asincrónico y ahí adentro todavía tiene el valor viejo.
export type ResSim = Record<string, unknown> & { ok?: boolean; aplicado?: boolean };
export type Simular = (ticker: string, curva1816: string, aplicar?: boolean,
                extra?: Record<string, unknown>, modo?: Modo) => Promise<ResSim>;

export type Hallazgo = {
  // QUÉ puede hacer el agente con este hallazgo. **Lo decide el backend** —
  // el front tenía la condición escrita a mano y comparaba contra la REGLA
  // (`flujos_vacios`) creyendo que era el TIPO (`sin_flujo`): el botón no
  // aparecía, sin error y sin nada que mirar.
  accion?: Modo | null;
  // NUESTRO o DEL MERCADO. **Lo declara el backend** (`av_agent.DE_QUIEN`), por
  // el mismo motivo que `accion`: el que sabe si algo tiene arreglo es el que
  // sabe resolverlo. Si el front lo dedujera de la regla, tendría una segunda
  // idea de qué es iliquidez y AHORA y ENCONTRÓ se contradirían.
  de_quien?: string | null;
  // Dónde se anota el voto del eval set. **Lo decide el backend**, igual que
  // `accion` y `de_quien`.
  dominio_eval?: string | null;
  // CUÁNTO ACIERTA esta causa, medido. `null` = no se pudo medir, que es
  // DISTINTO de 0 votos (eso sí es un dato: nadie juzgó nunca esta regla).
  confianza?: { humanos: number; aciertos: number; votos: number;
                precision: number | null; suficiente: boolean;
                // CAUSA PROBADA: el agente ya demostró que la entiende (mismo
                // umbral que abre la compuerta de autonomía). Deja de pedir el
                // voto — no por caso, que eso ya lo hace `ya_votado`, sino por
                // CAUSA: con `pata_equivocada` en 17/17, un BOPREAL nuevo pedía
                // el voto 18 y eso no agrega ninguna evidencia.
                probada?: boolean } | null;
  // ¿YA SE VOTÓ este par (caso, causa)? Lo manda el backend leyendo el eval
  // set. Sin esto los botones ¿ACERTÓ? reaparecen en cada rueda sobre lo
  // mismo — los BOPREALes llegaron a 17/17 y el user tuvo que verlos de nuevo.
  ya_votado?: boolean;
  voto?: boolean;
  // ¿YA LO ATENDÍ? `"aplicado"` (apreté el arreglo) · `"votado"` (no hay botón,
  // así que votar era lo único que se podía hacer) · `""` = pendiente.
  // **Votar NO cuenta como hecho cuando hay un botón sin apretar**: el voto
  // juzga al agente, no arregla el dato — mezclarlos escondería un bono roto.
  // Lo decide el backend por el mismo motivo que `accion`.
  atendido?: string | null;
  // ── LA MEMORIA DEL HALLAZGO (backend §0.bd) ────────────────────────────
  // Hasta hoy TODO se veía «de hoy»: la foto se reescribe en cada corrida, así
  // que un problema de hace dos semanas y uno de recién eran idénticos en
  // pantalla. Con identidad estable el objeto acumula historia.
  dias_abierto?: number | null;   // desde cuándo, de verdad
  veces?: number | null;          // cuántas corridas lleva sin resolverse
  // ── CUÁNTOS CASOS TIENE ESTE CHEQUEO, AHORA ────────────────────────────
  // Solo para las filas de SALUD. `n_casos` lo REESCRIBE el backend en cada
  // lectura contra `salud.evaluar()`; `n_casos_foto` es lo que decía la foto
  // de anoche, y viene SOLO si cambió.
  //
  // ⚠️ Por qué importa: un control con 8 casos del que se arreglan 5 SIGUE
  // rojo, así que la fila se queda — y hasta hoy se quedaba con el texto
  // congelado en «8». El user arregló cosas de verdad tres veces seguidas y
  // la pantalla mostró el mismo número, dígito por dígito. Sin el delta no
  // hay ninguna forma de ver el avance parcial, que es cómo avanza casi todo.
  n_casos?: number | null;
  n_casos_foto?: number | null;
  // ⚠️ Se arregló y REAPARECIÓ. Es la señal más fuerte que hay —dice que el
  // arreglo no sirvió— y por eso se marca aparte de la antigüedad: contarlo
  // como «uno viejo más» la borra.
  volvio?: boolean;
  // ⚠️ **QUÉ SE LE PUEDE PREGUNTAR A ESTA FILA.** `juicio` = el agente dedujo
  // una causa y puede errarle → ¿ACERTÓ?. `observacion` = copió un hecho (un
  // ERROR del log del motor, un 500 del proveedor) → «¿acertó?» no tiene
  // respuesta posible: la respuesta es siempre que sí. Lo decide el backend.
  pregunta?: string | null;
  tipo: string; ticker: string; regla: string; severidad: string;
  motivo: string; evidencia: Record<string, unknown> | null;
  // Lo marcaste «✖ es ruido». Hasta 2026-08-21 ese voto se guardaba y no lo
  // leía nadie: la fila quedaba exactamente donde estaba, que es la peor
  // versión posible de un botón porque parece que hizo algo.
  es_ruido?: boolean;
  // EL NOMBRE PARA LA PANTALLA. Para un bono es el ticker; para un chequeo es
  // su título humano («Patas en dólares que nadie pide»), que ya venía en la
  // evidencia y no lo leía nadie. Lo resuelve el BACKEND para que las dos
  // pantallas que muestran hallazgos digan lo mismo.
  nombre?: string;
  // DESDE CUÁNDO, en ISO. `dias_abierto` sirve para ordenar y para el color,
  // pero no ubica el hecho: «4d» no dice si empezó el lunes a la mañana o el
  // jueves a la noche. La pantalla lo escribe en hora argentina.
  abierto_at?: string | null;
};
export type Pregunta = {
  id: number; clave: string; tipo: string; pregunta: string; opciones: string[];
  contexto: Record<string, unknown> | null;
};
export type Mensaje = {
  id: number; para: string; tema: string; asunto: string;
  creado_at: string | null; resuelto: boolean; resuelto_at: string | null;
  vence_at: string | null; filas: number; hechas: number;
};
export type Decidida = {
  id: number; clave: string; tipo: string; pregunta: string;
  respuesta: string | null; nota: string | null; respondida_por: string | null;
  respondida_at: string | null; aplicada_at: string | null;
};
export type Ignorado = { ticker: string; motivo: string; por: string | null; creado_at: string | null };
export type Accion = {
  id: number; ts: string | null; accion: string; destino: string; objetivo: string;
  detalle: Record<string, unknown> | null; antes: Record<string, unknown> | null;
  origen: string; pregunta_id: number | null; por: string | null;
  ok: boolean; error: string | null;
};
export type Pendiente = {
  id: number; clave: string; ticker: string; respuesta: string | null;
  nota: string | null; respondida_por: string | null; respondida_at: string | null;
};
// Un AVISO es trabajo MANUAL pendiente: el agente hizo todo salvo un dato que
// solo puede poner una persona. No es un error — es la parte que ninguna fuente
// tiene. Se DERIVA en el backend, así que desaparece solo al cargar el dato.
export type Aviso = {
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
export type Vista = {
  corrida_at: string | null;
  avisos: Aviso[];
  hallazgos: Hallazgo[];
  por_tipo: Record<string, number>;
  por_regla: Record<string, number>;
  preguntas: Pregunta[];
  decisiones: Pregunta[];
  decididas: Decidida[];
  // Lo que el agente MANDÓ a alguien. Va aparte de `avisos` porque son dos cosas
  // distintas que compartían tabla: un aviso de bono se COMPLETA acá; un mensaje
  // se mandó y lo resuelve otra persona en SU pantalla.
  mensajes?: Mensaje[];
  ignorados: Ignorado[];
  pendientes: Pendiente[];
  acciones: Accion[];
  capacidades: { puede_ignorar: boolean; puede_dar_de_alta: boolean; motivo_alta: string };
  // LOS ARREGLOS CON EL RELOJ CORRIENDO (backend §0.bi). Lo único que el agente
  // sabe de sí mismo SIN que se lo diga nadie: de lo que dio por resuelto,
  // cuánto aguantó. Un ✔ tuyo es una opinión; que algo no haya vuelto en 30
  // días no lo es.
  seguimiento?: {
    en_prueba: number; aguantaron: number;
    proximos: { clave: string; sujeto: string; regla: string; titulo: string;
                dias: number; hitos: number; de: number; confianza: number;
                proximo_hito_en_dias: number | null; aguanto: boolean }[];
  };
  // DE TODO LO ABIERTO, QUÉ PIDE ALGO HOY (backend §0.bm). La historia se
  // guardaba desde hace días y esta pantalla seguía ordenando por severidad —
  // o sea igual que ANTES de tener memoria.
  que_importa?: {
    abiertos: number; piden_algo: number;
    por_banda: Record<string, number>;
    filas: { clave: string; sujeto: string; regla: string; titulo: string;
             severidad: string; veces: number; dias_abierto: number;
             banda: string }[];
    // Abierto, pero el detector volvió a correr y NO lo re-evaluó. No es lo
    // mismo que «sigue roto» y hasta acá se veían idénticos.
    sin_mirar: { clave: string; sujeto: string; regla: string; origen: string;
                 horas_sin_reevaluar: number }[];
  };
  // Cuántas de la lista ya pasaron por tus manos y cuántas descartaste. Van
  // SIEMPRE, aunque estén escondidas: un filtro que oculta sin decir cuánto
  // oculta es lo mismo que truncar en silencio.
  atendidos?: number;
  es_ruido?: number;
};

// EL TABLERO. Las fuentes usan el MISMO vocabulario de estados que el pre-flight
// (`ok` / `revisar` / `bloquea`) — no es reuso por pereza: que una fuente
// degradada y un paso de la cadena se pinten igual es lo que deja mirar toda la
// pantalla con una sola convención en la cabeza.
export type Fuente = {
  clave: string; titulo: string; estado: string; detalle: string; para: string;
};
// EL DIAGNÓSTICO MASIVO. `informe` llega PARCIAL mientras corre — se puede
// mirar sin esperar el final, que es lo que deja abortar una corrida que ya se
// ve mal.
export type FilaInforme = {
  sujeto: string; tipo?: string; regla?: string; estado: string;
  // QUÉ PUERTA abrir. Sin esto el informe era de solo lectura y había que
  // volver a buscar el bono en la lista para aplicarle lo que el informe ya
  // había dicho que estaba listo — o sea, el informe hacía el trabajo y
  // después te lo hacía repetir.
  accion?: Modo | null;
  causa?: string; veredicto?: string; detalle?: string;
  trabas?: { paso: string; estado: string; detalle: string }[];
};
export type RunMasivo = {
  ok: boolean; id: number; estado: string; total: number; hechos: number;
  sin_red: boolean; creditos: number | null; error: string | null;
  informe: FilaInforme[];
  resumen: { por_estado: Record<string, number>; por_causa: Record<string, number>;
             segundos: number };
  texto: string;
};

// EL CENTINELA. `vivo` sale de la EDAD del último latido, no de que alguna vez
// haya corrido: un círculo verde que no puede apagarse solo no informa nada.
export type Vigilado = {
  clave: string; tipo: string; sujeto: string; regla: string; severidad: string;
  motivo: string; abierto_at: string; ultimo_at: string; veces: number;
  visto_at: string | null; resuelto_at: string | null; resuelto_como: string | null;
  de_quien?: string | null;
  // ¿Apareció RECIÉN? Lo decide el backend (dos horas). «Sin ver» y «recién
  // aparecido» no son lo mismo: llamar NUEVO a algo de hace 10 h quema el
  // rótulo para todos los demás.
  recien?: boolean;
  // La antigüedad CANÓNICA, la del objeto — la misma que ve ENCONTRÓ. Sale del
  // backend por la misma razón que `recien`: el criterio tiene que ser uno solo.
  dias_abierto?: number | null;
  vuelto_at?: string | null;
  /** El nombre LEGIBLE — `control:patas_equivocadas` → `patas equivocadas`. Lo
   *  deriva el backend, igual que en ENCONTRÓ: dos pantallas que muestran el
   *  mismo hallazgo tienen que llamarlo igual. */
  nombre?: string;
  /** El texto LARGO del hallazgo (`evidencia.texto`): qué pasó · a qué afecta ·
   *  si sigue. Los motores lo traen desde siempre y la pantalla mostraba solo
   *  el título recortado — el user: *«sin información, sin contexto… si tenemos
   *  los logs tenemos los datos»*. Los datos estaban; no se dibujaban. */
  detalle?: string;
  /** La línea de log cruda. Es la evidencia, y va detrás de un click. */
  muestra?: string;
};

// LO QUE PASÓ HOY. El corte por día (en hora ARGENTINA) lo hace el backend:
// el navegador no puede mirar el reloj mientras dibuja, y el criterio tiene
// que ser uno solo.
export type LoDeHoy = {
  desde: string;
  /** LO QUE ESTÁ ROTO AHORA, sea o no novedad del día. Motores y proveedores:
   *  con el corte por día, un motor roto hace tres días NO entraba — cuanto más
   *  tiempo llevaba roto, menos visible era. Los tipos los declara el backend
   *  (`av_agent.EN_AHORA_SIEMPRE`). */
  roto?: Vigilado[];
  aparecio: Vigilado[];
  volvio: Vigilado[];
  se_arreglo: Vigilado[];
  novedades: number;
};
// Un chequeo que se ROMPIÓ y este admin todavía no vio. Viene de SALUD, que
// sigue siendo el dueño de la evaluación — el agente solo es la puerta.
// (`Pendiente`, a secas, ya es el hallazgo pendiente del centinela.)
export type SaludRoto = {
  id: number; chequeo_id: string; familia: string | null; titulo: string | null;
  de: string | null; a: string; motivo: string | null; evidencia: string | null;
  at: string | null;
};

export type Centinela = {
  ok: boolean; vivo: boolean; sin_ver: number;
  latido: { at: string; hace_s: number; ciclo: number; en_rueda: boolean;
            abiertos: number; nuevos: number; duracion_ms: number | null;
            error: string | null;
            // El ritmo que el propio latido declara, y cuánto falta para que el
            // círculo se apague. Con el umbral fijo, fuera de rueda el daemon
            // latía cada 300s y lo dábamos por muerto a los 90.
            cadencia_s: number; muere_en_s: number } | null;
  abiertos: Vigilado[]; resueltos: Vigilado[];
  hoy?: LoDeHoy;
};

export type Control = {
  parada: { parada: boolean; motivo: string; por: string; cambiado_at: string | null };
  fuentes: Fuente[];
  resumen: { bloquea: number; revisar: number; ok: number };
};

export const TIPO_LABEL: Record<string, string> = {
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
  // EL SISTEMA, no el mercado (2026-08-19). Los cinco entraban con el tipo
  // crudo de encabezado (`PERMISO_FLOJO`) y sin chip en la fila de filtros:
  // el hallazgo llegaba a la pantalla y aun así no se podía filtrar ni leer.
  motor_caido: "Motores, jobs y APIs caídos DENTRO de su ventana",
  tabla_quieta: "Tablas que dejaron de escribir cuando deberían",
  latencia: "Endpoints más lentos que su propia normalidad",
  db_cambio: "La base cambió: tablas nuevas, que crecieron o que ya no están",
  permiso_flojo: "Permisos que están en los papeles y el borde no aplica",
};

// Los hallazgos del SISTEMA no tienen por sujeto un ticker de 4 letras sino un
// path (`/api/portfolio/aum`), una tabla (`mercado.market_snapshot`) o un motor.
// En la columna de 72px entra «/api/po» y las filas quedan indistinguibles — el
// mismo problema que ya había tenido SALUD, y la misma solución.
export const SUJETO_LARGO = new Set(["salud", "motor_caido", "tabla_quieta", "latencia",
                              "db_cambio", "permiso_flojo"]);

// El label del CHIP. Los de `TIPO_LABEL` son frases ("Están en 1816 y no en tu
// base") — buenas como encabezado de sección, imposibles en una fila de filtros.
// Son dos textos porque cumplen dos funciones: el chip identifica, el encabezado
// explica. El chip lleva el largo en `title`, así no se pierde nada.
export const TIPO_CHIP: Record<string, string> = {
  sin_precio: "● SIN PRECIO",
  precio_moneda: "● MONEDA",
  salud: "SALUD",
  hueco_de_curva: "HUECOS",
  falta_en_base: "FALTAN",
  sin_flujo: "SIN FLUJO",
  tasa_sospechosa: "TASAS",
  motor_caido: "MOTORES",
  tabla_quieta: "TABLAS",
  latencia: "LENTOS",
  db_cambio: "BASE",
  permiso_flojo: "PERMISOS",
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
// Y el SISTEMA va arriba de los datos por el mismo criterio de «aguas arriba»:
// un motor caído o un permiso abierto explica —o vuelve secundario— cualquier
// bono mal cargado de más abajo.
export const ORDEN_TIPO = ["sin_precio", "precio_moneda", "salud", "permiso_flojo",
                    "motor_caido", "tabla_quieta", "latencia", "db_cambio",
                    "hueco_de_curva", "falta_en_base", "sin_flujo",
                    "tasa_sospechosa"];

export const SEV_TINT: Record<string, string> = {
  alta: "var(--t-neg)",
  media: "var(--t-tint-amber)",
  baja: "var(--t-text-dim)",
};

export function haceCuanto(iso: string | null): string {
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
export type Tab = "ahora" | "hallazgos" | "skills" | "agenda" | "historial" | "control";

// Una pregunta que el agente sabe contestar. Sale del backend, así que el día
// que se agregue una aparece sola: la pantalla no tiene su propia lista.
export type Sabe = { id: string; pregunta: string; necesita: string; de_donde: string };

// UNA habilidad del registro único. `usa_ia` tiene TRES valores y no es un
// booleano a propósito: `opcional` —la parte que resuelve es una función y el
// modelo solo agrega la frase— es la categoría más común acá y la que se suele
// contar mal para los dos lados.
export type Skill = {
  id: string; nombre: string; que_hace: string;
  tipo?: string; dominio?: string;
  usa_ia: "no" | "opcional" | "si"; para_que_la_ia: string;
  donde: string; fuente: string; extra?: Record<string, unknown> | null;
};
// LO QUE EL AGENTE HACE DURANTE EL DÍA (tab CONTROL). Todo DERIVADO en el
// backend (`api/services/av_agent_agenda.py`): catálogo de skills × crontab ×
// `manager.job_runs` × hallazgos abiertos. El front no calcula nada — si
// calculara, la pantalla y el backend podrían decir cosas distintas.
export type AgendaPieza = {
  nombre: string; que_hace: string; dominio?: string;
  usa_ia: "no" | "opcional" | "si";
};
export type AgendaFila = {
  job: string; cada: string;
  ultima: string | null; estado: string | null; resumen: string;
  hace_s: number | null;
  /** `null` = NO SE PUDO JUZGAR (sin schedule legible o sin ninguna corrida).
   *  Es distinto de `false`, y por eso no se pinta verde. */
  atrasado: boolean | null;
  piezas: AgendaPieza[];
  encontrados: number;
};
export type AgendaVista = {
  ok: boolean; filas: AgendaFila[];
  piezas: number; atrasados: number; sin_juzgar: number; al_dia: number;
  /** Habilidades que existen pero NO corren solas (explicar un cálculo, mandar
   *  un mensaje): se usan a pedido. Va declarado para que la diferencia con el
   *  total de SKILLS no se lea como que faltan. */
  a_pedido?: number;
};

export type SkillsVista = {
  total: number;
  por_tipo: Record<string, Skill[]>;
  por_dominio?: Record<string, Skill[]>;
  dominios?: string[];
  ia: { no: number; opcional: number; si: number };
  tareas_ia: string[];
};

// Un cron en castellano. **El horario NO se escribe acá**: viene del crontab real
// (`extra.cada`) y esto solo lo traduce — un horario copiado a mano en el front se
// desincroniza el día que se cambia el cron y nadie se entera.
// Ante cualquier forma que no reconozca, muestra el cron crudo: mentir sobre
// cuándo corre algo es peor que mostrar cinco caracteres feos.
export function cuandoCorre(cron: string): string {
  const partes = cron.split(" · ")[0]?.trim().split(/\s+/) ?? [];
  if (partes.length !== 5) return cron;
  const [min, hora, , , dow] = partes;
  const dias = dow === "1-5" ? " L-V" : dow === "*" ? "" : ` (${dow})`;
  if (min.startsWith("*/")) return `cada ${min.slice(2)} min${dias}`;
  if (min.includes("/")) return `cada ${min.split("/")[1]} min${dias}`;
  if (hora === "*") return `cada hora${dias}`;
  if (hora.includes(",") || hora.includes("-") || hora.includes("/"))
    return `varias veces por día${dias}`;
  // ⚠️ **EL CRON ES UTC, LA PANTALLA ES ART.** El user: *«basta de UTC y esas
  // cosas, horario argentino mostrar»*. Argentina es UTC−3 todo el año (no hay
  // horario de verano), así que la conversión es una resta y no puede errarle
  // por estación. Si cruza la medianoche el DÍA también se corre, y por eso el
  // rótulo de días deja de valer: se muestra el cron crudo antes que mentir.
  const h = Number(hora);
  if (!Number.isFinite(h)) return cron;
  const hAr = h - 3;
  if (hAr < 0) return `${String(hAr + 24).padStart(2, "0")}:${min.padStart(2, "0")} (día anterior)`;
  return `${String(hAr).padStart(2, "0")}:${min.padStart(2, "0")}${dias}`;
}

// Qué hizo cada acción, en castellano. El nombre técnico (`ignorar_ticker`) va
// igual en la fila: el libro tiene que servir para auditar, y para eso hace falta
// el nombre exacto que se busca en la base.
export const ACCION_LABEL: Record<string, string> = {
  ignorar_ticker: "Marcó como «no nos interesa»",
  designorar: "Deshizo un «no nos interesa»",
  crear_curva: "Creó la curva",
  alta_bono: "Dio de alta el bono",
  completar_flujo: "Completó el cuadro de flujos",
  sembrar_especies: "Sembró las patas del papel",
  sembrar_tasa_1816: "Cargó la tasa y el margen de 1816",
};

export function fechaHora(iso: string | null): string {
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

export const TITULO = "text-[10px] font-semibold tracking-widest text-[var(--t-accent)]";
export const SUB = "text-[10px] text-[var(--t-text-dim)]";

// ── TAB SKILLS: EL REGISTRO ÚNICO DE HABILIDADES ───────────────────────────
//
// **LA LEY** (user, 2026-08-19): *«necesito que se vaya centralizando todo: no
// solo esto, también lo que sabe resolver, lo que va entendiendo cuando
// encuentra algo… por ley y regla todo lo nuevo que se agregue de funcionalidad
// o habilidad tiene que quedar en esta tab, para que se vaya mapeando todo lo
// que va consolidando. Y dejar asentado si esa skill usa IA o no.»*
//
// La lista la DERIVA el backend de los registros reales (detectores, controles,
// explicadores, acciones): una skill nueva aparece por existir. Una lista de
// capacidades mantenida a mano se queda vieja la primera vez que alguien tiene
// apuro, y una desactualizada es peor que no tenerla — dice que el agente sabe
// algo que no sabe, o esconde algo que sí.
//
// **La jerarquía es por DOMINIO** (MERCADO, SISTEMA, SEGURIDAD, ADMINISTRACIÓN,
// DATOS) y el tipo —detecta / explica / resuelve— pasa a ser una etiqueta de la
// fila. El tipo dice CÓMO trabaja el agente; el dominio dice SOBRE QUÉ, que es
// la pregunta que uno se hace primero: agrupado por tipo, para saber qué sabe de
// seguridad había que leer las 37 filas.
export type EvalCausa = {
  dominio: string; causa: string; votos: number; aciertos: number;
  humanos: number; derivados: number;
  precision: number | null; suficiente: boolean; candidata_a_auto: boolean;
};
export type EvalResumen = {
  ok: boolean; total: number; aciertos: number; precision: number | null;
  min_votos: number; causas: EvalCausa[];
  fallos: { caso: string; causa_dicha: string; causa_correcta: string | null;
            nota: string | null; por: string | null }[];
};

// ── El PRE-FLIGHT: la cadena completa antes de escribir ────────────────────
//
// Se muestran TODOS los pasos, también los que están en verde. Mostrar solo lo
// que falla obliga a confiar en que el resto se chequeó, que es exactamente lo
// que este cuadro viene a reemplazar.

export type Paso = {
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
  /** Qué CLASE de renglón es: `prueba` decide (y puede trabar), `contexto`
   *  describe, `aprender` es material de estudio de OTROS casos, `veredicto` es
   *  la conclusión. Lo deriva el backend — el front no reclasifica. */
  capa?: string;
  /** Traba la escritura porque se probó que **está BIEN**, no porque esté mal.
   *  Es el mismo booleano con el significado opuesto y se dibujaba igual. */
  nada_que_hacer?: boolean;
  hacer?: { accion: string; titulo: string; campo: string; casos: number;
            pendientes: number;
            /** A quién YA se le avisó y todavía no lo cerró. Lo resuelve el
             *  backend leyendo la MISMA tabla que la campanita del
             *  destinatario, así la tarjeta no puede decir «avisale» con el
             *  mensaje ya en su bandeja. */
            avisado?: { para: string; creado_at: string | null }[];
            /** Cuántos avisos sobre esto ya se dieron por cerrados. */
            avisado_cerrado?: number } | null;
};

// Una propuesta esperando OK. `propuesto` puede venir VACÍO a propósito (el ping
// a una persona: a quién avisarle no lo puede adivinar el nombre del caso).
export type Propuesta = {
  id: number; accion: string; sujeto: string; campo: string;
  antes?: string | null; propuesto: string; porque: string;
  fuente: string; confianza?: number | null;
  extra?: { elige_destinatario?: boolean; n?: number } | null;
};

// El veredicto trae la DECISIÓN ya tomada, no los insumos para tomarla.
// `puede_aplicar` es para el humano; `puede_auto` es lo que va a leer la lane
// automática el día que exista — dos preguntas distintas y por eso dos campos.
export type Veredicto = {
  estado: string; texto: string;
  puede_aplicar?: boolean; puede_auto?: boolean;
  conteo?: { ok: number; info: number; revisar: number; bloquea: number; no_se: number;
             prueba?: number; contexto?: number; aprender?: number };
  /** LA OTRA PREGUNTA. `estado`/`texto` dicen si se puede APLICAR; esto dice
   *  QUÉ LE PASA al bono y en qué paso se trabó. Salen de los mismos pasos, así
   *  que no pueden contradecirse. */
  desenlace?: { clase: string; traba: string; titulo: string; que_hacer: string };
};

// Un insumo del cálculo: el número Y de dónde salió. El "de dónde" pesa tanto
// como el valor — cuando dos cuentas no coinciden, lo que hay que mirar es
// justamente el insumo que difiere.
export type Insumo = { campo: string; valor: unknown; fuente: string };

// LOS CINCO ESTADOS, y cada uno significa UNA cosa (rediseño 2026-08-17). El
// modelo viejo metía en el mismo ámbar «la paridad se contradice» y «el alta va
// a sembrar la especie» — una prueba de que el bono está mal y un aviso de
// rutina, con el mismo triángulo. Ahora `info` es GRIS y deliberadamente
// apagado: no es un aviso, es contexto, y no debe competir por la atención con
// lo que sí decide.
export const PASO_ICONO: Record<string, string> = {
  ok: "✔", bloquea: "✘", revisar: "▲", info: "○", no_se_puede_saber: "?",
};
export const PASO_COLOR: Record<string, string> = {
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
export type Respuesta = { ok?: boolean; error?: string; pendientes?: Propuesta[] };

// ── LA TAB CONTROL ──────────────────────────────────────────────────────────
//
// La primera pantalla del agente que no habla de un hallazgo sino de la
// HERRAMIENTA. Contesta tres preguntas que hasta acá no tenían dónde: ¿puedo
// frenarlo?, ¿de qué está leyendo?, ¿en qué estado está cada cosa.
//
// Diseñada para COMODIDAD, no para lucir: lo que se necesita en una emergencia
// va arriba y sin scroll, y cada fuente dice PARA QUÉ sirve — «1816 está sin
// token» no significa nada si uno no sabe que de ahí sale el cronograma.

export const FUENTE_ICONO: Record<string, string> = {
  ok: "✔", revisar: "▲", bloquea: "✘",
};
export const FUENTE_COLOR: Record<string, string> = {
  ok: "var(--t-pos)", revisar: "#f59e0b", bloquea: "var(--t-neg)",
};

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

export const EST_MASIVO: Record<string, { label: string; color: string }> = {
  // Los que EXPLOTARON primero y en rojo: son bugs del agente, no bonos mal
  // cargados, y son lo único de este informe que hay que arreglar en el código.
  error: { label: "explotaron", color: "var(--t-neg)" },
  no_pudo: { label: "sin diagnóstico", color: "#f59e0b" },
  bloqueado: { label: "bloqueados", color: "#f59e0b" },
  sin_puerta: { label: "sin puerta", color: "var(--t-text-dim)" },
  listo: { label: "listos", color: "var(--t-pos)" },
};
export const ORDEN_MASIVO = ["error", "no_pudo", "bloqueado", "sin_puerta", "listo"];

// ── LA TAB EN VIVO ──────────────────────────────────────────────────────────
//
// Lo que hace distinta a esta pantalla del resto del modal es que acá **el
// tiempo importa**: no es una foto de anoche, es lo que está pasando. Por eso
// cada fila lleva DESDE CUÁNDO y CUÁNTAS VECES, y lo nuevo sin ver va arriba.
//
// `veces` no es decoración: separa un problema que apareció una vez (puede ser
// un instante del mercado) de uno que lleva 200 ciclos (es un dato roto).

export function edad(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

export const SEV_COLOR: Record<string, string> = {
  alta: "var(--t-neg)", media: "#f59e0b", baja: "var(--t-text-dim)",
};

/** ¿LOS ARREGLOS DEL AGENTE AGUANTAN?
 *
 * El escalonado 1·2·3·7·14·30 (backend §0.bi). Un arreglo no se da por bueno
 * cuando se escribe: se da por bueno cuando el problema **no vuelve**, y eso
 * tarda. Cada hito que pasa suma confianza; volver una vez la borra entera.
 *
 * Se muestra plegado porque es CONTEXTO, no trabajo: cuántos hay en prueba es
 * el número que importa, y el detalle lo pide el que quiere mirarlo.
 */
// ── QUÉ PIDE ALGO HOY ───────────────────────────────────────────────────────
//
// El número que convierte una lista en una decisión. Con 64 filas abiertas
// todas iguales, la pantalla es un depósito: *«las cosas en ENCONTRÓ siguen
// figurando»*. Con «de 64, 3 piden algo», es un tablero.
export const BANDA_TXT: Record<string, string> = {
  volvio: "volvió después de arreglarse",
  estancado: "lo viste y sigue igual",
  arrastra: "abierto hace días y sin ver",
  nuevo: "apareció hoy",
};
export const BANDA_COLOR: Record<string, string> = {
  volvio: "var(--t-neg)",
  estancado: "var(--t-warn, #b8860b)",
  arrastra: "var(--t-text-muted)",
  nuevo: "var(--t-text-dim)",
};


// La hora del día, sin fecha: en una lista que ya es de hoy, la fecha es ruido.
// ⚠️ **LA ZONA SE DECLARA, NO SE HEREDA DEL NAVEGADOR.** Sin `timeZone`, esto
// escribía la hora de la máquina del que mira: en la oficina coincide con ART
// por casualidad, y desde un teléfono en otra zona —o con el reloj mal puesto—
// la pantalla miente sin avisar. El user: *«basta de UTC y esas cosas, horario
// argentino mostrar»*. Vale para todos: se declara siempre.
export const TZ_AR = "America/Argentina/Buenos_Aires";

export function hora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("es-AR",
        { timeZone: TZ_AR, hour: "2-digit", minute: "2-digit" });
}

// Fecha + hora ARGENTINA, corta. Para la columna de ENCONTRÓ: si es de hoy
// alcanza la hora, y si no, el día — poner la fecha completa en todas las filas
// gasta ancho para repetir «22/08» ciento treinta veces.
export function cuando(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date().toLocaleDateString("es-AR", { timeZone: TZ_AR });
  const suyo = d.toLocaleDateString("es-AR", { timeZone: TZ_AR });
  return suyo === hoy
    ? d.toLocaleTimeString("es-AR",
        { timeZone: TZ_AR, hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR",
        { timeZone: TZ_AR, day: "2-digit", month: "2-digit" });
}
