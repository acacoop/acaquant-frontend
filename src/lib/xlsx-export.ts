/**
 * xlsx-export.ts — helper para exportar tablas del frontend a XLSX.
 *
 * Lazy import de SheetJS — solo se carga cuando el user hace click en
 * un botón de descarga, no en el load inicial de cada página. Tradeoff:
 * el primer click tarda ~50-200ms en cargar la lib.
 *
 * Convención: cada `column` declara su `format`. Eso aplica:
 *   - "text"     → string, sin formato numérico.
 *   - "number"   → número con separador de miles + 2 decimales (1.234,56).
 *   - "currency" → idem number + prefijo $ ($1.234,56).
 *   - "percent"  → ya en escala 0-100 (no 0-1), 2 decimales + sufijo %.
 *   - "integer"  → entero con separador de miles, sin decimales.
 *   - "date"     → ISO date pasada como string.
 *
 * SheetJS preserva el tipo nativo de JS: si en la row hay `valuacion: 1234.56`
 * (number), llega al XLSX como número y Excel puede sumarlo / filtrarlo.
 *
 * Uso:
 *   exportToXlsx({
 *     sheets: [
 *       { name: "Por Cuenta", rows: porCuenta, columns: [...] },
 *       { name: "Por Asset",  rows: porUnidad, columns: [...] },
 *     ],
 *     filename: "aum-detalle-2026-05-14.xlsx",
 *   });
 */

export type CellFormat =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "integer"
  | "date";

export interface ColumnDef {
  /** Texto del header (lo que se ve en la fila 1 del Excel). */
  header: string;
  /** Key del row de donde se lee el valor. */
  key: string;
  /** Formato de la celda — define tipado + formato numérico. */
  format: CellFormat;
  /** Ancho de columna en caracteres (default 14). */
  width?: number;
}

export interface SheetDef {
  /** Nombre de la hoja en el Excel (max 31 chars por restricción XLSX). */
  name: string;
  /** Array de objetos a serializar. Cada object es una fila. */
  rows: Record<string, unknown>[];
  /** Definición de columnas (orden + format). */
  columns: ColumnDef[];
}

export interface ExportOptions {
  sheets: SheetDef[];
  filename: string;
}

/** Mapeo de format → number format string de Excel (es-AR). */
const NUMBER_FORMAT_BY_TYPE: Record<CellFormat, string> = {
  text:     "@",
  number:   "#,##0.00",
  currency: "[$$-2C0A]#,##0.00",       // $1.234,56 con locale es-AR.
  percent:  "0.00\\%",                  // muestra como "1.23%" (el valor ya viene en escala 0-100).
  integer:  "#,##0",
  date:     "yyyy-mm-dd",
};

/** Convierte un value crudo del row al tipo correcto para SheetJS. */
function castValue(v: unknown, format: CellFormat): string | number | null {
  if (v === null || v === undefined) return null;
  if (format === "text" || format === "date") return String(v);
  if (typeof v === "number") return v;
  // Intentar parse a número.
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function exportToXlsx({ sheets, filename }: ExportOptions): Promise<void> {
  // Lazy-load — no cargamos xlsx hasta que el user efectivamente exporta.
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    // Header row.
    const headers = sheet.columns.map((c) => c.header);
    // Data rows en formato Array of Arrays.
    const dataRows: (string | number | null)[][] = sheet.rows.map((row) =>
      sheet.columns.map((col) => castValue(row[col.key], col.format)),
    );
    const aoa: (string | number | null)[][] = [headers, ...dataRows];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Aplicar number format por celda. SheetJS no propaga el format de
    // columna por sí solo, hay que setear cell.z en cada celda.
    sheet.columns.forEach((col, colIdx) => {
      const fmt = NUMBER_FORMAT_BY_TYPE[col.format];
      if (!fmt || col.format === "text") return;
      for (let rowIdx = 1; rowIdx <= sheet.rows.length; rowIdx++) {
        const ref = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
        const cell = (ws as Record<string, unknown>)[ref] as { v?: unknown; z?: string } | undefined;
        if (cell && cell.v !== null && cell.v !== undefined) {
          cell.z = fmt;
        }
      }
    });

    // Anchos de columna.
    ws["!cols"] = sheet.columns.map((col) => ({ wch: col.width ?? 14 }));

    // El nombre de hoja tiene un límite de 31 chars en XLSX.
    const safeName = sheet.name.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  // Triggea download — SheetJS lo hace usando el helper writeFile (browser).
  XLSX.writeFile(wb, filename);
}

/**
 * Helper para construir el sufijo de filename con timestamp.
 * Devuelve "YYYY-MM-DD-HHMM" en local time.
 */
export function timestampSuffix(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
