import React from "react";

export function Panel({
  title,
  children,
  count,
  sub,
  actions,
  fill,
}: {
  title: string;
  children: React.ReactNode;
  count?: number;
  sub?: string;
  actions?: React.ReactNode;
  fill?: boolean;
}) {
  return (
    <div className="h-full flex flex-col border border-[#1a1a1a] bg-[#080808] overflow-hidden">
      <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-2 text-[10px] text-[#555555]">({count})</span>
        )}
        {actions && <div className="ml-3 flex items-center gap-1">{actions}</div>}
        {sub && (
          <span className="ml-auto text-[10px] text-[#555555]">{sub}</span>
        )}
      </div>
      <div className={`flex-1 min-h-0 p-2 ${fill ? "" : "overflow-y-auto"}`}>{children}</div>
    </div>
  );
}

export function Empty() {
  return (
    <p className="text-[#555555] text-xs py-4 text-center">
      SIN DATOS — MERCADO CERRADO
    </p>
  );
}

// ── Formatters ──

export function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

export function fmtNum(n: number): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPrice(n?: number): string {
  if (n === undefined || n === null) return "--";
  return fmtNum(n);
}

export function fmtVol(n?: number): string {
  if (n === undefined || n === null) return "--";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + "T";
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString("es-AR");
}

export function fmtPct(n?: number): string {
  if (n === undefined || n === null) return "--";
  return (n * 100).toFixed(2) + "%";
}


export function fmtTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
