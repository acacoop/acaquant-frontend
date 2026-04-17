"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

interface MenuItem {
  href?: string;
  label: string;
  children?: MenuItem[];
}

export function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-1 text-[11px] font-semibold tracking-wide text-white/60 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
      >
        {label}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0.5 min-w-[180px] bg-[#0e0e0e] border border-[#2a2a2a] shadow-lg z-50">
          {items.map((item) => (
            <DropdownItem
              key={item.label}
              item={item}
              onClose={() => setOpen(false)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const [subOpen, setSubOpen] = useState(false);

  if (item.children) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[#808080] hover:text-white hover:bg-[#1a1a1a] cursor-default">
          {item.label}
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        {subOpen && (
          <div className="absolute top-0 left-full min-w-[160px] bg-[#0e0e0e] border border-[#2a2a2a] shadow-lg">
            {item.children.map((child) => (
              <DropdownItem
                key={child.label}
                item={child}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className="block px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[#808080] hover:text-white hover:bg-[#1a1a1a]"
      >
        {item.label}
      </Link>
    );
  }

  return null;
}
