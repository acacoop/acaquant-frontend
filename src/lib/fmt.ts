// Formateadores de fecha es-AR compartidos (antes: ~17 copias locales de
// fmtFechaCorta con 8 variantes de implementación y 16 arrays MESES).
//
// Parsea por REGEX, no con `new Date(iso)`: varias copias viejas hacían
// new Date("YYYY-MM-DD") (que parsea a medianoche UTC) y después leían
// getDate()/getMonth() en hora LOCAL (ART = UTC-3) → mostraban el día
// ANTERIOR. El regex no tiene timezone: lo que dice el string es lo que se ve.

/** "YYYY-MM-DD..." → "dd/mm/yy". Vacío/null → "—"; no-fecha → tal cual. */
export function fmtFechaCorta(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

/** "YYYY-MM-DD..." → "dd/mm" (para tablas densas / intradía). */
export function fmtDiaMes(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[2]}/${m[1]}`;
}

export const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
