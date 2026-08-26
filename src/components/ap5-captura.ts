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

/** Ancho de cada columna numérica del consolidado, en caracteres.
 *
 * ⚠️ Tiene que entrar el número MÁS LARGO que puede aparecer, con signo y con
 * separadores de miles: `-759.063.000` son 12 caracteres, y los pesos del dólar
 * futuro llegan a esa escala. Con 12 justos las columnas se tocan y se lee como
 * un solo número. */
const W_NUM = 15;

/** Centra `s` en un campo de `w` caracteres.
 *
 * La imagen se dibuja en MONOESPACIADA, así que rellenar con espacios a un
 * ancho fijo es lo que alinea las columnas — no hace falta que el motor de
 * texto sepa nada de tablas. Centrando, el título de la columna queda sobre sus
 * números en vez de pegado al borde. */
function centrar(s: string, w = W_NUM): string {
    const libre = Math.max(0, w - s.length);
    const izq = Math.floor(libre / 2);
    return " ".repeat(izq) + s + " ".repeat(libre - izq);
}

/** Las N celdas numéricas de una fila, cada una con su tono.
 *
 *  ⚠️ **El tono es POR CELDA, no por fila.** Pintar la fila entera del color de
 *  una columna deja números positivos en rojo —el `20.000` de COMPRA de un
 *  producto vendido— y un positivo en rojo se lee como negativo.
 *
 *  ⚠️ **`tonoDesde` acota QUÉ columnas se pintan.** En el consolidado sólo
 *  ACUM. y DIARIA llevan color: COMPRA, VENTA y NETA son cantidades de la
 *  posición, no resultado, y pintarlas de verde/rojo sugiere una ganancia o una
 *  pérdida donde sólo hay toneladas.
 */
/*  ⚠️ **`fmt` recibe el ÍNDICE de la columna.** Hay cuadros donde no todas las
 *  columnas se formatean igual —en POSICIONES DE ACA conviven cantidades sin
 *  decimales, precios con dos y un porcentaje— y un solo formateador para todas
 *  obligaría a pre-formatear a mano, que es justo por donde la imagen y la
 *  pantalla empiezan a decir cosas distintas. Los llamadores que no lo usan
 *  siguen pasando `(n) => …` sin cambiar nada. */
export function celdas(valores: (string | number | null)[],
                       fmt: (n: number, i: number) => string,
                       tonoDesde = 0,
                       ancho = W_NUM): Celda[] {
    return valores.map((v, i) => {
        if (typeof v === "string") return { texto: centrar(v, ancho) };
        if (v === null) return { texto: centrar("—", ancho) };
        const texto = centrar(fmt(v, i), ancho);
        return i >= tonoDesde ? { texto, tono: v >= 0 ? "pos" : "neg" } : { texto };
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
  /** Apila las tablas en UNA sola columna en vez de repartirlas en dos.
   *
   *  ⚠️ Es una decisión de ANCHO, no de gusto. Una tabla de siete columnas
   *  numéricas ya mide ~125 caracteres; dos al lado se van a ~250 y la imagen
   *  sale con el doble del ancho de un mail, donde nadie la lee sin hacer zoom.
   *  Con pocas columnas —el consolidado, los rankings— dos al lado entran bien
   *  y aprovechan el alto. */
  unaColumna?: boolean;
}): Promise<"copiado" | "descargado" | "error"> {
  const { copiarReporte } = await import("@/lib/reporte-imagen");
  return copiarReporte({
    // Todas las columnas del mismo ancho: sin esto, FUTUROS U$S —que tiene
    // etiquetas más cortas— salía notoriamente más angosta que la de agro.
    mismoAncho: true,
    columnas: o.unaColumna ? [o.tablas] : enDosColumnas(o.tablas),
    titulo: o.titulo,
    fecha: o.fecha,
    firma: FIRMA,
    logoUrl: "/logo-login.png",
    archivo: o.archivo,
  });
}
