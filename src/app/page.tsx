"use client";

import { useState } from "react";
import { NewsPanel, type Headline } from "@/components/news-panel";
import { NewsReader } from "@/components/news-reader";

export default function Home() {
  const [article, setArticle] = useState<Headline | null>(null);

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* Columna izquierda — reader si hay artículo seleccionado, placeholder si no */}
        <div className="min-h-0">
          {article ? (
            <NewsReader
              url={article.url}
              fuente={article.fuente}
              tituloFallback={article.titulo}
              fechaFallback={article.fecha_publicacion}
              onClose={() => setArticle(null)}
            />
          ) : (
            <div className="h-full border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-[#555555] text-xs font-mono text-center px-6">
              Clickeá una noticia del feed para leerla acá
              <br />
              sin salir de la terminal.
            </div>
          )}
        </div>

        {/* Columna derecha — news panel live */}
        <div className="min-h-0">
          <NewsPanel
            onSelect={(h) => setArticle(h)}
            selectedUrl={article?.url ?? null}
          />
        </div>
      </div>
    </div>
  );
}
