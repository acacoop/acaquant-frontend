"use client";

// Error boundary global. Next 15+ lo monta automáticamente en cada route
// group que no tenga su propio error.tsx. Evita que un componente que
// rompa deje toda la página en blanco.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="h-full min-h-screen flex items-center justify-center bg-[var(--t-panel)] p-6">
      <div className="max-w-xl border border-[#ff3333]/40 bg-[var(--t-panel)] p-6 font-mono space-y-3">
        <div className="text-[#ff3333] text-xs uppercase tracking-wider">
          Error en la vista
        </div>
        <div className="text-[var(--t-text)] text-sm">
          Algo rompió al renderizar. Si persiste, revisá logs de la API o del
          motor correspondiente.
        </div>
        <pre className="text-[10px] text-[var(--t-text-dim)] whitespace-pre-wrap bg-[var(--t-panel)] border border-[var(--t-border)] p-2 overflow-x-auto">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="flex gap-2 pt-1">
          <button
            onClick={reset}
            className="px-3 py-1 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-3 py-1 text-[11px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
