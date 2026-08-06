"use client";

import { useEffect, useRef, useState } from "react";

/**
 * MultiSelect compartido — el desplegable con checkboxes + buscador de la barra de
 * filtros. Nació en `operadores-view.tsx`; se extrajo acá al reusarlo en la vista
 * OPERACIONES (`ops-view.tsx`) para no tener dos copias que se desincronicen.
 *
 * Contrato: `selected` es un array de values ([] = "Todos", sin filtro). Las vistas
 * lo mandan al backend separado por comas y allá se traduce a `= ANY(...)`.
 */

// ── Multi-select (dropdown con checkboxes + buscador) ──────────────────────
export type Opt = { value: string; label: string; n?: number };

// Sin acentos ni mayúsculas: "división" matchea tipeando "division".
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function MultiSelect({
  label, options, selected, onChange, width = "max-w-[220px]",
}: {
  label: string;
  options: Opt[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQ("");
  }, [open]);

  const sel = new Set(selected);
  const toggle = (v: string) =>
    onChange(sel.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  // Mostrar SIEMPRE lo seleccionado, aunque el cross-filter lo haya sacado de `options`
  // (así al cruzar niveles no desaparecen ni se rompen las selecciones previas).
  const optVals = new Set(options.map((o) => o.value));
  const displayOpts: Opt[] = [
    ...options,
    ...selected.filter((v) => !optVals.has(v)).map((v) => ({ value: v, label: v })),
  ];
  const nq = norm(q);
  const visibleOpts = nq ? displayOpts.filter((o) => norm(o.label).includes(nq)) : displayOpts;
  const resumen = selected.length === 0
    ? "— Todos —"
    : selected.length === 1
    ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} seleccionados`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={"flex items-center gap-1 bg-[var(--t-surface)] border text-[11px] px-2 py-1 font-mono outline-none " + width + " "
          + (selected.length ? "border-[var(--t-accent)] text-[var(--t-text)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]")}
        title={selected.join(", ")}
      >
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">{label}</span>
        <span className="truncate flex-1 text-left">{resumen}</span>
        <span className="text-[8px] opacity-70">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-[220px] max-h-[320px] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-xl">
          <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--t-border)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] shrink-0">
            <span>{label}</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[var(--t-accent)] hover:underline">limpiar</button>
            )}
          </div>
          <div className="px-2 py-1 border-b border-[var(--t-border)] shrink-0">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); return; }
                // Enter con un único resultado → lo tilda sin usar el mouse.
                if (e.key === "Enter" && visibleOpts.length === 1) { toggle(visibleOpts[0].value); setQ(""); }
              }}
              placeholder="buscar…"
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[11px] px-1.5 py-0.5 font-mono text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {/* "Todos" = sin filtro en este nivel (toma todo). Estable al cruzar niveles. */}
            <label className="flex items-center gap-2 px-2 py-1 text-[11px] border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] cursor-pointer font-semibold">
              <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])}
                className="accent-[var(--t-accent)]" />
              <span className="flex-1 text-[var(--t-text)]">Todos</span>
            </label>
            {visibleOpts.length === 0 && (
              <div className="px-2 py-2 text-[10px] text-[var(--t-text-muted)]">{q ? "sin coincidencias" : "sin opciones"}</div>
            )}
            {visibleOpts.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-[var(--t-surface)] cursor-pointer">
                <input type="checkbox" checked={sel.has(o.value)} onChange={() => toggle(o.value)}
                  className="accent-[var(--t-accent)]" />
                <span className="truncate flex-1" title={o.label}>{o.label}</span>
                {o.n != null && <span className="text-[9px] text-[var(--t-text-muted)]">({o.n})</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
