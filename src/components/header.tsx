"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "HOME" },
  { href: "/renta-fija", label: "RENTA FIJA" },
  { href: "/derivados", label: "DERIVADOS" },
  { href: "/retorno", label: "ESTRATEGIA" },
  { href: "/operaciones", label: "OPERACIONES" },
  { href: "/portfolios", label: "PORTFOLIOS" },
  { href: "/aum",     label: "AUM"     },
  { href: "/asistente", label: "ASISTENTE", admin: true },
  { href: "/manager", label: "MANAGER", admin: true },
];

export function Header({ isManager = false }: { isManager?: boolean }) {
  const pathname = usePathname();
  const links = NAV_LINKS.filter((l) => isManager || !l.admin);
  return (
    <header className="flex items-center h-10 px-3 bg-[#094293] border-b border-[#062d66]">
      <Link href="/" className="flex items-center gap-2 mr-6">
        <Image
          src="/logo-header.png"
          alt="ACA Valores"
          width={140}
          height={28}
          className="brightness-0 invert"
          priority
        />
      </Link>
      <div className="h-4 w-px bg-white/20 mr-4" />
      <nav className="flex gap-0.5 items-center">
        {links.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                active
                  ? "text-white bg-white/15"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto text-[10px] text-white/40 tracking-widest font-semibold">
        TERMINAL
      </div>
    </header>
  );
}
