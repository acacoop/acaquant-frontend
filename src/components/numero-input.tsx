"use client";

// Input numérico de la casa (Mesa de Dinero, SENEBIS, …):
//   1. Separadores de MILES en vivo, es-AR: 500000250 se ve "500.000.250"
//      mientras se tipea — con montos grandes es la diferencia entre ver el
//      error y mandarlo.
//   2. Coma (,) O punto (.) al TIPEAR = decimal, siempre. La tecla se captura
//      en onKeyDown y se inserta como coma decimal ANTES de que se confunda
//      con los puntos de agrupación (que solo agrega el formateador) — por
//      eso acá no hay ambigüedad "105.110": el punto tipeado ES decimal.
//   3. Pegar también funciona: si lo pegado trae coma, la coma es el decimal
//      y los puntos agrupación; si trae solo puntos, se asume agrupación
//      cuando hay varios o cuando al último lo siguen exactamente 3 dígitos
//      ("500.000" pegado = quinientos mil), y decimal en el resto ("105.11").
//
// Contrato: `value` es el CRUDO "1234567,89" (coma decimal, sin miles) —
// el mismo formato que ya parsean los `num()` de las vistas; el componente
// solo cambia lo que se VE. `onChange` recibe el crudo nuevo.

import { useCallback } from "react";

/** "1234567,89" → "1.234.567,89" (deja la coma colgando mientras se tipea). */
export const formatearMiles = (raw: string): string => {
  if (!raw) return "";
  const neg = raw.startsWith("-");
  const cuerpo = neg ? raw.slice(1) : raw;
  const i = cuerpo.indexOf(",");
  const ints = i < 0 ? cuerpo : cuerpo.slice(0, i);
  const agrupado = ints.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = i < 0 ? "" : "," + cuerpo.slice(i + 1);
  return (neg ? "-" : "") + agrupado + dec;
};

/** Display → crudo: los puntos solo pueden ser del formateador (se descartan);
 *  la coma (si hay) la insertó onKeyDown y es el decimal. */
const desdeDisplay = (s: string): string => {
  const neg = s.trim().startsWith("-");
  const i = s.indexOf(",");
  const ints = (i < 0 ? s : s.slice(0, i)).replace(/\D/g, "");
  if (i < 0) return (neg ? "-" : "") + ints;
  return (neg ? "-" : "") + ints + "," + s.slice(i + 1).replace(/\D/g, "");
};

/** Texto pegado → crudo (heurística de arriba). */
const normalizarPegado = (s: string): string => {
  const t = (s ?? "").replace(/\s/g, "");
  const neg = t.startsWith("-");
  const clean = t.replace(/[^\d.,]/g, "");
  const coma = clean.indexOf(",");
  if (coma >= 0) {
    return (neg ? "-" : "") + clean.slice(0, coma).replace(/\D/g, "")
      + "," + clean.slice(coma + 1).replace(/\D/g, "");
  }
  const puntos = (clean.match(/\./g) ?? []).length;
  if (!puntos) return (neg ? "-" : "") + clean;
  const ultimo = clean.lastIndexOf(".");
  const colita = clean.length - ultimo - 1;
  if (puntos > 1 || colita === 3) return (neg ? "-" : "") + clean.replace(/\./g, "");
  return (neg ? "-" : "") + clean.slice(0, ultimo).replace(/\D/g, "")
    + "," + clean.slice(ultimo + 1);
};

export function NumeroInput({
  value,
  onChange,
  className = "",
  placeholder,
  disabled,
  autoFocus,
  onKeyDown,
}: {
  /** Crudo "1234567,89" (coma decimal, sin separador de miles). */
  value: string;
  onChange: (raw: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Se llama DESPUÉS del manejo de coma/punto (para Enter/Escape de celdas). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "." || e.key === ",") {
      e.preventDefault();
      if (!value.includes(",")) {
        // ",5" queda feo y ambiguo → "0,5".
        if (value === "" || value === "-") onChange(value + "0,");
        else onChange(value + ",");
      }
      return;
    }
    onKeyDown?.(e);
  }, [value, onChange, onKeyDown]);

  return (
    <input
      value={formatearMiles(value)}
      inputMode="decimal"
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      className={className}
      onKeyDown={handleKeyDown}
      onChange={(e) => onChange(desdeDisplay(e.target.value))}
      onPaste={(e) => {
        e.preventDefault();
        onChange(normalizarPegado(e.clipboardData.getData("text")));
      }}
    />
  );
}
