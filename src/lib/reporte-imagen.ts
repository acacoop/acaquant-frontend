/**
 * El REPORTE FIN DE DÍA como IMAGEN, para pegar en un mail.
 *
 * ⚠️ **No es una captura de la pantalla: el reporte se DIBUJA de cero en un
 * canvas.** Las dos alternativas se descartaron por buenos motivos:
 *
 *   · Una librería tipo `html2canvas` es una dependencia grande que reimplementa
 *     el motor de layout del navegador y falla justo con lo que esta app usa
 *     (variables CSS, grid, temas). Además habría que bajarla en el bundle para
 *     un botón.
 *   · `SVG + foreignObject` obliga a inlinear TODO el CSS a mano y se rompe en
 *     silencio cuando cambia una clase.
 *
 * Dibujarlo tiene tres ventajas concretas: el resultado no depende de cómo se vea
 * la pantalla (mismo mail desde una notebook chica o desde un monitor grande),
 * sale **siempre en claro** aunque el usuario tenga la app en oscuro —un mail con
 * fondo negro se imprime pésimo—, y **nada de la UI puede colarse** en la imagen
 * porque el botón, el scroll y el ✕ simplemente no existen para el canvas.
 *
 * Se dibuja al TRIPLE de resolución (`ESCALA_OBJETIVO`) por dos motivos: no se
 * ve borroso cuando el cliente de mail lo agranda, y el mail lo pega al tamaño
 * en PÍXELES que tiene el PNG — así que la escala es, en la práctica, la
 * perilla del tamaño con que se lee el reporte en el correo.
 *
 * El reporte puede venir en SECCIONES apiladas (`SeccionImagen`), que es como
 * el mail gerencial de posiciones manda tres pantallas en una sola imagen.
 */

/** Una celda numérica con su propio color. En monoespaciada, `texto` viene ya
 *  rellenado con `padStart` a un ancho fijo, así las columnas alinean solas. */
export type Celda = { texto: string; tono?: "pos" | "neg" };

/** Una fila de la tabla de un banco. */
export type FilaImagen = {
  /** `CC ARS · 000100010488` — lo mismo que dice la columna CUENTA. */
  cuenta: string;
  /** La etiqueta, que va debajo y más chica. */
  sub?: string;
  /** El saldo ya formateado. Se dibuja tal cual: formatear dos veces es la forma
   *  de que la imagen y la pantalla terminen diciendo cosas distintas.
   *
   *  Puede ser UNA celda o VARIAS. Con varias, cada una lleva su propio tono:
   *  pintar toda la fila del color de una columna deja números positivos en
   *  rojo, y un positivo en rojo se lee como negativo. */
  valor: string | Celda[];
  /** Si arriba de esta fila cambia la moneda, lleva una línea más marcada. */
  corte?: boolean;
  /** Verde a favor, rojo en contra, para el caso de UNA sola celda. Lo decide
   *  QUIEN TIENE EL NÚMERO, no la imagen: `valor` llega ya formateado y adivinar
   *  el signo de un string es frágil (el `−` de un locale no es el `-` ASCII). */
  tono?: "pos" | "neg";
  /** Fila de TOTAL: fondo gris. Sin esto, el total se lee como una fila más y
   *  el ojo no encuentra dónde termina la tabla. */
  destacada?: boolean;
};

export type TablaImagen = {
  titulo: string;
  filas: FilaImagen[];
  /** Color de la banda del título. Sin esto, la banda gris de siempre.
   *
   *  Es para los cuadros donde el color **separa cosas que se leen distinto**:
   *  en POSICIONES DE ACA, agro y dólar tienen las mismas columnas pero unidades
   *  distintas (toneladas contra dólares), y dos tablas iguales una debajo de la
   *  otra se leen como la misma. El color tiene que ser el MISMO que el de la
   *  pantalla: si difieren, la captura y la vista se ven como dos informes. */
  color?: string;
  /** Título centrado en la banda en vez de pegado a la izquierda. */
  centrado?: boolean;
  /** Alto RESERVADO en filas. Si la tabla trae menos, se dibujan filas vacías
   *  hasta llegar. Es lo que mantiene alineadas dos tablas que están una al
   *  lado de la otra: sin esto, un Top 10 con 8 cuentas queda más corto y la
   *  siguiente arranca a otra altura. */
  filasMinimas?: number;
};

/**
 * Un TRAMO del reporte, con su propio acomodado en columnas y su banda de
 * título. Las secciones se apilan de arriba a abajo.
 *
 * Existe para el mail gerencial de POSICIONES Y DIFERENCIAS, que junta tres
 * pantallas en una sola imagen. La alternativa —mandar las tres tablas en una
 * lista plana— pierde justo lo que hace falta: que se vea DÓNDE termina AGRO y
 * empieza DÓLAR. Tres cuadros seguidos sin banda se leen como un cuadro largo.
 *
 * ⚠️ **Todas las secciones salen del MISMO ancho** (el de la más ancha, y las
 * más angostas se estiran repartiendo el sobrante entre sus columnas). Sin eso,
 * una sección de dos columnas y otra de una quedan con los bordes corridos y la
 * imagen se lee como tres capturas pegadas en vez de un informe.
 */
export type SeccionImagen = {
  /** La banda de arriba. Sin título, la sección arranca directo en sus tablas. */
  titulo?: string;
  /** Color de la banda del título de la sección. Por defecto, el azul de la barra. */
  color?: string;
  /** El mismo empaquetado que `Opciones.columnas`, pero de esta sección sola. */
  columnas: TablaImagen[][];
};

type OpcionesBase = {
  /** Todas las columnas del MISMO ancho (el del más ancho). Sin esto, una
   *  columna con contenido corto sale angosta y el reporte se ve desparejo. */
  mismoAncho?: boolean;
  titulo: string;
  fecha: string;
  /** La firma chiquita de la barra. */
  firma: string;
  logoUrl: string;
  /** Nombre del archivo si hay que caer a descargar. */
  archivo: string;
};

/** O se pasa UN solo acomodado (`columnas`) o VARIAS secciones apiladas
 *  (`secciones`), nunca las dos: con las dos, la imagen tendría que decidir
 *  cuál gana y esa decisión es del que arma el reporte. */
type Opciones = OpcionesBase & (
  | {
      /** Ya empaquetado en columnas: la imagen respeta el mismo acomodado que la
       *  pantalla, así el que la manda ve lo mismo que le llega al que la abre. */
      columnas: TablaImagen[][];
      secciones?: never;
    }
  | {
      /** Varios tramos, uno debajo del otro, cada uno con su banda de título. */
      secciones: SeccionImagen[];
      columnas?: never;
    }
);

/** Cuántos píxeles reales por píxel de dibujo.
 *
 *  ⚠️ **Es LO QUE HACE que la imagen se vea grande en el mail.** El canvas no
 *  lleva DPI, así que el cliente de correo la pega al tamaño en PÍXELES que
 *  tiene: con 2 el mail mostraba el reporte chico y había que hacer zoom para
 *  leer un número. Con 3 entra ~50% más grande y además aguanta el zoom sin
 *  pixelarse. Subirlo más pesa (el PNG crece con el cuadrado) sin que se lea
 *  mejor. */
const ESCALA_OBJETIVO = 3;

/** Topes del canvas del navegador. Pasarse NO tira error: devuelve un lienzo
 *  en blanco, y el mail se va con una imagen vacía sin que nadie se entere —
 *  por eso la escala se BAJA sola en vez de confiar en que el reporte entre.
 *  Los números son los de Safari/iOS, que es el más estricto de los tres. */
const LADO_MAX = 16384;
const AREA_MAX = 268435456; // 16384²

/** La escala más alta que este lienzo aguanta, hasta `ESCALA_OBJETIVO`.
 *
 *  Importa cuando el reporte es MUY alto —las tres tabs apiladas del mail
 *  gerencial— porque ahí el alto por la escala es lo primero que se pasa. */
function escalaSegura(w: number, h: number): number {
  const e = Math.min(ESCALA_OBJETIVO, LADO_MAX / w, LADO_MAX / h,
                     Math.sqrt(AREA_MAX / (w * h)));
  return Math.max(1, e);
}

// Paleta FIJA y clara. No sale de las variables del tema a propósito: la imagen
// se va a un mail, donde el tema de la app no existe.
const AZUL = "#094293";
const TINTA = "#1c2430";
const TENUE = "#6b7684";
const LINEA = "#c9d2df";
const BANDA = "#e4e9f1";
const FONDO = "#ffffff";
// Verde/rojo de PAPEL: más oscuros que los de pantalla, porque un mail se
// imprime y un verde claro sobre blanco desaparece.
const VERDE = "#15803d";

const ROJO = "#b91c1c";

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const F_CUENTA = `15px ${MONO}`;
const F_SUB = `11px ${MONO}`;
const F_TITULO_TABLA = `bold 14px ${MONO}`;
// ⚠️ La fila de TOTAL va en NEGRITA pero del MISMO CUERPO que las demás. Con el
// cuerpo del título (14px) cada carácter mide distinto, y como las columnas se
// alinean rellenando con espacios en monoespaciada, el total quedaba corrido
// respecto de los números que suma.
const F_TOTAL = `bold 15px ${MONO}`;
const F_BARRA = `bold 17px ${MONO}`;
const F_FIRMA = `12px ${MONO}`;

const PAD = 20;          // margen del lienzo
const BARRA_H = 50;      // la barra azul
const GAP_X = 26;        // entre columnas
const GAP_Y = 16;        // entre tablas de una misma columna
const CELDA_X = 9;       // padding horizontal de cada celda
const H_TITULO = 28;     // alto de la fila de título del banco
const H_FILA = 26;       // alto de una fila sin etiqueta
const H_FILA_SUB = 38;   // alto de una fila con etiqueta debajo
const SEP_COL = 22;      // separación entre la cuenta y el saldo
const H_SECCION = 30;    // la banda de título de una sección
const GAP_SECCION = 26;  // entre una sección y la siguiente
const F_SECCION = `bold 15px ${MONO}`;

const color = (t?: "pos" | "neg") => (t === "pos" ? VERDE : t === "neg" ? ROJO : TINTA);

const alto = (f: FilaImagen) => (f.sub ? H_FILA_SUB : H_FILA);

/** El texto completo de la parte derecha, para medir el ancho de la tabla. */
const textoValor = (f: FilaImagen) =>
  typeof f.valor === "string" ? f.valor : f.valor.map((c) => c.texto).join("");
/** Cuántas filas vacías hay que agregar para llegar al alto reservado. */
const relleno = (t: TablaImagen) =>
  Math.max(0, (t.filasMinimas ?? 0) - t.filas.length);

const altoTabla = (t: TablaImagen) =>
  H_TITULO + t.filas.reduce((a, f) => a + alto(f), 0) + relleno(t) * H_FILA;

/** Carga el logo. Si falla, el reporte sale igual: un mail sin logo es mejor que
 *  un botón que no hace nada. */
function cargarLogo(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function reporteComoImagen(o: Opciones): Promise<Blob | null> {
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return null;

  // Un solo acomodado es UNA sección sin banda: así el resto de la función
  // tiene un único camino y el reporte de Tesorería —que no sabe de
  // secciones— se dibuja exactamente igual que antes.
  const secciones: SeccionImagen[] = o.secciones ?? [{ columnas: o.columnas ?? [] }];

  // ── Medir antes de dibujar ────────────────────────────────────────────────
  // Todas las tablas de una MISMA columna comparten ancho: si cada una midiera
  // lo suyo, los bordes no alinearían y la columna se leería como un serrucho.
  const anchoDe = (col: TablaImagen[]) => {
    let ancho = 0;
    for (const t of col) {
      medidor.font = F_TITULO_TABLA;
      ancho = Math.max(ancho, medidor.measureText(t.titulo).width + CELDA_X * 2);
      for (const f of t.filas) {
        medidor.font = f.destacada ? F_TOTAL : F_CUENTA;
        const izq = medidor.measureText(f.cuenta).width;
        medidor.font = F_SUB;
        const sub = f.sub ? medidor.measureText(f.sub).width : 0;
        medidor.font = f.destacada ? F_TOTAL : F_CUENTA;
        const der = medidor.measureText(textoValor(f)).width;
        ancho = Math.max(ancho, Math.max(izq, sub) + SEP_COL + der + CELDA_X * 2);
      }
    }
    return Math.ceil(ancho);
  };

  const anchoPorSeccion = secciones.map((sec) => {
    const anchos = sec.columnas.map(anchoDe);
    // `mismoAncho` empareja DENTRO de la sección: dos columnas de la misma
    // sección con anchos distintos se ven desparejas aunque el bloque entero
    // mida bien.
    if (o.mismoAncho && anchos.length) anchos.fill(Math.max(...anchos));
    return anchos;
  });

  const cuerpoDe = (anchos: number[]) =>
    anchos.reduce((a, w) => a + w, 0) + GAP_X * Math.max(0, anchos.length - 1);

  // El cuerpo lo fija la sección MÁS ANCHA y las demás se estiran hasta ahí
  // (repartiendo el sobrante entre sus columnas). Es lo que hace que tres
  // tramos apilados se lean como un informe y no como tres capturas pegadas.
  const anchoCuerpo = Math.max(0, ...anchoPorSeccion.map(cuerpoDe));
  for (const anchos of anchoPorSeccion) {
    if (!anchos.length) continue;
    const sobra = anchoCuerpo - cuerpoDe(anchos);
    if (sobra <= 0) continue;
    const parte = Math.floor(sobra / anchos.length);
    anchos.forEach((w, i) => { anchos[i] = w + parte; });
    // Lo que no se repartió parejo va a la última: el borde derecho tiene que
    // caer en el mismo píxel en todas las secciones.
    anchos[anchos.length - 1] += sobra - parte * anchos.length;
  }

  const altoSeccion = secciones.map((sec, i) => {
    const altos = sec.columnas.map(
      (col) => col.reduce((a, t) => a + altoTabla(t), 0) + GAP_Y * (col.length - 1));
    return (sec.titulo ? H_SECCION : 0) + Math.max(0, ...altos, 0)
      + (i < secciones.length - 1 ? GAP_SECCION : 0);
  });

  const W = Math.max(560, anchoCuerpo + PAD * 2);
  const H = BARRA_H + PAD + altoSeccion.reduce((a, h) => a + h, 0) + PAD;

  const canvas = document.createElement("canvas");
  const escala = escalaSegura(W, H);
  canvas.width = Math.floor(W * escala);
  canvas.height = Math.floor(H * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(escala, escala);
  ctx.textBaseline = "middle";

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, W, H);

  // ── La barra azul ─────────────────────────────────────────────────────────
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, W, BARRA_H);

  let x = PAD;
  const logo = await cargarLogo(o.logoUrl);
  if (logo && logo.width && logo.height) {
    const h = 26;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, x, (BARRA_H - h) / 2, w, h);
    x += w + 14;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.moveTo(x - 7, 14);
    ctx.lineTo(x - 7, BARRA_H - 14);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = F_BARRA;
  ctx.textAlign = "left";
  ctx.fillText(o.titulo.toUpperCase(), x, BARRA_H / 2);
  x += ctx.measureText(o.titulo.toUpperCase()).width + 14;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(o.fecha, x, BARRA_H / 2);

  // La firma va chica y a la derecha: dice de dónde salió el reporte sin
  // competir con el título.
  ctx.font = F_FIRMA;
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.textAlign = "right";
  ctx.fillText(o.firma, W - PAD, BARRA_H / 2);

  // ── Las secciones, una debajo de la otra ──────────────────────────────────
  let yTope = BARRA_H + PAD;
  secciones.forEach((sec, s) => {
    const anchos = anchoPorSeccion[s];

    if (sec.titulo) {
      // La banda de la sección va del ANCHO ENTERO y en el color de la barra:
      // es el corte que dice «acá empieza otra cosa». Una banda del ancho de
      // una columna se confundiría con el título de una tabla.
      ctx.fillStyle = sec.color ?? AZUL;
      ctx.fillRect(PAD, yTope, anchoCuerpo, H_SECCION);
      ctx.fillStyle = "#ffffff";
      ctx.font = F_SECCION;
      ctx.textAlign = "left";
      ctx.fillText(sec.titulo.toUpperCase(), PAD + CELDA_X, yTope + H_SECCION / 2);
      yTope += H_SECCION;
    }

    let colX = PAD;
    sec.columnas.forEach((col, i) => {
      const w = anchos[i];
      let y = yTope;
      for (const t of col) {
        // Título del banco, sobre su banda.
        ctx.fillStyle = t.color ?? BANDA;
        ctx.fillRect(colX, y, w, H_TITULO);
        ctx.strokeStyle = LINEA;
        ctx.lineWidth = 1;
        ctx.strokeRect(colX + 0.5, y + 0.5, w - 1, H_TITULO - 1);
        ctx.fillStyle = TINTA;
        ctx.font = F_TITULO_TABLA;
        ctx.textAlign = t.centrado ? "center" : "left";
        ctx.fillText(t.titulo.toUpperCase(),
                     t.centrado ? colX + w / 2 : colX + CELDA_X, y + H_TITULO / 2);
        // Vuelve al default: las filas de abajo dan por sentado que arranca en
        // "left" y una tabla centrada corrompería a la siguiente.
        ctx.textAlign = "left";
        y += H_TITULO;

        for (const f of t.filas) {
          const h = alto(f);
          if (f.destacada) {
            ctx.fillStyle = BANDA;
            ctx.fillRect(colX, y, w, h);
          }
          ctx.strokeStyle = LINEA;
          ctx.lineWidth = f.corte || f.destacada ? 2 : 1;
          ctx.strokeRect(colX + 0.5, y + 0.5, w - 1, h - 1);

          const medio = f.sub ? y + 14 : y + h / 2;
          ctx.font = f.destacada ? F_TOTAL : F_CUENTA;
          ctx.fillStyle = TINTA;
          ctx.textAlign = "left";
          ctx.fillText(f.cuenta, colX + CELDA_X, medio);
          // El color va SOLO en los números: pintar también el nombre haría que
          // la tabla se lea como un semáforo y se pierde qué es lo que cambia.
          ctx.textAlign = "right";
          if (typeof f.valor === "string") {
            ctx.fillStyle = color(f.tono);
            ctx.fillText(f.valor, colX + w - CELDA_X, medio);
          } else {
            // De derecha a izquierda: cada celda se ancla al borde de la que ya
            // se dibujó. Medir el texto real (y no asumir un ancho) mantiene el
            // alineado aunque la fuente monoespaciada no esté disponible.
            let bordeDer = colX + w - CELDA_X;
            for (let k = f.valor.length - 1; k >= 0; k--) {
              const c = f.valor[k];
              ctx.fillStyle = color(c.tono);
              ctx.fillText(c.texto, bordeDer, medio);
              bordeDer -= ctx.measureText(c.texto).width;
            }
          }
          if (f.sub) {
            ctx.fillStyle = TENUE;
            ctx.font = F_SUB;
            ctx.textAlign = "left";
            ctx.fillText(f.sub, colX + CELDA_X, y + h - 11);
          }
          y += h;
        }
        // Las filas vacías del alto reservado. Se DIBUJAN (con su borde) en vez
        // de dejar el hueco en blanco: así la tabla se ve completa y se nota que
        // no hay más datos, no que se cortó.
        for (let k = 0; k < relleno(t); k++) {
          ctx.strokeStyle = LINEA;
          ctx.lineWidth = 1;
          ctx.strokeRect(colX + 0.5, y + 0.5, w - 1, H_FILA - 1);
          y += H_FILA;
        }
        y += GAP_Y;
      }
      colX += w + GAP_X;
    });

    yTope += altoSeccion[s] - (sec.titulo ? H_SECCION : 0);
  });

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Copia el reporte al portapapeles. Si el navegador no deja (Firefox y cualquier
 * origen sin HTTPS no implementan copiar imágenes), **lo descarga**: el objetivo
 * es que la imagen llegue al mail, y quedarse en un error no la lleva a ningún
 * lado. Devuelve qué pasó para que la pantalla lo diga.
 */
export async function copiarReporte(o: Opciones): Promise<"copiado" | "descargado" | "error"> {
  try {
    const blob = await reporteComoImagen(o);
    if (!blob) return "error";
    try {
      const Item = window.ClipboardItem;
      if (Item && navigator.clipboard?.write) {
        await navigator.clipboard.write([new Item({ "image/png": blob })]);
        return "copiado";
      }
    } catch {
      // Sigue al plan B: descargar.
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = o.archivo;
    a.click();
    URL.revokeObjectURL(url);
    return "descargado";
  } catch {
    return "error";
  }
}
