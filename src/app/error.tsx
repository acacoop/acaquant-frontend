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
      <div className="max-w-xl border border-[#ff3333]/40 bg-[#0a0a0a] p-6 font-mono space-y-3">
        <div className="text-[#ff3333] text-xs uppercase tracking-wider">
          Error en la vista
        </div>
        <div className="text-[#d0d0d0] text-sm">
          Algo rompió al renderizar. Si persiste, revisá logs de la API o del
          motor correspondiente.
        </div>
        <pre className="text-[10px] text-[#808080] whitespace-pre-wrap bg-[var(--t-panel)] border border-[#1a1a1a] p-2 overflow-x-auto">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="flex gap-2 pt-1">
          <button
            onClick={reset}
            className="px-3 py-1 text-[11px] font-semibold border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black transition-colors"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-3 py-1 text-[11px] font-semibold border border-[#2a2a2a] text-[#808080] hover:text-[#ff9900] hover:border-[#ff9900] transition-colors"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
