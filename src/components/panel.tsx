"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function ExpandIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.5 1v3.5H1M11 4.5H7.5V1M7.5 11V7.5H11M1 7.5h3.5V11" />
    </svg>
  );
}

export function Panel({
  title,
  children,
  count,
  sub,
  actions,
  fill,
  expandable,
}: {
  title: string;
  children: React.ReactNode;
  count?: number;
  sub?: string;
  actions?: React.ReactNode;
  fill?: boolean;
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const header = (
    <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
      <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
        {title}
      </span>
      {count !== undefined && (
        <span className="ml-2 text-[10px] text-[var(--t-text-muted)]">({count})</span>
      )}
      {actions && <div className="ml-3 flex items-center gap-1">{actions}</div>}
      {sub && (
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">{sub}</span>
      )}
      {expandable && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors p-0.5"
          title={expanded ? "Minimizar" : "Maximizar"}
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}
    </div>
  );

  const content = (
    // Scroll cuando el panel NO es fill (tablas, listas). El modo expandido
    // también scrollea — antes clippeaba contenido alto en pantalla completa.
    <div className={`flex-1 min-h-0 p-2 ${fill ? "" : "overflow-y-auto"}`}>
      {children}
    </div>
  );

  const overlay = expanded && typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)]"
          style={{ margin: "12px" }}
        >
          {header}
          {content}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="h-full flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
        {header}
        {!expanded && content}
      </div>
      {overlay}
    </>
  );
}
