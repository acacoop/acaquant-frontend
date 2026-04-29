// Tooltip explicativo `?` reutilizable. CSS-only con group:hover, sin
// estado React — útil para no afectar performance en componentes con
// polling agresivo. La caja del tooltip arranca al lado del `?` (left/top
// configurables), max-w para que no se desborde, soporta texto largo.
//
// Uso:
//   <InfoIcon tip="Lo que sea que tengas que explicar." />
//   <InfoIcon tip="..." width="320px" align="right" />

interface Props {
  tip: string;
  // Default 260px. Subilo si el texto es largo (multi-párrafo).
  width?: string;
  // Anclaje horizontal del tooltip. Default 'left' (la caja arranca pegada
  // al `?` extendiéndose a la derecha). 'right' invierte (útil cuando el
  // `?` está al borde derecho del contenedor).
  align?: "left" | "right";
}

export function InfoIcon({ tip, width = "260px", align = "left" }: Props) {
  const posClass = align === "right" ? "right-0" : "left-0";
  return (
    <span className="relative inline-block group cursor-help align-middle">
      <span className="text-[8px] text-[#555] hover:text-[#ff9900] border border-[#333] rounded-full px-[3px] leading-[1.2] font-mono">
        ?
      </span>
      <span
        className={`absolute ${posClass} top-full mt-1 z-50 hidden group-hover:block bg-black border border-[#2a2a2a] p-2 text-[10px] text-[#d0d0d0] leading-relaxed shadow-xl normal-case tracking-normal whitespace-normal pointer-events-none`}
        style={{ width }}
      >
        {tip}
      </span>
    </span>
  );
}
