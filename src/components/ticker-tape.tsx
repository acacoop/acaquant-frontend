"use client";

interface TickerItem {
  label: string;
  value: string;
  color: string;
}

export function TickerTape({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  // Duplicate items for seamless loop
  const allItems = [...items, ...items];

  return (
    <div className="ticker-wrap bg-[#080808] border-b border-[#1a1a1a] h-7 flex items-center overflow-hidden">
      <div className="ticker-content flex items-center gap-8 px-4">
        {allItems.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold text-[#555555] tracking-wide">
              {item.label}
            </span>
            <span
              className="text-[12px] font-bold"
              style={{ color: item.color }}
            >
              {item.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
