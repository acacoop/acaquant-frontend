/**
 * El LOTE de descuento de cheques como imagen, para pegar en un mail.
 *
 * Mismo espíritu que `reporte-imagen.ts` (se DIBUJA de cero en un canvas,
 * sale siempre en claro, escala x3 con `escalaSegura`), pero con una tabla
 * ANCHA de N columnas en vez de la tabla label/valor de dos columnas que ya
 * sabe dibujar ese archivo. Estirar `reporte-imagen.ts` con un tercer tipo
 * de tabla lo complicaba para TODOS sus usos (fin de día, posiciones de ACA,
 * el mail gerencial), así que el lote vive en su propio archivo — pero
 * comparte con `reporte-imagen.ts` la barra azul (`dibujarBarra`), la
 * paleta (`PALETA`), la escala segura (`escalaSegura`) y el camino a
 * portapapeles/descarga (`entregarImagen`), para que los reportes de la app
 * se lean como una misma familia aunque las tablas sean distintas.
 */

import { PALETA, BARRA_H, PAD, escalaSegura, cargarLogo, dibujarBarra, entregarImagen } from "./reporte-imagen";

const { AZUL, TINTA, TENUE, LINEA, BANDA, FONDO, ROJO, MONO } = PALETA;

/** Una columna de la tabla ancha. */
export type ColumnaLote = { titulo: string; alinear: "izq" | "der" };

export type LoteImagen = {
  titulo: string;      // p. ej. "Simulación de descuento · lote"
  fecha: string;       // ya formateada, "09/09/2026"
  firma: string;
  logoUrl: string;
  archivo: string;     // nombre si hay que caer a descargar
  /** Renglones debajo de la barra (cliente, instrumento, aval, parámetros). Ya armados. */
  subtitulo: string[];
  columnas: ColumnaLote[];
  /** Celdas YA formateadas; cada fila tiene la misma longitud que `columnas`. */
  filas: string[][];
  /** Fila TOTAL, misma longitud que `columnas` ("" en las celdas sin total). */
  total: string[];
  /** Cuadros de resumen, uno al lado del otro debajo de la tabla. */
  resumen: { titulo: string; filas: { label: string; valor: string; fuerte?: boolean }[] }[];
  /** La línea grande: CFT. */
  destacado: { label: string; valor: string };
  /** Flujos: fecha + importe ya formateado; `negativo` pinta en rojo. */
  flujos: { fecha: string; importe: string; negativo: boolean }[];
  /** Pie chiquito (aclaraciones). Puede venir vacío. */
  nota: string;
};

// ── Tipografía propia de este reporte. Mismo MONO que `reporte-imagen.ts`
// (viene de `PALETA`) para que las dos familias de reportes se lean igual. ──
const F_SUB = `12px ${MONO}`;               // subtítulo (cliente/instrumento/aval/parámetros)
const F_CAB = `bold 12px ${MONO}`;          // cabecera de columna
const F_CELDA = `13px ${MONO}`;             // celda de la tabla
const F_TOTAL = `bold 13px ${MONO}`;        // fila TOTAL
const F_RESUMEN_TIT = `bold 13px ${MONO}`;  // título de un cuadro de resumen
const F_RESUMEN = `13px ${MONO}`;           // fila de un cuadro de resumen
const F_RESUMEN_FUERTE = `bold 13px ${MONO}`; // la fila "fuerte" de un cuadro de resumen
const F_DESTACADO_LABEL = `bold 13px ${MONO}`;
const F_DESTACADO = `bold 22px ${MONO}`;    // el CFT: grande, en azul
const F_FLUJO = `12px ${MONO}`;
const F_NOTA = `11px ${MONO}`;

// ── Altos ────────────────────────────────────────────────────────────────
const H_SUB = 18;
const H_CAB = 30;
const H_FILA = 24;
const H_RESUMEN_TIT = 26;
const H_RESUMEN_FILA = 24;
const H_DESTACADO = 44;
const H_FLUJO = 20;
const H_NOTA = 16;

// ── Paddings ─────────────────────────────────────────────────────────────
const CELDA_X = 8;    // padding horizontal de cada celda
const GAP_Y = 14;      // entre bloques (subtítulo/tabla/resumen/destacado/flujos/nota)
const GAP_X = 16;      // entre cuadros de resumen
const GAP_FLUJO = 28;  // separación entre un flujo y el siguiente, en la misma línea

const ANCHO_MIN = 900; // ancho mínimo del lienzo

// Colores propios de este reporte que no viven en `PALETA` porque son de UN
// solo uso acá (la banda ámbar de un total "fuerte", el cebrado de la tabla).
const AMBAR = "#fbf3df"; // el ámbar de la pantalla en claro
const CEBRA = "#f6f8fb"; // fondo de las filas pares, para seguir con el ojo una tabla de números

const medir = (medidor: CanvasRenderingContext2D, texto: string, font: string): number => {
  medidor.font = font;
  return medidor.measureText(texto).width;
};

/** Ancho de cada columna: el máximo entre su título, cada celda y su total,
 *  más el padding de celda a los dos lados. */
function anchoColumnas(medidor: CanvasRenderingContext2D, o: LoteImagen): number[] {
  return o.columnas.map((col, j) => {
    let ancho = medir(medidor, col.titulo, F_CAB);
    for (const fila of o.filas) ancho = Math.max(ancho, medir(medidor, fila[j] ?? "", F_CELDA));
    ancho = Math.max(ancho, medir(medidor, o.total[j] ?? "", F_TOTAL));
    return Math.ceil(ancho) + CELDA_X * 2;
  });
}

/** Reparte el sobrante entre columnas cuando la tabla es más angosta que el
 *  cuerpo del reporte — mismo criterio que `reporteComoImagen`: parte entera
 *  a cada una, el resto a la última (el borde derecho tiene que caer siempre
 *  en el mismo píxel). Muta `anchos` in place. */
function repartirSobrante(anchos: number[], anchoObjetivo: number): void {
  if (!anchos.length) return;
  const sobra = anchoObjetivo - anchos.reduce((a, w) => a + w, 0);
  if (sobra <= 0) return;
  const parte = Math.floor(sobra / anchos.length);
  anchos.forEach((w, i) => { anchos[i] = w + parte; });
  anchos[anchos.length - 1] += sobra - parte * anchos.length;
}

/** Ancho de cada cuadro de resumen, repartiendo `anchoCuerpo` con `GAP_X`
 *  entre ellos (misma idea que `repartirSobrante`, pero de entrada). */
function repartirCuadros(anchoCuerpo: number, n: number): number[] {
  if (!n) return [];
  const disponible = anchoCuerpo - GAP_X * (n - 1);
  const base = Math.floor(disponible / n);
  const anchos = Array<number>(n).fill(base);
  anchos[n - 1] += disponible - base * n;
  return anchos;
}

type FlujoUbicado = LoteImagen["flujos"][number] & { linea: number; x: number };

/** Acomoda los flujos en línea, cortando a la siguiente cuando no entran en
 *  `anchoCuerpo`. Se calcula UNA sola vez y se reusa para medir el alto y
 *  para dibujar: dos cálculos separados podían desincronizarse y cortar la
 *  imagen a mitad de un flujo. */
function armarFlujos(
  medidor: CanvasRenderingContext2D,
  flujos: LoteImagen["flujos"],
  anchoCuerpo: number,
): FlujoUbicado[] {
  medidor.font = F_FLUJO;
  let x = 0;
  let linea = 0;
  return flujos.map((f) => {
    const ancho = medidor.measureText(`${f.fecha} ${f.importe}`).width;
    if (x !== 0 && x + ancho > anchoCuerpo) {
      linea += 1;
      x = 0;
    }
    const ubicado = { ...f, linea, x };
    x += ancho + GAP_FLUJO;
    return ubicado;
  });
}

/** Parte `texto` en líneas que entren en `anchoMax`, cortando por palabra
 *  (igual que hace cualquier cliente de mail con un párrafo). */
function partirEnLineas(medidor: CanvasRenderingContext2D, texto: string, font: string, anchoMax: number): string[] {
  medidor.font = font;
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medidor.measureText(candidata).width > anchoMax) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function loteComoImagen(o: LoteImagen): Promise<Blob | null> {
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return null;

  // ── Medir antes de dibujar ────────────────────────────────────────────────
  const anchos = anchoColumnas(medidor, o);
  const anchoTabla = anchos.reduce((a, w) => a + w, 0);
  const anchoCuerpo = Math.max(anchoTabla, ANCHO_MIN - PAD * 2);
  repartirSobrante(anchos, anchoCuerpo);
  const W = anchoCuerpo + PAD * 2;

  const anchosResumen = repartirCuadros(anchoCuerpo, o.resumen.length);
  const filasResumen = Math.max(0, ...o.resumen.map((r) => r.filas.length));
  const altoResumen = H_RESUMEN_TIT + filasResumen * H_RESUMEN_FILA;

  const flujosUbicados = armarFlujos(medidor, o.flujos, anchoCuerpo);
  const maxLineaFlujo = flujosUbicados.length ? Math.max(...flujosUbicados.map((f) => f.linea)) : -1;
  const altoFlujos = (maxLineaFlujo + 1) * H_FLUJO;

  const lineasNota = o.nota ? partirEnLineas(medidor, o.nota, F_NOTA, anchoCuerpo) : [];

  const H = BARRA_H + PAD
    + o.subtitulo.length * H_SUB + GAP_Y
    + H_CAB + o.filas.length * H_FILA + H_FILA + GAP_Y
    + altoResumen + GAP_Y
    + H_DESTACADO + GAP_Y
    + altoFlujos
    + (lineasNota.length ? GAP_Y + lineasNota.length * H_NOTA : 0)
    + PAD;

  const escala = escalaSegura(W, H);
  // Mismo criterio que `reporteComoImagen`: si ni dibujado 1:1 entra en el
  // lienzo del navegador, no se manda un PNG en blanco.
  if (escala < 1) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(W * escala);
  canvas.height = Math.floor(H * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(escala, escala);
  ctx.textBaseline = "middle";

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, W, H);

  dibujarBarra(ctx, W, { titulo: o.titulo, fecha: o.fecha, firma: o.firma, logo: await cargarLogo(o.logoUrl) });

  let y = BARRA_H + PAD;

  // ── Subtítulo ───────────────────────────────────────────────────────────
  ctx.font = F_SUB;
  ctx.fillStyle = TENUE;
  ctx.textAlign = "left";
  for (const linea of o.subtitulo) {
    ctx.fillText(linea, PAD, y + H_SUB / 2);
    y += H_SUB;
  }
  y += GAP_Y;

  // ── Cabecera de la tabla ────────────────────────────────────────────────
  ctx.fillStyle = BANDA;
  ctx.fillRect(PAD, y, anchoCuerpo, H_CAB);
  ctx.strokeStyle = LINEA;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 0.5, y + 0.5, anchoCuerpo - 1, H_CAB - 1);
  ctx.font = F_CAB;
  ctx.fillStyle = TINTA;
  {
    let cx = PAD;
    o.columnas.forEach((col, j) => {
      const w = anchos[j];
      ctx.textAlign = col.alinear === "der" ? "right" : "left";
      ctx.fillText(col.titulo, col.alinear === "der" ? cx + w - CELDA_X : cx + CELDA_X, y + H_CAB / 2);
      cx += w;
    });
  }
  ctx.textAlign = "left";
  y += H_CAB;

  // ── Filas ───────────────────────────────────────────────────────────────
  o.filas.forEach((fila, i) => {
    // Filas pares (1-indexado: la 2ª, la 4ª...) con fondo cebrado, para que
    // el ojo no pierda el renglón en una tabla de 12 filas de números.
    if ((i + 1) % 2 === 0) {
      ctx.fillStyle = CEBRA;
      ctx.fillRect(PAD, y, anchoCuerpo, H_FILA);
    }
    ctx.font = F_CELDA;
    ctx.fillStyle = TINTA;
    let cx = PAD;
    o.columnas.forEach((col, j) => {
      const w = anchos[j];
      ctx.strokeStyle = LINEA;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, y + 0.5, w - 1, H_FILA - 1);
      ctx.textAlign = col.alinear === "der" ? "right" : "left";
      ctx.fillText(fila[j] ?? "", col.alinear === "der" ? cx + w - CELDA_X : cx + CELDA_X, y + H_FILA / 2);
      cx += w;
    });
    y += H_FILA;
  });
  ctx.textAlign = "left";

  // ── Fila TOTAL ──────────────────────────────────────────────────────────
  ctx.fillStyle = BANDA;
  ctx.fillRect(PAD, y, anchoCuerpo, H_FILA);
  ctx.font = F_TOTAL;
  ctx.fillStyle = TINTA;
  {
    let cx = PAD;
    o.columnas.forEach((col, j) => {
      const w = anchos[j];
      ctx.strokeStyle = LINEA;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 0.5, y + 0.5, w - 1, H_FILA - 1);
      ctx.textAlign = col.alinear === "der" ? "right" : "left";
      ctx.fillText(o.total[j] ?? "", col.alinear === "der" ? cx + w - CELDA_X : cx + CELDA_X, y + H_FILA / 2);
      cx += w;
    });
  }
  ctx.textAlign = "left";
  y += H_FILA + GAP_Y;

  // ── Cuadros de resumen, uno al lado del otro ───────────────────────────
  {
    let cx = PAD;
    o.resumen.forEach((cuadro, i) => {
      const w = anchosResumen[i];
      ctx.fillStyle = BANDA;
      ctx.fillRect(cx, y, w, H_RESUMEN_TIT);
      ctx.strokeStyle = LINEA;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, y + 0.5, w - 1, H_RESUMEN_TIT - 1);
      ctx.font = F_RESUMEN_TIT;
      ctx.fillStyle = TINTA;
      ctx.textAlign = "left";
      ctx.fillText(cuadro.titulo.toUpperCase(), cx + CELDA_X, y + H_RESUMEN_TIT / 2);

      let fy = y + H_RESUMEN_TIT;
      for (let k = 0; k < filasResumen; k++) {
        const fila = cuadro.filas[k];
        if (fila) {
          if (fila.fuerte) {
            ctx.fillStyle = AMBAR;
            ctx.fillRect(cx, fy, w, H_RESUMEN_FILA);
          }
          ctx.strokeStyle = LINEA;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, fy + 0.5, w - 1, H_RESUMEN_FILA - 1);
          ctx.font = fila.fuerte ? F_RESUMEN_FUERTE : F_RESUMEN;
          ctx.fillStyle = TINTA;
          ctx.textAlign = "left";
          ctx.fillText(fila.label, cx + CELDA_X, fy + H_RESUMEN_FILA / 2);
          ctx.textAlign = "right";
          ctx.fillText(fila.valor, cx + w - CELDA_X, fy + H_RESUMEN_FILA / 2);
        } else {
          // Fila de relleno: el mismo borde que las reales (como
          // `filasMinimas` en `reporte-imagen.ts`), para que el cuadro se
          // vea completo en vez de cortado a media altura.
          ctx.strokeStyle = LINEA;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 0.5, fy + 0.5, w - 1, H_RESUMEN_FILA - 1);
        }
        fy += H_RESUMEN_FILA;
      }
      cx += w + GAP_X;
    });
  }
  ctx.textAlign = "left";
  y += altoResumen + GAP_Y;

  // ── Línea destacada (CFT) ───────────────────────────────────────────────
  ctx.strokeStyle = LINEA;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 0.5, y + 0.5, anchoCuerpo - 1, H_DESTACADO - 1);
  ctx.font = F_DESTACADO_LABEL;
  ctx.fillStyle = TINTA;
  ctx.textAlign = "left";
  ctx.fillText(o.destacado.label.toUpperCase(), PAD + CELDA_X, y + H_DESTACADO / 2);
  ctx.font = F_DESTACADO;
  ctx.fillStyle = AZUL;
  ctx.textAlign = "right";
  ctx.fillText(o.destacado.valor, PAD + anchoCuerpo - CELDA_X, y + H_DESTACADO / 2);
  ctx.textAlign = "left";
  y += H_DESTACADO + GAP_Y;

  // ── Flujos, en línea ────────────────────────────────────────────────────
  ctx.font = F_FLUJO;
  for (const f of flujosUbicados) {
    const px = PAD + f.x;
    const py = y + f.linea * H_FLUJO;
    ctx.textAlign = "left";
    ctx.fillStyle = TENUE;
    ctx.fillText(`${f.fecha} `, px, py + H_FLUJO / 2);
    const anchoFecha = ctx.measureText(`${f.fecha} `).width;
    ctx.fillStyle = f.negativo ? ROJO : TINTA;
    ctx.fillText(f.importe, px + anchoFecha, py + H_FLUJO / 2);
  }
  y += altoFlujos;

  // ── Nota al pie ─────────────────────────────────────────────────────────
  if (lineasNota.length) {
    y += GAP_Y;
    ctx.font = F_NOTA;
    ctx.fillStyle = TENUE;
    ctx.textAlign = "left";
    for (const linea of lineasNota) {
      ctx.fillText(linea, PAD, y + H_NOTA / 2);
      y += H_NOTA;
    }
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Copia el lote al portapapeles, con la misma degradación a descarga que
 *  `copiarReporte` (ver `entregarImagen` en `reporte-imagen.ts`). */
export async function copiarLote(o: LoteImagen): Promise<"copiado" | "descargado" | "error"> {
  try {
    const blob = await loteComoImagen(o);
    if (!blob) return "error";
    return await entregarImagen(blob, o.archivo);
  } catch {
    return "error";
  }
}
