// Las tres piezas del diseño de INFORME — la pill de tab, el panel con cabecera
// azul y el dato de cabecera. Nacieron en `/aca` (RESUMEN EJECUTIVO DE
// INVERSIONES) y ahora también arman NEGOCIO → CARTERAS.
//
// Viven acá y no copiadas en cada vista por un motivo concreto: son la identidad
// visual de "esto es un informe para leer", no un detalle de una pantalla. Con
// dos copias, el día que se ajuste el alto de la cabecera o el color del borde
// las dos vistas empiezan a verse distinto sin que nadie decida que se vean
// distinto — y un informe que no se parece a otro informe no se lee igual.
//
// Cero estado y cero fetch: son presentación pura, tipadas por props.
//
// Los tres formateadores también viven acá: un informe se compara leyendo dos
// cuadros en paralelo, y dos vistas que redondean distinto se leen como si los
// números no cerraran.

/** Entero con separador de miles. null/undefined → "—". */
export const fmt0 = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("es-AR");

/** Decimal fijo (2 por default). null/undefined → "—". */
export const fmt2 = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** FRACCIÓN → porcentaje (0.42 → "42,0%"). null/undefined → "—". */
export const fmtPct = (n: number | null | undefined, dec = 1) =>
  n == null ? "—" : (n * 100).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";

/**
 * El monto de un agregado en la moneda elegida (toggle ARS/USD).
 *
 * **Elige un CAMPO, no calcula.** Los espejos en dólares vienen resueltos del
 * backend al MEP del día del snapshot — dividir en la pantalla sería el mismo
 * número calculado en dos lugares, que es como un día terminan diciendo cosas
 * distintas. Sin MEP el campo viene `null` y sale «—»: nunca un 0 que parece
 * un dato.
 *
 * Vive acá, con los formateadores, porque la usan las TRES superficies del
 * mismo informe —la pantalla, el reporte imprimible y lo que salga después— y
 * una copia por superficie es exactamente lo que hace que el PDF y la pantalla
 * puedan contradecirse.
 */
export const enMoneda = (m: { monto: number; monto_usd: number | null }, usd: boolean) =>
  usd ? m.monto_usd : m.monto;

export function Pill({ label, active, onClick, title }: {
  label: string; active: boolean; onClick: () => void; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-3 py-1 text-[11px] tracking-wide border ${
        active
          ? "border-[var(--t-accent)] text-[var(--t-accent)]"
          : "border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
      }`}
    >
      {label}
    </button>
  );
}

/** Cuadro con cabecera azul. `extra` va a la derecha del título (el total). */
export function Panel({ titulo, extra, children, className }: {
  titulo: string; extra?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden ${className ?? ""}`}>
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-brand)]">
        <span className="text-[11px] font-semibold text-white tracking-wide">{titulo}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

/** Celda de cabecera: rótulo chico arriba, número grande abajo. */
export function Dato({ label, valor, sub, tono, title }: {
  label: string; valor: string; sub?: string;
  /** Colorea SOLO el número (PnL, variación). Sin tono va en el color de texto. */
  tono?: "pos" | "neg" | null;
  title?: string;
}) {
  const color = tono === "pos" ? "text-[var(--t-pos)]"
    : tono === "neg" ? "text-[var(--t-neg)]"
      : "text-[var(--t-text)]";
  return (
    <div className="px-3 py-2 border border-[var(--t-border)] bg-[var(--t-panel)]" title={title}>
      <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">{label}</div>
      <div className={`text-[15px] font-semibold tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="text-[9px] text-[var(--t-text-muted)]">{sub}</div>}
    </div>
  );
}
