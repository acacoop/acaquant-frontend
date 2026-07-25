"use client";

import { Fragment, useEffect, useState } from "react";

/**
 * CALENDARIO económico — chip de la watchlist HOME (se renderiza DENTRO del
 * panel watchlist, por eso no trae borde ni header propio). Próximos eventos
 * AR/US/BR de alto impacto (feed FMP → home.market_calendar), agrupados por día.
 * Fuente: GET /api/calendario. Poll 5 min (el dato cambia 1×/día).
 */
type CalEvent = {
  evt_ts: string;
  country: string;
  event: string;
  impact: number;
  actual: number | string | null;
  prev: number | string | null;
  estimate: number | string | null;
  unit: string | null;
};

const POLL_MS = 300_000;

// Bandera por país (los 3 que seguimos).
const FLAG: Record<string, string> = { AR: "🇦🇷", US: "🇺🇸", BR: "🇧🇷" };

function fmtDia(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    weekday: "short", day: "2-digit", month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
function fmtHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
function fmtVal(v: number | string | null, unit: string | null): string {
  if (v == null || v === "") return "—";
  const s = typeof v === "number" ? v.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : String(v);
  return unit ? `${s}${unit}` : s;
}

export function CalendarioPanel() {
  const [data, setData] = useState<CalEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/calendario", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: CalEvent[]) => { if (alive) { setData(j); setErr(null); } })
        .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "error"); });
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Agrupar por día (ART).
  const grupos: [string, CalEvent[]][] = [];
  if (data) {
    const map = new Map<string, CalEvent[]>();
    for (const ev of data) {
      const dia = fmtDia(ev.evt_ts);
      (map.get(dia) ?? map.set(dia, []).get(dia)!).push(ev);
    }
    for (const [k, v] of map) grupos.push([k, v]);
  }

  return (
    <>
      {err ? (
          <p className="p-3 text-[11px] text-[var(--t-neg)]">Error: {err}</p>
        ) : !data ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
        ) : grupos.length === 0 ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin eventos próximos. (¿Corrió el job del calendario con FMP?)</p>
        ) : (
          <table className="w-full text-[10px]">
            <tbody>
              {grupos.map(([dia, evs]) => (
                <Fragment key={`grp-${dia}`}>
                  <tr className="bg-[var(--t-surface-2)]">
                    <td colSpan={4} className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--t-text-dim)]">
                      {dia}
                    </td>
                  </tr>
                  {evs.map((ev, i) => (
                    <tr key={`${dia}-${i}`} className="border-b border-[var(--t-border-2)] hover:bg-[var(--t-border)]">
                      <td className="px-2 py-1 tabular-nums text-[var(--t-text-muted)] whitespace-nowrap">{fmtHora(ev.evt_ts)}</td>
                      <td className="px-1 py-1 whitespace-nowrap">{FLAG[ev.country] ?? ev.country}</td>
                      <td className="px-2 py-1 text-[var(--t-text)]">{ev.event}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-[var(--t-text-dim)] whitespace-nowrap" title="est. / previo">
                        {ev.estimate != null && ev.estimate !== ""
                          ? `est ${fmtVal(ev.estimate, ev.unit)}`
                          : ev.prev != null && ev.prev !== ""
                          ? `prev ${fmtVal(ev.prev, ev.unit)}`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
      )}
    </>
  );
}
