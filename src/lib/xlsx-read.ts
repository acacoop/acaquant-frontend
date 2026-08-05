// Lectura de Excel/CSV para los paneles de import (hermano de xlsx-export.ts).
// Centraliza lo que estaba copiado 6 veces en manager-view con divergencias:
// un CSV leído binario rompe los acentos ("Concertación" → "ConcertaciÃ³n" y
// el mapeo de columnas falla) — acá SIEMPRE se decodifica UTF-8 explícito.

async function readWorkbook(file: File, cellDates: boolean) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string", cellDates })
    : XLSX.read(buf, { type: "array", cellDates });
  return { XLSX, ws: wb.Sheets[wb.SheetNames[0]] };
}

/** Primera hoja → filas JSON (defval: ""). `fechasLocalISO` pasa las celdas
 * Date a "YYYY-MM-DD" con getters LOCALES — serializadas solas (toJSON = UTC)
 * un 01/07 a medianoche se iría al 30/06. */
export async function readSheetRows(
  file: File,
  opts: { cellDates?: boolean; fechasLocalISO?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const { XLSX, ws } = await readWorkbook(file, opts.cellDates ?? false);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
  if (opts.fechasLocalISO) {
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        const v = r[k];
        if (v instanceof Date && !isNaN(v.getTime())) {
          r[k] = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
        }
      }
    }
  }
  return rows;
}

/** Primera hoja → texto tabulado (para parsers que reciben "pegar desde
 * Excel"). cellDates + dateNF ISO: sin esto SheetJS formatea fechas como US
 * (M/D/Y) y un parser DMY lee "6/8" como junio en vez de agosto. */
export async function readSheetTsv(file: File): Promise<string> {
  const { XLSX, ws } = await readWorkbook(file, true);
  return XLSX.utils.sheet_to_csv(ws, { FS: "\t", dateNF: "yyyy-mm-dd" });
}
