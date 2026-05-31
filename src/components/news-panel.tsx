"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NewsReader } from "./news-reader";

export interface Headline {
  url: string;
  fuente: string;
  categoria: string;
  titulo: string;
  excerpt?: string;
  fecha_publicacion: string; // ISO
  fetched_at?: string;
}

// Colores por fuente — tipo Bloomberg (cada source con un acento).
const FUENTE_COLOR: Record<string, string> = {
  "Ámbito":       "#ff9900",
  "Cronista":     "#4a9eff",
  "Infobae":      "#bb66ff",
  "iProfesional": "#00cc66",
  "La Nación":    "#ff6666",
  "Clarín":       "#ffcc00",
  "BAE":          "#66ddcc",
};

const FUENTE_BG: Record<string, string> = {
  "Ámbito":       "bg-[#ff9900]/10",
  "Cronista":     "bg-[#4a9eff]/10",
  "Infobae":      "bg-[#bb66ff]/10",
  "iProfesional": "bg-[#00cc66]/10",
  "La Nación":    "bg-[#ff6666]/10",
  "Clarín":       "bg-[#ffcc00]/10",
  "BAE":          "bg-[#66ddcc]/10",
};

const CATEGORIAS = [
  { v: "all",      label: "Todas"    },
  { v: "economia", label: "Economía" },
  { v: "finanzas", label: "Finanzas" },
  { v: "mercados", label: "Mercados" },
];

const POLL_MS = 60_000;

function fmtHora(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mismoDia = d.toDateString() === now.toDateString();
  if (mismoDia) {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return (
    d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}

export function NewsPanel() {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string>("all");
  const [fuenteFiltro, setFuenteFiltro] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [newUrls, setNewUrls] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Headline | null>(null);
  const urlsSeenRef = useRef<Set<string>>(new Set());

  const fetchHeadlines = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (categoria !== "all") qs.set("categoria", categoria);
      qs.set("limit", "150");
      const res = await fetch(`/api/news?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Headline[] = await res.json();
      // Detectar nuevos (URLs no vistas)
      const nuevos = new Set<string>();
      if (urlsSeenRef.current.size > 0) {
        for (const h of data) {
          if (!urlsSeenRef.current.has(h.url)) nuevos.add(h.url);
        }
      }
      for (const h of data) urlsSeenRef.current.add(h.url);
      setHeadlines(data);
      if (nuevos.size > 0) {
        setNewUrls(nuevos);
        // Limpiar flash después de 8s
        setTimeout(() => setNewUrls(new Set()), 8000);
      }
      setLastFetch(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [categoria]);

  useEffect(() => {
    fetchHeadlines();
    const iv = setInterval(fetchHeadlines, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchHeadlines]);

  // Lista de fuentes presentes (para chips de filtro)
  const fuentesPresentes = useMemo(() => {
    const s = new Set(headlines.map((h) => h.fuente));
    return Array.from(s).sort();
  }, [headlines]);

  const visibles = useMemo(() => {
    if (!fuenteFiltro) return headlines;
    return headlines.filter((h) => h.fuente === fuenteFiltro);
  }, [headlines, fuenteFiltro]);

  // Si hay artículo expandido, mostramos el reader ocupando el mismo espacio.
  if (expanded) {
    return (
      <NewsReader
        url={expanded.url}
        fuente={expanded.fuente}
        tituloFallback={expanded.titulo}
        fechaFallback={expanded.fecha_publicacion}
        onClose={() => setExpanded(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 border border-[#1a1a1a] bg-[var(--t-panel)]">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          Noticias
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: loading ? "#ff9900" : "#00cc66" }}
        />
        <span className="text-[9px] text-[#555555] tracking-wide uppercase">
          {loading
            ? "cargando…"
            : lastFetch
            ? `live · ${lastFetch.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
            : "—"}
        </span>
        <span className="text-[9px] text-[#555555]">· poll 60s</span>
        <span className="ml-auto text-[9px] text-[#555555]">{visibles.length} notas</span>
      </div>

      {/* Filtros por categoría */}
      <div className="px-2 py-1.5 border-b border-[#1a1a1a] flex flex-wrap items-center gap-1 shrink-0">
        {CATEGORIAS.map((c) => (
          <button
            key={c.v}
            onClick={() => setCategoria(c.v)}
            className={`px-2 py-0.5 text-[9px] font-mono border uppercase tracking-wide ${
              categoria === c.v
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="w-px h-3 bg-[#2a2a2a] mx-1" />
        {fuentesPresentes.map((f) => {
          const color = FUENTE_COLOR[f] ?? "#888888";
          const active = fuenteFiltro === f;
          return (
            <button
              key={f}
              onClick={() => setFuenteFiltro(active ? null : f)}
              className="px-1.5 py-0.5 text-[9px] font-mono border uppercase tracking-wide"
              style={{
                color: active ? "#000" : color,
                background: active ? color : "transparent",
                borderColor: color,
              }}
              title={`Filtrar por ${f}`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Lista de headlines */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="px-3 py-2 text-[10px] text-[#ff3333] font-mono">Error: {error}</div>
        )}
        {!loading && visibles.length === 0 && (
          <div className="px-3 py-6 text-[11px] text-[#555555] text-center font-mono">
            Sin noticias todavía. El cron las ingesta cada 15 min.
          </div>
        )}
        <ul className="font-mono">
          {visibles.map((h) => {
            const color = FUENTE_COLOR[h.fuente] ?? "#888888";
            const flash = newUrls.has(h.url);
            const bg = FUENTE_BG[h.fuente] ?? "bg-[#1a1a1a]/20";
            return (
              <li
                key={h.url}
                className={`border-b border-[#111111] transition-colors hover:bg-[var(--t-surface)] ${
                  flash ? "bg-[#ff9900]/15 animate-pulse" : ""
                }`}
              >
                <button
                  onClick={() => setExpanded(h)}
                  className="block w-full text-left px-3 py-1.5 group cursor-pointer"
                >
                  <div className="flex items-start gap-2 text-[10px]">
                    <span className="text-[#555555] shrink-0 w-[44px] tabular-nums">
                      {fmtHora(h.fecha_publicacion)}
                    </span>
                    <span
                      className={`shrink-0 px-1 ${bg} uppercase tracking-wide font-semibold`}
                      style={{ color }}
                    >
                      {h.fuente.replace("Ámbito", "AMB").slice(0, 7)}
                    </span>
                    <span className="text-[11px] text-[#d0d0d0] group-hover:text-white leading-tight">
                      {h.titulo}
                    </span>
                  </div>
                  {h.excerpt && (
                    <div className="pl-[52px] mt-0.5 text-[10px] text-[#666666] leading-snug line-clamp-2 group-hover:text-[#888888]">
                      {h.excerpt}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
