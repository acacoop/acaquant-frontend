"use client";

// Filtro de período para los charts históricos de DERIVADOS (costo de un
// contrato, costo de una estrategia, griegas). Reemplaza al brush de recharts
// que iba debajo del eje X: la mesa no lo entendía y tapaba el eje.
//
// Los períodos se cortan en hora LOCAL del navegador (la mesa está en AR):
//   HOY = desde las 00:00 de hoy · WTD = desde el lunes 00:00 · MTD = desde el
//   1º del mes 00:00 · TODO = sin corte.
export type Periodo = "HOY" | "WTD" | "MTD" | "TODO";

export const PERIODOS_INTRADIA: Periodo[] = ["HOY", "WTD", "MTD", "TODO"];
// Las griegas son un rollup DIARIO: "HOY" sería un solo punto.
export const PERIODOS_DIARIO: Periodo[] = ["WTD", "MTD", "TODO"];

/** Timestamp (ms) desde el que entra un punto, o null si entra todo. */
export function inicioPeriodo(periodo: Periodo, ahora: Date = new Date()): number | null {
  if (periodo === "TODO") return null;
  const d = new Date(ahora);
  d.setHours(0, 0, 0, 0);
  if (periodo === "WTD") {
    // getDay(): 0 = domingo. Retrocedemos hasta el lunes.
    const dow = d.getDay();
    d.setDate(d.getDate() - ((dow + 6) % 7));
  } else if (periodo === "MTD") {
    d.setDate(1);
  }
  return d.getTime();
}

export function PeriodoFilter({
  value,
  onChange,
  opciones,
}: {
  value: Periodo;
  onChange: (p: Periodo) => void;
  opciones: Periodo[];
}) {
  return (
    <span className="flex items-center gap-1">
      {opciones.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`text-[9px] px-1.5 py-0 border transition-colors ${
            value === p
              ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
              : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
          }`}
        >
          {p}
        </button>
      ))}
    </span>
  );
}
