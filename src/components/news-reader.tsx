"use client";

import { useEffect, useState } from "react";

interface ArticleResponse {
  ok: boolean;
  title?: string;
  author?: string;
  date?: string;
  hostname?: string;
  excerpt?: string;
  text?: string;
  url?: string;
  error?: string;
}

interface Props {
  url: string;
  fuente: string;
  tituloFallback: string;
  fechaFallback: string;
  onClose: () => void;
}

function fmtFecha(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function NewsReader({ url, fuente, tituloFallback, fechaFallback, onClose }: Props) {
  const [article, setArticle] = useState<ArticleResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setArticle(null);
    fetch(`/api/news/article?url=${encodeURIComponent(url)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ArticleResponse) => {
        if (!cancelled) setArticle(data);
      })
      .catch((e) => {
        if (!cancelled) setArticle({ ok: false, error: String(e) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const titulo = article?.title || tituloFallback;
  const fechaFormatted = fmtFecha(article?.date || fechaFallback);

  return (
    <div className="h-full flex flex-col min-h-0 border border-[#1a1a1a] bg-[#080808] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          Lectura
        </span>
        <span className="text-[10px] text-[#888888] font-mono">{fuente}</span>
        {article?.hostname && (
          <span className="text-[9px] text-[#555555] font-mono">· {article.hostname}</span>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-[#555555] hover:text-white text-lg leading-none px-2"
          title="Cerrar"
        >
          ×
        </button>
      </div>

      {/* Título + metadata */}
      <div className="px-4 pt-3 pb-2 border-b border-[#1a1a1a] shrink-0">
        <h1 className="text-[15px] font-semibold text-[#d0d0d0] leading-tight">
          {titulo}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[#666666] font-mono">
          {article?.author && <span>{article.author}</span>}
          {article?.author && fechaFormatted && <span>·</span>}
          {fechaFormatted && <span>{fechaFormatted}</span>}
          {url && (
            <>
              <span>·</span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ff9900] hover:text-[#ffb84d] underline decoration-dotted"
              >
                abrir original ↗
              </a>
            </>
          )}
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="text-[11px] text-[#555555] font-mono">Cargando lectura…</div>
        )}
        {!loading && article?.ok && article.text && (
          <article className="text-[12px] text-[#d0d0d0] leading-relaxed whitespace-pre-wrap font-sans">
            {article.text}
          </article>
        )}
        {!loading && (!article || !article.ok) && (
          <div className="text-[11px] text-[#ff9900] font-mono space-y-2">
            <div>
              No pude extraer la nota limpia{article?.error ? `: ${article.error}` : ""}.
            </div>
            <div className="text-[#888888]">
              Puede ser paywall o el medio bloquea scraping. Abrila en el original:
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-2 py-1 border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black uppercase tracking-wide text-[10px]"
            >
              Abrir original ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
