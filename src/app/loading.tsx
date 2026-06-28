// Loading UI global del App Router. Next lo muestra automáticamente (vía
// Suspense) mientras una página suspende — es decir, mientras se resuelve el
// render dinámico (force-dynamic) de la ruta destino.
//
// POR QUÉ EXISTE: sin loading.tsx, al hacer click en un <Link> hacia una página
// force-dynamic el router se queda BLOQUEADO en silencio hasta que termina todo
// el SSR (en renta-fija son 9 fetches al backend) — sin ningún feedback visual,
// con lo cual "parece que no hace nada". Con este archivo, el click cambia de
// pantalla al instante y muestra este loader hasta que la página está lista.
//
// Aplica a TODA la app (segmento raíz) salvo que un segmento defina el suyo.
// El layout (Header + footer) persiste; esto solo ocupa el <main>.
export default function Loading() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--t-panel)]">
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-widest uppercase text-[var(--t-text-dim)]">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--t-border-2)] border-t-[var(--t-accent)]" />
        Cargando…
      </div>
    </div>
  );
}
