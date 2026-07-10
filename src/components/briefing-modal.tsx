"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Briefing de apertura (QuantAI P1, v1 determinista) — modal de HOME.
 *
 * Aparece SOLO a partir de las 10:00 ART, L-V, una vez por carga de página,
 * para usuarios con el módulo `ia` (si el backend devuelve 403, el componente
 * entero es invisible — gate estructural). "No volver a mostrar" silencia por
 * usuario+día (localStorage); al día siguiente reaparece con datos nuevos.
 * Re-lectura manual: botón BRIEFING fijo abajo a la derecha de HOME.
 *
 * El contenido viene 100% calculado del backend (GET /api/ia/briefing):
 * futuros US, oficial (MAE live + A3500) y cierres MEP/CCL con variaciones.
 * Si una fuente falta, su fila lo dice honesto ("aún sin operaciones") —
 * nunca un número viejo disfrazado de vivo.
 */

interface FutRow {
  label: string;
  last: number | null;
  pct_day: number | null;
  updated_at: string | null;
  stale: boolean;
}

interface OficialLive {
  valor: number | null;
  variacion_pct: number | null;
  maximo: number | null;
  minimo: number | null;
  ts: string;
}

interface Anchor {
  fecha: string;
  valor?: number | null;
  cierre?: number | null;
  variacion_pct: number | null;
}

interface BriefingResp {
  fecha: string;
  generado: string;
  futuros: FutRow[];
  oficial_live: OficialLive | null;
  a3500: Anchor | null;
  mep: Anchor | null;
  ccl: Anchor | null;
}

const HORA_APERTURA_ART = 10; // el modal recién puede aparecer desde las 10:00 ART
const DISMISS_KEY = "briefing.dismiss"; // valor = fecha (YYYY-MM-DD) silenciada
const POLL_MS = 60_000;

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

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

function Var({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-[var(--t-text-dim)]">—</span>;
  const cls = pct > 0 ? "text-[var(--t-pos)]" : pct < 0 ? "text-[var(--t-neg)]" : "";
  return <span className={cls}>{pct > 0 ? "+" : ""}{nf.format(pct)}%</span>;
}

function fmtFecha(iso: string | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

const ROW = "flex items-baseline justify-between gap-4 px-4 py-2 border-b border-[var(--t-border-2)]";
const LBL = "text-[10px] font-semibold tracking-widest text-[var(--t-text-muted)]";
const VAL = "text-[13px] font-mono tabular-nums";

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
            className="w-full max-w-md bg-[var(--t-panel)] border border-[var(--t-accent)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--t-border)]">
              <span className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                ☀ BRIEFING DE APERTURA
              </span>
              <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
                {fmtFecha(data.fecha)}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[14px] leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Futuros US */}
            {data.futuros.map((f) => (
              <div key={f.label} className={ROW}>
                <span className={LBL}>
                  {f.label}
                  {f.stale && <span className="text-[var(--t-neg)]"> (FEED VIEJO)</span>}
                </span>
                <span className={VAL}>
                  {f.last != null ? nf.format(f.last) : "—"}{" "}
                  <Var pct={f.pct_day} />
                </span>
              </div>
            ))}

            {/* Oficial */}
            <div className={ROW}>
              <span className={LBL}>OFICIAL MAYORISTA</span>
              <span className={VAL}>
                {data.oficial_live?.valor != null ? (
                  <>
                    {nf.format(data.oficial_live.valor)} <Var pct={data.oficial_live.variacion_pct} />
                  </>
                ) : (
                  <span className="text-[var(--t-text-dim)]">aún sin operaciones</span>
                )}
              </span>
            </div>
            {data.a3500 && (
              <div className={ROW}>
                <span className={LBL}>A3500 ({fmtFecha(data.a3500.fecha)})</span>
                <span className={VAL}>
                  {data.a3500.valor != null ? nf.format(Number(data.a3500.valor)) : "—"}{" "}
                  <Var pct={data.a3500.variacion_pct} />
                </span>
              </div>
            )}

            {/* MEP / CCL — cierre del último día hábil */}
            {(["mep", "ccl"] as const).map((k) => {
              const a = data[k];
              return (
                <div key={k} className={ROW}>
                  <span className={LBL}>
                    {k.toUpperCase()} CIERRE {a ? `(${fmtFecha(a.fecha)})` : ""}
                  </span>
                  <span className={VAL}>
                    {a?.cierre != null ? nf.format(Number(a.cierre)) : "—"}{" "}
                    <Var pct={a?.variacion_pct} />
                  </span>
                </div>
              );
            })}

            {/* Footer */}
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-[9px] font-mono text-[var(--t-text-dim)]">
                fuentes: Yahoo (Globex) · MAE · BCRA A3500 · BYMA (MEP/CCL)
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
