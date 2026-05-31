"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CuentaDescubierta } from "./dolar-mep-shared";
import { inputCls } from "./dolar-mep-shared";

// Picker buscable de cuentas para reemplazar al <select> nativo de OPERAR.
//
// Permite escribir parcial y filtra por prefix (cuenta que empieza con lo
// tipeado). El user pidió expresamente que escribir "6" muestre las que
// arrancan con 6, y que se puedan tipear varios dígitos seguidos sin que
// se reinicie como pasa con el select nativo (que matchea solo el primer
// caracter y se resetea al siguiente).
//
// Convenciones:
//  - Click fuera cierra el dropdown sin tocar el valor.
//  - Enter selecciona el primer match.
//  - Escape cierra y restaura el valor anterior.
//  - Si el query exacto matchea una cuenta, se permite seleccionarla con
//    flecha + enter.
//  - Las cuentas vacías se siguen ofreciendo (se muestran al final), pero
//    sin etiqueta "(vacía)" — el user pidió sacarla.
export function AccountPicker({
  value,
  onChange,
  cuentas,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  cuentas: CuentaDescubierta[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Si el value externo cambia (ej: el shell setea por localStorage o
  // primera activa), reflejarlo en el input.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click fuera cierra.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value); // restaurar
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, value]);

  // Filtrar por prefix. Si el query está vacío, mostramos todas con
  // activas primero. Si tiene texto, las que empiezan con eso (case
  // sensitive no aplica — son números).
  const filtradas = useMemo(() => {
    const q = query.trim();
    let list = cuentas;
    if (q) {
      list = cuentas.filter((c) => c.account_id.startsWith(q));
    }
    // Activas primero, después por account_id ascendente.
    return [...list].sort((a, b) => {
      if (a.activa !== b.activa) return a.activa ? -1 : 1;
      return a.account_id.localeCompare(b.account_id, undefined, { numeric: true });
    });
  }, [cuentas, query]);

  function commit(acc: string) {
    onChange(acc);
    setQuery(acc);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = filtradas[0];
            if (first) commit(first.account_id);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(value);
            inputRef.current?.blur();
          }
        }}
        className={inputCls}
        placeholder={cuentas.length === 0 ? "— sin cuentas —" : "buscar…"}
      />
      {open && filtradas.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-[300px] overflow-y-auto bg-black border border-[var(--t-border-2)] shadow-lg">
          {filtradas.map((c) => (
            <button
              key={c.account_id}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // que no robe el blur al input antes del click
              onClick={() => commit(c.account_id)}
              className={`w-full text-left px-2 py-1 text-[11px] font-mono hover:bg-[#1a1a1a] flex items-center justify-between ${
                c.account_id === value ? "bg-[#1a1a1a] text-[#ff9900]" : "text-[var(--t-text)]"
              }`}
            >
              <span>{c.account_id}</span>
              {c.activa && (
                <span className="text-[8px] text-[var(--t-text-muted)]">
                  {c.ars_disponible !== null
                    ? `$${c.ars_disponible.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
                    : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && filtradas.length === 0 && query.trim() && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-black border border-[var(--t-border-2)] px-2 py-1 text-[10px] text-[var(--t-text-muted)]">
          ninguna empieza con &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
