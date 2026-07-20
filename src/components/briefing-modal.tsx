"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/**
 * Briefing de apertura (QuantAI P1, v2 determinista) — modal de HOME.
 *
 * Aparece SOLO a partir de las 10:00 ART, L-V, una vez por carga de página,
 * para usuarios con el módulo `ia` (si el backend devuelve 403, el componente
 * entero es invisible — gate estructural). "No volver a mostrar" silencia por
 * usuario+día (localStorage); al día siguiente reaparece con datos nuevos.
 * Re-lectura manual: botón ☀ BRIEFING inline en la barra de estado inferior
 * (montado en layout.tsx → vive en TODAS las páginas, no solo HOME).
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

interface DlrRow {
  ticker: string;
  dias: number | null;
  ultimo: number | null;
  tna: number | null;
}

interface BriefingResp {
  fecha: string;
  generado: string;
  futuros: MetricRow[];
  oficial: MetricRow[];
  financieros: MetricRow[];
  cauciones?: MetricRow[];
  // Mail de research del DÍA (1816) — None si hoy no llegó: el panel ni aparece.
  research_hoy?: { asunto: string; texto: string } | null;
  futuros_dlr?: DlrRow[];
  pagan_hoy: PagaRow[];
}

const HORA_APERTURA_ART = 10; // el modal recién puede aparecer desde las 10:00 ART
const DISMISS_KEY = "briefing.dismiss"; // valor = fecha (YYYY-MM-DD) silenciada
const POLL_MS = 60_000;

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// grilla compartida header/filas → columnas alineadas. Numéricas al mínimo
// que banca el valor más ancho (64.688,12 / +17,06%) para que el label
// (Mayorista MAE, Caución ARS 1d) nunca se trunque con el research abierto.
const GRID = "grid grid-cols-[minmax(0,1fr)_60px_44px_44px_44px] gap-x-1 px-2";
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
  if (v == null) return <span className="text-right tabular-nums text-[11px] text-[var(--t-text-dim)]">—</span>;
  const cls = v > 0 ? "text-[var(--t-pos)]" : v < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]";
  return (
    <span className={`text-right font-semibold tabular-nums text-[11px] ${cls}`}>
      {v > 0 ? "+" : ""}
      {nf.format(v)}%
    </span>
  );
}

function Hoy({ v }: { v: number | null }) {
  if (v == null) return <span className="text-right text-[11px] font-semibold text-[var(--t-text-dim)]">Sin Ops</span>;
  return <span className="text-right font-mono font-bold tabular-nums text-[11px] text-[var(--t-text)]">{nf.format(v)}</span>;
}

function Row({ r }: { r: MetricRow }) {
  return (
    <div className={`${GRID} items-baseline py-1.5 border-b border-[var(--t-border-2)]`}>
      <span className={LBL} title={r.label}>
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
    <div className="px-3 py-1.5 bg-[var(--t-surface-2)] border-l-[3px] border-[var(--t-accent)] text-[10px] font-bold tracking-widest text-[var(--t-accent)]">
      {title}
    </div>
  );
}

function ColHeader() {
  return (
    <div className={`${GRID} py-1 border-b border-[var(--t-border-2)] bg-[var(--t-bg)]`}>
      <span />
      <span className={HEAD}>HOY</span>
      <span className={HEAD}>1D</span>
      <span className={HEAD}>WTD</span>
      <span className={HEAD}>MTD</span>
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
          className="px-3 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--t-text-dim)]"
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
      {/* Re-lectura manual — botón inline en la barra de estado inferior
          (layout.tsx), mismo estilo que el ThemeToggle. Antes era un fixed
          flotante que quedaba desolapado sobre la barra. */}
      <button
        onClick={() => {
          void cargar();
          setOpen(true);
        }}
        title="Volver a abrir el briefing de apertura"
        className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
      >
        <span>☀</span>
        <span className="tracking-widest">BRIEFING</span>
      </button>

      {open && data && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${data.research_hoy ? "max-w-[110rem]" : "max-w-6xl"} bg-[var(--t-panel)] border border-[var(--t-accent)] flex flex-col overflow-hidden`}
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

            {/* Contenido: la tabla de siempre + (si HAY mail de HOY) el research
                al costado — cada mitad scrollea POR SU CUENTA */}
            <div className="flex min-h-0 max-h-[82vh]">
            <div className="overflow-y-auto p-3 flex-1 min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] lg:grid-cols-[1.1fr_1fr_0.85fr] gap-x-3 gap-y-3">
                {/* IZQUIERDA — Futuros (el bloque grande) */}
                <div className="self-start">
                  <Section title="FUTUROS" />
                  <ColHeader />
                  {renderFuturos(data.futuros)}
                </div>

                {/* DERECHA — dólares + bonos, siempre visibles (no enterrados) */}
                <div className="flex flex-col gap-3">
                  <div>
                    <Section title="DÓLAR OFICIAL" />
                    <ColHeader />
                    {data.oficial.map((r) => (
                      <Row key={r.label} r={r} />
                    ))}
                  </div>

                  <div>
                    <Section title="DÓLARES FINANCIEROS" />
                    <ColHeader />
                    {data.financieros.map((r) => (
                      <Row key={r.label} r={r} />
                    ))}
                  </div>

                  {(data.cauciones?.length ?? 0) > 0 && (
                    <div>
                      <Section title="CAUCIONES · TNA %" />
                      <ColHeader />
                      {data.cauciones!.map((r) => (
                        <Row key={r.label} r={r} />
                      ))}
                    </div>
                  )}

                  <div>
                    <Section title="BONOS QUE PAGAN HOY" />
                    {data.pagan_hoy.length > 0 ? (
                      data.pagan_hoy.map((b) => (
                        <div
                          key={b.ticker}
                          className="px-2 py-1.5 border-b border-[var(--t-border-2)] text-[12px]"
                        >
                          <span className="font-mono font-bold text-[var(--t-text)]">{b.ticker}</span>
                          {b.emisor && <span className="text-[var(--t-text-dim)]"> — {b.emisor}</span>}
                        </div>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-[11px] text-[var(--t-text-dim)]">
                        Hoy no paga ningún bono en cartera.
                      </div>
                    )}
                  </div>
                </div>

                {/* TERCERA COLUMNA — curva de futuros de dólar (Matba Rofex) */}
                <div className="self-start">
                  <Section title="DÓLAR FUTURO (DLR)" />
                  <div className="grid grid-cols-[minmax(0,1fr)_36px_56px_48px] gap-x-1.5 px-2 text-[9px] tracking-widest text-[var(--t-text-dim)] py-1">
                    <span>TICKER</span>
                    <span className="text-right">DÍAS</span>
                    <span className="text-right">ÚLTIMO</span>
                    <span className="text-right">TNA %</span>
                  </div>
                  {(data.futuros_dlr?.length ?? 0) > 0 ? (
                    data.futuros_dlr!.map((f) => (
                      <div
                        key={f.ticker}
                        className="grid grid-cols-[minmax(0,1fr)_36px_56px_48px] gap-x-1.5 px-2 py-1 border-b border-[var(--t-border-2)] text-[11px] font-mono"
                      >
                        <span className="font-semibold text-[var(--t-text)] truncate">{f.ticker}</span>
                        <span className="text-right text-[var(--t-text-muted)]">{f.dias ?? "—"}</span>
                        <span className="text-right text-[var(--t-text)]">
                          {f.ultimo != null ? f.ultimo.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"}
                        </span>
                        <span className="text-right text-[var(--t-accent)] font-semibold">
                          {f.tna != null ? `${f.tna.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-[var(--t-text-dim)]">
                      Sin datos de la curva DLR.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RESEARCH DEL DÍA (mail 1816) — solo si llegó HOY; scroll propio */}
            {data.research_hoy && (
              <aside className="hidden lg:flex w-[360px] shrink-0 border-l border-[var(--t-border)] flex-col min-h-0">
                <div className="px-3 py-2 border-b border-[var(--t-border)] shrink-0">
                  <span className="text-[10px] font-semibold tracking-widest text-[var(--t-accent)]">
                    📰 RESEARCH DEL DÍA
                  </span>
                  <span className="ml-2 text-[10px] text-[var(--t-text-dim)]">
                    {data.research_hoy.asunto.replace(/^(RV:|V:|Fwd:|Fw:)\s*/i, "")}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  <p className="whitespace-pre-wrap text-[11px] leading-[1.55] text-[var(--t-text)]">
                    {data.research_hoy.texto}
                  </p>
                </div>
              </aside>
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
