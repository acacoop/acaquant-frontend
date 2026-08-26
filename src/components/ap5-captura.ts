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
import type { FilaImagen, TablaImagen } from "@/lib/reporte-imagen";

const FIRMA = "Hecho en ACAQuant";

/** Ancho de cada columna numérica del consolidado, en caracteres. */
const W_NUM = 12;

const num = (s: string) => s.padStart(W_NUM);

/** Las N celdas numéricas de una fila, alineadas para monoespaciada. */
export function celdas(valores: string[]): string {
  return valores.map(num).join("");
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
    columnas: enDosColumnas(o.tablas),
    titulo: o.titulo,
    fecha: o.fecha,
    firma: FIRMA,
    logoUrl: "/logo-login.png",
    archivo: o.archivo,
  });
}
