// La identidad visual de una CARTERA: su abreviatura y su color.
//
// Vivía adentro de `valuaciones-view.tsx` y lo necesitan también el informe de
// carteras (torta del RESUMEN, cuadros por cartera) y cualquier vista futura que
// muestre la misma apertura. Con una copia por vista, la torta de una pantalla y
// las barras de otra pintan la MISMA cartera de dos colores distintos — y ahí el
// color deja de significar algo.
//
// Es identidad de DATO, no de tema: por eso son strings y no variables CSS
// (recharts las necesita resueltas) y por eso no cambian entre claro y oscuro.

const CARTERA_COLORS: Record<string, string> = {
  ARS: "#4a9eff",
  DL: "var(--t-pos)",
  HD: "#ff9900",
  FCI: "#bb66ff",
  RV: "#00cc66",
  MON: "#7ec8f0",
  DERIV: "#d95fbb",
  FIN: "#f0c419",
};

// Paleta de respaldo para una cartera que el maestro tenga y esta lista no. Se
// asigna POR POSICIÓN (no un gris único) porque dos carteras del mismo gris se
// leen como una sola porción.
const PALETA: string[] = ["#094293", "#7ec8f0", "#a8cdf0", "#4a93d9", "#666"];

// Etiquetas que no entran en una columna angosta ("RENTA VARIABLE" es la mitad
// de las filas de una cuenta típica).
const CARTERA_ABREV: Record<string, string> = {
  "RENTA VARIABLE": "RV",
  "RENTA FIJA": "RF",
  FINANCIAMIENTO: "FIN",
  DERIVADOS: "DERIV",
  MONEDAS: "MON",
  "SIN CLASIFICAR": "S/C",
};

/** "CARTERA RENTA VARIABLE" → "RV". Tolera el prefijo viejo y el nombre nuevo. */
export function carteraShort(c: string): string {
  if (!c) return "—";
  const s = c.replace("CARTERA ", "").trim();
  return CARTERA_ABREV[s.toUpperCase()] ?? s;
}

/** Color estable de una cartera. `i` decide el respaldo cuando no está mapeada. */
export function carteraColor(c: string, i = 0): string {
  return CARTERA_COLORS[carteraShort(c).toUpperCase()] ?? PALETA[i % PALETA.length];
}
