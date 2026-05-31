export { Panel } from "./panel";

export function Empty() {
  return (
    <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
      SIN DATOS — MERCADO CERRADO
    </p>
  );
}

// ── Formatters ──

export function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

export function fmtNum(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPrice(n?: number): string {
  if (n === undefined || n === null) return "--";
  return fmtNum(n);
}

export function fmtVol(n?: number): string {
  if (n === undefined || n === null) return "--";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + "T";
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString("es-AR");
}

export function fmtPct(n?: number): string {
  if (n === undefined || n === null) return "--";
  return (n * 100).toFixed(2) + "%";
}

export function fmtTs(ts: string): string {
  try {
    // Si el ts viene UTC-naive desde el backend (sin 'Z' ni offset), hay
    // que asumir UTC; el browser lo parsearía como local y daría una hora
    // off-by-N-horas.
    const hasTz = /[zZ]|[+-]\d{2}:\d{2}$/.test(ts);
    const iso = hasTz ? ts : `${ts}Z`;
    return new Date(iso).toLocaleTimeString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

/** Hora ART en formato HH:MM:SS para tiempos capturados en el browser. */
export function fmtHoraAR(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
