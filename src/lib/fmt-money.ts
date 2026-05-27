/**
 * fmt-money.ts — formato de montos para el módulo Comercial.
 *
 * Compacto (es-AR): mil = "k", millón = "M", mil millones = "MM",
 * billón = "B". Ej: 12,6 B · 1,5 MM · 12,6 M · 50 k.
 */

const f = (x: number, d: number) => x.toLocaleString("es-AR", { maximumFractionDigits: d });

/** Monto compacto con sufijo de magnitud. `null`/NaN → "—". */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e12) return `${sign}$${f(a / 1e12, 2)} B`;
  if (a >= 1e9) return `${sign}$${f(a / 1e9, 1)} MM`;
  if (a >= 1e6) return `${sign}$${f(a / 1e6, 1)} M`;
  if (a >= 1e3) return `${sign}$${f(a / 1e3, 0)} k`;
  return a ? `${sign}$${f(a, 0)}` : "—";
}

/** Monto completo con separador de miles (para tooltips/title). */
export function fmtMoneyFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("es-AR");
}
