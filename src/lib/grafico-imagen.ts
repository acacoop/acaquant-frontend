/**
 * Un GRÁFICO como IMAGEN, para pegar en un mail — el hermano de `reporte-imagen.ts`.
 *
 * Aquél DIBUJA tablas de cero en un canvas porque no hay nada que copiar. Acá sí
 * lo hay: recharts ya renderizó un `<svg>` en el DOM, así que la imagen se arma
 * **serializando ese mismo SVG** y pegándolo en un canvas debajo de la barra azul.
 * No se redibuja el gráfico: lo que se manda por mail es, literalmente, lo que
 * está en pantalla. Dos dibujos del mismo gráfico se separan con el tiempo.
 *
 * Tres cosas que NO son obvias y que rompen esto en silencio si se olvidan:
 *
 *  1. **Un SVG serializado no hereda NADA de la página.** Las `var(--t-*)` que
 *     recharts dejó en los atributos no resuelven fuera del documento: el
 *     navegador las trata como color inválido y pinta NEGRO, sin avisar. Por eso
 *     se reemplazan por su valor antes de serializar.
 *  2. **Se resuelven contra el tema CLARO, siempre**, aunque el usuario tenga la
 *     app en oscuro — mismo criterio que el reporte: un mail con fondo negro se
 *     imprime pésimo. Los valores salen de un `div.light` invisible, así que
 *     siguen siendo los del tema y no una copia que se desactualiza.
 *  3. **La leyenda de recharts es HTML, no SVG**, así que NO viaja en la
 *     serialización. Se dibuja en el canvas a partir de lo que declara quien
 *     llama — si se omite, la imagen sale sin leyenda y nadie se entera.
 *
 * Al DOBLE de resolución, para que no se vea borroso al agrandarlo.
 */

const AZUL = "#094293";
const FONDO = "#ffffff";
const TINTA = "#1c2430";
const TENUE = "#6b7684";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const ESCALA = 2;
const PAD = 20;
const BARRA_H = 44;

// Los tokens que puede usar un gráfico. Se leen del tema (no se copian sus
// valores acá) para que un cambio de paleta no deje la imagen con los colores
// viejos.
const TOKENS = [
  "--t-brand", "--t-accent", "--t-neg", "--t-pos", "--t-text", "--t-text-dim",
  "--t-text-muted", "--t-border", "--t-border-2", "--t-panel", "--t-surface",
] as const;

export type LeyendaItem = { label: string; color: string; forma: "barra" | "linea" };

type Opciones = {
  /** El `<svg>` que recharts ya dibujó. */
  svg: SVGSVGElement;
  titulo: string;
  fecha: string;
  logoUrl: string;
  archivo: string;
  /** La leyenda, que en recharts es HTML y no viaja en el SVG. */
  leyenda?: LeyendaItem[];
  /** Renglones al pie (el contexto que hace que el número se entienda). */
  pie?: string[];
};

/** Valor CLARO de cada token, leído del tema con un `div.light` invisible. */
function tokensClaros(): Record<string, string> {
  const probe = document.createElement("div");
  probe.className = "light";
  probe.style.cssText = "position:absolute;left:-9999px;top:0;width:0;height:0;";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out: Record<string, string> = {};
  for (const t of TOKENS) {
    const v = cs.getPropertyValue(t).trim();
    if (v) out[t] = v;
  }
  document.body.removeChild(probe);
  return out;
}

/** `var(--t-brand)` → `#…`. Lo que no esté en el mapa queda en tinta: un color
 *  inválido pinta negro sin avisar, y negro sobre blanco al menos se lee. */
function resolverVars(xml: string, mapa: Record<string, string>): string {
  return xml.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)/gi,
    (_m, name: string) => mapa[name] ?? TINTA);
}

function cargarImagen(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Parte un texto en líneas que entran en `max`. Sin esto el pie se corta a la
 *  mitad de una palabra y la advertencia deja de decir lo que decía. */
function enLineas(ctx: CanvasRenderingContext2D, texto: string, max: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of texto.split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (linea && ctx.measureText(prueba).width > max) {
      out.push(linea);
      linea = palabra;
    } else {
      linea = prueba;
    }
  }
  if (linea) out.push(linea);
  return out;
}

export async function graficoComoImagen(o: Opciones): Promise<Blob | null> {
  const src = o.svg;
  const box = src.getBoundingClientRect();
  const HG = Math.max(200, Math.round(box.height));
  const mapa = tokensClaros();

  // El ancho lo decide el MÁS ANCHO entre el gráfico y la barra de título. Sin
  // esto, un rango de fechas largo se sale del lienzo y se pisa con lo que haya
  // a la derecha — pasó con "31/08/2026" encima de la firma.
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return null;
  const tit = o.titulo.toUpperCase();
  medidor.font = `bold 14px ${MONO}`;
  const anchoTit = medidor.measureText(tit).width;
  medidor.font = `11px ${MONO}`;
  const anchoFecha = medidor.measureText(o.fecha).width;
  const anchoBarra = PAD + 90 + anchoTit + 14 + anchoFecha + PAD;
  const W = Math.max(560, Math.round(box.width), Math.ceil(anchoBarra));

  const clone = src.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(W));
  clone.setAttribute("height", String(HG));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${W} ${HG}`);
  // Fuera del documento no hay CSS: sin esto los ticks salen en la serif por
  // default del navegador y la imagen no se parece a la pantalla.
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = `text{font-family:${MONO};}`;
  clone.insertBefore(st, clone.firstChild);

  const xml = resolverVars(new XMLSerializer().serializeToString(clone), mapa);
  const grafico = await cargarImagen(
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml));
  if (!grafico) return null;

  const leyenda = o.leyenda ?? [];
  const H_LEY = leyenda.length ? 26 : 0;
  // El pie se mide ANTES de reservar el alto: una advertencia larga ocupa varias
  // líneas y si el lienzo no las contempla, se dibuja fuera y no se ve.
  medidor.font = `10px ${MONO}`;
  const pie = (o.pie ?? []).flatMap((t) => enLineas(medidor, t, W - PAD * 2));
  const H_PIE = pie.length * 14;
  const H = BARRA_H + PAD + HG + H_LEY + (H_PIE ? H_PIE + 10 : 0) + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W * ESCALA;
  canvas.height = H * ESCALA;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = "middle";
  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, W, H);

  // ── La barra azul, igual que el reporte de Interbanking ───────────────────
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, W, BARRA_H);
  let x = PAD;
  const logo = await cargarImagen(o.logoUrl);
  if (logo?.width && logo.height) {
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
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 14px ${MONO}`;
  ctx.fillText(tit, x, BARRA_H / 2);
  x += ctx.measureText(tit).width + 14;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `11px ${MONO}`;
  ctx.fillText(o.fecha, x, BARRA_H / 2);
  // NO va una firma a la derecha: el logo de la izquierda ya dice de quién es, y
  // una firma más en la misma barra es justo lo que se pisó con la fecha.

  // ── El gráfico ────────────────────────────────────────────────────────────
  ctx.drawImage(grafico, 0, BARRA_H + PAD, W, HG);

  // ── La leyenda (HTML en recharts → se dibuja acá o no existe) ─────────────
  let y = BARRA_H + PAD + HG;
  if (leyenda.length) {
    y += 14;
    const items = leyenda.map((l) => ({ ...l, color: resolverVars(l.color, mapa) }));
    ctx.font = `11px ${MONO}`;
    const anchos = items.map((l) => 18 + ctx.measureText(l.label).width);
    const total = anchos.reduce((a, w) => a + w, 0) + 22 * (items.length - 1);
    let lx = (W - total) / 2;
    items.forEach((l, i) => {
      ctx.fillStyle = l.color;
      ctx.strokeStyle = l.color;
      if (l.forma === "barra") {
        ctx.fillRect(lx, y - 4, 9, 9);
      } else {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx + 9, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(lx + 4.5, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = TINTA;
      ctx.textAlign = "left";
      ctx.fillText(l.label, lx + 15, y);
      lx += anchos[i] + 22;
    });
    y += 12;
  }

  // ── El pie ────────────────────────────────────────────────────────────────
  if (pie.length) {
    y += 10;
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = TENUE;
    ctx.textAlign = "left";
    for (const linea of pie) {
      ctx.fillText(linea, PAD, y);
      y += 14;
    }
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Copia el gráfico al portapapeles; si el navegador no deja (Firefox y cualquier
 * origen sin HTTPS no implementan copiar imágenes), **lo descarga**. Mismo
 * criterio que `copiarReporte`: el objetivo es que la imagen llegue al mail, y
 * quedarse en un error no la lleva a ningún lado.
 */
export async function copiarGrafico(o: Opciones): Promise<"copiado" | "descargado" | "error"> {
  try {
    const blob = await graficoComoImagen(o);
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
