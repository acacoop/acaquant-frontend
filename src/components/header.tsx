"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// module coincide con core/roles.py::MODULES en el backend. Link visible
// si el user tiene ese módulo en /api/me.modules.
const NAV_LINKS: { href: string; label: string; module: string }[] = [
  { href: "/",                label: "HOME",          module: "home" },
  { href: "/renta-fija",      label: "RENTA FIJA",    module: "renta-fija" },
  { href: "/derivados",       label: "DERIVADOS",     module: "derivados" },
  { href: "/agro",            label: "AGRO",          module: "agro" },
  { href: "/sinteticos",      label: "SINTÉTICOS",    module: "sinteticos" },
  { href: "/renta-variable",  label: "RENTA VARIABLE",module: "renta-variable" },
  { href: "/retorno",         label: "ESTRATEGIA",    module: "estrategia" },
  { href: "/operar",          label: "OPERAR",        module: "operar" },
  { href: "/operaciones",     label: "OPERACIONES",   module: "operaciones" },
  { href: "/aum",             label: "AUM",           module: "portfolios" },
  { href: "/valuaciones",     label: "VALUACIONES",   module: "portfolios" },
  { href: "/manager",         label: "MANAGER",       module: "manager" },
];

export function Header({ modules = null }: { modules?: string[] | null }) {
  const pathname = usePathname();
  // modules === null → dev mode / backend caído: mostrar todos los links.
  // modules === [] o distinto → filtrar por pertenencia.
  const links =
    modules === null
      ? NAV_LINKS
      : NAV_LINKS.filter((l) => modules.includes(l.module));
  return (
    <header className="flex items-center h-10 px-3 bg-[#094293] border-b border-[#062d66]">
      <Link href="/" className="flex items-center gap-2 mr-6">
        <Image
          src="/logo-login.png"
          alt="ACA Valores"
          width={140}
          height={28}
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
