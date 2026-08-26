/**
 * La tab actual de AP5 como IMAGEN, para pegar en el mail.
 *
 * ⚠️ **Reusa `lib/reporte-imagen`, no dibuja nada propio.** Ese módulo ya
 * resuelve la barra azul con el logo, la firma, el doble de resolución, la
 * paleta clara fija (un mail con fondo negro se imprime pésimo) y el plan B de
 * descargar cuando el navegador no deja copiar. Una segunda implementación
 * empezaría a verse distinta sin que nadie lo decida — que es exactamente lo que
 * pasó con las tablas de informe antes de que existiera `ui/informe`.
 *
 * ⚠️ **Los números se mandan YA FORMATEADOS.** Formatearlos de nuevo del lado de
 * la imagen es la forma de que el mail y la pantalla terminen diciendo cosas
 * distintas, y nadie se entera hasta que alguien compara.
 *
 * El consolidado tiene SIETE columnas y `FilaImagen` sólo trae etiqueta + valor.
 * En vez de tocar la librería —que hoy sirve a Tesorería y anda—, las columnas
 * numéricas se alinean con `padStart`: la imagen se dibuja en **monoespaciada**,
 * así que un ancho fijo por columna queda perfectamente alineado.
 */
import type { Celda, FilaImagen, TablaImagen } from "@/lib/reporte-imagen";

const FIRMA = "Hecho en ACAQuant";

/** Ancho de cada columna numérica del consolidado, en caracteres. */
const W_NUM = 12;

/** Las N celdas numéricas de una fila, cada una con su tono.
 *
 *  ⚠️ **El tono es POR CELDA, no por fila.** Pintar la fila entera del color de
 *  una columna deja números positivos en rojo —el `20.000` de COMPRA de un
 *  producto vendido— y un positivo en rojo se lee como negativo.
 *
 *  El `padStart` es lo que las alinea: la imagen se dibuja en monoespaciada, así
 *  que un ancho fijo en caracteres es un ancho fijo en píxeles.
 */
export function celdas(valores: (string | number | null)[],
                       fmt: (n: number) => string): Celda[] {
  return valores.map((v) => {
    if (typeof v === "string") return { texto: v.padStart(W_NUM) };
    if (v === null) return { texto: "—".padStart(W_NUM) };
    return { texto: fmt(v).padStart(W_NUM), tono: v >= 0 ? "pos" : "neg" };
  });
}

export type Bloque = { titulo: string; filas: FilaImagen[] };

/** Reparte las tablas en DOS columnas, respetando el orden. */
export function enDosColumnas(tablas: TablaImagen[]): TablaImagen[][] {
  const mitad = Math.ceil(tablas.length / 2);
  return [tablas.slice(0, mitad), tablas.slice(mitad)].filter((c) => c.length);
}

export async function copiarTab(o: {
  tablas: TablaImagen[];
  titulo: string;
  fecha: string;
  archivo: string;
}): Promise<"copiado" | "descargado" | "error"> {
  const { copiarReporte } = await import("@/lib/reporte-imagen");
  return copiarReporte({
    // Todas las columnas del mismo ancho: sin esto, FUTUROS U$S —que tiene
    // etiquetas más cortas— salía notoriamente más angosta que la de agro.
    mismoAncho: true,
    columnas: enDosColumnas(o.tablas),
    titulo: o.titulo,
    fecha: o.fecha,
    firma: FIRMA,
    logoUrl: "/logo-login.png",
    archivo: o.archivo,
  });
}
