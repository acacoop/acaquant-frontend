"use client";

import { useEffect, useRef, useState } from "react";

// Date picker compacto con calendario inline navegable (no usa <input type="date">
// nativo). Extraído de aunesa-explorar-panel para reuso. Soporta acotar el rango
// seleccionable con `min`/`max` (ISO YYYY-MM-DD); por defecto el tope es hoy (ART).

export const MESES_AR = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const DIAS_AR = ["L", "M", "X", "J", "V", "S", "D"];

export function todayART(): string {
  // ART = UTC-3. Restamos 3h al "ahora" UTC y leemos su date ISO.
  // Independiente de la timezone del browser (Date.now() siempre UTC ms).
  const ar = new Date(Date.now() - 3 * 60 * 60_000);
  return ar.toISOString().slice(0, 10);
}

export function parseISO(s: string): Date {
  // "YYYY-MM-DD" → Date local sin issue de tz.
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function fmtDisplay(s: string): string {
  const d = parseISO(s);
  const dia = DIAS_AR[(d.getDay() + 6) % 7]; // domingo=0 → 6
  return `${dia} ${d.getDate()} ${MESES_AR[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function DatePickerCompact({
  value, onChange, min, max,
}: {
  value: string;
  onChange: (s: string) => void;
  /** Fecha mínima seleccionable (ISO). Sin límite si se omite. */
  min?: string;
  /** Fecha máxima seleccionable (ISO). Default: hoy (ART). */
  max?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => parseISO(value));
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync viewDate cuando cambia el value externamente.
  useEffect(() => { setViewDate(parseISO(value)); }, [value]);

  // Click fuera para cerrar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const maxISO = max ?? todayART();
  const atMax = value >= maxISO;
  const atMin = !!min && value <= min;
  // Botón de salto rápido: "Hoy" si el tope es hoy, "Fin" si es otra fecha (ej. último día con datos).
  const jumpLabel = max && max !== todayART() ? "Fin" : "Hoy";

  return (
    <div ref={wrapperRef} className="relative inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
      <button
        onClick={() => onChange(addDays(value, -1))}
        disabled={atMin}
        className="px-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:bg-[var(--t-border)] disabled:text-[var(--t-border-2)] disabled:hover:bg-transparent"
        title="Día anterior"
      >
        ‹
      </button>
      <button
        onClick={() => setOpen((p) => !p)}
        className={
          "px-3 py-1 text-[11px] font-mono min-w-[170px] text-center " +
          (open ? "bg-[var(--t-border)] text-[var(--t-accent)]" : "bg-[var(--t-panel)] text-[var(--t-text)] hover:bg-[var(--t-surface-2)]")
        }
      >
        {fmtDisplay(value)}
      </button>
      <button
        onClick={() => onChange(addDays(value, 1))}
        disabled={atMax}
        className="px-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:bg-[var(--t-border)] disabled:text-[var(--t-border-2)] disabled:hover:bg-transparent"
        title="Día siguiente"
      >
        ›
      </button>
      <button
        onClick={() => onChange(maxISO)}
        disabled={atMax}
        className={
          "px-2 text-[10px] uppercase tracking-wider " +
          (atMax
            ? "bg-[var(--t-panel)] text-[var(--t-text-muted)]"
            : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:bg-[var(--t-border)]")
        }
      >
        {jumpLabel}
      </button>

      {open && (
        <CalendarPopup
          value={value}
          viewDate={viewDate}
          setViewDate={setViewDate}
          min={min}
          max={maxISO}
          onPick={(d) => { onChange(d); setOpen(false); }}
        />
      )}
    </div>
  );
}

function CalendarPopup({
  value, viewDate, setViewDate, onPick, min, max,
}: {
  value: string;
  viewDate: Date;
  setViewDate: (d: Date) => void;
  onPick: (s: string) => void;
  min?: string;
  max: string;
}) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Primer día del mes y total de días.
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Lunes=0 ... Domingo=6
  const startCol = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayART();
  const todayD = parseISO(today);
  const valD = parseISO(value);

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--t-panel)] border border-[var(--t-accent)] p-3 shadow-2xl min-w-[260px]">
      {/* Header — mes/año + nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="px-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
        >
          ‹
        </button>
        <div className="text-[11px] font-mono text-[var(--t-accent)]">
          {MESES_AR[month]} {year}
        </div>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="px-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
        >
          ›
        </button>
      </div>

      {/* Header días */}
      <div className="grid grid-cols-7 gap-0.5 mb-1 text-[9px] uppercase text-[var(--t-text-muted)] text-center">
        {DIAS_AR.map((d) => (
          <div key={d} className="py-0.5">{d}</div>
        ))}
      </div>

      {/* Grid días */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const dDate = new Date(year, month, d);
          const dISO = toISO(dDate);
          const isSelected = dISO === value;
          const isToday = dDate.getTime() === todayD.getTime();
          const isOut = dISO > max || (!!min && dISO < min);
          const isWeekend = dDate.getDay() === 0 || dDate.getDay() === 6;
          const baseClasses = "py-1 text-[11px] font-mono text-center transition";
          let cls = "";
          if (isSelected) {
            cls = "bg-[var(--t-accent)] text-[var(--t-on-accent)] font-semibold";
          } else if (isToday) {
            cls = "border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-border)]";
          } else if (isOut) {
            cls = "text-[var(--t-border-2)] cursor-not-allowed";
          } else if (isWeekend) {
            cls = "text-[var(--t-text-muted)] hover:bg-[var(--t-border)] hover:text-[var(--t-text-dim)]";
          } else {
            cls = "text-[var(--t-text)] hover:bg-[var(--t-border)] hover:text-[var(--t-accent)]";
          }
          return (
            <button
              key={i}
              onClick={() => !isOut && onPick(dISO)}
              disabled={isOut}
              className={`${baseClasses} ${cls}`}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--t-border)] text-[9px] uppercase tracking-wider">
        <button
          onClick={() => onPick(max)}
          className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
        >
          → {max !== today ? "Fin" : "Hoy"}
        </button>
        <span className="text-[var(--t-text-muted)]">
          {valD.getDate()}/{valD.getMonth() + 1}/{valD.getFullYear()}
        </span>
      </div>
    </div>
  );
}
