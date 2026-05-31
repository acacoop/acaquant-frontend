"use client";

export function DualRange({
  min,
  max,
  lo,
  hi,
  setLo,
  setHi,
}: {
  min: number;
  max: number;
  lo: number;
  hi: number;
  setLo: (v: number) => void;
  setHi: (v: number) => void;
}) {
  const range = max - min || 1;
  const loPct = ((lo - min) / range) * 100;
  const hiPct = ((hi - min) / range) * 100;
  return (
    <div className="relative flex-1 h-4 flex items-center">
      <div className="absolute inset-x-0 h-[2px] bg-[#2a2a2a] rounded pointer-events-none" />
      <div
        className="absolute h-[2px] bg-[var(--t-accent)] rounded pointer-events-none"
        style={{ left: `${loPct}%`, width: `${Math.max(0, hiPct - loPct)}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={lo}
        onChange={(e) => setLo(Math.min(+e.target.value, hi))}
        className="dual-range-input absolute w-full h-0"
        style={{ zIndex: lo >= hi ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={hi}
        onChange={(e) => setHi(Math.max(+e.target.value, lo))}
        className="dual-range-input absolute w-full h-0"
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
