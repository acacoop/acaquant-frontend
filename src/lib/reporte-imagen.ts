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
 * Se dibuja al DOBLE de resolución (`ESCALA`) para que no se vea borroso cuando
 * el cliente de mail lo agranda.
 */

/** Una fila de la tabla de un banco. */
export type FilaImagen = {
  /** `CC ARS · 000100010488` — lo mismo que dice la columna CUENTA. */
  cuenta: string;
  /** La etiqueta, que va debajo y más chica. */
  sub?: string;
  /** El saldo ya formateado. Se dibuja tal cual: formatear dos veces es la forma
   *  de que la imagen y la pantalla terminen diciendo cosas distintas. */
  valor: string;
  /** Si arriba de esta fila cambia la moneda, lleva una línea más marcada. */
  corte?: boolean;
};

export type TablaImagen = { titulo: string; filas: FilaImagen[] };

type Opciones = {
  /** Ya empaquetado en columnas: la imagen respeta el mismo acomodado que la
   *  pantalla, así el que la manda ve lo mismo que le llega al que la abre. */
  columnas: TablaImagen[][];
  titulo: string;
  fecha: string;
  /** La firma chiquita de la barra. */
  firma: string;
  logoUrl: string;
  /** Nombre del archivo si hay que caer a descargar. */
  archivo: string;
};

const ESCALA = 2;

// Paleta FIJA y clara. No sale de las variables del tema a propósito: la imagen
// se va a un mail, donde el tema de la app no existe.
const AZUL = "#094293";
const TINTA = "#1c2430";
const TENUE = "#6b7684";
const LINEA = "#c9d2df";
const BANDA = "#e4e9f1";
const FONDO = "#ffffff";

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const F_CUENTA = `13px ${MONO}`;
const F_SUB = `10px ${MONO}`;
const F_TITULO_TABLA = `bold 12px ${MONO}`;
const F_BARRA = `bold 14px ${MONO}`;
const F_FIRMA = `11px ${MONO}`;

const PAD = 20;          // margen del lienzo
const BARRA_H = 44;      // la barra azul
const GAP_X = 26;        // entre columnas
const GAP_Y = 16;        // entre tablas de una misma columna
const CELDA_X = 9;       // padding horizontal de cada celda
const H_TITULO = 24;     // alto de la fila de título del banco
const H_FILA = 22;       // alto de una fila sin etiqueta
const H_FILA_SUB = 32;   // alto de una fila con etiqueta debajo
const SEP_COL = 22;      // separación entre la cuenta y el saldo

const alto = (f: FilaImagen) => (f.sub ? H_FILA_SUB : H_FILA);
const altoTabla = (t: TablaImagen) =>
  H_TITULO + t.filas.reduce((a, f) => a + alto(f), 0);

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

  // ── Medir antes de dibujar ────────────────────────────────────────────────
  // Todas las tablas de una MISMA columna comparten ancho: si cada una midiera
  // lo suyo, los bordes no alinearían y la columna se leería como un serrucho.
  const anchoCol = o.columnas.map((col) => {
    let ancho = 0;
    for (const t of col) {
      medidor.font = F_TITULO_TABLA;
      ancho = Math.max(ancho, medidor.measureText(t.titulo).width + CELDA_X * 2);
      for (const f of t.filas) {
        medidor.font = F_CUENTA;
        const izq = medidor.measureText(f.cuenta).width;
        medidor.font = F_SUB;
        const sub = f.sub ? medidor.measureText(f.sub).width : 0;
        medidor.font = F_CUENTA;
        const der = medidor.measureText(f.valor).width;
        ancho = Math.max(ancho, Math.max(izq, sub) + SEP_COL + der + CELDA_X * 2);
      }
    }
    return Math.ceil(ancho);
  });

  const altoCol = o.columnas.map(
    (col) => col.reduce((a, t) => a + altoTabla(t), 0) + GAP_Y * (col.length - 1));

  const anchoCuerpo = anchoCol.reduce((a, w) => a + w, 0)
    + GAP_X * Math.max(0, anchoCol.length - 1);
  const W = Math.max(560, anchoCuerpo + PAD * 2);
  const H = BARRA_H + PAD + Math.max(0, ...altoCol, 0) + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W * ESCALA;
  canvas.height = H * ESCALA;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = "middle";

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, W, H);

  // ── La barra azul ─────────────────────────────────────────────────────────
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, W, BARRA_H);

  let x = PAD;
  const logo = await cargarLogo(o.logoUrl);
  if (logo && logo.width && logo.height) {
    const h = 22;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, x, (BARRA_H - h) / 2, w, h);
    x += w + 14;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.beginPath();
    ctx.moveTo(x - 7, 13);
    ctx.lineTo(x - 7, BARRA_H - 13);
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

  // ── Las tablas ────────────────────────────────────────────────────────────
  let colX = PAD;
  o.columnas.forEach((col, i) => {
    const w = anchoCol[i];
    let y = BARRA_H + PAD;
    for (const t of col) {
      // Título del banco, sobre su banda.
      ctx.fillStyle = BANDA;
      ctx.fillRect(colX, y, w, H_TITULO);
      ctx.strokeStyle = LINEA;
      ctx.lineWidth = 1;
      ctx.strokeRect(colX + 0.5, y + 0.5, w - 1, H_TITULO - 1);
      ctx.fillStyle = TINTA;
      ctx.font = F_TITULO_TABLA;
      ctx.textAlign = "left";
      ctx.fillText(t.titulo.toUpperCase(), colX + CELDA_X, y + H_TITULO / 2);
      y += H_TITULO;

      for (const f of t.filas) {
        const h = alto(f);
        ctx.strokeStyle = LINEA;
        ctx.lineWidth = f.corte ? 2 : 1;
        ctx.strokeRect(colX + 0.5, y + 0.5, w - 1, h - 1);

        const medio = f.sub ? y + 12 : y + h / 2;
        ctx.fillStyle = TINTA;
        ctx.font = F_CUENTA;
        ctx.textAlign = "left";
        ctx.fillText(f.cuenta, colX + CELDA_X, medio);
        ctx.textAlign = "right";
        ctx.fillText(f.valor, colX + w - CELDA_X, medio);
        if (f.sub) {
          ctx.fillStyle = TENUE;
          ctx.font = F_SUB;
          ctx.textAlign = "left";
          ctx.fillText(f.sub, colX + CELDA_X, y + h - 10);
        }
        y += h;
      }
      y += GAP_Y;
    }
    colX += w + GAP_X;
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
