// Formatters compartidos entre los paneles.

export const fmt = (n: number | null | undefined, dec = 2): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
};

export const fmtSize = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(1) + "k";
  return sign + abs.toFixed(0);
};

export const fmtSigned = (n: number | null | undefined, dec = 2): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return sign + fmt(n, dec);
};

export const fmtBps = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return `${fmt(n, 1)}bps`;
};

export const fmtTimeAr = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    // ART = UTC-3.
    const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return ar.toISOString().slice(11, 19);
  } catch {
    return "—";
  }
};
