"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → INTERBANKING. Los bancos de ACA, para CONCILIAR.
 *
 * **UN día, no un rango** (user, 2026-08-18: «la fecha es una sola, es siempre el
 * mismo día»). Un solo selector de fecha, compartido por las dos sub-tabs; sin
 * fecha manda el backend, que usa HOY en hora argentina — así la pantalla no
 * depende del reloj del navegador.
 *
 * ── CONSOLIDADO BANCOS (default) — UNA fila por cuenta, agrupadas bajo el
 *    nombre del banco: SALDO AL INICIO · SALDO AL CIERRE · VARIACIÓN · GASTOS
 *    BANCARIOS · MOVS. Los dos saldos los informa el banco (apertura y cierre de
 *    ESE día): no los calculamos. La cuenta va a la IZQUIERDA con el número
 *    ENTERO; las columnas de datos van CENTRADAS, de ancho parejo y separadas
 *    por una línea.
 *
 *    El agrupado por banco existe para poder navegar 38 cuentas, nada más: **no
 *    hay subtotales por banco ni totales por moneda** — los sacó el back office
 *    porque no los usaba, y sin ellos la vista arranca directo en la tabla.
 *
 *    ⚠️ Lista TODAS las cuentas activas. El CIERRE tiene dos fuentes y la celda
 *    rotula cuál: sin rótulo = extracto; «saldo» = lo informa el banco pero la
 *    cuenta no se movió y no hay extracto que lo respalde; «≠» = el banco
 *    informa las dos y no coinciden (hallazgo de conciliación). Sin ninguna de
 *    las dos va «—» y nunca 0 — poner cero sería inventar.
 *
 *    GASTOS BANCARIOS lo DERIVA el backend de las reglas de clasificación. Sin
 *    una sola regla ni marca cargada viene **null** y se muestra «—» y NO cero,
 *    porque «no sabemos» y «no hubo gastos» son cosas distintas.
 *
 * ── MOVIMIENTOS — clic en una cuenta del consolidado abre el MODAL del día, con
 *    las 8 columnas que pidió el back office el 2026-08-18: FECHA · DESCRIPCIÓN ·
 *    CONCEPTO · COD OP · COD OP BCO · COMPROBANTE · SUCURSAL · IMPORTE, más
 *    GASTO y CUENTA. Las dos que faltaban (`sucursal` y `codigo_banco`) ya
 *    estaban GUARDADAS en `bancos.movimientos` desde la primera corrida: el
 *    backend simplemente no las publicaba, así que sumarlas no costó ni una
 *    llamada nueva a Interbanking ni un backfill.
 *
 *    Arriba, el AUDITOR: GASTOS BANCARIOS (el total) y su desglose por balde;
 *    clic en cualquiera de esos números deja la tabla mostrando SOLO las filas
 *    que lo componen, con su suma al lado. Un total que no se puede abrir es un
 *    total en el que hay que creer.
 *
 *    Las DOS columnas del final responden preguntas distintas y por eso son dos:
 *    **GASTO** dice QUÉ ES el movimiento (lo cobró el banco o no) y **CUENTA**
 *    dice SI SUMA. Un duplicado del banco sigue siendo un gasto — lo que no es,
 *    es dos gastos. Ignorarlo no lo borra: la fila queda tachada, con quién y
 *    cuándo, y afuera de los totales (el equivalente al destildado por celda de
 *    Tesorería). Borrarla haría que el detalle deje de coincidir con el extracto.
 *
 * **FILTRO POR BANCO** en la barra. Es client-side sobre lo que ya trajo el
 * consolidado —pedirle la vista filtrada al backend sería un request por cada
 * cambio de selector para esconder filas que ya están en memoria— y alcanza
 * también al REPORTE FIN DE DÍA: el reporte no puede decir algo distinto de la
 * pantalla desde la que se abrió. El alta de movimientos manuales NO se filtra:
 * es una herramienta de carga, y no poder cargarle un movimiento a un banco por
 * tener la vista filtrada sería una trampa.
 *
 * **Clic en una celda con dato = se copia al portapapeles** (flash verde). Estos
 * datos se pegan en otros sistemas todo el día. Las celdas sin dato («—») no
 * reaccionan: un cursor de mano que no hace nada promete algo que no pasa.
 *
 * ── REPORTE FIN DE DÍA (botón de la barra) — el saldo al cierre de TODAS las cuentas,
 *    para pasar hacia afuera. **Una tabla POR BANCO**, no una matriz: se probaron
 *    las dos (bancos en las columnas y bancos en las filas) y las dos fallan por
 *    lo mismo — cada cuenta pertenece a UN banco, así que en una grilla común la
 *    enorme mayoría de las celdas queda vacía y la tabla queda larguísima o
 *    anchísima al pedo. Cada tabla mide lo que su banco necesita y se acomodan
 *    unas al lado de otras, repartidas con los bancos GRANDES primero para que
 *    las columnas queden parejas, y con espacios grandes en el medio para que se
 *    lea que cada una es su propia tabla. El modal toma el ancho que piden las
 *    tablas: ni estirarlas ni escalarlas, que fue lo que se probó antes. Adentro, ARS primero
 *    y una línea más marcada donde cambia la moneda. Usa el MISMO día que la
 *    vista, así no puede decir algo distinto de la pantalla desde la que se
 *    abrió. Cabecera azul con el logo UNA vez arriba de todo y la firma «Hecho
 *    en ACAQuant» en chico. Botón **COPIAR IMAGEN** para pegarlo en un mail: la
 *    imagen se DIBUJA de cero en un canvas con los mismos datos (ver
 *    `lib/reporte-imagen`), no es una captura — por eso el botón, el scroll y el
 *    ✕ no pueden colarse en ella, y por eso sale siempre en claro aunque la app
 *    esté en oscuro: un mail con fondo negro se imprime pésimo.
 *
 * ── DIFERENCIAS (botón de la barra) — el control de que el saldo NO se movió
 *    solo. Tres pasos, y las columnas son esos tres pasos en orden:
 *      1. **VARIACIÓN** = saldo del día − saldo del día anterior.
 *      2. **MOVIMIENTOS** = la suma de los importes del día.
 *      3. **DIFERENCIA** = variación − movimientos. Si da cero, cierra.
 *    ⚠️ Las cinco columnas están porque el número final **hay que poder
 *    seguirlo**: con solo el resultado, el back office tendría que creerle. La
 *    primera versión no mostraba la variación y por eso no se entendía de dónde
 *    salía.
 *    Cuando no da cero, casi siempre es el banco registrando un movimiento con
 *    fecha del día ANTERIOR que recién impacta en el saldo de este: el
 *    movimiento queda en un día que ya cerramos y el salto aparece en el otro.
 *    El tooltip de la DIFERENCIA muestra la evidencia —en cuánto cerró el banco
 *    el día anterior y en cuánto abrió este—, que cuando el día cuadra contra
 *    sus propios movimientos es exactamente ese mismo número.
 *    Se concilia contra el BANCO: los manuales no entran (se muestran aparte),
 *    los ignorados sí (ignorar saca del GASTO, no del extracto). Sin alguno de
 *    los dos saldos no se inventa una diferencia: dice «sin dato». Arranca
 *    mostrando SOLO las cuentas con diferencia — 38 filas en cero esconden las 2
 *    que importan.
 *
 * ── MOVIMIENTOS A CONCILIAR (botón de la barra) — lo que se confirmó en
 *    CONCILIAR y hay que arreglar en el sistema contable. Existe porque
 *    **encontrar el movimiento no alcanza: el arreglo se hace en OTRO sistema y
 *    en otro momento**, y sin anotarlo la próxima conciliación vuelve a
 *    encontrar lo mismo sin que nadie sepa si ya se corrigió. Cada fila dice
 *    QUÉ HACER (cargar en el mayor / sacar del mayor) y lleva la descripción
 *    **tal como viene de SU lado**, que es lo que la hace encontrable allá.
 *    Sin filtro de fecha; lo resuelto se marca y queda como traza.
 *
 * ── CONCILIAR (botón de la barra) — compara UN número contra otro: nuestro saldo
 *    al cierre y el ÚLTIMO saldo del mayor del sistema contable, que el usuario
 *    sube como Excel. Si no coinciden, muestra qué movimientos del día podrían
 *    explicar la diferencia.
 *
 *    El usuario ELIGE banco y cuenta: no se infieren del archivo. El mayor no
 *    trae CBU ni número de cuenta bancaria (verificado sobre exports reales), y
 *    elegirla además fija el universo de movimientos sin ambigüedad.
 *
 *    Del archivo se usa **un solo número**: el último saldo. No se leen sus
 *    movimientos — sus descripciones y comprobantes no tienen NADA en común con
 *    los del banco (`[Op. 1130699] bco a bco` contra `TRANSF.O/BANCOS MISMO
 *    TIT`), así que cruzarlos por texto no era una opción.
 *
 *    Los dos detalles se ven en MOVIMIENTOS (uno por uno) o en CONSOLIDADO
 *    (juntados por concepto, con la suma y desplegables). El toggle es uno solo
 *    para las dos tablas y el TOTAL no cambia entre vistas.
 *
 *    ⚠️ El navegador no interpreta el archivo: solo lo convierte en filas y
 *    columnas crudas y las manda. Qué columna es el saldo y cómo se lee la
 *    `D`/`A` que le da el signo (D = positivo, A = negativo) lo decide el
 *    backend, donde se puede testear. **No se persiste nada.**
 *
 * De dónde sale el dato: `jobs/interbanking_sync` trae extracto + saldo a
 * `bancos.*` cada 2 horas (9 a 19 ART) y esta vista lee de ahí. **La pantalla
 * nunca le pega a Interbanking**: el límite de 100 llamadas/minuto es del ABONADO
 * y no del proceso. La barra de arriba dice **Última actualización** con la fecha
 * y hora de la última sincronización del job — una tabla vacía con el job caído
 * no es "no hubo movimientos".
 *
 * El día por defecto es el **hábil ANTERIOR a hoy**, que es el que está cerrado:
 * el banco ya informó su extracto completo. Lo decide el backend, no el reloj
 * del navegador. `bancos.*` guarda solo las **3 fechas** más recientes.
 *
 * ⚠️ **Nada de esto se mezcla con TESORERÍA.** Son objetos sin clave en común: la
 * cuenta operativa de Aunesa es una imputación interna del agente; esto es la
 * cuenta bancaria real. Ver docs/INTERBANKING.md.
 *
 * El **número de cuenta va ENTERO** (decisión del user 2026-08-18: son las
 * cuentas de la casa y el número es lo que se copia a otros sistemas). El **CBU
 * NO sale nunca** — identificar la cuenta y poder transferirle plata son dos
 * permisos distintos; hay tests que lo congelan.
 */

type Cuenta = {
  id: number;
  banco: string;
  banco_nombre: string;
  tipo: string;
  moneda: string;
  etiqueta: string;
  numero: string;
  activa: boolean;
  /** La cargó una persona, no Interbanking. */
  manual?: boolean;
};

/** Un movimiento que el banco no informa. Comparte las claves con `Movimiento`
 *  para poder dibujarse en la misma tabla. */
type Manual = {
  id: number;
  manual: true;
  fecha: string | null;
  hora: string | null;
  importe: number | null;
  tipo: string | null;
  descripcion: string;
  por: string | null;
};

type CuentaConsolidada = Cuenta & {
  saldo_inicio: number | null;
  saldo_cierre: number | null;
  variacion: number | null;
  movimientos: number | null;
  // De dónde salió el CIERRE. Lo decide el backend, la pantalla solo lo rotula.
  //   "extracto" → apertura/cierre del extracto (con su detalle de movimientos)
  //   "saldo"    → `bancos.saldos`: la cuenta no se movió ese día y el extracto
  //                no la devuelve, pero el banco igual informa cuánto hay
  //   null       → no sabemos (cuenta con «—»)
  //   "manual"   → no está en Interbanking: el saldo ES lo cargado a mano
  fuente: "extracto" | "saldo" | "manual" | null;
  saldo_banco: number | null;
  // El banco informó las DOS cosas y no coinciden: hallazgo de conciliación.
  discrepancia: number | null;
  // Suma de los gastos que cobró el banco ese día. **null mientras la regla de
  // clasificación no esté definida** — «no sabemos» no es «no hubo gastos», así
  // que jamás cero por defecto.
  gastos_bancarios: number | null;
  gastos_desglose: Desglose | null;
  // Cuánto del cierre lo puso una persona. Se muestra aparte: un saldo con
  // ajuste manual no vale lo mismo que uno que informó el banco.
  ajuste_manual: number | null;
  movimientos_manuales: number;
};

type Banco = {
  banco: string;
  banco_nombre: string;
  cuentas: CuentaConsolidada[];
};

type Sync = { corrida_at: string; cuentas: number; con_error: number } | null;

type Conectado = { email: string; visto_at: string };

/** Un balde del desglose de gastos. Las etiquetas las manda el BACKEND: si el
 *  front las copiara, cambiar un balde obligaría a tocar dos lados. */
/** Una columna del desglose. Desde el 2026-08-18 el catálogo vive en la BASE y
 *  lo edita el equipo desde la vista: `matchers` son las GRAFÍAS con que llega
 *  ese concepto (cada banco lo escribe distinto) y `orden` es lo que decide los
 *  empates cuando dos baldes se pisan. */
type Matcher = { id: number; campo: string; operador: string; valor: string };
type Balde = {
  clave: string; etiqueta: string; grupo: "concepto" | "otros";
  orden: number; matchers: Matcher[];
};

/** {clave: monto} + `total` + `resto`. `resto` es el gasto que no cayó en
 *  ningún balde — no es columna, se muestra en el modal solo si no es cero. */
type Desglose = Record<string, number>;

/** Una regla del catálogo que clasifica un movimiento como gasto bancario. */
type Regla = {
  id: number; campo: string; operador: string; valor: string;
  nota: string | null; activa: boolean; creado_por: string | null;
};

type RespConsolidado = {
  fecha: string;
  conectados: Conectado[];
  puede_escribir: boolean;
  desglose: Balde[];
  bancos: Banco[];
  cuentas: number;
  sin_datos: number;
  gastos_definidos: boolean;
  sync: Sync;
};

type Dia = {
  fecha: string;
  saldo_apertura: number | null;
  saldo_cierre: number | null;
  creditos: number | null;
  debitos: number | null;
  movimientos_banco: number | null;
  movimientos_base: number | null;
  cierra: boolean | null;
  diferencia: number | null;
};

type Movimiento = {
  // Identidad del movimiento: es lo que se manda para marcarlo como gasto.
  mov_hash: string;
  es_gasto?: boolean;
  // De DÓNDE salió la marca: "regla" (la clasificó el catálogo) o "manual"
  // (alguien la decidió). Viaja hasta la pantalla a propósito — ver el comentario
  // de la columna GASTO.
  gasto_origen?: "regla" | "manual" | null;
  // En qué balde del desglose cayó. Es lo que permite abrir un número del
  // desglose y ver EXACTAMENTE qué filas lo componen.
  gasto_balde?: string | null;
  // IGNORADO — el equivalente al destildado por celda de Tesorería. La fila
  // SIGUE viéndose (tachada): lo único que cambia es que no suma. Borrarla
  // haría que el detalle deje de coincidir con el extracto del banco.
  ignorado?: boolean;
  ignorado_motivo?: string | null;
  ignorado_por?: string | null;
  ignorado_at?: string | null;
  fecha: string | null;
  hora: string | null;
  importe: number | null;
  tipo: string | null;
  descripcion: string;
  concepto: string;
  codigo: string | null;
  codigo_banco: string | null;
  sucursal: string | null;
  extracto: string | null;
  correlativo: number | null;
  comprobante: number | null;
  contraparte: string | null;
  contraparte_cuit: string | null;
};

type RespVista = {
  cuentas: Cuenta[];
  cuenta_id: number | null;
  puede_escribir: boolean;
  reglas: Regla[];
  desglose: Balde[];
  fecha: string;
  dias: Dia[];
  movimientos: Movimiento[];
  manuales: Manual[];
  resumen: {
    dias: number;
    movimientos: number;
    creditos: number;
    debitos: number;
    neto: number;
    ajuste_manual: number;
    movimientos_manuales: number;
    dias_que_no_cierran: string[];
    dias_incompletos: string[];
    saldo_final: number | null;
    gastos: number;
    gastos_desglose: Desglose;
  };
  sync: Sync;
};

/** Un movimiento del banco que podría explicar la diferencia contra el mayor. */
type MovCandidato = {
  mov_hash: string;
  fecha: string | null;
  hora: string | null;
  importe: number;
  tipo: string | null;
  /** Con signo: C suma, D resta. Lo firma el BACKEND a partir de `tipo`. */
  importe_firmado: number;
  descripcion: string;
  concepto: string;
  codigo: string | null;
  codigo_banco: string | null;
  comprobante: number | null;
  ignorado: boolean;
};

/** Una combinación de movimientos cuya suma da exactamente la diferencia. */
type Candidato = {
  movimientos: MovCandidato[]; suma: number; cantidad: number;
  /** De qué lado salió: no es lo mismo «cargá esto en HYGIRUS» que «sacá esto». */
  lado: "banco" | "mayor";
  accion: "falta_en_el_mayor" | "sobra_en_el_mayor";
  /** Cuánto queda SIN explicar. Se muestra siempre que no sea cero: una
   *  explicación aproximada no se puede confundir con una exacta. */
  resto: number;
  /** El mismo importe pero de la otra mano — el sistema contable lleva la cuenta
   *  del otro lado. Se marca en vez de disimularlo. */
  signo_invertido: boolean;
};

type RespConciliacion = {
  fecha: string;
  cuenta: {
    id: number; banco: string; numero: string;
    tipo: string; moneda: string; etiqueta: string;
  };
  saldo_nuestro: number | null;
  saldo_nuestro_fuente: string | null;
  ajuste_manual: number | null;
  saldo_excel: number | null;
  /** El texto crudo de la celda y en qué fila estaba: el usuario tiene que poder
   *  verificar de dónde salió el número sin abrir el Excel al lado. */
  saldo_excel_texto: string | null;
  saldo_excel_letra: string | null;
  saldo_excel_fila: number | null;
  diferencia: number | null;
  concilia: boolean | null;
  movimientos_dia: number;
  /** Los gastos que cobró el banco ese día y su reparto por impuesto. Salen de
   *  la MISMA función que la columna del consolidado, así que son el mismo
   *  número que muestra el modal de MOVIMIENTOS.
   *
   *  ⚠️ En POSITIVO (lo que se llevó el banco), al revés que los movimientos de
   *  la lista. Es la convención del resto de INTERBANKING y se respeta para que
   *  el número se pueda comparar entre pantallas sin darlo vuelta.
   *
   *  **null** sin una sola regla cargada: «no sabemos» y «no hubo gastos» son
   *  cosas distintas. */
  gastos: number | null;
  gastos_desglose: Desglose | null;
  candidatos: Candidato[];
  candidatos_truncados: boolean;
  avisos: string[];
  /** Los dos detalles, uno de cada lado. Solo descripción e importe: los del
   *  banco y los del mayor no tienen NADA en común en fechas ni comprobantes
   *  (`[Op. 1130699] bco a bco` contra `TRANSF.O/BANCOS MISMO TIT`), así que
   *  ponerlos al lado invitaría a cruzarlos por donde no se puede. Lo único que
   *  se compara de verdad es el IMPORTE.
   *
   *  `grupo` es la clave del CONSOLIDADO y la calcula el BACKEND: qué se
   *  considera «el mismo movimiento» es un criterio de negocio y vive testeado
   *  allá, no acá. Del lado del mayor NO es el concepto (que trae el número de
   *  asiento y el del comprobante, y por eso es único fila por fila). */
  banco_movimientos: {
    descripcion: string; grupo: string; concepto: string; importe: number }[];
  banco_suma: number;
  mayor_movimientos: {
    concepto: string; grupo: string; importe: number; fila: number }[];
  mayor_suma: number;
  /** El margen con que se buscó la explicación. Se muestra: un criterio que
   *  decide qué aparece en pantalla no puede vivir escondido en el código. */
  tolerancia: number | null;
};

/** Una fila de cualquiera de los dos lados de la conciliación. `grupo` es la
 *  clave con que se consolida y `detalle` el texto largo que se ve al abrir el
 *  grupo (del lado del banco, el concepto de Interbanking, que es distinto de
 *  la descripción truncada que manda el banco). */
type FilaLado = {
  texto: string; importe: number; grupo: string; detalle?: string };

const CONSOLIDADO_VACIO: RespConsolidado = {
  fecha: "", conectados: [], puede_escribir: false, desglose: [], bancos: [], cuentas: 0,
  sin_datos: 0, gastos_definidos: false, sync: null,
};

const VISTA_VACIA: RespVista = {
  cuentas: [], cuenta_id: null, puede_escribir: false, reglas: [], desglose: [],
  fecha: "", dias: [], movimientos: [], manuales: [],
  resumen: {
    dias: 0, movimientos: 0, creditos: 0, debitos: 0, neto: 0, gastos: 0, gastos_desglose: {},
    dias_que_no_cierran: [], dias_incompletos: [], saldo_final: null,
    ajuste_manual: 0, movimientos_manuales: 0,
  },
  sync: null,
};

// El dato cambia cada 2 horas: pollear seguido no aporta.
const POLL_MS = 60_000;

/**
 * Las columnas de DATOS del consolidado: contenido centrado, ancho parejo y una
 * línea a la izquierda que las separa.
 *
 * El `w-[13%]` es lo que arregla el hueco: sin un ancho declarado, la columna
 * CUENTA se quedaba con TODO el espacio sobrante y los números terminaban
 * apretados contra el margen derecho, con una franja en blanco enorme en el
 * medio. Con 5 columnas al 13% ocupan el 65% de la fila y se reparten parejo;
 * CUENTA se queda con el resto, que le alcanza de sobra para entrar entera.
 *
 * Se declara UNA vez para que la cabecera y las filas no puedan desalinearse.
 */
const COL_DATO = "w-[13%] border-l border-[var(--t-border)]";

/** Igual que `COL_DATO` pero SIN ancho fijo, para las tablas del DETALLE: ahí las
 *  columnas son muchas y angostas, y forzarles un porcentaje las desbordaría. */
const COL_SEP = "border-l border-[var(--t-border)]";

/** Fondo de las columnas que salen del MAYOR (saldo inicio, debe, haber, saldo
 *  final), para separarlas de un vistazo de las que salen del banco. */
const COL_MAYOR = "bg-[var(--t-accent)]/[0.07]";

function plata(v: number | null | undefined, moneda = "") {
  if (v === null || v === undefined) return "—";
  const s = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
  return moneda ? `${moneda} ${s}` : s;
}

/** Quién más tiene la vista abierta. Mismo patrón que Tesorería y SENEBIS. */
function Presencia({ conectados }: { conectados: Conectado[] }) {
  if (!conectados.length) return null;
  return (
    <div className="flex items-center gap-1" title={conectados.map((c) => c.email).join("\n")}>
      <span className="text-[9px] text-[var(--t-text-muted)] uppercase">En vista:</span>
      {conectados.map((c) => (
        <span
          key={c.email}
          title={c.email}
          className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] bg-[var(--t-panel)] uppercase"
        >
          {c.email.split("@")[0]}
        </span>
      ))}
    </div>
  );
}

/** «18/08/2026 13:42». Fecha, hora y minuto — nada más (user, 2026-08-18). */
function momento(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Suma varios baldes del desglose. Devuelve **null y no 0** cuando no hay
 * desglose: «no sabemos» y «no hubo gastos» son cosas distintas, y un cero acá
 * se leería como que el banco no cobró nada.
 */
function sumaBaldes(d: Desglose | null | undefined, baldes: Balde[]) {
  if (!d) return null;
  return Math.round(baldes.reduce((a, b) => a + (d[b.clave] ?? 0), 0) * 100) / 100;
}


/* ══════════════════════════════════════════════════════════════════════════ */

export function InterbankingView() {
  // UNA fecha, no un rango (user, 2026-08-18: «la fecha es una sola, es siempre
  // el mismo día»). Arranca vacía A PROPÓSITO: sin fecha el backend usa el día
  // HÁBIL ANTERIOR, así el default lo decide el servidor y no el navegador.
  const [fecha, setFecha] = useState("");

  // Identidad ESTABLE (useCallback sin deps) + update funcional: si se pasara una
  // arrow inline, cambiaría en cada render y el efecto del hijo que la tiene en
  // deps correría en cada render. Solo completa si está vacía, así que nunca
  // pisa el día que el usuario eligió a mano.
  const aplicarFecha = useCallback((f: string) => setFecha((p) => p || f), []);

  // Cuándo sincronizó el JOB con el banco. Lo reporta el consolidado (viene en
  // su payload) y se muestra ACÁ ARRIBA, en una sola línea. Antes era una franja
  // de texto explicando cada cuánto corre el cron y cuántas cuentas no tenían
  // dato: el back office la sacó, y tenía razón — una pantalla no se explica a
  // sí misma en prosa. Lo único que hace falta saber es de cuándo es el dato.
  //
  // ⚠️ La respuesta del consolidado se guarda ENTERA acá arriba (`resp`) en vez
  // de mandar tres callbacks distintos hacia abajo. La barra necesita cosas de
  // ese payload (última sync, quién está en línea, si es una foto) y el REPORTE
  // FINAL necesita los bancos: con callbacks sueltos cada dato nuevo agregaba un
  // prop y una copia de estado que se podía quedar vieja.
  const [resp, setResp] = useState<RespConsolidado>(CONSOLIDADO_VACIO);
  const syncAt = resp.sync?.corrida_at ?? null;
  // Quién más tiene la vista abierta. Mismo patrón que Tesorería y SENEBIS: el
  // poll de la vista ES el heartbeat, no hay un endpoint aparte que golpear.
  const enLinea = resp.conectados;

  // La cuenta cuyo detalle está abierto. `null` = modal cerrado.
  const [abierta, setAbierta] = useState<CuentaConsolidada | null>(null);
  const cerrar = useCallback(() => setAbierta(null), []);

  const [reporte, setReporte] = useState(false);
  const [manual, setManual] = useState(false);
  const [difs, setDifs] = useState(false);
  const [pendientes, setPendientes] = useState(false);
  const [conciliar, setConciliar] = useState(false);

  // FILTRO POR BANCO. Es client-side sobre lo que ya trajo el consolidado: pedir
  // la vista filtrada al backend sería un request por cada cambio de selector
  // para esconder filas que ya están en memoria.
  //
  // Filtra la grilla Y el REPORTE FIN DE DÍA, a propósito: el reporte no puede decir
  // algo distinto de la pantalla desde la que se abrió. El alta de movimientos
  // manuales NO se filtra — es una herramienta de carga, y no poder cargarle un
  // movimiento a un banco por tener la vista filtrada sería una trampa.
  const [banco, setBanco] = useState("");
  const bancosVista = useMemo(
    () => (banco ? resp.bancos.filter((b) => b.banco === banco) : resp.bancos),
    [resp.bancos, banco]);
  return (
    <div className="h-full min-h-0 flex flex-col text-[12px]">
      {/* ⚠️ La barra tiene UN solo renglón y siete controles: cada píxel que se
          gasta compite con el siguiente. Por eso:
          · el título «Consolidado Bancos» se sacó — la pantalla ya se llama así
            en la solapa, y repetirlo costaba el ancho de dos botones;
          · el filtro de banco vive a la IZQUIERDA, con la última actualización:
            es CONTEXTO de lo que se está mirando, no una acción;
          · CONCILIAR y MOVIMIENTOS A CONCILIAR van encuadrados juntos, porque
            son las dos mitades de un mismo circuito —encontrar la diferencia y
            anotar qué hay que arreglar— y el recuadro dice eso sin una palabra. */}
      <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-1.5 flex flex-wrap items-center gap-3">
        <span className="text-[11px] text-[var(--t-text-dim)]">
          Última actualización {momento(syncAt)}
        </span>
        <select
          value={banco}
          onChange={(e) => setBanco(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[11px] outline-none"
          title="Ver un solo banco. Afecta también al reporte de fin de día."
        >
          <option value="">Todos los bancos</option>
          {resp.bancos.map((b) => (
            <option key={b.banco} value={b.banco}>{b.banco_nombre}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {/* Las dos mitades del mismo circuito, en un solo bloque. */}
          <div className="flex items-center gap-1 border border-[var(--t-border-2)] px-1 py-0.5">
            <button
              onClick={() => setConciliar(true)}
              className="px-2 py-0.5 text-[11px] uppercase tracking-wide hover:bg-[var(--t-surface)]"
              title="Subir el mayor del sistema contable y ver qué explica la diferencia de saldo"
            >
              Conciliar
            </button>
            <span className="text-[var(--t-border-2)]">·</span>
            <button
              onClick={() => setPendientes(true)}
              className="px-2 py-0.5 text-[11px] uppercase tracking-wide hover:bg-[var(--t-surface)]"
              title="Lo que se confirmó que hay que arreglar en el sistema contable"
            >
              Movimientos a conciliar
            </button>
          </div>
          <button
            onClick={() => setDifs(true)}
            className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
            title="¿La variación del saldo de cada cuenta está explicada por sus movimientos?"
          >
            Diferencias bancarias
          </button>
          <button
            onClick={() => setReporte(true)}
            className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
            title="El saldo al cierre de cada cuenta, por banco, para pasar"
          >
            Reporte fin de día
          </button>
          {resp.puede_escribir && (
            <button
              onClick={() => setManual(true)}
              className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
              title="Movimientos que el banco no informa, y cuentas de bancos que no están en Interbanking"
            >
              Registrar movimientos manuales
            </button>
          )}
          <Presencia conectados={enLinea} />
          <Fecha label="Fecha" value={fecha} onChange={setFecha} />
        </div>
      </div>

      <Consolidado
        fecha={fecha}
        banco={banco}
        onFecha={aplicarFecha}
        onDatos={setResp}
        onAbrir={setAbierta}
      />

      {abierta && (
        <ModalMovimientos cuenta={abierta} fecha={fecha} onCerrar={cerrar} />
      )}

      {pendientes && (
        <ModalPendientes
          puedeEscribir={resp.puede_escribir}
          onCerrar={() => setPendientes(false)}
        />
      )}

      {difs && (
        <ModalDiferencias
          fecha={resp.fecha || fecha}
          banco={banco}
          onCerrar={() => setDifs(false)}
        />
      )}

      {manual && (
        <ModalManuales
          bancos={resp.bancos}
          fecha={resp.fecha || fecha}
          onCerrar={() => setManual(false)}
        />
      )}

      {reporte && (
        <ModalReporte
          bancos={bancosVista}
          fecha={resp.fecha || fecha}
          onCerrar={() => setReporte(false)}
        />
      )}

      {conciliar && (
        <ModalConciliar
          bancos={resp.bancos}
          baldes={resp.desglose}
          fecha={resp.fecha || fecha}
          puedeEscribir={resp.puede_escribir}
          onCerrar={() => setConciliar(false)}
        />
      )}
    </div>
  );
}

/* ── CONSOLIDADO BANCOS ─────────────────────────────────────────────────── */

function Consolidado({
  fecha, banco, onFecha, onDatos, onAbrir,
}: {
  fecha: string; banco: string; onFecha: (f: string) => void;
  onDatos: (d: RespConsolidado) => void; onAbrir: (c: CuentaConsolidada) => void;
}) {
  const url = useMemo(
    () => `/api/back-office/interbanking/consolidado${fecha ? `?fecha=${fecha}` : ""}`,
    [fecha],
  );

  const { data, lastAt, error } = usePoll<RespConsolidado>(url, CONSOLIDADO_VACIO, POLL_MS, {
    fetchOnMount: true,
  });

  useEffect(() => {
    if (data.fecha) onFecha(data.fecha);
  }, [data.fecha, onFecha]);

  // El payload entero sube a la barra. `onDatos` es un setter de estado, así que
  // su identidad es estable y el efecto corre solo cuando llega data nueva.
  useEffect(() => { onDatos(data); }, [data, onDatos]);

  // El filtro se aplica al DIBUJO, no al fetch: el payload llega entero (lo
  // necesita la barra para armar el selector y el reporte) y acá se elige qué se
  // muestra. Un request por cada cambio de selector, para esconder filas que ya
  // están en memoria, sería pagar 8,5ms por nada.
  const visibles = useMemo(
    () => (banco ? data.bancos.filter((b) => b.banco === banco) : data.bancos),
    [data.bancos, banco]);

  // Los conceptos tienen columna propia; el grupo "otros" se suma en UNA sola
  // (OTROS IMP) y se abre adentro del modal.
  const conceptos = useMemo(
    () => data.desglose.filter((b) => b.grupo === "concepto"), [data.desglose]);
  const otros = useMemo(
    () => data.desglose.filter((b) => b.grupo === "otros"), [data.desglose]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ErrorLinea error={error} />

      {/* La barra de totales por moneda se ELIMINÓ (user, 2026-08-18: «no tiene
          sentido todas esas columnas de ahí arriba»). La vista arranca en la
          tabla. */}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse table-auto">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            {/* ⚠️ El ancho de CUENTA se resuelve ACÁ, con `w-full` en su `<th>`.
                En una tabla de layout automático, la columna que declara
                `width:100%` se queda con TODO el espacio que sobra después de
                que las demás toman el que necesitan para su contenido. Las de
                números son cortas, así que el sobrante es casi todo para CUENTA
                y el nombre entra entero sin scroll.

                Lo que NO alcanzaba: `whitespace-nowrap` en la celda solo evita
                que el texto salte de línea — no le da ancho a la columna, así
                que el nombre seguía cortado. Y `w-auto` en la tabla tampoco:
                sin slack que repartir, cada columna se queda con lo justo. */}
            {/* SALDO AL INICIO, VARIACIÓN y MOVS. se sacaron (user, 2026-08-18:
                «no sirven»). En su lugar entra el DESGLOSE de los gastos, que es
                lo que el back office sí mira: cuánto del total es IVA, cuánto
                percepción y cuánto comisión.

                Las columnas del desglose las declara el BACKEND (`data.desglose`)
                — acá no hay una lista de etiquetas copiada que pueda quedar
                diciendo algo distinto que el número que la llena. */}
            <tr>
              <Th>Cuenta</Th>
              <Th center className={COL_DATO}>Saldo al cierre</Th>
              <Th center className={COL_DATO}>Gastos bancarios</Th>
              {conceptos.map((b) => (
                <Th key={b.clave} center className={COL_DATO}>{b.etiqueta}</Th>
              ))}
              <Th center className={COL_DATO}>Otros imp.</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((b) => (
              <BloqueBanco
                key={`${b.banco}-${b.banco_nombre}`}
                banco={b}
                conceptos={conceptos}
                otros={otros}
                onAbrir={onAbrir}
              />
            ))}
            {visibles.length === 0 && (
              <Vacia cols={3 + conceptos.length + 1} hubo={lastAt > 0} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BloqueBanco({
  banco, conceptos, otros, onAbrir,
}: {
  banco: Banco; conceptos: Balde[]; otros: Balde[];
  onAbrir: (c: CuentaConsolidada) => void;
}) {
  return (
    <>
      {/* El banco como TÍTULO de su bloque de cuentas. Agrupa para poder
          navegar 38 cuentas, nada más: los subtotales por banco y por moneda se
          ELIMINARON (user, 2026-08-18) — cada fila se lee sola. */}
      <tr className="bg-[var(--t-surface-2)] border-y border-[var(--t-border)]">
        <td
          colSpan={3 + conceptos.length + 1}
          className="px-2 py-1.5 font-semibold tracking-wide"
        >
          {banco.banco_nombre || "(sin nombre)"}
          <span className="ml-2 text-[10px] font-normal text-[var(--t-text-dim)]">
            BCRA {banco.banco} · {banco.cuentas.length} cuenta(s)
          </span>
        </td>
      </tr>

      {banco.cuentas.map((c) => (
        <tr key={c.id} className="border-b border-[var(--t-border)]">
          {/* ⚠️ La fila tiene DOS gestos distintos y no es arbitrario:
              · clic en la CUENTA → abre el detalle del día (la cuenta es la
                identidad de la fila, y "entrar" es la acción sobre ella);
              · clic en una celda de DATOS → copia el número al portapapeles.
              Si la cuenta también copiara, no habría con qué abrir el detalle;
              el número igual se copia desde el encabezado del modal. */}
          <td
            onClick={() => onAbrir(c)}
            title="Ver los movimientos del día"
            className="px-2 py-1 whitespace-nowrap cursor-pointer hover:bg-[var(--t-surface)]"
          >
            <span className="pl-3">
              {c.tipo} {c.moneda} · <span className="font-semibold">{c.numero}</span>
              {c.etiqueta ? (
                <span className="text-[var(--t-text-dim)]"> · {c.etiqueta}</span>
              ) : null}
              {/* Una cuenta que no informa ningún banco no vale lo mismo que una
                  conciliada contra un extracto: se dice. */}
              {c.manual && (
                <span
                  className="ml-2 px-1 text-[9px] uppercase border border-[var(--t-border-2)] text-[var(--t-text-muted)]"
                  title="Cuenta cargada a mano: no viene de Interbanking. Su saldo es la suma de sus movimientos manuales."
                >
                  manual
                </span>
              )}
            </span>
          </td>
          <Td center strong className={COL_DATO} copiar={plata(c.saldo_cierre)}>
            {plata(c.saldo_cierre)}
            {/* El saldo que NO viene del extracto se rotula: es el mismo banco
                informando, pero es otra fuente y el back office tiene que poder
                distinguirlo de un cierre respaldado por su detalle. */}
            {/* Cuánto de este cierre lo puso una persona. Un saldo ajustado a
                mano y uno informado por el banco no se leen igual. */}
            {c.ajuste_manual != null && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-accent)]"
                title={`Incluye ${plata(c.ajuste_manual)} de ${c.movimientos_manuales} `
                  + "movimiento(s) cargado(s) a mano, que el banco no informa."}
              >
                ±man
              </span>
            )}
            {c.fuente === "manual" && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-text-dim)]"
                title="Este banco no está en Interbanking: el saldo es la suma de los movimientos cargados a mano."
              >
                s/banco
              </span>
            )}
            {c.fuente === "saldo" && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-text-dim)]"
                title="Saldo informado por el banco. La cuenta no tuvo movimientos ese día, así que no hay extracto que lo respalde."
              >
                saldo
              </span>
            )}
            {c.discrepancia != null && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-neg)]"
                title={`El extracto cierra en ${plata(c.saldo_cierre)} y el saldo `
                  + `informado dice ${plata(c.saldo_banco)} (${plata(c.discrepancia)} de `
                  + "diferencia). Las dos las informa el banco."}
              >
                ≠
              </span>
            )}
          </Td>
          <Td center strong className={COL_DATO} copiar={plata(c.gastos_bancarios)}>
            {plata(c.gastos_bancarios)}
          </Td>
          {conceptos.map((b) => {
            const v = c.gastos_desglose?.[b.clave] ?? null;
            return (
              <Td key={b.clave} center className={COL_DATO} copiar={plata(v)}>
                {plata(v)}
              </Td>
            );
          })}
          <Td center className={COL_DATO} copiar={plata(sumaBaldes(c.gastos_desglose, otros))}>
            {plata(sumaBaldes(c.gastos_desglose, otros))}
          </Td>
        </tr>
      ))}
    </>
  );
}

/* ── MODAL: los movimientos del día de UNA cuenta ───────────────────────── */

/**
 * Se abre haciendo clic en la cuenta del CONSOLIDADO. Reemplazó a la sub-tab
 * "Detalle por cuenta" (user, 2026-08-18): esa vista obligaba a elegir banco y
 * después cuenta en dos selectores, para ver el detalle de una fila que ya
 * estabas mirando en la otra pantalla. El modal parte de donde estás.
 *
 * Es el mismo patrón que el modal por celda de Tesorería → BANCOS: el número
 * grande se ve en la grilla, y lo que lo compone se abre encima sin perder el
 * contexto.
 *
 * Reusa `GET /vista?cuenta_id&fecha`, que ya devolvía exactamente esto. No hizo
 * falta un endpoint nuevo.
 */
function ModalMovimientos({
  cuenta, fecha, onCerrar,
}: { cuenta: CuentaConsolidada; fecha: string; onCerrar: () => void }) {
  const url = useMemo(() => {
    const p = new URLSearchParams({ cuenta_id: String(cuenta.id) });
    if (fecha) p.set("fecha", fecha);
    return `/api/back-office/interbanking/vista?${p.toString()}`;
  }, [cuenta.id, fecha]);

  // `fetchOnMount` + poll: si el modal queda abierto y el job sincroniza, se
  // actualiza solo. No hay nada que "guardar", así que refrescar no pisa nada.
  // `bump` fuerza un refetch después de marcar: el total del día lo recalcula el
  // BACKEND con la misma función que alimenta la columna del consolidado, así
  // que la pantalla no puede quedar diciendo otra cosa que el total.
  const [bump, setBump] = useState(0);
  const recargar = useCallback(() => setBump((n) => n + 1), []);
  const { data, lastAt, error } = usePoll<RespVista>(
    `${url}${url.includes("?") ? "&" : "?"}_r=${bump}`, VISTA_VACIA, POLL_MS,
    { fetchOnMount: true },
  );

  // Escape cierra: es un modal, tiene que poder salirse sin mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const dia = data.dias[0] ?? null;
  const r = data.resumen;
  const mon = cuenta.moneda;
  const [reglasAbierto, setReglasAbierto] = useState(false);
  const [desgloseAbierto, setDesgloseAbierto] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // AUDITOR del desglose. Clic en un número → la tabla queda mostrando SOLO las
  // filas que lo componen. Mismo gesto que el modal por celda de Tesorería →
  // BANCOS: un total que no se puede abrir es un total en el que hay que creer.
  //
  // Filtra la tabla de abajo en vez de abrir otro modal encima: las filas ya
  // están, con todas sus columnas, y apilar modales para mirar lo mismo es
  // ceremonia. `"__total"` = todos los gastos.
  const [filtro, setFiltro] = useState<string | null>(null);
  const auditar = useCallback(
    (clave: string) => setFiltro((p) => (p === clave ? null : clave)), []);

  const visibles = useMemo(() => {
    if (!filtro) return data.movimientos;
    if (filtro === "__total") return data.movimientos.filter((m) => m.es_gasto);
    return data.movimientos.filter((m) => m.es_gasto && m.gasto_balde === filtro);
  }, [data.movimientos, filtro]);

  // La suma de lo FILTRADO, calculada acá sobre las filas que se están viendo.
  // Es la verificación: si no coincide con el número que clickeaste, el desglose
  // y el detalle se contradicen — y eso hay que poder verlo.
  // ⚠️ Los IGNORADOS quedan afuera de la suma, igual que en el backend — si
  // sumaran, este número nunca coincidiría con el del desglose y el auditor
  // acusaría una diferencia que no existe. Se siguen VIENDO (tachados) y se
  // cuentan aparte, que es justo lo que explica por qué N filas dan menos.
  const sumaVisible = useMemo(
    () => Math.round(visibles.reduce(
      (a, m) => a + (m.ignorado ? 0 : (m.importe ?? 0) * (m.tipo === "D" ? 1 : -1)),
      0) * 100) / 100,
    [visibles]);

  const ignoradosVisibles = useMemo(
    () => visibles.filter((m) => m.ignorado).length, [visibles]);

  const etiquetaFiltro = filtro === "__total"
    ? "Gastos bancarios"
    : filtro === "resto"
      ? "Movimientos restantes"
      : data.desglose.find((b) => b.clave === filtro)?.etiqueta ?? filtro;

  /** Marca / desmarca / vuelve al criterio de las reglas. `null` BORRA la marca. */
  async function marcar(mov: Movimiento, es_gasto: boolean | null) {
    setErr(null);
    const res = await fetch("/api/back-office/interbanking/gastos/movimiento", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mov_hash: mov.mov_hash, es_gasto }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo guardar la marca.");
      return;
    }
    recargar();   // el total del día lo recalcula el BACKEND, no la pantalla
  }

  /** IGNORA / des-ignora un movimiento. No lo borra: deja de sumar. */
  async function ignorar(mov: Movimiento) {
    setErr(null);
    const quiere = !mov.ignorado;
    // El motivo es OPCIONAL a propósito: pedirlo obligatorio convierte un gesto
    // de un clic en un formulario, y el equipo termina escribiendo "x" para
    // sacárselo de encima. Quién y cuándo los sella el backend siempre.
    const motivo = quiere
      ? (window.prompt("Motivo (opcional) — por qué este movimiento no cuenta:") ?? "")
      : "";
    const res = await fetch("/api/back-office/interbanking/gastos/ignorar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mov_hash: mov.mov_hash, ignorar: quiere, motivo }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo guardar.");
      return;
    }
    recargar();
  }

  async function descargar() {
    const { exportToXlsx } = await import("@/lib/xlsx-export");
    await exportToXlsx({
      sheets: [{
        name: "Movimientos",
        // El importe va FIRMADO (débito negativo): así la columna suma el neto
        // del día en Excel sin que nadie tenga que armar la fórmula.
        // Se descarga lo que se ESTÁ VIENDO: si el filtro está puesto, bajar la
        // lista completa sería darle al usuario algo distinto de lo que pidió.
        rows: visibles.map((m) => ({
          ...m,
          importe_firmado: m.importe === null
            ? null
            : (m.tipo === "D" ? -m.importe : m.importe),
          // El ignorado va marcado en el archivo: si no, la planilla suma una
          // fila que la pantalla dejó afuera y los dos totales no coinciden.
          cuenta_txt: m.ignorado ? "NO CUENTA" : "",
        })),
        columns: [
          { header: "Fecha",        key: "fecha",            format: "date",    width: 12 },
          { header: "Descripción",  key: "descripcion",      format: "text",    width: 38 },
          { header: "Concepto",     key: "concepto",         format: "text",    width: 20 },
          { header: "Cod op",       key: "codigo",           format: "text",    width: 10 },
          { header: "Cod op bco",   key: "codigo_banco",     format: "text",    width: 12 },
          { header: "Comprobante",  key: "comprobante",      format: "text",    width: 14 },
          // Sucursal como TEXTO: viene "010" y como número perdería el cero.
          { header: "Sucursal",     key: "sucursal",         format: "text",    width: 10 },
          { header: "Contraparte",  key: "contraparte",      format: "text",    width: 30 },
          { header: "CUIT",         key: "contraparte_cuit", format: "text",    width: 14 },
          { header: "Tipo",         key: "tipo",             format: "text",    width: 6 },
          { header: "Importe",      key: "importe_firmado",  format: "number",  width: 16 },
          { header: "Ignorado",     key: "cuenta_txt",       format: "text",    width: 12 },
        ],
        title: `${cuenta.banco_nombre} · ${cuenta.tipo} ${mon} ${cuenta.numero}`
          + `${cuenta.etiqueta ? ` · ${cuenta.etiqueta}` : ""} · ${data.fecha || fecha}`
          + `${filtro ? ` · ${etiquetaFiltro}` : ""}`,
      }],
      filename: `interbanking-${cuenta.numero}-${data.fecha || fecha}.xlsx`,
    });
  }

  return (
    // El fondo cierra al hacer clic. `stopPropagation` en el panel para que un
    // clic adentro (copiar una celda, por ejemplo) no lo cierre de rebote.
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[1400px] max-h-[90vh] flex flex-col text-[12px]"
      >
        {/* Cabecera: de qué cuenta y de qué día es esto. */}
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold tracking-wide">{cuenta.banco_nombre}</span>
          <span className="text-[var(--t-text-dim)]">
            {cuenta.tipo} {mon} ·{" "}
            <span className="text-[var(--t-text)] font-semibold">{cuenta.numero}</span>
            {cuenta.etiqueta ? ` · ${cuenta.etiqueta}` : ""}
          </span>
          <span className="text-[var(--t-accent)]">{data.fecha || fecha}</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setReglasAbierto(true)}
              className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border)] hover:bg-[var(--t-surface)]"
              title="Qué movimientos se clasifican solos como gasto bancario"
            >
              Reglas de gastos ({data.reglas.filter((x) => x.activa).length})
            </button>
            <button
              onClick={() => setDesgloseAbierto(true)}
              className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border)] hover:bg-[var(--t-surface)]"
              title="Qué columnas de impuestos hay y qué texto cae en cada una"
            >
              Desglose de impuestos ({data.desglose.length})
            </button>
            <button
              onClick={descargar}
              disabled={visibles.length === 0}
              className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border)] hover:bg-[var(--t-surface)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Descargar
            </button>
            <button
              onClick={onCerrar}
              className="px-2 py-1 text-[13px] hover:bg-[var(--t-surface)]"
              title="Cerrar (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Este modal es de MOVIMIENTOS. Apertura / créditos / débitos / cierre
            se sacaron (user, 2026-08-18: «es texto al pedo»): son los saldos del
            día, ya se ven en la grilla del consolidado, y repetirlos acá no
            ayuda a leer una lista de movimientos. Queda lo que SÍ habla de esta
            lista: cuántos son y cuánto de eso es gasto bancario. */}
        {/* ⚠️ La JERARQUÍA es el punto de este bloque: GASTOS BANCARIOS es el
            TOTAL y todo lo que sigue son sus PARTES. Sin esa distinción visual,
            nueve números en una fila se leen como nueve totales — y alguien
            termina sumando el total con sus propios componentes.

            Lo dice de tres formas a la vez: el total va más grande, tiene su
            propio bloque, y una LÍNEA VERTICAL lo separa del desglose. Después,
            «= suma de» arriba de las partes lo deja explícito.

            Todos los valores se copian con un clic (mismo gesto que las celdas
            de la tabla): estos números se pegan en otros sistemas todo el día. */}
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] flex flex-wrap items-stretch gap-4">
          <div className="pr-4 border-r-2 border-[var(--t-border-2)] flex items-center">
            <Dato
              label="Gastos bancarios"
              valor={plata(r.gastos, mon)}
              copiar={plata(r.gastos)}
              onAuditar={() => auditar("__total")}
              activo={filtro === "__total"}
              fuerte
            />
          </div>

          <div className="flex flex-col justify-center gap-1">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
              = suma de
            </span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {data.desglose.map((b) => (
                <Dato
                  key={b.clave}
                  label={b.etiqueta}
                  valor={plata(r.gastos_desglose?.[b.clave] ?? null)}
                  copiar={plata(r.gastos_desglose?.[b.clave] ?? null)}
                  onAuditar={() => auditar(b.clave)}
                  activo={filtro === b.clave}
                  chico
                />
              ))}
              {/* Gasto que no cayó en ningún balde. OTROS IMP son SOLO las 4
                  descripciones declaradas, así que puede quedar algo afuera —
                  y eso hay que verlo, no esconderlo adentro de otra celda.
                  Aparece únicamente cuando no es cero. */}
              {!!r.gastos_desglose?.resto && (
                <Dato
                  label="Movimientos restantes"
                  valor={plata(r.gastos_desglose.resto)}
                  copiar={plata(r.gastos_desglose.resto)}
                  onAuditar={() => auditar("resto")}
                  activo={filtro === "resto"}
                  clase="text-[var(--t-accent)]"
                  chico
                />
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Las dos alertas de conciliación las calcula el BACKEND. */}
            {dia?.cierra === false && (
              <span className="px-2 py-0.5 text-[10px] uppercase bg-[var(--t-tint-red)] text-[var(--t-neg)]">
                No cierra · {plata(dia.diferencia)}
              </span>
            )}
            {r.dias_incompletos.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] uppercase bg-[var(--t-tint-amber)] text-[var(--t-accent)]">
                Incompleto · el banco declara {dia?.movimientos_banco}
              </span>
            )}
          </div>
        </div>

        <ErrorLinea error={err ?? error} />

        {filtro && (
          <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex flex-wrap items-center gap-3 text-[11px]">
            <span className="uppercase tracking-wide text-[var(--t-text-dim)]">
              Mostrando
            </span>
            <span className="font-semibold">{etiquetaFiltro}</span>
            <span className="text-[var(--t-text-dim)]">
              {visibles.length} movimiento(s)
            </span>
            {/* La suma de las filas que se están viendo. Si no coincide con el
                número del desglose, el detalle y el total se contradicen. */}
            <span className="tabular-nums font-semibold">{plata(sumaVisible, mon)}</span>
            {ignoradosVisibles > 0 && (
              <span className="text-[var(--t-text-muted)]">
                ({ignoradosVisibles} ignorado(s), fuera de la suma)
              </span>
            )}
            <button
              onClick={() => setFiltro(null)}
              className="ml-auto px-2 py-0.5 border border-[var(--t-border)] hover:bg-[var(--t-surface)] uppercase text-[10px]"
            >
              Ver todos
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr className="border-b border-[var(--t-border-2)]">
                {/* ⚠️ `w-full` en DESCRIPCIÓN: en una tabla de ancho
                    automático, la columna que lo lleva se queda con TODO el
                    sobrante y las demás se ajustan a su contenido. Es el mismo
                    truco que hizo entrar entera la columna CUENTA del
                    consolidado. Sin esto, con 10 columnas el reparto es parejo,
                    la descripción queda angosta y el texto —que es el dato más
                    largo de la fila— se lee cortado. */}
                <Th className="whitespace-nowrap">Fecha</Th>
                <Th className="w-full">Descripción</Th>
                <Th center className={COL_SEP}>Concepto</Th>
                <Th center className={COL_SEP}>Cod op</Th>
                <Th center className={COL_SEP}>Cod op bco</Th>
                <Th center className={COL_SEP}>Comprobante</Th>
                <Th center className={COL_SEP}>Sucursal</Th>
                <Th center className={COL_SEP}>Importe</Th>
                <Th center className={COL_SEP}>Gasto</Th>
                <Th center className={COL_SEP}>Cuenta</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((m, i) => (
                // Ignorado = tachado y apagado. Se sigue viendo a propósito:
                // que la fila desaparezca esconde justamente la decisión que
                // alguien tomó sobre ella.
                <tr
                  key={`${m.fecha}-${m.extracto}-${m.correlativo}-${i}`}
                  className={`border-b border-[var(--t-border)] ${
                    m.ignorado ? "line-through opacity-45" : ""
                  }`}
                >
                  <Td copiar={m.fecha} className="whitespace-nowrap">
                    {m.fecha}
                    {/* La hora solo si el banco la informa DE VERDAD: medido,
                        `process_date` viene siempre a las 00:00:00. */}
                    {m.hora && m.hora !== "00:00:00" ? (
                      <span className="text-[var(--t-text-dim)]"> {m.hora}</span>
                    ) : null}
                  </Td>
                  {/* La descripción va ENTERA (pedido del back office,
                      2026-08-18). Si el texto igual se lee cortado, el corte lo
                      hizo el BANCO: `code_description_bank` llega truncado a
                      ~25 caracteres y con los acentos rotos. Por eso las reglas
                      y las grafías del desglose van por `contiene` sobre la raíz
                      de la palabra y nunca por `igual` sobre el texto completo. */}
                  <Td copiar={m.descripcion} className="break-words">
                    {m.descripcion}
                    {m.contraparte ? (
                      <div className="text-[10px] text-[var(--t-text-dim)]">
                        {m.contraparte}
                        {m.contraparte_cuit ? ` · ${m.contraparte_cuit}` : ""}
                      </div>
                    ) : null}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.concepto}>
                    {m.concepto || "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.codigo}>
                    {m.codigo || "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.codigo_banco}>
                    {m.codigo_banco || "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.comprobante?.toString()}>
                    {m.comprobante ?? "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.sucursal}>
                    {m.sucursal || "—"}
                  </Td>
                  <Td
                    center
                    strong
                    className={`${COL_SEP} ${
                      m.tipo === "C" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                    }`}
                    copiar={plata(m.importe)}
                  >
                    {m.tipo === "D" ? "−" : "+"}
                    {plata(m.importe)}
                  </Td>
                  <CeldaGasto
                    mov={m}
                    editable={data.puede_escribir}
                    onMarcar={marcar}
                  />
                  <CeldaIgnorar
                    mov={m}
                    editable={data.puede_escribir}
                    onIgnorar={ignorar}
                  />
                </tr>
              ))}
              {/* Los MANUALES van en la misma tabla, abajo y marcados: son
                  parte del saldo de esa cuenta ese día, así que esconderlos en
                  otro panel obligaría a sumar dos listas para entender el
                  cierre. No entran al filtro del auditor —no son gastos que
                  cobró el banco— y por eso se dibujan siempre. */}
              {data.manuales.map((m) => (
                <tr key={`man-${m.id}`} className="border-b border-[var(--t-border-2)] bg-[var(--t-surface)]">
                  <Td className="whitespace-nowrap">{m.fecha}</Td>
                  <Td colSpan={6}>
                    {m.descripcion}
                    <span className="ml-2 px-1 text-[9px] uppercase border border-[var(--t-border-2)] text-[var(--t-text-muted)]">
                      manual
                    </span>
                    <span className="ml-1 text-[10px] text-[var(--t-text-dim)]">
                      {m.por} {m.hora}
                    </span>
                  </Td>
                  <Td center strong className={`${COL_SEP} ${
                    m.tipo === "C" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                  }`} copiar={plata(m.importe)}>
                    {m.tipo === "D" ? "−" : "+"}{plata(m.importe)}
                  </Td>
                  <Td colSpan={2} className={COL_SEP} />
                </tr>
              ))}
              {visibles.length === 0 && data.manuales.length === 0
                && <Vacia cols={10} hubo={lastAt > 0} />}
            </tbody>
          </table>
        </div>
      </div>

      {reglasAbierto && (
        <ModalReglas
          reglas={data.reglas}
          editable={data.puede_escribir}
          onCambio={recargar}
          onCerrar={() => setReglasAbierto(false)}
        />
      )}

      {desgloseAbierto && (
        <ModalDesglose
          baldes={data.desglose}
          totales={r.gastos_desglose ?? null}
          moneda={mon}
          editable={data.puede_escribir}
          onCambio={recargar}
          onCerrar={() => setDesgloseAbierto(false)}
        />
      )}
    </div>
  );
}

/* ── GASTOS BANCARIOS ───────────────────────────────────────────────────── */

/**
 * La celda SÍ/NO de un movimiento. Un clic la cambia — mismo gesto que el estado
 * de un cheque en Tesorería: sin abrir nada, sin confirmar.
 *
 * ⚠️ Muestra de DÓNDE salió la marca, y eso no es decorativo:
 *   · sin subrayado = lo clasificó una REGLA (nadie tuvo que hacer nada);
 *   · subrayado     = lo marcó una PERSONA a mano.
 * Si el equipo ve una columna llena de subrayados repitiéndose todos los días,
 * eso no es trabajo manual bien hecho: es una regla que falta.
 *
 * El tercer estado (VOLVER A LA REGLA) existe para poder deshacer: sin él,
 * arreglar una marca equivocada obligaría a adivinar qué decía la regla y marcar
 * el opuesto a mano, congelando para siempre algo que la regla ya resolvía.
 */
function CeldaGasto({
  mov, editable, onMarcar,
}: {
  mov: Movimiento;
  editable: boolean;
  onMarcar: (m: Movimiento, v: boolean | null) => void;
}) {
  const manual = mov.gasto_origen === "manual";
  const si = !!mov.es_gasto;

  if (!editable) {
    return (
      <Td center className={COL_SEP}>
        <span className={si ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"}>
          {si ? "SÍ" : "no"}
        </span>
      </Td>
    );
  }

  return (
    <td className={`px-2 py-1 text-center ${COL_SEP}`}>
      <button
        onClick={() => onMarcar(mov, !si)}
        title={manual ? "Marcado a mano · clic para cambiar" : "Lo clasificó una regla · clic para cambiar"}
        className={`px-1.5 py-0.5 text-[11px] hover:bg-[var(--t-surface)] ${
          si ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-text-dim)]"
        } ${manual ? "underline decoration-dotted underline-offset-2" : ""}`}
      >
        {si ? "SÍ" : "no"}
      </button>
      {manual && (
        <button
          onClick={() => onMarcar(mov, null)}
          title="Volver al criterio de las reglas"
          className="ml-1 text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
        >
          ↺
        </button>
      )}
    </td>
  );
}

/**
 * IGNORAR un movimiento. Es OTRA pregunta que la columna GASTO:
 *   · GASTO   dice QUÉ ES el movimiento (lo cobró el banco o no).
 *   · IGNORAR dice SI CUENTA (esta fila no tiene que sumar).
 * Por eso son dos columnas y no una: un duplicado del banco sigue siendo un
 * gasto — lo que no es, es dos gastos.
 *
 * La fila NO se borra nunca. Se tacha y queda con su observación (quién y
 * cuándo), igual que el destildado por celda de Tesorería: el extracto del
 * banco sigue teniendo esa línea, y una vista que la esconda deja de poder
 * conciliarse contra él.
 */
function CeldaIgnorar({
  mov, editable, onIgnorar,
}: {
  mov: Movimiento;
  editable: boolean;
  onIgnorar: (m: Movimiento) => void;
}) {
  const fuera = !!mov.ignorado;
  // La observación completa vive en el tooltip: en la celda ocuparía media
  // tabla, pero sin ella «no cuenta» es una decisión sin autor.
  const detalle = fuera
    ? `Ignorado${mov.ignorado_por ? ` por ${mov.ignorado_por}` : ""}`
      + `${mov.ignorado_at ? ` · ${mov.ignorado_at.slice(0, 16).replace("T", " ")}` : ""}`
      + `${mov.ignorado_motivo ? ` · ${mov.ignorado_motivo}` : ""}`
    : "Cuenta en los totales";

  if (!editable) {
    return (
      <Td center className={COL_SEP}>
        <span
          title={detalle}
          className={fuera ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}
        >
          {fuera ? "NO CUENTA" : "cuenta"}
        </span>
      </Td>
    );
  }

  return (
    <td className={`px-2 py-1 text-center ${COL_SEP}`}>
      <button
        onClick={() => onIgnorar(mov)}
        title={`${detalle} · clic para ${fuera ? "volver a contarlo" : "ignorarlo"}`}
        className={`px-1.5 py-0.5 text-[11px] no-underline hover:bg-[var(--t-surface)] ${
          fuera
            ? "text-[var(--t-neg)] font-semibold"
            : "text-[var(--t-text-dim)]"
        }`}
      >
        {fuera ? "NO CUENTA" : "cuenta"}
      </button>
    </td>
  );
}

/** Los inputs de los dos modales. Con `--t-border-2` (el borde FUERTE): en modo
 *  oscuro el borde principal es casi del color del panel y un input sin marco no
 *  se ve que es un input. */
const INPUT = "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 "
  + "text-[12px] outline-none";

const CAMPOS: Record<string, string> = {
  codigo_ib: "Cod op",
  codigo_banco: "Cod op bco",
  descripcion_banco: "Descripción",
  descripcion_ib: "Concepto",
};

/**
 * El catálogo de reglas. Es el CONOCIMIENTO durable: una regla acá vale para
 * todos los bancos y para todos los días, y es lo que hace que mañana no haya
 * que marcar nada a mano.
 *
 * La validación REAL vive en el backend (`crear_regla` valida campo y operador
 * contra las constantes del service). Esto es solo la UI.
 */
/**
 * ABM del DESGLOSE: qué columnas hay y qué texto cae en cada una.
 *
 * ⚠️ Por qué existe esta pantalla. Hasta el 2026-08-18 los baldes eran una
 * constante en el código: cuando aparecía un impuesto que ninguna columna
 * agarraba, la única salida era pedir un cambio y esperar un deploy. Pero el que
 * sabe que el Banco X escribe `LEY25413DB` donde el Y dice `IMP.DB/CR BANCARIOS
 * P/DEB` es el back office. Ahora lo cargan ellos y el número se mueve en el
 * próximo poll, porque el desglose se DERIVA en la lectura y no se materializa.
 *
 * Una fila = una columna del desglose. Sus TEXTOS QUE SUMAN son las formas en
 * que llega ese mismo concepto según el banco: agregar uno es el 90% del uso, y
 * por eso el alta sale INLINE en la misma fila. Si el formulario apareciera
 * abajo, cada apertura estiraría el modal y el resto de las columnas se irían de
 * la pantalla.
 *
 * ⚠️ **Toda la explicación vive en el «?» del título, no en un párrafo.** La
 * versión anterior arrancaba con cinco renglones de prosa que nadie leía y que
 * empujaban la tabla fuera de la vista. Lo que hay que saber sigue estando —
 * CONTIENE vs EXACTO (con `contiene`, «IVA» se come «IVAPERCEP»: el total daría
 * bien y dos columnas quedarían mal) y que el # decide los empates — pero se pide.
 *
 * ⚠️ Los bordes van con `--t-border-2` y no con `--t-border`: en modo OSCURO el
 * borde principal (#1a1a1a) sobre el panel (#080808) no se ve, y la tabla se leía
 * como un bloque de texto sin delimitar.
 *
 * Al lado de cada columna va su TOTAL DEL DÍA: después de agregar un texto se ve
 * el número moverse sin salir de acá, que es la forma de comprobar que agarró.
 */
function ModalDesglose({
  baldes, totales, moneda, editable, onCambio, onCerrar,
}: {
  baldes: Balde[];
  totales: Desglose | null;
  moneda: string;
  editable: boolean;
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Qué columna está abierta para sumarle un texto. Una a la vez, y el formulario
  // sale DENTRO de su misma fila: si apareciera abajo, cada apertura estiraría el
  // modal hacia abajo y el resto de las columnas se irían de la pantalla.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [campo, setCampo] = useState("descripcion_banco");
  const [operador, setOperador] = useState("contiene");
  const [valor, setValor] = useState("");
  const [nueva, setNueva] = useState("");
  const [nuevaGrupo, setNuevaGrupo] = useState<"concepto" | "otros">("otros");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  async function pegar(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/back-office/interbanking${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo guardar.");
      return false;
    }
    onCambio();
    return true;
  }

  async function agregarTexto(balde: string) {
    if (!valor.trim()) { setErr("Escribí el texto que llega en el movimiento."); return; }
    if (await pegar("/gastos/desglose/matchers", "POST",
                    { balde, campo, operador, valor })) {
      setValor("");
    }
  }

  /** Sube o baja una columna. Se manda la lista COMPLETA en el orden nuevo: media
   *  lista dejaría unas columnas con el orden viejo y otras con el nuevo, o sea
   *  empates silenciosos. */
  async function mover(clave: string, delta: number) {
    const orden = baldes.map((b) => b.clave);
    const i = orden.indexOf(clave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= orden.length) return;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    await pegar("/gastos/desglose/orden", "POST", { claves: orden });
  }

  async function nuevaColumna() {
    if (!nueva.trim()) { setErr("Poné cómo se llama la columna."); return; }
    // Va al final: mover el orden es una decisión aparte, y una columna nueva que
    // se cuele antes cambiaría dónde caen movimientos que hoy ya están bien.
    const orden = Math.max(0, ...baldes.map((b) => b.orden)) + 10;
    if (await pegar("/gastos/desglose", "POST",
                    { etiqueta: nueva, grupo: nuevaGrupo, orden })) {
      setNueva("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[1100px] max-h-[85vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex items-center gap-2">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Desglose para contabilizar Impuestos
          </span>
          {/* Toda la explicación vive ACÁ y no en un párrafo: la pantalla se lee
              sola y el que necesita el detalle lo pide. Un modal que arranca con
              cinco renglones de prosa se cierra sin leer. */}
          <Ayuda texto={
            "Cada columna suma los movimientos cuyo texto coincida.\n\n"
            + "⊃ CONTIENE — para texto que llega cortado o con cola.\n"
            + "= EXACTO — cuando un valor es principio de otro: con «contiene», "
            + "IVA se comería IVAPERCEP (el total daría bien y dos columnas "
            + "quedarían mal).\n\n"
            + "ORDEN: gana la PRIMERA columna que coincide. Si dos se pisan, "
            + "subí la que tiene que ganar con ▲.\n"
            + "Ejemplo real: un banco manda «IVA PERCEPCION RESOL GRAL» con el "
            + "concepto en IVA. Se arregla subiendo IVAPERCEP arriba de IVA y "
            + "dándole un texto por DESCRIPCIÓN — el IVA común sigue cayendo en "
            + "IVA, porque ese texto no lo agarra.\n\n"
            + "Lo que no cae en ninguna aparece como MOVIMIENTOS RESTANTES: ahí "
            + "se ve qué falta.\n\n"
            + "Esto no suma ni resta plata: parte el total que ya está."
          } />
          <button
            onClick={onCerrar}
            className="ml-auto px-2 py-1 hover:bg-[var(--t-surface)]"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        {err && (
          <div className="shrink-0 px-3 py-1 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)]">
            {err}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            {/* ⚠️ Los bordes van con `--t-border-2` y no con `--t-border`: en modo
                OSCURO el borde principal es #1a1a1a sobre un panel #080808 y las
                filas quedan sin delimitar — se lee como un bloque de texto. El
                borde fuerte se ve en los dos temas. */}
            <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr className="border-b border-[var(--t-border-2)]">
                <th className="px-2 py-1.5 font-normal text-center w-[50px]" title="Orden en que se evalúan. Gana la PRIMERA que coincide, así que si dos columnas se pisan, subí la que tiene que ganar.">Orden</th>
                <th className="px-2 py-1.5 font-normal text-left whitespace-nowrap">Columna</th>
                <th className="px-2 py-1.5 font-normal text-left whitespace-nowrap border-l border-[var(--t-border-2)]">Dónde se muestra</th>
                <th className="px-2 py-1.5 font-normal text-right whitespace-nowrap border-l border-[var(--t-border-2)]">Total del día</th>
                <th className="px-2 py-1.5 font-normal text-left w-full border-l border-[var(--t-border-2)]">Textos que suman</th>
                <th className="px-2 py-1.5 font-normal border-l border-[var(--t-border-2)]" />
              </tr>
            </thead>
            <tbody>
              {baldes.map((b, i) => (
                <tr key={b.clave} className="border-b border-[var(--t-border-2)] align-top">
                  {/* El ORDEN se mueve desde acá. No es cosmético: es lo
                      ÚNICO que decide los empates cuando dos columnas se pisan.
                      El caso que lo pidió: un banco manda «IVA PERCEPCION RESOL
                      GRAL» con el concepto en IVA, y como IVA se evaluaba antes
                      se lo comía. La salida no es una excepción escondida en el
                      código: es subir IVAPERCEP y darle un matcher por
                      descripción. */}
                  <td className="px-1 py-1.5 whitespace-nowrap text-[var(--t-text-muted)]">
                    {editable ? (
                      <span className="inline-flex items-center">
                        <button
                          onClick={() => mover(b.clave, -1)}
                          disabled={busy || i === 0}
                          title="Subir: esta columna se evalúa antes"
                          className="px-1 leading-none hover:text-[var(--t-text)] disabled:opacity-25"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => mover(b.clave, 1)}
                          disabled={busy || i === baldes.length - 1}
                          title="Bajar: esta columna se evalúa después"
                          className="px-1 leading-none hover:text-[var(--t-text)] disabled:opacity-25"
                        >
                          ▼
                        </button>
                      </span>
                    ) : (
                      <span className="px-2 tabular-nums">{b.orden}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{b.etiqueta}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-[var(--t-text-dim)] border-l border-[var(--t-border-2)]">
                    {b.grupo === "concepto" ? "Columna propia" : "Otros imp."}
                  </td>
                  {/* El total del día al lado de su columna: después de agregar un
                      texto se ve el número moverse sin salir de acá. Esa es la
                      comprobación de que agarró. */}
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-[var(--t-border-2)]">
                    {totales?.[b.clave] !== undefined ? plata(totales[b.clave], moneda) : "—"}
                  </td>
                  <td className="px-2 py-1.5 border-l border-[var(--t-border-2)]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {b.matchers.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 border border-[var(--t-border-2)] bg-[var(--t-surface)] px-1.5 py-0.5 text-[11px]"
                          title={`${CAMPOS[m.campo] ?? m.campo} ${m.operador === "igual" ? "exacto" : "contiene"}`}
                        >
                          <span className="text-[9px] uppercase text-[var(--t-text-muted)]">
                            {CAMPOS[m.campo] ?? m.campo}{m.operador === "igual" ? " =" : " ⊃"}
                          </span>
                          {m.valor}
                          {editable && (
                            <button
                              onClick={() => {
                                if (!window.confirm(
                                  `¿Sacar «${m.valor}» de ${b.etiqueta}?\n\n`
                                  + "Los movimientos que agarraba pasan a "
                                  + "MOVIMIENTOS RESTANTES.")) return;
                                pegar(`/gastos/desglose/matchers/${m.id}`, "DELETE");
                              }}
                              disabled={busy}
                              title="Sacar este texto de la columna"
                              className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)] disabled:opacity-40"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      ))}
                      {b.matchers.length === 0 && (
                        <span className="text-[11px] text-[var(--t-accent)]">
                          sin textos — esta columna no agarra nada
                        </span>
                      )}

                      {/* El alta, INLINE y en la misma fila. */}
                      {editable && abierto === b.clave && (
                        <>
                          <select value={campo} onChange={(e) => setCampo(e.target.value)} className={INPUT}>
                            {Object.entries(CAMPOS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                          <select
                            value={operador}
                            onChange={(e) => setOperador(e.target.value)}
                            className={INPUT}
                          >
                            <option value="contiene">contiene</option>
                            <option value="igual">exacto</option>
                          </select>
                          <input
                            autoFocus
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") agregarTexto(b.clave);
                              if (e.key === "Escape") { setAbierto(null); setValor(""); }
                            }}
                            placeholder="el texto tal como llega"
                            className={`${INPUT} w-[240px]`}
                          />
                          <button
                            onClick={() => agregarTexto(b.clave)}
                            disabled={busy}
                            className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40"
                          >
                            Guardar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right border-l border-[var(--t-border-2)]">
                    {editable && (
                      <>
                        <button
                          onClick={() => {
                            setAbierto(abierto === b.clave ? null : b.clave);
                            setValor(""); setErr(null);
                          }}
                          className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
                        >
                          {abierto === b.clave ? "Cancelar" : "Agregar"}
                        </button>
                        {/* ⚠️ El ✕ de la COLUMNA aparece solo cuando está
                            VACÍA. Incidente 2026-08-19: se borró COM.TRANSF con
                            sus tres textos de un clic y no se pudieron
                            recuperar. Una columna cargada se desarma sacándole
                            los textos de a uno —cada uno queda auditado— y
                            recién ahí se puede borrar: el gesto destructivo se
                            vuelve deliberado en vez de instantáneo. El backend
                            lo exige igual; esto es que no se pueda ni intentar. */}
                        {b.matchers.length === 0 && (
                          <button
                            onClick={() => {
                              if (!window.confirm(`¿Borrar la columna «${b.etiqueta}»?`)) return;
                              pegar(`/gastos/desglose/${b.clave}`, "DELETE");
                            }}
                            disabled={busy}
                            title="Borrar la columna. Está vacía, así que no se pierde nada."
                            className="ml-1 px-1 text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] disabled:opacity-40"
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editable && (
          <div className="shrink-0 px-3 py-2 border-t border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              Columna nueva
            </span>
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") nuevaColumna(); }}
              placeholder="cómo se llama"
              className={`${INPUT} w-[220px]`}
            />
            <select
              value={nuevaGrupo}
              onChange={(e) => setNuevaGrupo(e.target.value as "concepto" | "otros")}
              className={INPUT}
            >
              <option value="otros">adentro de OTROS IMP</option>
              <option value="concepto">columna propia en el consolidado</option>
            </select>
            <button
              onClick={nuevaColumna}
              disabled={busy}
              className="px-2 py-1 text-[11px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40"
            >
              Crear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * REPORTE FIN DE DÍA — el saldo al cierre de todas las cuentas, para pasar hacia afuera.
 *
 * ⚠️ **Una tabla POR BANCO**, no una matriz única. Se probaron las dos matrices
 * —bancos en las columnas y después bancos en las filas— y las dos fallan por lo
 * mismo: cada cuenta pertenece a UN banco, así que en una grilla común la enorme
 * mayoría de las celdas queda vacía. El resultado era una tabla larguísima o
 * anchísima **al pedo**, con el dato disperso en un mar de blanco.
 *
 * Con una tabla por banco cada una mide lo que su banco necesita —dos filas si
 * tiene dos cuentas, seis si tiene seis— y las tablas se **acomodan** una al lado
 * de la otra hasta llenar el espacio. Cero celdas vacías.
 *
 * El acomodado es un empaquetado explícito y no `columns` de CSS: así una tabla
 * **nunca se parte al medio**, que es lo que hace el flujo de CSS y lo que
 * volvería ilegible el reporte. El reparto es un **bin packing con los bancos
 * grandes primero** (ver `empaquetar`): es lo que hace que las columnas queden
 * parejas y que no aparezca una casi vacía al final.
 *
 * ⚠️ **El MODAL se ajusta al contenido, no al revés.** Ancho fijo + tablas que
 * miden lo suyo = media pantalla en blanco al costado; ancho fijo + tablas
 * estiradas para llenarlo = tablas deformadas; y escalar todo para que entrase
 * dejaba la letra ilegible. Las tres se probaron. Lo que funciona es lo simple:
 * las columnas se dimensionan por su CONTENIDO (`max-content`) y el modal toma
 * el ancho que eso pide, hasta el borde de la pantalla.
 *
 * El día es el MISMO que muestra la vista (el hábil anterior por default): el
 * reporte no elige su propia fecha, así no puede decir algo distinto de la
 * pantalla desde la que se abrió. La cabecera va en el azul de la casa con el
 * logo, UNA vez arriba de todo — este modal se muestra y se captura, no es una
 * pantalla de trabajo.
 */

/** Cuántas filas apunta a medir cada columna de tablas (título del banco + una
 *  fila por cuenta). Es un OBJETIVO para decidir en cuántas columnas se reparten
 *  los bancos, no un tope duro. */
const FILAS_OBJETIVO = 16;

/** La firma del reporte. Va chica en la barra y también adentro de la imagen: si
 *  el reporte termina reenviado tres veces, sigue diciendo de dónde salió. */
const FIRMA = "Hecho en ACAQuant";

/**
 * Reparte los bancos en columnas parejas, sin partir ninguna tabla.
 *
 * Es un **bin packing** clásico y la idea es la que propuso el back office: los
 * bancos GRANDES primero. Banco Valores tiene 9 cuentas e Industrial 5 — puestos
 * uno abajo del otro llenan una columna entera; después los chicos (Coinag 3,
 * Comafi 4, Galicia 5) rellenan los huecos que quedan.
 *
 * Al revés no funciona: si se van tomando en el orden que vienen, los chicos
 * ocupan las primeras columnas y el banco de 9 cuentas ya no entra en ninguna,
 * así que se abre una columna nueva casi vacía. Eso es lo que dejaba media
 * pantalla en blanco y una tabla afuera de la foto.
 *
 * Cada banco va a la columna que HOY está más vacía. Con eso las columnas quedan
 * parejas sin buscar el óptimo perfecto, que para 9 elementos no hace falta.
 */
function empaquetar(bancos: Banco[]): Banco[][] {
  const mide = (b: Banco) => 1 + b.cuentas.length;   // título + una fila por cuenta
  const total = bancos.reduce((a, b) => a + mide(b), 0);
  const n = Math.max(1, Math.ceil(total / FILAS_OBJETIVO));

  const cols: Banco[][] = Array.from({ length: n }, () => []);
  const alto = new Array(n).fill(0);
  // Grandes primero: es lo que hace que el reparto cierre.
  for (const b of [...bancos].sort((x, y) => mide(y) - mide(x))) {
    let i = 0;
    for (let k = 1; k < n; k++) if (alto[k] < alto[i]) i = k;
    cols[i].push(b);
    alto[i] += mide(b);
  }
  return cols.filter((c) => c.length);
}

function ModalReporte({
  bancos, fecha, onCerrar,
}: {
  bancos: Banco[]; fecha: string; onCerrar: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const columnas = useMemo(() => empaquetar(bancos), [bancos]);

  // COPIAR IMAGEN. El botón vive en la barra pero **no aparece en la imagen**, y
  // no porque se lo esconda: el reporte se DIBUJA de cero en un canvas a partir
  // de los mismos datos, así que la UI no existe para él. Ver `lib/reporte-imagen`.
  const [copia, setCopia] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);

  async function copiarImagen() {
    setCopiando(true); setCopia(null);
    const { copiarReporte } = await import("@/lib/reporte-imagen");
    const r = await copiarReporte({
      columnas: columnas.map((col) => col.map((b) => ({
        titulo: b.banco_nombre,
        filas: cuentasOrdenadas(b).map((c, i, arr) => ({
          cuenta: `${c.tipo} ${c.moneda} · ${c.numero}`,
          sub: c.etiqueta || undefined,
          // El saldo se manda YA formateado: formatearlo de nuevo del otro lado
          // es la forma de que la imagen y la pantalla digan cosas distintas.
          valor: c.saldo_cierre === null ? "—" : plata(c.saldo_cierre),
          corte: i > 0 && esArs(arr[i - 1].moneda) !== esArs(c.moneda),
        })),
      }))),
      titulo: "Reporte fin de día · saldos al cierre",
      fecha,
      firma: FIRMA,
      logoUrl: "/logo-login.png",
      archivo: `reporte-bancos-${fecha}.png`,
    });
    setCopiando(false);
    setCopia(r === "copiado" ? "Copiado · pegalo en el mail"
      : r === "descargado" ? "Tu navegador no deja copiar imágenes: se descargó"
      : "No se pudo generar la imagen");
    window.setTimeout(() => setCopia(null), 6000);
  }

  // ⚠️ El marco es CHICO a propósito —padding del fondo, del contenido y de los
  // huecos entre tablas—: cada píxel que se le da al marco se lo saca al reporte,
  // y el reporte entra por poco.
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-2"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] max-w-[97vw] max-h-[97vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-[#094293] text-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- el modal se
              captura como imagen; `next/image` mete un wrapper que complica eso */}
          <img src="/logo-login.png" alt="ACA Valores" height={24} className="h-6 w-auto" />
          <div className="h-4 w-px bg-white/25" />
          <span className="text-[12px] font-semibold tracking-wide uppercase">
            Reporte fin de día · saldos al cierre
          </span>
          <span className="text-[12px] text-white/80">{fecha}</span>
          {/* La firma va CHICA: dice de dónde salió el reporte sin competir con
              el título. Va también adentro de la imagen. */}
          <span className="text-[10px] text-white/60 tracking-normal normal-case">
            {FIRMA}
          </span>

          {copia && (
            <span className="ml-auto text-[11px] text-white/85">{copia}</span>
          )}
          <button
            onClick={copiarImagen}
            disabled={copiando || bancos.length === 0}
            className={`${copia ? "" : "ml-auto"} px-2 py-0.5 text-[11px] uppercase tracking-wide border border-white/40 text-white hover:bg-white/10 disabled:opacity-40`}
            title="Genera la imagen del reporte y la copia al portapapeles, para pegarla en un mail"
          >
            {copiando ? "Generando…" : "Copiar imagen"}
          </button>
          <button
            onClick={onCerrar}
            className="px-2 py-0.5 text-white/80 hover:text-white hover:bg-white/10"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          {/* ⚠️ GRID con `grid-auto-flow: column`, NO `flex-wrap`. Con flex, una
              columna que no entra por ancho se va a un renglón nuevo: quedaba una
              sola columna larguísima, media pantalla en blanco al lado y las
              tablas que seguían abajo del fold. Acá las columnas son hermanas por
              definición.
              Y `max-content`, NO `1fr`: estirarlas para llenar el ancho deforma
              las tablas. El ancho lo da el contenido; el modal se ajusta a él. */}
          <div
            className="inline-grid items-start gap-x-8 gap-y-5"
            style={{ gridAutoFlow: "column", gridAutoColumns: "max-content" }}
          >
            {columnas.map((col, j) => (
              // Los espacios entre tablas son GRANDES a propósito: son lo único
              // que dice que cada bloque es una tabla independiente y no la
              // continuación de la de al lado.
              <div key={j} className="flex flex-col gap-4">
                {col.map((b) => <TablaBanco key={b.banco} banco={b} />)}
              </div>
            ))}
            {bancos.length === 0 && (
              <div className="text-[var(--t-text-dim)]">No hay cuentas para ese día.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * La tabla de UN banco: su nombre como título y una fila por cuenta.
 *
 * Las cuentas van ARS primero y el resto después, con una línea más marcada en el
 * cambio de moneda: separar por moneda importa más que ordenar, porque leer
 * pesos y dólares en la misma corrida visual es el error que este formato evita.
 */
const esArs = (m: string) => (m || "").toUpperCase().startsWith("ARS");

/** Las cuentas de un banco, en el orden del reporte: ARS primero. Vive acá y no
 *  adentro de la tabla porque la IMAGEN usa exactamente el mismo orden — si cada
 *  una ordenara por su cuenta, lo que se pega en el mail podría no coincidir con
 *  lo que se está mirando. */
function cuentasOrdenadas(banco: Banco): CuentaConsolidada[] {
  const clave = (c: CuentaConsolidada) =>
    `${esArs(c.moneda) ? "0" : "1"}|${c.tipo}|${c.numero}`;
  return [...banco.cuentas].sort((a, b) => clave(a).localeCompare(clave(b)));
}

function TablaBanco({ banco }: { banco: Banco }) {
  const cuentas = useMemo(() => cuentasOrdenadas(banco), [banco]);

  return (
    <table className="border-collapse">
      <thead>
        <tr>
          <th
            colSpan={2}
            className="px-2 py-1 text-left text-[11px] uppercase tracking-wide font-semibold bg-[var(--t-surface-2)] border border-[var(--t-border-2)] whitespace-nowrap"
          >
            {banco.banco_nombre}
          </th>
        </tr>
      </thead>
      <tbody>
        {cuentas.map((c, i) => {
          // Línea más marcada donde cambia la moneda.
          const corte = i > 0 && esArs(cuentas[i - 1].moneda) !== esArs(c.moneda);
          return (
            <tr
              key={c.id}
              className={`border-x border-b border-[var(--t-border-2)] ${
                corte ? "border-t-2 border-t-[var(--t-border-2)]" : ""
              }`}
            >
              {/* Dice EXACTO lo mismo que la columna CUENTA del consolidado: si
                  dijera otra cosa, el que compara las dos pantallas tendría que
                  traducir. La etiqueta va DEBAJO del número y no al lado — a lo
                  largo, una sola cuenta ocupa media pantalla. */}
              <Td copiar={`${c.tipo} ${c.moneda} · ${c.numero}`} className="whitespace-nowrap">
                <div>
                  {c.tipo} {c.moneda} · <span className="font-semibold">{c.numero}</span>
                </div>
                {c.etiqueta ? (
                  <div className="text-[9px] text-[var(--t-text-muted)]">{c.etiqueta}</div>
                ) : null}
              </Td>
              <Td right strong className="whitespace-nowrap align-top"
                  copiar={plata(c.saldo_cierre)}>
                {c.saldo_cierre === null ? "—" : plata(c.saldo_cierre)}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type FilaDif = Cuenta & {
  cierre: number | null;
  cierre_previo: number | null;
  variacion: number | null;
  movimientos: number;
  n_movimientos: number;
  apertura: number | null;
  salto_apertura: number | null;
  sin_explicar: number | null;
  cierra: boolean | null;
  ajuste_manual: number | null;
};

type RespDif = {
  fecha: string;
  fecha_previa: string | null;
  sin_previa: boolean;
  filas: FilaDif[];
};

/**
 * DIFERENCIAS — ¿la variación del saldo está explicada por sus movimientos?
 *
 * La cuenta que tiene que dar:
 *
 *     cierre(hoy) − cierre(día anterior)  ==  Σ movimientos de hoy
 *
 * Lo que sobra es la **diferencia sin explicar**, y tiene una causa concreta que
 * el back office ya conocía: **el banco a veces registra un movimiento con fecha
 * de ANTEAYER que recién impacta en el saldo de AYER**. El movimiento queda en un
 * día que ya cerramos y el salto aparece en el otro.
 *
 * ⚠️ La propiedad que hace útil a esta pantalla: como `Σ movimientos =
 * cierre − apertura` cuando el día cierra bien, la diferencia sin explicar
 * **ES** el salto entre el cierre de un día y la apertura del siguiente — los dos
 * informados por el banco. Por eso la fila muestra las dos lecturas: el número y
 * su evidencia. La pantalla no dice solo cuánto falta: dice **dónde mirar**.
 *
 * Arranca mostrando **solo las cuentas con diferencia**, que son las que hay que
 * mirar. Una lista de 38 filas en cero esconde las 2 que importan.
 */
function ModalDiferencias({
  fecha, banco, onCerrar,
}: {
  fecha: string; banco: string; onCerrar: () => void;
}) {
  const [data, setData] = useState<RespDif | null>(null);
  const [todas, setTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await fetch(
        `/api/back-office/interbanking/diferencias?fecha=${fecha}`, { cache: "no-store" });
      if (!vivo) return;
      if (!r.ok) { setError("No se pudo calcular."); return; }
      setData(await r.json());
    })();
    return () => { vivo = false; };
  }, [fecha]);

  // El filtro por banco de la vista alcanza a esta pantalla: si estás mirando un
  // banco, el control es de ese banco.
  const filas = useMemo(() => {
    const base = (data?.filas ?? []).filter((f) => !banco || f.banco === banco);
    return todas ? base : base.filter((f) => Math.abs(f.sin_explicar ?? 0) >= 0.01);
  }, [data, banco, todas]);

  const conDif = useMemo(
    () => (data?.filas ?? []).filter((f) => Math.abs(f.sin_explicar ?? 0) >= 0.01).length,
    [data]);
  // Sin los dos cierres no hay resta posible, y eso NO es «sin diferencia»: es
  // «no sabemos». Se cuenta aparte para que no se lea como un verde.
  const sinDato = useMemo(
    () => (data?.filas ?? []).filter((f) => f.sin_explicar === null).length, [data]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[1300px] max-h-[90vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex flex-wrap items-center gap-2">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Diferencias
          </span>
          <span className="text-[var(--t-text-dim)]">
            {data?.fecha_previa ?? "…"} <span className="text-[var(--t-text-muted)]">→</span>{" "}
            <span className="text-[var(--t-accent)]">{data?.fecha ?? fecha}</span>
          </span>
          <Ayuda texto={
            "La cuenta, paso a paso:\n"
            + "1. Saldo del día − saldo del día anterior = VARIACIÓN.\n"
            + "2. La suma de los importes de los MOVIMIENTOS del día.\n"
            + "3. Variación − movimientos = DIFERENCIA. Si da cero, cierra.\n\n"
            + "Cuando no da cero, casi siempre es el banco registrando un "
            + "movimiento con fecha del día ANTERIOR que recién impacta en el "
            + "saldo de este: el movimiento queda en un día que ya cerramos y el "
            + "salto aparece en el otro. El tooltip de la DIFERENCIA muestra en "
            + "cuánto cerró el banco el día anterior y en cuánto abrió este.\n\n"
            + "El día anterior es el último que hay en la base, no T−2 de "
            + "calendario: un feriado no rompe la comparación.\n\n"
            + "Se compara contra el BANCO: los movimientos manuales no entran (se "
            + "muestran aparte)."
          } />

          {data && !data.sin_previa && (
            <span className={conDif ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"}>
              {conDif
                ? `${conDif} cuenta(s) con diferencia`
                : "Todas las cuentas cierran"}
              {sinDato > 0 && (
                <span className="text-[var(--t-accent)]"> · {sinDato} sin dato</span>
              )}
            </span>
          )}

          <button
            onClick={() => setTodas((v) => !v)}
            className="ml-auto px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
          >
            {todas ? "Solo diferencias" : "Ver todas"}
          </button>
          <button onClick={onCerrar} className="px-2 py-1 hover:bg-[var(--t-surface)]" title="Cerrar (Esc)">
            ✕
          </button>
        </div>

        <ErrorLinea error={error} />

        {data?.sin_previa && (
          <div className="px-3 py-3 text-[var(--t-accent)]">
            No hay un día anterior en la base para comparar. La base retiene 3
            fechas: esto pasa el primer día, o si la ingesta viene fallando.
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              {/* Las columnas siguen EXACTAMENTE los pasos de la cuenta, en
                  orden: los dos saldos, su resta, los movimientos del día y la
                  resta final. Antes faltaba la VARIACIÓN —el «monto» del paso
                  1— y sin ella el número de la última columna había que creerlo:
                  no se podía seguir de dónde salía. */}
              <tr className="border-b border-[var(--t-border-2)]">
                <Th className="w-full">Cuenta</Th>
                <Th center className={COL_SEP}>Saldo {data?.fecha_previa ?? "anterior"}</Th>
                <Th center className={COL_SEP}>Saldo {data?.fecha ?? ""}</Th>
                <Th center className={COL_SEP}>Variación</Th>
                <Th center className={COL_SEP}>Movimientos</Th>
                <Th center className={COL_SEP}>Diferencia</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const hay = Math.abs(f.sin_explicar ?? 0) >= 0.01;
                return (
                  <tr key={f.id} className="border-b border-[var(--t-border-2)]">
                    <Td copiar={`${f.banco_nombre} ${f.tipo} ${f.moneda} ${f.numero}`}>
                      <span className="text-[var(--t-text-dim)]">{f.banco_nombre}</span>
                      {" · "}{f.tipo} {f.moneda} ·{" "}
                      <span className="font-semibold">{f.numero}</span>
                      {f.etiqueta ? (
                        <span className="text-[var(--t-text-dim)]"> · {f.etiqueta}</span>
                      ) : null}
                      {/* El otro chequeo, el de ADENTRO del día. Sirve para
                          distinguir un asiento retroactivo de un día que
                          directamente no cuadra contra sus movimientos. */}
                      {f.cierra === false && (
                        <span className="ml-2 px-1 text-[9px] uppercase bg-[var(--t-tint-red)] text-[var(--t-neg)]">
                          el día no cierra
                        </span>
                      )}
                      {f.ajuste_manual != null && (
                        <span
                          className="ml-2 px-1 text-[9px] uppercase border border-[var(--t-border-2)] text-[var(--t-text-muted)]"
                          title={`Esta cuenta tiene ${plata(f.ajuste_manual)} de ajuste manual. NO entra en esta cuenta: acá se concilia contra el banco.`}
                        >
                          ±man
                        </span>
                      )}
                    </Td>
                    <Td center className={COL_SEP} copiar={plata(f.cierre_previo)}>
                      {plata(f.cierre_previo)}
                    </Td>
                    <Td center className={COL_SEP} copiar={plata(f.cierre)}>
                      {plata(f.cierre)}
                    </Td>
                    {/* Paso 1: cuánto se movió el saldo. */}
                    <Td center className={COL_SEP} copiar={plata(f.variacion)}
                        title="Saldo del día menos saldo del día anterior">
                      {f.variacion === null ? "—" : plata(f.variacion)}
                    </Td>
                    {/* Paso 2: cuánto dicen los movimientos que se movió. */}
                    <Td center className={COL_SEP} copiar={plata(f.movimientos)}
                        title={`Suma de los ${f.n_movimientos} movimiento(s) del día`}>
                      {plata(f.movimientos)}
                    </Td>
                    {/* Paso 3: lo que sobra. Es lo único que hay que mirar. */}
                    <Td center strong className={`${COL_SEP} ${
                      f.sin_explicar === null ? "text-[var(--t-accent)]"
                        : hay ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"
                    }`} copiar={plata(f.sin_explicar)}
                        title={f.salto_apertura === null
                          ? "Variación menos movimientos."
                          : "Variación menos movimientos. El banco cerró el día "
                            + `anterior en ${plata(f.cierre_previo)} y abrió este en `
                            + `${plata(f.apertura)}: un salto de ${plata(f.salto_apertura)}.`}>
                      {f.sin_explicar === null ? "sin dato" : plata(f.sin_explicar)}
                    </Td>
                  </tr>
                );
              })}
              {data && !data.sin_previa && filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-[var(--t-pos)]">
                    Todas las cuentas cierran: la variación del saldo está explicada
                    por sus movimientos.
                  </td>
                </tr>
              )}
              {!data && !error && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-[var(--t-text-dim)]">
                    Calculando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type MovManual = {
  id: number; cuenta_id: number; cuenta: string; fecha: string | null;
  descripcion: string; importe: number | null; tipo: string | null;
  por: string | null; hora: string | null;
};

/**
 * MOVIMIENTOS Y CUENTAS MANUALES — lo que Interbanking no informa.
 *
 * Dos cosas que van juntas porque son la misma necesidad: **hay bancos de la
 * casa que no están en Interbanking y plata que el banco no reporta.**
 *
 * ⚠️ Un movimiento manual **siempre impacta el saldo al cierre** del día que se
 * le cargue. En una cuenta real se suma arriba de su extracto; en una cuenta
 * manual —donde no hay extracto ni saldo del banco— el saldo ES la suma de estos
 * movimientos. Mismo modelo que los REGISTROS MANUALES de Tesorería.
 *
 * El día NO se elige acá: es el que muestra la vista. Si el formulario tuviera su
 * propio selector, se podría cargar un ajuste en un día que no se está mirando y
 * el saldo cambiaría en una pantalla que nadie tiene abierta.
 *
 * **La moneda tampoco se elige**: cada cuenta bancaria ya es de una moneda, así
 * que preguntarla sería ofrecer la posibilidad de contradecir a la cuenta.
 *
 * Al elegir el banco, el selector de cuenta se llena solo con las cuentas de ESE
 * banco — que es lo que evita el error de cargarle un movimiento a la cuenta de
 * otro banco con número parecido.
 */
function ModalManuales({
  bancos, fecha, onCerrar,
}: {
  bancos: Banco[]; fecha: string; onCerrar: () => void;
}) {
  const [movs, setMovs] = useState<MovManual[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Alta de movimiento.
  const [banco, setBanco] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [importe, setImporte] = useState("");
  const [tipo, setTipo] = useState<"C" | "D">("D");

  // Alta de cuenta/banco manual.
  const [altaCuenta, setAltaCuenta] = useState(false);
  const [nBanco, setNBanco] = useState("");
  const [nNumero, setNNumero] = useState("");
  const [nTipo, setNTipo] = useState("CC");
  const [nMoneda, setNMoneda] = useState("ARS");
  const [nEtiqueta, setNEtiqueta] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const recargar = useCallback(async () => {
    const r = await fetch(
      `/api/back-office/interbanking/manual/movimientos?fecha=${fecha}`,
      { cache: "no-store" });
    setMovs(r.ok ? await r.json() : []);
  }, [fecha]);

  useEffect(() => { recargar(); }, [recargar]);

  // Las cuentas del banco elegido. Es lo que hace que no se pueda cargar un
  // movimiento en la cuenta de otro banco.
  const cuentas = useMemo(
    () => bancos.find((b) => b.banco === banco)?.cuentas ?? [], [bancos, banco]);

  async function pegar(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/back-office/interbanking${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo guardar.");
      return false;
    }
    await recargar();
    return true;
  }

  async function alta() {
    const monto = Number((importe || "").replace(/\./g, "").replace(",", "."));
    if (!cuentaId) { setErr("Elegí la cuenta."); return; }
    if (!Number.isFinite(monto) || !monto) { setErr("Poné un importe."); return; }
    if (await pegar("/manual/movimientos", "POST", {
      cuenta_id: Number(cuentaId), descripcion, importe: Math.abs(monto), tipo, fecha,
    })) {
      setDescripcion(""); setImporte("");
    }
  }

  async function altaCuentaManual() {
    if (await pegar("/manual/cuentas", "POST", {
      banco: nBanco, numero: nNumero, tipo: nTipo, moneda: nMoneda, etiqueta: nEtiqueta,
    })) {
      setNBanco(""); setNNumero(""); setNEtiqueta(""); setAltaCuenta(false);
      // El catálogo de cuentas lo trae el consolidado en su próximo poll: no hay
      // nada que refrescar a mano acá, y forzarlo sería una copia que se puede
      // quedar vieja.
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[1000px] max-h-[88vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex items-center gap-2">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Movimientos manuales
          </span>
          <span className="text-[var(--t-accent)]">{fecha}</span>
          <Ayuda texto={
            "Lo que el banco no informa. SIEMPRE impacta el saldo al cierre del "
            + "día que muestra la vista.\n\n"
            + "En una cuenta de Interbanking se suma arriba de su extracto. En una "
            + "cuenta manual —un banco que no está en Interbanking— el saldo ES la "
            + "suma de estos movimientos.\n\n"
            + "La moneda no se elige: cada cuenta ya es de una moneda."
          } />
          <button
            onClick={() => { setAltaCuenta((v) => !v); setErr(null); }}
            className="ml-auto px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
          >
            {altaCuenta ? "Cancelar" : "+ Cuenta manual"}
          </button>
          <button onClick={onCerrar} className="px-2 py-1 hover:bg-[var(--t-surface)]" title="Cerrar (Esc)">
            ✕
          </button>
        </div>

        {err && (
          <div className="shrink-0 px-3 py-1 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)]">
            {err}
          </div>
        )}

        {/* Alta de una cuenta que Interbanking no informa. El BANCO se escribe
            por nombre: si ya existe, la cuenta queda agrupada abajo de él; si no,
            se da de alta un banco nuevo. Con un solo formulario se resuelven las
            dos cosas, y al usuario no se le pide un "código de banco" que no
            tiene. */}
        {altaCuenta && (
          <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] flex flex-wrap items-center gap-2">
            <input value={nBanco} onChange={(e) => setNBanco(e.target.value)}
                   placeholder="banco (nuevo o existente)" className={`${INPUT} w-[220px]`} />
            <input value={nNumero} onChange={(e) => setNNumero(e.target.value)}
                   placeholder="número de cuenta" className={`${INPUT} w-[200px]`} />
            <select value={nTipo} onChange={(e) => setNTipo(e.target.value)} className={INPUT}>
              <option value="CC">CC</option>
              <option value="CA">CA</option>
            </select>
            <select value={nMoneda} onChange={(e) => setNMoneda(e.target.value)} className={INPUT}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
            <input value={nEtiqueta} onChange={(e) => setNEtiqueta(e.target.value)}
                   placeholder="etiqueta (opcional)" className={`${INPUT} flex-1 min-w-[160px]`} />
            <button onClick={altaCuentaManual} disabled={busy}
                    className="px-2 py-1 text-[11px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40">
              Crear cuenta
            </button>
          </div>
        )}

        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] flex flex-wrap items-center gap-2">
          <select
            value={banco}
            onChange={(e) => { setBanco(e.target.value); setCuentaId(""); }}
            className={`${INPUT} w-[200px]`}
          >
            <option value="">Banco…</option>
            {bancos.map((b) => (
              <option key={b.banco} value={b.banco}>{b.banco_nombre}</option>
            ))}
          </select>
          {/* Se llena solo con las cuentas del banco elegido. */}
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            disabled={!banco}
            className={`${INPUT} w-[280px] disabled:opacity-40`}
          >
            <option value="">Cuenta…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tipo} {c.moneda} · {c.numero}{c.etiqueta ? ` · ${c.etiqueta}` : ""}
              </option>
            ))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "C" | "D")}
                  className={INPUT}>
            <option value="D">Resta (−)</option>
            <option value="C">Suma (+)</option>
          </select>
          <input value={importe} onChange={(e) => setImporte(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") alta(); }}
                 placeholder="importe" className={`${INPUT} w-[130px] text-right`} />
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") alta(); }}
                 placeholder="descripción" className={`${INPUT} flex-1 min-w-[200px]`} />
          <button onClick={alta} disabled={busy}
                  className="px-2 py-1 text-[11px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40">
            Registrar
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr className="border-b border-[var(--t-border-2)]">
                <Th>Cuenta</Th>
                <Th className="w-full">Descripción</Th>
                <Th center className={COL_SEP}>Importe</Th>
                <Th center className={COL_SEP}>Cargado</Th>
                <Th className={COL_SEP} />
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id} className="border-b border-[var(--t-border-2)]">
                  <Td copiar={m.cuenta} className="whitespace-nowrap">{m.cuenta}</Td>
                  <Td copiar={m.descripcion}>{m.descripcion}</Td>
                  <Td center strong className={`${COL_SEP} whitespace-nowrap ${
                    m.tipo === "C" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                  }`} copiar={plata(m.importe)}>
                    {m.tipo === "D" ? "−" : "+"}{plata(m.importe)}
                  </Td>
                  <Td center className={`${COL_SEP} whitespace-nowrap text-[var(--t-text-dim)]`}>
                    {m.por} {m.hora}
                  </Td>
                  <td className={`px-2 py-1 text-right ${COL_SEP}`}>
                    <button
                      onClick={() => pegar(`/manual/movimientos/${m.id}`, "DELETE")}
                      disabled={busy}
                      title="Borrar el movimiento. El saldo al cierre vuelve atrás."
                      className="px-1 text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {movs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-[var(--t-text-dim)]">
                    No hay movimientos manuales cargados en {fecha}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type Pendiente = {
  id: number; cuenta_id: number; cuenta: string; moneda: string;
  fecha: string | null;
  accion: "falta_en_el_mayor" | "sobra_en_el_mayor";
  descripcion: string; importe: number; diferencia: number | null;
  nota: string | null; por: string | null; at: string | null;
  resuelto: boolean; resuelto_por: string | null; resuelto_at: string | null;
};

/**
 * MOVIMIENTOS A CONCILIAR — lo que se confirmó que hay que arreglar.
 *
 * ⚠️ Por qué existe: CONCILIAR encuentra el movimiento que explica la
 * diferencia, pero **el arreglo se hace en OTRO sistema (HYGIRUS) y en otro
 * momento**. Sin anotarlo, la próxima conciliación vuelve a encontrar lo mismo y
 * nadie sabe si ya se corrigió — así es como un hallazgo se convierte en trabajo
 * repetido.
 *
 * Cada fila dice **qué hacer**, no qué se detectó:
 *   · FALTA EN EL MAYOR → cargarlo en HYGIRUS;
 *   · SOBRA EN EL MAYOR → sacarlo de HYGIRUS.
 *
 * Y la **descripción va tal como viene de SU lado**: si sobra en el mayor, como
 * la escribe HYGIRUS (`[Op. 1131723] Extracción…`); si falta, como la escribe el
 * banco (`CREDITO POR DATANET`). Es lo que la hace encontrable en el sistema
 * donde hay que ir a arreglarla — traducirla sería obligar a buscar a ciegas.
 *
 * **Sin filtro de fecha**: un pendiente puede tardar días en resolverse, y
 * esconderlo al día siguiente sería perder justo lo que se quiso anotar. Lo
 * resuelto se marca, no se borra: es la traza de qué se corrigió y quién.
 */
function ModalPendientes({
  puedeEscribir, onCerrar,
}: {
  puedeEscribir: boolean; onCerrar: () => void;
}) {
  const [filas, setFilas] = useState<Pendiente[]>([]);
  const [verResueltos, setVerResueltos] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const recargar = useCallback(async () => {
    const r = await fetch(
      `/api/back-office/interbanking/conciliar/pendientes?incluir_resueltos=${verResueltos}`,
      { cache: "no-store" });
    setFilas(r.ok ? await r.json() : []);
  }, [verResueltos]);

  useEffect(() => { recargar(); }, [recargar]);

  async function pegar(url: string, method: string, body?: unknown) {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/back-office/interbanking${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).detail ?? "No se pudo guardar.");
      return;
    }
    await recargar();
  }

  const abiertos = filas.filter((f) => !f.resuelto).length;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[1400px] max-h-[90vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex flex-wrap items-center gap-2">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Movimientos a conciliar
          </span>
          <span className={abiertos ? "text-[var(--t-accent)]" : "text-[var(--t-pos)]"}>
            {abiertos ? `${abiertos} sin arreglar` : "nada pendiente"}
          </span>
          <Ayuda texto={
            "Lo que se confirmó en CONCILIAR y hay que arreglar en el sistema "
            + "contable.\n\n"
            + "FALTA EN EL MAYOR → cargarlo en HYGIRUS.\n"
            + "SOBRA EN EL MAYOR → sacarlo de HYGIRUS.\n\n"
            + "La descripción está tal como viene de SU lado, para que se pueda "
            + "buscar igual en el sistema donde hay que arreglarla.\n\n"
            + "No se filtra por fecha: un pendiente puede tardar días. Lo "
            + "resuelto se marca y queda como traza, no se borra."
          } />
          <button
            onClick={() => setVerResueltos((v) => !v)}
            className="ml-auto px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
          >
            {verResueltos ? "Solo pendientes" : "Ver arreglados"}
          </button>
          <button onClick={onCerrar} className="px-2 py-1 hover:bg-[var(--t-surface)]" title="Cerrar (Esc)">
            ✕
          </button>
        </div>

        <ErrorLinea error={err} />

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr className="border-b border-[var(--t-border-2)]">
                <Th>Día</Th>
                <Th className={COL_SEP}>Cuenta</Th>
                <Th className={COL_SEP}>Qué hacer</Th>
                <Th className={`w-full ${COL_SEP}`}>Movimiento</Th>
                <Th center className={COL_SEP}>Importe</Th>
                <Th center className={COL_SEP}>Confirmó</Th>
                <Th className={COL_SEP} />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.id}
                  className={`border-b border-[var(--t-border-2)] ${
                    f.resuelto ? "line-through opacity-45" : ""
                  }`}
                >
                  <Td className="whitespace-nowrap">{f.fecha}</Td>
                  <Td className={`${COL_SEP} whitespace-nowrap`} copiar={f.cuenta}>
                    {f.cuenta}
                  </Td>
                  {/* La ACCIÓN, no el diagnóstico. */}
                  <Td className={`${COL_SEP} whitespace-nowrap`}>
                    <span className={`px-1 text-[10px] uppercase no-underline ${
                      f.accion === "falta_en_el_mayor"
                        ? "bg-[var(--t-tint-red)] text-[var(--t-neg)]"
                        : "bg-[var(--t-tint-amber)] text-[var(--t-accent)]"
                    }`}>
                      {f.accion === "falta_en_el_mayor" ? "cargar en el mayor"
                                                        : "sacar del mayor"}
                    </span>
                  </Td>
                  {/* Tal como viene de SU lado: así se busca igual en el otro
                      sistema. */}
                  <Td className={COL_SEP} copiar={f.descripcion}>{f.descripcion}</Td>
                  <Td center strong className={`${COL_SEP} whitespace-nowrap ${
                    f.importe < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"
                  }`} copiar={plata(f.importe)}>
                    {plata(f.importe, f.moneda)}
                  </Td>
                  <Td center className={`${COL_SEP} whitespace-nowrap text-[var(--t-text-dim)]`}>
                    {f.por}
                    {f.resuelto && f.resuelto_por && (
                      <div className="text-[10px]">arregló {f.resuelto_por}</div>
                    )}
                  </Td>
                  <td className={`px-2 py-1 text-right whitespace-nowrap ${COL_SEP}`}>
                    {puedeEscribir && (
                      <>
                        <button
                          onClick={() => pegar(`/conciliar/pendientes/${f.id}`, "PUT",
                                               { resuelto: !f.resuelto })}
                          disabled={busy}
                          className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40 no-underline"
                        >
                          {f.resuelto ? "Reabrir" : "Ya lo arreglé"}
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm("¿Borrar este pendiente? Usalo solo si se confirmó por error — lo ya arreglado se marca, no se borra.")) return;
                            pegar(`/conciliar/pendientes/${f.id}`, "DELETE");
                          }}
                          disabled={busy}
                          title="Confirmado por error"
                          className="ml-1 px-1 text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] disabled:opacity-40 no-underline"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-[var(--t-text-dim)]">
                    Nada confirmado todavía. Se anota desde CONCILIAR, con el botón
                    «Confirmar» de cada explicación.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── CONCILIAR contra el mayor del sistema contable ──────────────────────── */

/** Una fila del TABLERO: una cuenta bancaria con su mayor del día. */
type FilaTablero = {
  id: number; banco: string; banco_nombre: string; tipo: string; moneda: string;
  etiqueta: string; numero: string; manual: boolean;
  tiene_mayor: boolean; codigo_contable: string | null;
  saldo_inicio: number | null; saldo_inicio_fuente: string | null;
  gastos: number | null; debe: number; haber: number; movimientos_mayor: number;
  saldo_final: number | null; cierre_banco: number | null; ajuste_manual: number;
  diferencia: number | null; concilia: boolean | null;
  dif_sin_gastos: number | null; motivo: string | null;
};

type RespTablero = {
  fecha: string; fecha_apertura: string; filas: FilaTablero[];
  sin_mayor: number;
  mayor_sync: { corrida_at: string; movimientos_banco: number; ok: boolean } | null;
};

/**
 * TABLERO: todas las cuentas de un vistazo, sin subir ningún archivo.
 *
 * El mayor lo trae `jobs/mayor_sync` de la API de contabilidad y vive en
 * `bancos.mayor_movimientos`, así que acá solo se pinta. Reemplaza al flujo de
 * exportar el .xlsx de HYGIRUS cuenta por cuenta, que sigue existiendo en la otra
 * pestaña — es el único camino para una cuenta que todavía no está mapeada.
 *
 * ⚠️ **La DIFERENCIA es contra el cierre del BANCO**, no contra el saldo inicial.
 * `saldo_final − saldo_inicio` se simplifica a `debe + haber`: los dos términos
 * salen del mayor y no podría mostrar un descuadre ni queriendo.
 *
 * ⚠️ **Los GASTOS no entran en ningún total.** Si sumaran al saldo final, se
 * contarían dos veces el día que el equipo los cargue en el mayor. La columna
 * propia se sacó (era informativa y ensuciaba la grilla): queda solo
 * `dif_sin_gastos`, que viene en `null` cuando ya no hay diferencia —el gasto se
 * calcula de los movimientos del BANCO y sigue valiendo lo mismo esté o no
 * cargado del otro lado, así que seguir restándolo publicaría un número que no
 * existe.
 */
function TableroConciliacion({ fecha, onAbrirCuenta }: {
  fecha: string; onAbrirCuenta: (f: FilaTablero) => void;
}) {
  const [data, setData] = useState<RespTablero | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [soloDif, setSoloDif] = useState(false);
  useEffect(() => {
    let vivo = true;
    setData(null); setErr(null);
    fetch(`/api/back-office/interbanking/conciliar/tablero?fecha=${fecha}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "");
        return r.json();
      })
      .then((j) => { if (vivo) setData(j); })
      .catch(() => { if (vivo) setErr("No pude traer el tablero."); });
    return () => { vivo = false; };
  }, [fecha]);

  const filas = useMemo(() => {
    if (!data) return [];
    // SOLO las que tienen diferencia de verdad. Las que no se pudieron comparar
    // se veían acá y llenaban el filtro de filas con «—» (8 de 13 en la primera
    // corrida real), que es lo contrario de lo que el filtro promete. No quedan
    // escondidas: el contador «N sin comparar» de la barra las sigue cantando.
    return soloDif
      ? data.filas.filter((f) => f.concilia === false)
      : data.filas;
  }, [data, soloDif]);

  if (err) return <ErrorLinea error={err} />;
  if (!data) {
    return <div className="px-3 py-6 text-[var(--t-text-dim)]">Cargando el tablero…</div>;
  }

  const conDif = data.filas.filter((f) => f.concilia === false).length;
  const sinDato = data.filas.filter((f) => f.motivo).length;
  // Cada columna es de un día distinto y eso NO se deduce mirando los números:
  // el saldo inicial es el cierre del banco de AYER y todo lo demás es de hoy.
  const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const dApertura = ddmm(data.fecha_apertura);
  const dDia = ddmm(data.fecha);

  return (
    <div className="flex flex-col">
      {/* Cuándo se trajo el mayor. NO es decorativo: entre dos corridas del
          mismo día una cuenta se movió 2.008 millones, así que una diferencia
          grande puede ser simplemente que Contabilidad no terminó de cargar.
          El resto del contexto (qué día es cada columna) vive en los
          encabezados: repetirlo acá en prosa confundía más que ayudar. */}
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border-2)] flex flex-wrap items-center gap-3 text-[11px]">
        <span className="text-[var(--t-text-dim)]">
          Mayor:{" "}
          {data.mayor_sync ? (
            <span className="text-[var(--t-text)]">
              {new Date(data.mayor_sync.corrida_at).toLocaleString("es-AR", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
              })}
              {" · "}{data.mayor_sync.movimientos_banco} movs
            </span>
          ) : (
            <span className="text-[var(--t-warn)]">sin traer</span>
          )}
        </span>
        {conDif > 0 && (
          <span className="text-[var(--t-danger)]">{conDif} con diferencia</span>
        )}
        {sinDato > 0 && (
          <span className="text-[var(--t-warn)]">{sinDato} sin comparar</span>
        )}
        {data.sin_mayor > 0 && (
          <span className="text-[var(--t-text-muted)]">{data.sin_mayor} sin mayor</span>
        )}
        <label className="ml-auto flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={soloDif}
                 onChange={(e) => setSoloDif(e.target.checked)} />
          <span className="uppercase tracking-wide text-[10px]">Solo con diferencia</span>
        </label>
      </div>

      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10">
          <tr className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)]">
            <th className="text-left px-2 py-1 font-medium">Cuenta</th>
            {/* «cierre» y no la fecha sola: el saldo inicial de hoy ES el cierre
                de ayer, y con solo la fecha se lee como si fuera otra cosa. */}
            <ThTablero dia={`cierre ${dApertura}`} sep mayor>Saldo inicio</ThTablero>
            <ThTablero dia={dDia} sep mayor>Debe</ThTablero>
            <ThTablero dia={dDia} mayor>Haber</ThTablero>
            <ThTablero dia={dDia} sep mayor>Saldo final</ThTablero>
            <ThTablero dia={dDia}>Cierre banco</ThTablero>
            <ThTablero sep>Diferencia</ThTablero>
            <ThTablero>Dif. sin gastos</ThTablero>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}
                onClick={() => onAbrirCuenta(f)}
                title="Ver los movimientos de los dos lados y qué podría explicar la diferencia"
                className={`border-t border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface)] ${
                  f.concilia === false ? "bg-[var(--t-danger)]/5" : ""}`}>
              <td className="px-2 py-1">
                <span className={f.tiene_mayor ? "" : "text-[var(--t-text-muted)]"}>
                  {f.etiqueta || f.numero}
                </span>
                <span className="text-[var(--t-text-muted)] ml-1">
                  {f.tipo} {f.moneda}
                </span>
                {!f.tiene_mayor && (
                  <span className="ml-1 text-[9px] uppercase text-[var(--t-text-muted)]"
                        title="Esta cuenta no tiene código contable asignado: no hay mayor que comparar">
                    sin mayor
                  </span>
                )}
              </td>
              <td className={`text-right px-2 py-1 tabular-nums ${COL_SEP} ${COL_MAYOR}`}
                  title={f.saldo_inicio_fuente ?? undefined}>
                {plata(f.saldo_inicio)}
              </td>
              <td className={`text-right px-2 py-1 tabular-nums ${COL_SEP} ${COL_MAYOR}`}>
                {f.movimientos_mayor ? plata(f.debe) : "—"}
              </td>
              <td className={`text-right px-2 py-1 tabular-nums ${COL_MAYOR}`}>
                {f.movimientos_mayor ? plata(f.haber) : "—"}
              </td>
              <td className={`text-right px-2 py-1 tabular-nums ${COL_SEP} ${COL_MAYOR}`}>
                {plata(f.saldo_final)}
              </td>
              <td className="text-right px-2 py-1 tabular-nums text-[var(--t-text-dim)]">
                {plata(f.cierre_banco)}
              </td>
              <td className={`text-right px-2 py-1 tabular-nums font-semibold ${COL_SEP} ${
                    f.concilia === false ? "text-[var(--t-danger)]"
                      : f.concilia ? "text-[var(--t-ok)]" : ""}`}
                  title={f.motivo ?? undefined}>
                {f.motivo ? "—" : plata(f.diferencia)}
              </td>
              <td className="text-right px-2 py-1 tabular-nums"
                  title={f.dif_sin_gastos === null && f.concilia
                    ? "Sin diferencia: no hay nada que explicar"
                    : undefined}>
                {plata(f.dif_sin_gastos)}
              </td>
            </tr>
          ))}
          {!filas.length && (
            <tr><td colSpan={8} className="px-3 py-6 text-[var(--t-text-dim)]">
              {soloDif ? "Ninguna cuenta tiene diferencia." : "No hay cuentas."}
            </td></tr>
          )}
        </tbody>
      </table>

      {sinDato > 0 && (
        <div className="px-3 py-2 text-[11px] text-[var(--t-text-dim)] border-t border-[var(--t-border-2)]">
          Las filas con «—» en DIFERENCIA no se pudieron comparar (falta el saldo
          del banco de alguno de los dos días). Pasá el mouse por encima para ver
          el motivo. <b>No son cuentas conciliadas</b>: es que no hay con qué comparar.
        </div>
      )}
    </div>
  );
}

/** Encabezado del tablero de conciliación. `dia` va debajo del rótulo porque
 *  cada columna es de un día distinto —el saldo inicial es de AYER y el resto de
 *  hoy— y sin verlo ahí mismo la grilla se lee como si todo fuera del mismo día.
 *
 *  Se llama `ThTablero` y no `Th` porque **ya hay un `Th` en este archivo** (el
 *  de las tablas de movimientos): dos declaraciones con el mismo nombre compilan
 *  en el editor pero rompen el build. */
function ThTablero({ children, dia, sep, mayor }: {
  children: React.ReactNode; dia?: string; sep?: boolean; mayor?: boolean;
}) {
  return (
    <th className={`text-right px-2 py-1 font-medium align-bottom ${sep ? COL_SEP : ""} ${
      mayor ? COL_MAYOR : ""}`}>
      <div>{children}</div>
      {dia && (
        <div className="text-[9px] normal-case text-[var(--t-text-muted)]">{dia}</div>
      )}
    </th>
  );
}

/**
 * Compara UN número contra otro: el saldo al cierre que tenemos del banco y el
 * último saldo del mayor de HYGIRUS. Si no coinciden, muestra qué movimientos
 * del día podrían explicar la diferencia.
 *
 * El usuario ELIGE banco y cuenta: no se infieren del archivo. El mayor no trae
 * CBU ni número de cuenta bancaria (verificado sobre exports reales), así que no
 * hay nada que inferir — y elegirla además fija el universo de movimientos sin
 * ambigüedad.
 *
 * ⚠️ El navegador **no interpreta el archivo**: solo lo convierte en filas y
 * columnas crudas (`readSheetGrid`) y las manda. Qué columna es el saldo, cómo
 * se lee la `D`/`A` que le da el signo y qué se compara lo decide el backend,
 * que es donde se puede testear. Si ese criterio viviera acá, cada ajuste sería
 * un deploy del front sin una sola prueba que lo respalde.
 *
 * No persiste nada: subir el archivo de nuevo recalcula y listo.
 */
/** Identidad de una explicación, para no confirmar dos veces la misma. */
function claveCand(c: Candidato) {
  return `${c.accion}|${c.suma}|${c.movimientos.map((m) => m.descripcion).join("|")}`;
}

function ModalConciliar({
  bancos, baldes, fecha, puedeEscribir, onCerrar,
}: {
  bancos: Banco[]; baldes: Balde[]; fecha: string; puedeEscribir: boolean;
  onCerrar: () => void;
}) {
  const [banco, setBanco] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  // El TABLERO es lo primero que se ve: cubre todas las cuentas sin pedir nada.
  // El archivo queda como segundo camino, que sigue siendo el único para una
  // cuenta sin `codigo_contable` asignado.
  const [modo, setModo] = useState<"tablero" | "archivo">("tablero");
  // Drill-down de una fila del tablero: el MISMO detalle que el archivo, con el
  // mayor que ya está en la base. Por eso reusa `res` y todo el bloque de abajo.
  const [detalle, setDetalle] = useState(false);
  const [res, setRes] = useState<RespConciliacion | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Detalle o consolidado por concepto. Uno solo para las dos tablas.
  const [vista, setVista] = useState<"movimientos" | "consolidado">("movimientos");
  // Qué explicaciones ya se anotaron. Se marca en la pantalla para que nadie
  // confirme dos veces lo mismo mirando la misma lista.
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});

  /** Anota la explicación en MOVIMIENTOS A CONCILIAR.
   *
   * ⚠️ Se guarda la DESCRIPCIÓN tal como viene de SU lado: si el movimiento
   * sobra en el mayor, como lo escribe HYGIRUS; si falta, como lo escribe el
   * banco. Es lo que lo hace encontrable en el sistema donde hay que ir a
   * arreglarlo — traducirlo sería obligar a buscar a ciegas.
   *
   * ⚠️ Y viaja `mov_ref` con la identidad del movimiento. Sin eso, dos
   * movimientos distintos que se escriben igual (dos `N/C - CRED REVERSO PASE E`
   * de $50.000 el mismo día) se pisaban entre sí en la base y quedaba anotado
   * uno solo, por la mitad de la diferencia. */
  async function confirmar(c: Candidato) {
    if (!cuentaId) return;
    setBusy(true); setErr(null);
    for (const m of c.movimientos) {
      const r = await fetch("/api/back-office/interbanking/conciliar/pendientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cuenta_id: Number(cuentaId), fecha, accion: c.accion,
          descripcion: m.descripcion, importe: m.importe_firmado,
          diferencia: res?.diferencia ?? null, mov_ref: m.mov_hash,
        }),
      });
      if (!r.ok) {
        setErr((await r.json().catch(() => ({}))).detail ?? "No se pudo confirmar.");
        setBusy(false);
        return;
      }
    }
    setConfirmados((p) => ({ ...p, [claveCand(c)]: true }));
    setBusy(false);
  }

  /** Drill-down: abre el detalle de UNA fila del tablero.
   *
   * Usa `GET /conciliar/cuenta`, que devuelve la MISMA respuesta que el POST con
   * archivo pero leyendo el mayor que ya está en la base — por eso reusa `res` y
   * todo el bloque de abajo sin duplicar una línea de render.
   *
   * También mueve `banco`/`cuentaId`: los selectores de arriba leen de ahí, y si
   * no se movieran, el detalle mostraría una cuenta y el encabezado otra.
   */
  const abrirCuenta = useCallback(async (f: FilaTablero) => {
    setDetalle(true);
    setBanco(f.banco);
    setCuentaId(String(f.id));
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch(
        `/api/back-office/interbanking/conciliar/cuenta?cuenta_id=${f.id}`
        + `&fecha=${encodeURIComponent(fecha)}`);
      if (!r.ok) {
        setErr((await r.json().catch(() => ({}))).detail
               ?? "No se pudo abrir el detalle de esa cuenta.");
        return;
      }
      setRes(await r.json());
    } catch {
      setErr("No se pudo abrir el detalle de esa cuenta.");
    } finally {
      setBusy(false);
    }
  }, [fecha]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const cuentas = useMemo(
    () => bancos.find((b) => b.banco === banco)?.cuentas ?? [], [bancos, banco]);

  const cuenta = useMemo(
    () => cuentas.find((c) => String(c.id) === cuentaId) ?? null, [cuentas, cuentaId]);

  const moneda = res?.cuenta?.moneda ?? cuenta?.moneda ?? "";

  async function correr() {
    if (!cuentaId) { setErr("Elegí la cuenta."); return; }
    if (!archivo) { setErr("Subí el Excel del mayor."); return; }
    setBusy(true); setErr(null); setRes(null);
    try {
      const { readSheetGrid } = await import("@/lib/xlsx-read");
      const filas = await readSheetGrid(archivo);
      const r = await fetch("/api/back-office/interbanking/conciliar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cuenta_id: Number(cuentaId), fecha, filas }),
      });
      if (!r.ok) {
        setErr((await r.json().catch(() => ({}))).detail ?? "No se pudo conciliar.");
        return;
      }
      setRes(await r.json());
    } catch {
      setErr("No pude leer el archivo. ¿Es un .xlsx o .csv?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[1600px] max-h-[92vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex items-center gap-2">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Conciliar
          </span>
          <span className="text-[var(--t-accent)]">{fecha}</span>
          <div className="flex">
            {(["tablero", "archivo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setModo(m); setDetalle(false); setRes(null); setErr(null); }}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-wide border ${
                  modo === m
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                }`}
              >
                {m === "tablero" ? "Tablero" : "Por archivo"}
              </button>
            ))}
          </div>
          <Ayuda texto={
            modo === "tablero"
              ? "Todas las cuentas de un vistazo. El mayor lo trae solo el job de "
                + "contabilidad, no hay que subir nada.\n\n"
                + "SALDO INICIO es el cierre del BANCO del día hábil anterior. "
                + "DEBE y HABER son del mayor de este día. SALDO FINAL = inicio "
                + "+ debe + haber.\n\n"
                + "DIFERENCIA = saldo final del mayor − cierre del BANCO de hoy. "
                + "Positiva: al mayor le falta registrar algo que el banco sí "
                + "tiene.\n\n"
                + "GASTOS es informativo y NO entra en ningún total — sale de la "
                + "vista principal. DIF. SIN GASTOS resta esos gastos para ver si "
                + "además hay otra cosa; cuando ya no hay diferencia muestra «—», "
                + "porque el gasto se calcula del BANCO y seguiría restándose "
                + "aunque el equipo ya lo haya cargado en el mayor.\n\n"
                + "Mirá la hora de MAYOR TRAÍDO: el día no está cerrado y "
                + "Contabilidad sigue cargando asientos durante la rueda."
              : "Compara el saldo al cierre que tenemos del banco contra el ÚLTIMO "
                + "saldo del mayor del sistema contable.\n\n"
                + "Del Excel se usa un solo número: el último saldo, que es el "
                + "vigente. El signo lo da la letra — D (deudor) es POSITIVO y "
                + "A (acreedor) es NEGATIVO.\n\n"
                + "Si hay diferencia, se busca qué combinación de movimientos del "
                + "día la suma. Son POSIBLES explicaciones: con muchos movimientos, "
                + "más de una combinación puede dar el mismo número.\n\n"
                + "No se guarda nada."
          } />
          <button
            onClick={onCerrar}
            className="ml-auto px-2 py-0.5 text-[11px] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
          >
            ✕
          </button>
        </div>

        {/* Elegir la cuenta y el archivo. */}
        {modo === "archivo" && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] flex flex-wrap items-center gap-2">
          <select
            value={banco}
            onChange={(e) => { setBanco(e.target.value); setCuentaId(""); setRes(null); }}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[11px] outline-none"
          >
            <option value="">Banco…</option>
            {bancos.map((b) => (
              <option key={b.banco} value={b.banco}>{b.banco_nombre}</option>
            ))}
          </select>
          <select
            value={cuentaId}
            onChange={(e) => { setCuentaId(e.target.value); setRes(null); }}
            disabled={!banco}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[11px] outline-none disabled:opacity-40"
          >
            <option value="">Cuenta…</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tipo} {c.moneda} · {c.numero}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setRes(null); }}
            className="text-[11px] file:mr-2 file:px-2 file:py-1 file:text-[11px] file:uppercase file:tracking-wide file:border file:border-[var(--t-border-2)] file:bg-[var(--t-surface)] file:text-[var(--t-text)]"
          />
          <button
            onClick={correr}
            disabled={busy || !cuentaId || !archivo}
            className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40"
          >
            {busy ? "Comparando…" : "Comparar"}
          </button>
          {cuenta && (
            <span className="text-[11px] text-[var(--t-text-dim)]">
              Nuestro cierre: {plata(cuenta.saldo_cierre, cuenta.moneda)}
            </span>
          )}
        </div>
        )}

        <ErrorLinea error={err} />

        <div className="flex-1 min-h-0 overflow-auto">
          {modo === "tablero" && !detalle && (
            <TableroConciliacion fecha={fecha} onAbrirCuenta={abrirCuenta} />
          )}

          {modo === "tablero" && detalle && (
            <div className="px-3 pt-2">
              <button
                onClick={() => { setDetalle(false); setRes(null); setErr(null); }}
                className="px-2 py-0.5 text-[11px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)]"
              >
                ← Volver al tablero
              </button>
              {busy && (
                <span className="ml-2 text-[11px] text-[var(--t-text-dim)]">Buscando…</span>
              )}
            </div>
          )}

          {modo === "archivo" && !res && !busy && (
            <div className="px-3 py-6 text-[var(--t-text-dim)]">
              Elegí la cuenta y subí el Excel del mayor de ESA cuenta.
              Se compara contra el día {fecha}.
            </div>
          )}

          {res && (modo === "archivo" || detalle) && (
            <div className="p-3 flex flex-col gap-3">
              {/* Los tres números. */}
              <div className="flex flex-wrap gap-4 items-end">
                <Numero
                  rotulo="Nuestro saldo (banco)"
                  valor={plata(res.saldo_nuestro, moneda)}
                  nota={res.saldo_nuestro_fuente ?? undefined}
                />
                <Numero
                  rotulo="Saldo del mayor"
                  valor={plata(res.saldo_excel, moneda)}
                  nota={res.saldo_excel_fila
                    ? `fila ${res.saldo_excel_fila}${res.saldo_excel_letra ? ` · ${res.saldo_excel_letra}` : ""}`
                    : undefined}
                />
                {/* ⚠️ El SIGNO de la diferencia ya dice qué pasó, pero leerlo
                    obliga a acordarse de la convención. Va escrito acá arriba,
                    al lado del número, y no solo abajo en cada opción: el que
                    abre el modal tiene que saber de una si el movimiento hay
                    que CARGARLO o SACARLO del mayor. */}
                <Numero
                  rotulo="Diferencia"
                  valor={plata(res.diferencia, moneda)}
                  clase={res.concilia === true
                    ? "text-[var(--t-pos)]"
                    : res.concilia === false ? "text-[var(--t-neg)]" : ""}
                  marca={res.concilia === false && res.diferencia != null
                    ? (res.diferencia > 0
                        ? { texto: "falta en el mayor · cargarlo", tono: "neg" as const }
                        : { texto: "sobra en el mayor · sacarlo", tono: "amber" as const })
                    : undefined}
                />
              </div>

              {res.concilia === true && (
                <div className="px-2 py-1.5 border border-[var(--t-pos)] text-[var(--t-pos)]">
                  Concilia: los dos saldos coinciden.
                </div>
              )}

              {res.avisos.map((a, i) => (
                <div
                  key={i}
                  className="px-2 py-1.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)]"
                >
                  {a}
                </div>
              ))}

              {/* ⚠️ Los dos detalles, UNO DE CADA LADO. Solo descripción e
                  importe: fechas y comprobantes no tienen nada en común entre el
                  banco y el mayor, así que mostrarlos invitaría a cruzarlos por
                  donde no se puede. Lo único comparable es el IMPORTE, y por eso
                  las dos columnas de números quedan alineadas a la derecha, a la
                  misma altura: el ojo hace la comparación solo. */}
              {/* ⚠️ GASTOS BANCARIOS del lado del BANCO, con el mismo bloque que
                  el modal de MOVIMIENTOS (mismo número, misma función que lo
                  deriva) porque son el caso típico de «falta en el mayor»: el
                  banco cobra la comisión y el IVA el mismo día y el sistema
                  contable los registra al mes, o no los registra. Si la
                  diferencia es del orden de este total, ya sabés por dónde
                  empezar a buscar.

                  Es un CORTE TRANSVERSAL de los mismos movimientos, no una
                  parte más: por eso NO toca ninguno de los dos totales de abajo
                  y por eso el rótulo dice de qué lado sale. */}
              {res.gastos != null && (
                <div className="px-2 py-1.5 border border-[var(--t-border-2)] bg-[var(--t-surface-2)] flex flex-wrap items-stretch gap-4">
                  <div className="pr-4 border-r-2 border-[var(--t-border-2)] flex items-center">
                    <Dato
                      label="Gastos bancarios (banco)"
                      valor={plata(res.gastos, moneda)}
                      copiar={plata(res.gastos)}
                      fuerte
                    />
                  </div>
                  <div className="flex flex-col justify-center gap-1">
                    <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                      = suma de
                    </span>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {/* Solo los baldes CON importe. Los ocho en cero al lado
                          del que sí tiene plata son ocho números que hay que
                          descartar de a uno antes de leer el que importa. */}
                      {baldes
                        .filter((b) => !!res.gastos_desglose?.[b.clave])
                        .map((b) => (
                          <Dato
                            key={b.clave}
                            label={b.etiqueta}
                            valor={plata(res.gastos_desglose?.[b.clave] ?? null)}
                            copiar={plata(res.gastos_desglose?.[b.clave] ?? null)}
                            chico
                          />
                        ))}
                      {/* Gasto que no cayó en ningún balde: hay que verlo, no
                          esconderlo adentro de otra celda. */}
                      {!!res.gastos_desglose?.resto && (
                        <Dato
                          label="Movimientos restantes"
                          valor={plata(res.gastos_desglose.resto)}
                          copiar={plata(res.gastos_desglose.resto)}
                          clase="text-[var(--t-accent)]"
                          chico
                        />
                      )}
                      {!res.gastos && (
                        <span className="text-[11px] text-[var(--t-text-dim)]">
                          Ningún movimiento del día está clasificado como gasto.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center">
                    <Ayuda texto={
                      "Los gastos que cobró el BANCO ese día, repartidos por "
                      + "impuesto. Es el mismo número que muestra el modal de "
                      + "MOVIMIENTOS: sale de las mismas reglas.\n\n"
                      + "Va en POSITIVO (cuánto se llevó el banco), al revés "
                      + "que los movimientos de abajo, donde un débito es "
                      + "negativo.\n\n"
                      + "No suma ni resta a los totales: son los mismos "
                      + "movimientos mirados por otro corte.\n\n"
                      + "Sirve porque es el caso típico de «falta en el mayor»: "
                      + "el banco cobra hoy y el sistema contable lo registra "
                      + "después."
                    } />
                  </div>
                </div>
              )}

              {/* ⚠️ Las dos mitades NO son iguales: el concepto del mayor es
                  larguísimo (`[Op. 1131651] Pago c/retención ganancias RG 830
                  - …`) y la descripción del banco entra en una línea. Partir al
                  50% dejaba aire de sobra a la izquierda y cortaba justo lo que
                  hay que leer a la derecha. */}
              {/* ⚠️ El toggle es UNO SOLO para las dos tablas. Con uno por lado
                  se podía quedar mirando un detalle contra un consolidado, que
                  es justo la comparación que no significa nada. */}
              <div className="flex items-center gap-1">
                {(["movimientos", "consolidado"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVista(v)}
                    className={`px-2 py-0.5 text-[10px] uppercase tracking-wide border ${
                      vista === v
                        ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                        : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:bg-[var(--t-surface)]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
                <Ayuda texto={
                  "CONSOLIDADO junta los movimientos por concepto y suma los "
                  + "importes. Clic en un renglón lo abre y muestra los "
                  + "movimientos que lo componen.\n\n"
                  + "El concepto del mayor viene con el número de asiento y el "
                  + "del comprobante adentro, que cambian en cada fila; se "
                  + "agrupa por el TIPO (Depósito, Extracción, …).\n\n"
                  + "El TOTAL de cada lado es el mismo en las dos vistas."
                } />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] gap-3">
                <LadoConciliacion
                  titulo="Movimientos del banco"
                  filas={res.banco_movimientos.map((m) => ({
                    texto: m.descripcion, importe: m.importe, grupo: m.grupo,
                    detalle: m.concepto || m.descripcion }))}
                  suma={res.banco_suma}
                  moneda={moneda}
                  consolidado={vista === "consolidado"}
                />
                <LadoConciliacion
                  titulo="Movimientos del mayor"
                  filas={res.mayor_movimientos.map((m) => ({
                    texto: m.concepto, importe: m.importe, grupo: m.grupo }))}
                  suma={res.mayor_suma}
                  moneda={moneda}
                  consolidado={vista === "consolidado"}
                />
              </div>

              {res.concilia === false && (
                <div className="text-[11px] text-[var(--t-text-dim)]">
                  {res.candidatos.length > 0
                    ? `Movimientos que podrían explicar la diferencia `
                      + `(sobre ${res.movimientos_dia} del día):`
                    : `El día tiene ${res.movimientos_dia} movimientos.`}
                  {/* El margen con que se buscó, a la vista: un criterio que
                      decide qué aparece en pantalla no puede vivir escondido. */}
                  {!!res.tolerancia && ` · margen ±${plata(res.tolerancia)}`}
                  {res.candidatos_truncados && " — no se exploraron todas las combinaciones."}
                </div>
              )}

              {res.candidatos.map((c, i) => (
                <div key={i} className="border border-[var(--t-border-2)]">
                  <div className="px-2 py-1 bg-[var(--t-surface-2)] flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="uppercase tracking-wide">
                      {res.candidatos.length > 1 ? `Opción ${i + 1}` : "Explicación"}
                    </span>
                    {/* QUÉ HAY QUE HACER, dicho como acción y no como
                        diagnóstico: el que lo lee tiene que saber qué toca sin
                        traducir nada, y sin eso «hay una diferencia de X» no le
                        dice a nadie si cargar o borrar. */}
                    <span className={`px-1 text-[9px] uppercase ${
                      c.accion === "falta_en_el_mayor"
                        ? "bg-[var(--t-tint-red)] text-[var(--t-neg)]"
                        : "bg-[var(--t-tint-amber)] text-[var(--t-accent)]"
                    }`}>
                      {c.accion === "falta_en_el_mayor"
                        ? "falta en el mayor · cargarlo"
                        : "sobra en el mayor · sacarlo"}
                    </span>
                    <span className="text-[var(--t-text-dim)]">
                      {c.cantidad} movimiento{c.cantidad === 1 ? "" : "s"}
                    </span>
                    {c.signo_invertido && (
                      <span
                        className="px-1 text-[9px] uppercase bg-[var(--t-tint-amber)] text-[var(--t-accent)]"
                        title="El importe es el mismo pero con el signo al revés: el sistema contable lleva la cuenta del otro lado."
                      >
                        signo invertido
                      </span>
                    )}
                    {/* Lo que sobra se dice SIEMPRE. Una explicación que tapa un
                        resto es peor que no tener explicación: cierra el caso
                        con plata sin justificar adentro. */}
                    {!!c.resto && (
                      <span
                        className="px-1 text-[9px] uppercase bg-[var(--t-tint-amber)] text-[var(--t-accent)]"
                        title="Diferencia que queda sin explicar después de este movimiento."
                      >
                        resto {plata(c.resto)}
                      </span>
                    )}
                    <span className="ml-auto font-semibold">
                      {plata(c.suma, moneda)}
                    </span>
                    {puedeEscribir && (
                      <button
                        onClick={() => confirmar(c)}
                        disabled={busy || !!confirmados[claveCand(c)]}
                        className="px-2 py-0.5 text-[10px] uppercase tracking-wide border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40"
                        title="Anotarlo en MOVIMIENTOS A CONCILIAR: el arreglo se hace en el otro sistema y en otro momento"
                      >
                        {confirmados[claveCand(c)] ? "Confirmado ✓" : "Confirmar"}
                      </button>
                    )}
                  </div>
                  <table className="w-full border-collapse">
                    <thead className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
                      <tr className="border-b border-[var(--t-border-2)]">
                        <Th>Hora</Th>
                        <Th>Descripción</Th>
                        <Th>Concepto</Th>
                        <Th center>Cod op</Th>
                        <Th center>Comprobante</Th>
                        <Th center>Importe</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.movimientos.map((m) => (
                        <tr key={m.mov_hash} className="border-b border-[var(--t-border-2)]">
                          <Td className="whitespace-nowrap">{m.hora || "—"}</Td>
                          <Td copiar={m.descripcion}>{m.descripcion || "—"}</Td>
                          <Td className={COL_SEP}>{m.concepto || "—"}</Td>
                          <Td center className={COL_SEP}>{m.codigo || "—"}</Td>
                          <Td center className={COL_SEP}>{m.comprobante ?? "—"}</Td>
                          <Td
                            center
                            strong
                            className={`${COL_SEP} whitespace-nowrap ${
                              m.tipo === "C" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                            }`}
                            copiar={plata(m.importe)}
                          >
                            {m.tipo === "D" ? "−" : "+"}{plata(m.importe)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un número grande con su rótulo, para los tres saldos de la conciliación. */
function Numero({
  rotulo, valor, nota, clase = "", marca,
}: {
  rotulo: string; valor: string; nota?: string; clase?: string;
  /** La etiqueta de acción al lado del número (la usa DIFERENCIA). */
  marca?: { texto: string; tono: "neg" | "amber" };
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
        {rotulo}
      </span>
      <span className="flex items-center gap-2">
        <span className={`text-[16px] font-semibold ${clase}`}>{valor}</span>
        {marca && (
          <span className={`px-1 text-[9px] uppercase ${
            marca.tono === "neg"
              ? "bg-[var(--t-tint-red)] text-[var(--t-neg)]"
              : "bg-[var(--t-tint-amber)] text-[var(--t-accent)]"
          }`}>
            {marca.texto}
          </span>
        )}
      </span>
      {nota && (
        <span className="text-[10px] text-[var(--t-text-dim)]">{nota}</span>
      )}
    </div>
  );
}

/**
 * Un lado de la conciliación: la lista de movimientos con su importe y el total.
 *
 * Compacta a propósito —dos columnas y nada más— porque el punto es poder mirar
 * los dos lados A LA VEZ. Con fechas, comprobantes y códigos, cada lista ocuparía
 * la pantalla entera y habría que scrollear para comparar, que es exactamente lo
 * que no sirve.
 *
 * En CONSOLIDADO junta las filas por `grupo` y suma. La clave la calcula el
 * backend: acá no se decide qué es «el mismo movimiento», solo se suma.
 *
 * ⚠️ El TOTAL de abajo es el mismo en las dos vistas —sale de `suma`, no de lo
 * que se está mostrando—. Cambiar de pestaña no puede cambiar el número.
 */
function LadoConciliacion({
  titulo, filas, suma, moneda, consolidado,
}: {
  titulo: string;
  filas: FilaLado[];
  suma: number;
  moneda: string;
  consolidado: boolean;
}) {
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});

  // Ordenado por importe absoluto: lo grande arriba. Alfabético dejaría el
  // movimiento de mil millones abajo de todo por empezar con T.
  const grupos = useMemo(() => {
    const m = new Map<string, { clave: string; total: number; items: FilaLado[] }>();
    for (const f of filas) {
      const g = m.get(f.grupo) ?? { clave: f.grupo, total: 0, items: [] };
      g.total = Math.round((g.total + f.importe) * 100) / 100;
      g.items.push(f);
      m.set(f.grupo, g);
    }
    return [...m.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [filas]);

  return (
    <div className="border border-[var(--t-border-2)]">
      <div className="px-2 py-1 bg-[var(--t-surface-2)] flex items-center gap-2 text-[11px] border-b border-[var(--t-border-2)]">
        <span className="uppercase tracking-wide">{titulo}</span>
        <span className="text-[var(--t-text-dim)]">
          {consolidado
            ? `${grupos.length} concepto${grupos.length === 1 ? "" : "s"} · ${filas.length} mov`
            : filas.length}
        </span>
      </div>
      <div className="max-h-[300px] overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {consolidado && grupos.map((g) => (
              <Fragment key={g.clave}>
                <tr
                  onClick={() => setAbierto((p) => ({ ...p, [g.clave]: !p[g.clave] }))}
                  className="border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface)]"
                  title="Ver los movimientos que lo componen"
                >
                  {/* Sin `copiar` en el renglón del grupo: el clic acá es
                      DESPLEGAR, y una celda que además copia haría las dos
                      cosas de un mismo clic. Los movimientos de adentro sí. */}
                  <Td pad="px-1.5 py-[2px]" className="text-[10px] w-full leading-[1.15] break-words">
                    <span className="text-[var(--t-text-dim)] mr-1">
                      {abierto[g.clave] ? "▾" : "▸"}
                    </span>
                    {g.clave}
                    <span className="ml-1.5 text-[var(--t-text-dim)]">×{g.items.length}</span>
                  </Td>
                  <Td right pad="px-1.5 py-[2px]" className={`text-[10px] whitespace-nowrap tabular-nums font-semibold ${
                    g.total < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"
                  }`}>
                    {plata(g.total)}
                  </Td>
                </tr>
                {abierto[g.clave] && g.items.map((f, i) => (
                  <tr key={i} className="border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                    <Td
                      copiar={f.texto}
                      pad="pl-5 pr-1.5 py-[2px]"
                      className="text-[10px] w-full leading-[1.15] break-words text-[var(--t-text-dim)]"
                    >
                      {f.detalle || f.texto}
                    </Td>
                    <Td right pad="px-1.5 py-[2px]" className={`text-[10px] whitespace-nowrap tabular-nums ${
                      f.importe < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"
                    }`} copiar={plata(f.importe)}>
                      {plata(f.importe)}
                    </Td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!consolidado && filas.map((f, i) => (
              // `w-full` en la descripción: se lleva TODO el sobrante y el
              // importe queda pegado a la derecha. Sin eso la tabla reparte el
              // ancho por igual y quedan diez centímetros de aire entre las dos
              // columnas, que es lo que hacía imposible comparar de un vistazo.
              // Y `break-words`: el concepto del mayor no cabe en una línea, así
              // que baja de renglón en vez de empujar la columna del importe
              // fuera de la pantalla.
              <tr key={i} className="border-b border-[var(--t-border)]">
                <Td
                  copiar={f.texto}
                  pad="px-1.5 py-[2px]"
                  className="text-[10px] w-full leading-[1.15] break-words"
                >
                  {f.texto}
                </Td>
                <Td right pad="px-1.5 py-[2px]" className={`text-[10px] whitespace-nowrap tabular-nums ${
                  f.importe < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"
                }`} copiar={plata(f.importe)}>
                  {plata(f.importe)}
                </Td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={2} className="px-2 py-3 text-[11px] text-[var(--t-text-dim)]">
                  Sin movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* El TOTAL de cada lado, a la misma altura en los dos: la resta entre los
          dos números es la que explica la diferencia de saldos. */}
      <div className="px-2 py-1 border-t border-[var(--t-border-2)] flex items-center gap-2 text-[11px] bg-[var(--t-surface-2)]">
        <span className="uppercase tracking-wide text-[var(--t-text-dim)]">Total</span>
        <span className="ml-auto font-semibold tabular-nums">{plata(suma, moneda)}</span>
      </div>
    </div>
  );
}

/** El «?» que reemplaza a un párrafo. La explicación completa está, pero no
 *  ocupa la pantalla de todos los días. */
function Ayuda({ texto }: { texto: string }) {
  return (
    <span
      title={texto}
      className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full border border-[var(--t-border-2)] text-[10px] text-[var(--t-text-dim)] cursor-help"
    >
      ?
    </span>
  );
}

function ModalReglas({
  reglas, editable, onCambio, onCerrar,
}: {
  reglas: Regla[]; editable: boolean; onCambio: () => void; onCerrar: () => void;
}) {
  const [campo, setCampo] = useState("descripcion_banco");
  const [operador, setOperador] = useState("contiene");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  async function alta() {
    if (!valor.trim()) { setErr("Escribí qué tiene que coincidir."); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/back-office/interbanking/gastos/reglas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campo, operador, valor, nota }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo crear la regla.");
      return;
    }
    setValor(""); setNota("");
    onCambio();
  }

  async function baja(id: number) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/back-office/interbanking/gastos/reglas/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo borrar la regla.");
      return;
    }
    onCambio();
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-[820px] max-h-[85vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] flex items-center gap-3">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Reglas para contabilizar Gastos Bancarios
          </span>
          <button
            onClick={onCerrar}
            className="ml-auto px-2 py-1 hover:bg-[var(--t-surface)]"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <p className="shrink-0 px-3 py-2 text-[11px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
          Un movimiento que cumpla CUALQUIERA de estas reglas se marca solo como
          gasto bancario. La marca hecha a mano sobre un movimiento puntual siempre
          gana sobre la regla. Los gastos ya están adentro del saldo: esto los
          DISTINGUE, no los suma de nuevo.
        </p>

        {err && (
          <div className="shrink-0 px-3 py-1 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)]">
            {err}
          </div>
        )}

        {editable && (
          <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border-2)] flex flex-wrap items-center gap-2">
            <select value={campo} onChange={(e) => setCampo(e.target.value)} className={INPUT}>
              {Object.entries(CAMPOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              className={INPUT}
            >
              <option value="contiene">contiene</option>
              <option value="igual">es igual a</option>
            </select>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") alta(); }}
              placeholder="COMISION"
              className={`${INPUT} w-[200px]`}
            />
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="para qué es (opcional)"
              className={`${INPUT} flex-1 min-w-[160px]`}
            />
            <button
              onClick={alta}
              disabled={busy}
              className="px-2 py-1 text-[11px] uppercase border border-[var(--t-border-2)] hover:bg-[var(--t-surface)] disabled:opacity-40"
            >
              Agregar
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Campo</Th>
                <Th className={COL_SEP}>Condición</Th>
                <Th className={COL_SEP}>Valor</Th>
                <Th className={COL_SEP}>Nota</Th>
                <Th className={COL_SEP}>Creada por</Th>
                {editable && <Th center className={COL_SEP}>—</Th>}
              </tr>
            </thead>
            <tbody>
              {reglas.map((r) => (
                <tr key={r.id} className="border-b border-[var(--t-border-2)]">
                  <Td>{CAMPOS[r.campo] ?? r.campo}</Td>
                  <Td className={COL_SEP}>{r.operador === "igual" ? "es igual a" : "contiene"}</Td>
                  <Td className={COL_SEP} copiar={r.valor}>
                    <span className="font-semibold">{r.valor}</span>
                  </Td>
                  <Td className={COL_SEP}>{r.nota || "—"}</Td>
                  <Td className={COL_SEP}>{r.creado_por || "—"}</Td>
                  {editable && (
                    <td className={`px-2 py-1 text-center ${COL_SEP}`}>
                      <button
                        onClick={() => baja(r.id)}
                        disabled={busy}
                        title="Borrar la regla (las marcas hechas a mano no se tocan)"
                        className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)] disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {reglas.length === 0 && (
                <tr>
                  <td colSpan={editable ? 6 : 5} className="px-3 py-6 text-center text-[var(--t-text-dim)]">
                    Todavía no hay ninguna regla. Mientras no haya ninguna, la
                    columna GASTOS BANCARIOS muestra «—» y no cero: nadie afirmó
                    que el banco no cobró nada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Piezas compartidas ─────────────────────────────────────────────────── */


/** Solo aparece cuando algo FALLA. En el caso normal la pantalla no dice nada:
 *  de cuándo es el dato ya lo informa «Última actualización» arriba. */
function ErrorLinea({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="shrink-0 px-3 py-1 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)] border-b border-[var(--t-border-2)]">
      {error}
    </div>
  );
}

function Fecha({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--t-bg)] border border-[var(--t-border-2)] px-2 py-1 text-[12px]"
      />
    </label>
  );
}

function Dato({
  label, valor, fuerte, chico, clase = "", copiar, onAuditar, activo,
}: {
  label: string; valor: string; fuerte?: boolean; chico?: boolean;
  clase?: string; copiar?: string | null;
  // Si viene, el VALOR se vuelve clickeable y abre las filas que lo componen.
  onAuditar?: () => void; activo?: boolean;
}) {
  const cp = useCopiar(copiar);
  return (
    <div
      className={`px-1 -mx-1 ${activo ? "bg-[var(--t-surface-2)]" : ""}`}
    >
      <div
        className={`${chico ? "text-[9px]" : "text-[10px]"} uppercase tracking-wide text-[var(--t-text-dim)] flex items-center gap-1`}
      >
        {label}
        {/* El copiar vive acá, en un ícono chico y SIEMPRE visible, no escondido
            en un hover: si el gesto principal del bloque pasa a ser "ver las
            filas", el copiar necesita su propio lugar o desaparece. */}
        {cp.hay && (
          <button
            onClick={cp.onClick}
            title="Copiar"
            className={`text-[9px] text-[var(--t-text-muted)] hover:text-[var(--t-text)] ${cp.clase}`}
          >
            ⧉
          </button>
        )}
      </div>
      <div
        onClick={onAuditar}
        title={onAuditar ? "Ver los movimientos que suman este número" : undefined}
        className={`tabular-nums ${
          fuerte ? "text-[15px] font-semibold" : chico ? "text-[12px]" : "text-[13px]"
        } ${onAuditar ? "cursor-pointer hover:underline decoration-dotted underline-offset-2" : ""} ${clase}`}
      >
        {valor}
      </div>
    </div>
  );
}


function Th({
  children, right, center, className = "",
}: {
  children?: React.ReactNode; right?: boolean; center?: boolean; className?: string;
}) {
  const al = center ? "text-center" : right ? "text-right" : "text-left";
  return (
    <th className={`px-2 py-1.5 font-normal whitespace-nowrap ${al} ${className}`}>
      {children}
    </th>
  );
}

/**
 * Clic para copiar. Está acá, en un hook, y no repetida en cada componente:
 * `Td` (las celdas de las tablas) y `Dato` (el desglose del modal) hacen
 * exactamente lo mismo, y si la lógica viviera dos veces una de las dos se
 * quedaría vieja.
 *
 * Sin dato NO se copia y la celda no reacciona: un cursor de mano sobre un «—»
 * promete algo que no pasa.
 */
function useCopiar(texto?: string | null) {
  const [copiado, setCopiado] = useState(false);
  const hay = texto != null && texto !== "" && texto !== "—";
  const onClick = hay
    ? () => {
        navigator.clipboard.writeText(texto as string).then(
          () => { setCopiado(true); setTimeout(() => setCopiado(false), 900); },
          () => {},   // sin portapapeles (http, permiso denegado): no rompe nada
        );
      }
    : undefined;
  return {
    hay,
    onClick,
    title: hay ? "Clic para copiar" : undefined,
    clase: `${hay ? "cursor-pointer hover:bg-[var(--t-surface)]" : ""} ${
      copiado ? "bg-[var(--t-tint-green)]" : ""
    }`,
  };
}

function Td({
  children, right, center, strong, className = "", copiar, colSpan, title,
  pad = "px-2 py-1",
}: {
  children?: React.ReactNode; right?: boolean; center?: boolean; strong?: boolean;
  className?: string; copiar?: string | null; colSpan?: number; title?: string;
  /** El padding, como prop y no dentro de `className`: dos clases de Tailwind
   *  con la misma especificidad (`px-2` y `px-1`) las resuelve el ORDEN del CSS
   *  generado, no el orden en el atributo — o sea que apretar una celda desde
   *  afuera funcionaba a veces y a veces no. */
  pad?: string;
}) {
  const cp = useCopiar(copiar);
  const al = center ? "text-center tabular-nums" : right ? "text-right tabular-nums" : "";
  return (
    <td
      colSpan={colSpan}
      onClick={cp.onClick}
      // Un `title` propio GANA sobre el «Clic para copiar»: cuando la celda
      // necesita explicar qué es el número, eso importa más que el gesto.
      title={title ?? cp.title}
      className={`${pad} ${al} ${strong ? "font-semibold" : ""} ${cp.clase} ${className}`}
    >
      {children}
    </td>
  );
}

/** Una tabla vacía ANTES del primer fetch no significa lo mismo que después. */
function Vacia({ cols, hubo }: { cols: number; hubo: boolean }) {
  return (
    <tr>
      <td colSpan={cols} className="px-2 py-6 text-center text-[var(--t-text-dim)]">
        {hubo ? "Sin datos para este rango." : "Cargando…"}
      </td>
    </tr>
  );
}
