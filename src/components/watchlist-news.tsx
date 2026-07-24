"use client";

import { usePoll } from "@/lib/use-poll";
import { fmtTs } from "./ui";

// Tab NOTICIAS de la watchlist HOME — titulares Reuters del feed Eikon de
// oficina (universo curado server-side: papeles relevantes + soberanos off).
// Solo titulares; se mueven únicamente con el feed prendido.

const POLL_MS = 60_000;

interface NewsRow {
  story_id: string;
  ticker: string;
  ric: string;
  fecha: string | null;
  titular: string;
  fuente: string | null;
}

interface NewsResp {
  news: NewsRow[];
}

const EMPTY: NewsResp = { news: [] };

export function WatchlistNews() {
  const { data } = usePoll<NewsResp>("/api/eikon-news", EMPTY, POLL_MS, {
    fetchOnMount: true,
  });

  if (data.news.length === 0) {
    return (
      <div className="px-3 py-6 text-[11px] text-[var(--t-text-muted)] text-center font-mono">
        Sin titulares — el feed Eikon de oficina todavía no mandó noticias.
      </div>
    );
  }

  return (
    <div>
      {data.news.map((n) => (
        <div
          key={n.story_id}
          className="px-2.5 py-1.5 border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-mono font-bold px-1.5 py-px rounded-sm bg-[var(--t-accent)]/15 text-[var(--t-accent)]">
              {n.ticker}
            </span>
            {n.fecha && (
              <span className="text-[9px] font-mono text-[var(--t-text-muted)]">
                {fmtTs(n.fecha)}
              </span>
            )}
          </div>
          <div className="text-[11px] leading-snug text-[var(--t-text)]">{n.titular}</div>
        </div>
      ))}
    </div>
  );
}
