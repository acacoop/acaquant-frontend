/**
 * Piezas compartidas entre los dos modos del panel DESCUENTO (SIMPLE y LOTE):
 * tipos del contrato, formateadores, y las cajitas visuales (`Caja`, `Campo`,
 * `Fila`, `TabBtn`, `MontoInput`). Existe como archivo aparte porque los dos
 * modos comparten el mismo look y los mismos formateadores, y un import
 * circular entre `financiamiento-descuento.tsx` y
 * `financiamiento-descuento-lote.tsx` es frágil con fast refresh.
 */

import { useRef } from "react";

export type Aval = {
  nombre: string;
  costo_cheque: number | null;
  costo_pagare: number | null;
  nota: string;
  orden: number;
  actualizado_por: string | null;
  actualizado_at: string | null;
};

export type Aranceles = {
  arancel_aca: number | null;
  derecho_mercado: number | null;
  actualizado_por: string | null;
  actualizado_at: string | null;
};

export type Datos = {
  avales: Aval[];
  aranceles: Aranceles;
  iva_pct: number;
  base_anual: number;
  disponible: boolean;
};

export type Instrumento = "cheque" | "pagare";

export const API = "/api/operaciones/financiamiento";

/** Plata con 2 decimales y separadores AR. Acá SÍ lleva "$": son pesos, no
 *  nominales (a diferencia del resto de la vista FINANCIAMIENTO). */
export function fmtPlata(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(n: number | null | undefined, dec = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}%`;
}

/** "2026-12-17" → "17/12/2026". Se parte el string en vez de usar Date, que lo
 *  interpretaría en UTC y correría el día. */
export function fmtFecha(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Puntos de miles MIENTRAS se escribe: "100000" → "100.000".
 *
 * Escribir 50 millones sin separadores es la forma más fácil de cotizar un
 * cero de más y no verlo. Se formatea en cada tecla en vez de al salir del
 * campo, que es cuando ya te equivocaste.
 *
 * Formato argentino: "." para miles y "," para decimales. Descarta todo lo que
 * no sea dígito o coma, y deja UNA sola coma (pegar "1.234,56" o "1,2,3" no
 * rompe nada). El parseo inverso lo hace `aNumero`.
 */
export function conMiles(s: string): string {
  const limpio = s.replace(/[^\d,]/g, "");
  const [entero, ...resto] = limpio.split(",");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return resto.length ? `${conPuntos},${resto.join("")}` : conPuntos;
}

/** "45.058.947,42" → 45058947.42. Inverso de `conMiles`. */
export function aNumero(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function costoDe(a: Aval, i: Instrumento): number | null {
  return i === "cheque" ? a.costo_cheque : a.costo_pagare;
}

// Sin `w-full`: cada uso fija su ancho (los campos de la tira COMPLETAR van
// dimensionados al dato que llevan, no estirados). Mezclar `w-full` acá con un
// `w-[130px]` en el call site deja el ancho a merced del orden del CSS.
export const INPUT =
  "bg-transparent text-[10px] font-mono text-[var(--t-text)] outline-none " +
  "border border-[var(--t-border-2)] px-1 py-0.5 focus:border-[var(--t-accent)]";

/** Valor de solo-lectura en la tira COMPLETAR (arancel, derecho, IVA). Apagado
 *  a propósito: no se editan acá, se cargan en la tab DATOS. */
export const VALOR_PARAM = "text-[10px] font-mono text-[var(--t-text-dim)] leading-[18px]";

export function Caja({
  titulo,
  extra,
  destacada = false,
  cargando = false,
  children,
}: {
  titulo: string;
  extra?: string;
  destacada?: boolean;
  cargando?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--t-border)]">
      <div
        className={
          "px-2 py-1 flex items-center gap-2 text-[9px] uppercase tracking-widest " +
          (destacada
            ? "bg-[var(--t-accent)] text-white"
            : "bg-[var(--t-accent)]/10 text-[var(--t-accent)]")
        }
      >
        <span>{titulo}</span>
        {extra && <span className="opacity-70 normal-case tracking-normal">{extra}</span>}
        {cargando && <span className="ml-auto opacity-70">·····</span>}
      </div>
      {children}
    </div>
  );
}

/** Campo de la tira COMPLETAR: etiqueta chiquita ARRIBA del control.
 *  Apilado ocupa la mitad de ancho que "etiqueta a la izquierda", que es lo que
 *  permite meter los seis campos en una sola línea. */
export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

export function Fila({
  label,
  valor,
  fuerte = false,
  resaltada = false,
  negativo = false,
}: {
  label: string;
  valor: React.ReactNode;
  fuerte?: boolean;
  resaltada?: boolean;
  negativo?: boolean;
}) {
  return (
    // `fuerte` marca los TRES números que la mesa realmente le dice al cliente
    // (monto descontado, a recibir, y el neto con aval): fondo tenue + negrita
    // para pescarlos sin leer la tabla entera. El resto son los componentes que
    // explican cómo se llegó ahí.
    //
    // Los DOS fondos salen de `--t-tint-amber`, el token del tema, y NO de un
    // color fijo. Un pastel hardcodeado (#ffe9b0 al 25%) se ve bien en claro
    // pero sobre el negro da una banda GRIS sucia — el token ya trae el par
    // (#fbf3df en claro, #1a1308 en oscuro) y es lo que usan pizarra agro y
    // operar. `resaltada` va al 100% (es el resaltado que la planilla original
    // tenía pintado a mano en la comisión SGR) y `fuerte` al 60%, para que las
    // tres filas destacadas no le compitan a esa.
    <div
      className={
        "flex items-center gap-2 px-2 py-0.5 border-t border-[var(--t-border)] " +
        (resaltada
          ? "bg-[var(--t-tint-amber)]"
          : fuerte
            ? "bg-[var(--t-tint-amber)]/60"
            : "")
      }
    >
      <span
        className={
          "text-[10px] flex-1 min-w-0 truncate " +
          (fuerte ? "font-semibold text-[var(--t-text)]" : "text-[var(--t-text-dim)]")
        }
      >
        {label}
      </span>
      <span
        className={
          "text-[10px] font-mono shrink-0 " +
          (negativo
            ? "text-[#ff7777]"
            : fuerte
              ? "font-semibold text-[var(--t-accent)]"
              : "text-[var(--t-text)]")
        }
      >
        {valor}
      </span>
    </div>
  );
}

export function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-[10px] uppercase tracking-wide px-2 py-0.5 border " +
        (active
          ? "border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10"
          : "border-transparent text-[var(--t-text-dim)] hover:text-[var(--t-text)]")
      }
    >
      {children}
    </button>
  );
}

/**
 * Input de monto con puntos de miles en vivo y conservación del caret.
 *
 * Reformatear en cada tecla manda el cursor al final del campo, así que se
 * cuenta cuántos DÍGITOS había antes del cursor y se lo devuelve después del
 * mismo dígito — insertar un punto no le mueve el lugar a nadie. Sin esto,
 * editar el medio de "50.000.000" es imposible.
 */
export function MontoInput({
  value,
  onChange,
  className,
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const caret = e.target.selectionStart ?? e.target.value.length;
    const digitosAntes = e.target.value.slice(0, caret).replace(/\D/g, "").length;
    const fmt = conMiles(e.target.value);
    onChange(fmt);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      let i = 0;
      let vistos = 0;
      while (i < fmt.length && vistos < digitosAntes) {
        if (/\d/.test(fmt[i])) vistos++;
        i++;
      }
      el.setSelectionRange(i, i);
    });
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={onInputChange}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      inputMode="decimal"
      className={INPUT + " " + (className ?? "")}
    />
  );
}
