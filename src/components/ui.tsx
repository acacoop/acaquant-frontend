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

// Botón de filtro/pill. Copia CANÓNICA: el mismo componente estaba definido
// local e idéntico en renta-fija-table, curvas-chart, breakevens-block y
// descomposicion-tab. Los nuevos (tab CURVAS del rediseño) usan este; los
// viejos se migran cuando se los toque, sin cambio visual — es el mismo markup.
export function FilterBtn({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
