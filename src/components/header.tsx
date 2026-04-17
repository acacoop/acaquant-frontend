"use client";

import Image from "next/image";
import Link from "next/link";
import { NavDropdown } from "./nav-dropdown";

const MERCADO_ITEMS = [
  { href: "/mercado/renta-fija", label: "RENTA FIJA" },
  {
    label: "DERIVADOS",
    children: [{ href: "/mercado/derivados/opciones", label: "OPCIONES" }],
  },
];

const NAV_LINKS = [
  { href: "/portfolios", label: "PORTFOLIOS" },
  { href: "/operaciones", label: "OPERACIONES" },
  { href: "/aum", label: "AUM" },
];

export function Header() {
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
        <NavDropdown label="MERCADO" items={MERCADO_ITEMS} />
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="px-3 py-1 text-[11px] font-semibold tracking-wide text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto text-[10px] text-white/40 tracking-widest font-semibold">
        TERMINAL
      </div>
    </header>
  );
}
