"use client";

import { useState } from "react";

// Piezas compartidas de los paneles de Manager (extraídas de manager-view
// al partir el monolito — mismo patrón de archivos hermanos con import
// estático que manager-jobs-panel / aunesa-*-panel).

export function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors border ${
        active ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
               : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}>
      {label}
    </button>
  );
}

// ── Tab: Diagnóstico (árbol por vista) ────────────────────────────────────────

export function CheckPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--t-surface)] transition-colors">
        <span className="text-[10px] text-[var(--t-text-muted)]">{open ? "▾" : "▸"}</span>
        <span className="text-[11px] font-semibold text-[var(--t-text)]">{title}</span>
      </button>
      {open && <div className="border-t border-[var(--t-border)] p-3">{children}</div>}
    </div>
  );
}

export function RunBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40 mb-2">
      {loading ? "Ejecutando…" : "▶ Ejecutar"}
    </button>
  );
}

export function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5"
      style={{ color: ok ? "var(--t-pos)" : "var(--t-neg)", border: `1px solid ${ok ? "#00cc6640" : "#ff333340"}`, backgroundColor: ok ? "#00cc6612" : "#ff333312" }}>
      {label ?? (ok ? "OK" : "ERROR")}
    </span>
  );
}

export function d10(s?: string | null): string {
  return s ? String(s).slice(0, 10) : "—";
}

export const GROUP_HEADER = "flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0";
export const GROUP_TITLE = "text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2";
