"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/**
 * Briefing de apertura (QuantAI P1, v2 determinista) — modal de HOME.
 *
 * Aparece SOLO a partir de las 10:00 ART, L-V, una vez por carga de página,
 * para usuarios con el módulo `ia` (si el backend devuelve 403, el componente
 * entero es invisible — gate estructural). "No volver a mostrar" silencia por
 * usuario+día (localStorage); al día siguiente reaparece con datos nuevos.
 * Re-lectura manual: botón BRIEFING fijo abajo a la derecha de HOME.
 *
 * Contenido 100% calculado del backend (GET /api/ia/briefing) con columnas
 * uniformes HOY·1D·WTD·MTD: futuros (índices US/energía/metales/granos/cripto),
 * dólar oficial (mayorista MAE live + A3500), financieros (MEP/CCL) y bonos que
 * pagan hoy. WTD/MTD se calculan sobre el último cierre → sirven aunque hoy no
 * haya operado; si el mayorista no operó, su HOY dice "Sin Ops" (nunca un número
 * viejo disfrazado de vivo).
 */

interface MetricRow {
  label: string;
  grupo?: string;
  hoy: number | null;
  ret_1d: number | null;
  ret_wtd: number | null;
  ret_mtd: number | null;
  fecha?: string;
  stale?: boolean;
}

interface PagaRow {
  ticker: string;
  emisor: string | null;
}

interface BriefingResp {
  fecha: string;
  generado: string;
  futuros: MetricRow[];
  oficial: MetricRow[];
  financieros: MetricRow[];
  pagan_hoy: PagaRow[];
}

const HORA_APERTURA_ART = 10; // el modal recién puede aparecer desde las 10:00 ART
const DISMISS_KEY = "briefing.dismiss"; // valor = fecha (YYYY-MM-DD) silenciada
const POLL_MS = 60_000;

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// grilla compartida header/filas → columnas alineadas
const GRID = "grid grid-cols-[minmax(0,1fr)_72px_58px_58px_58px] gap-x-2 px-4";
const LBL = "text-[11px] font-bold tracking-wide text-[var(--t-text)] truncate";
const HEAD = "text-right text-[9px] font-semibold tracking-widest text-[var(--t-text-dim)]";

function artNow(): { hora: number; esHabil: boolean } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    hour: "numeric",
    weekday: "short",
  }).formatToParts(new Date());
  const hora = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hora, esHabil: !["Sat", "Sun"].includes(wd) };
}

function fmtFecha(iso: string | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-right tabular-nums text-[12px] text-[var(--t-text-dim)]">—</span>;
  const cls = v > 0 ? "text-[var(--t-pos)]" : v < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]";
  return (
    <span className={`text-right font-semibold tabular-nums text-[12px] ${cls}`}>
      {v > 0 ? "+" : ""}
      {nf.format(v)}%
    </span>
  );
}

function Hoy({ v }: { v: number | null }) {
  if (v == null) return <span className="text-right text-[11px] font-semibold text-[var(--t-text-dim)]">Sin Ops</span>;
  return <span className="text-right font-mono font-bold tabular-nums text-[12px] text-[var(--t-text)]">{nf.format(v)}</span>;
}

function Row({ r }: { r: MetricRow }) {
  return (
    <div className={`${GRID} items-baseline py-1.5 border-b border-[var(--t-border-2)]`}>
      <span className={LBL}>
        {r.label}
        {r.fecha && <span className="font-normal text-[var(--t-text-dim)]"> {fmtFecha(r.fecha)}</span>}
        {r.stale && <span className="text-[var(--t-neg)]"> ⚠</span>}
      </span>
      <Hoy v={r.hoy} />
      <Pct v={r.ret_1d} />
      <Pct v={r.ret_wtd} />
      <Pct v={r.ret_mtd} />
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="mt-1.5 px-4 py-1.5 bg-[var(--t-surface-2)] border-l-[3px] border-[var(--t-accent)] text-[10px] font-bold tracking-widest text-[var(--t-accent)]">
      {title}
    </div>
  );
}

function renderFuturos(rows: MetricRow[]): ReactNode[] {
  const out: ReactNode[] = [];
  let grupo: string | undefined;
  for (const r of rows) {
    if (r.grupo !== grupo) {
      grupo = r.grupo;
      out.push(
        <div
          key={`g-${grupo}`}
          className="px-4 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--t-text-dim)]"
        >
          {grupo}
        </div>,
      );
    }
    out.push(<Row key={r.label} r={r} />);
  }
  return out;
}

export function BriefingModal() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<BriefingResp | null>(null);
  const [open, setOpen] = useState(false);
  const autoShownRef = useRef(false); // auto-apertura: máx. 1 vez por carga de página

  const cargar = useCallback(async (): Promise<BriefingResp | null> => {
    try {
      const res = await fetch("/api/ia/briefing", { cache: "no-store" });
      if (!res.ok) {
        // 401/403 = sin módulo `ia` → el componente no existe para este user.
        if (res.status === 401 || res.status === 403) setAllowed(false);
        return null;
      }
      const j = (await res.json()) as BriefingResp;
      setAllowed(true);
      setData(j);
      return j;
    } catch {
      return null;
    }
  }, []);

  // Chequeo de auto-apertura: al montar, cada minuto y al volver a la pestaña.
  useEffect(() => {
    const check = async () => {
      if (autoShownRef.current) return;
      const { hora, esHabil } = artNow();
      if (!esHabil || hora < HORA_APERTURA_ART) {
        // Antes de las 10 solo resolvemos el gate (para mostrar u ocultar el botón).
        if (allowed === null) void cargar();
        return;
      }
      const j = await cargar();
      if (!j) return;
      if (localStorage.getItem(DISMISS_KEY) === j.fecha) return; // silenciado hoy
      autoShownRef.current = true;
      setOpen(true);
    };
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cargar, allowed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (allowed === false || allowed === null) return null;

  const silenciarHoy = () => {
    if (data) localStorage.setItem(DISMISS_KEY, data.fecha);
    setOpen(false);
  };

  return (
    <>
      {/* Re-lectura manual desde HOME (aunque se haya descartado) */}
      <button
        onClick={() => {
          void cargar();
          setOpen(true);
        }}
        className="fixed bottom-3 right-3 z-40 px-2 py-1 text-[10px] font-semibold tracking-wide border border-[var(--t-border-2)] bg-[var(--t-panel)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
      >
        ☀ BRIEFING
      </button>

      {open && data && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[var(--t-panel)] border border-[var(--t-accent)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--t-border)]">
              <span className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                ☀ BRIEFING DE APERTURA
              </span>
              <span className="text-[10px] font-mono text-[var(--t-text-dim)]">{fmtFecha(data.fecha)}</span>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[14px] leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto max-h-[72vh]">
              {/* Cabecera de columnas */}
              <div className={`${GRID} py-1 border-b border-[var(--t-border-2)] bg-[var(--t-bg)]`}>
                <span />
                <span className={HEAD}>HOY</span>
                <span className={HEAD}>1D</span>
                <span className={HEAD}>WTD</span>
                <span className={HEAD}>MTD</span>
              </div>

              {/* FUTUROS (agrupados) */}
              <Section title="FUTUROS" />
              {renderFuturos(data.futuros)}

              {/* DÓLAR OFICIAL (mayorista MAE + A3500) */}
              <Section title="DÓLAR OFICIAL" />
              {data.oficial.map((r) => (
                <Row key={r.label} r={r} />
              ))}

              {/* DÓLARES FINANCIEROS (MEP/CCL) */}
              <Section title="DÓLARES FINANCIEROS" />
              {data.financieros.map((r) => (
                <Row key={r.label} r={r} />
              ))}

              {/* BONOS QUE PAGAN HOY (solo si hay) */}
              {data.pagan_hoy.length > 0 && (
                <>
                  <Section title="BONOS QUE PAGAN HOY" />
                  {data.pagan_hoy.map((b) => (
                    <div
                      key={b.ticker}
                      className="px-4 py-1.5 border-b border-[var(--t-border-2)] text-[12px]"
                    >
                      <span className="font-mono font-bold text-[var(--t-text)]">{b.ticker}</span>
                      {b.emisor && <span className="text-[var(--t-text-dim)]"> — {b.emisor}</span>}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--t-border)]">
              <span className="text-[9px] font-mono text-[var(--t-text-dim)]">
                Yahoo (Globex) · MAE · BCRA A3500 · BYMA (MEP/CCL)
              </span>
              <button
                onClick={silenciarHoy}
                className="ml-auto px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
              >
                NO VOLVER A MOSTRAR HOY
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
