"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { IaVistaPanel } from "@/components/ia-vista-panel";
import { useIsGuest } from "@/lib/use-is-guest";

// Cada vista gateada por su `module` (coincide con core/roles.py::MODULES).
// La nav agrupa las vistas: links sueltos (HOME, OPERAR, CARTERAS, BACK OFFICE,
// MANAGER) + dropdowns (MERCADOS, NEGOCIO). Un grupo aparece solo si el user
// tiene al menos una vista adentro.
type Leaf = { href: string; label: string; module: string };
type Entry =
  | ({ kind: "link" } & Leaf)
  | { kind: "group"; label: string; items: Leaf[] };

// Sub-módulos de manager: cualquier rol con uno de estos ve el link MANAGER
// (la propia view filtra qué tabs muestra). `asistente_comercial` tiene
// manager_clientes pero NO el umbrella `manager`.
const MANAGER_MODULES = [
  "manager",
  "manager_clientes",
  "manager_clientes_bulk",
];

// Vistas con copiloto IA cuyo botón vive ACÁ, en el slot derecho del header
// (donde estaba el texto TERMINAL) — pedido del user 2026-07-12: usar el lugar
// que ya existe, no crear una franja nueva por vista. /trading NO está en el
// mapa: su botón vive en la propia vista porque va cableado a las tarjetas y
// al vigía (getParams/preguntaExterna). El panel se auto-oculta sin módulo ia.
const VISTA_IA_POR_RUTA: Record<string, string> = {
  "/": "home",
  "/renta-fija": "renta_fija",
  "/renta-variable": "renta_variable",
};

const NAV: Entry[] = [
  { kind: "link", href: "/",            label: "HOME",        module: "home" },
  { kind: "link", href: "/operar",      label: "OPERAR",      module: "operar" },
  { kind: "link", href: "/trading",     label: "TRADING",     module: "trading" },
  {
    kind: "group",
    label: "MERCADOS",
    // Items ordenados alfabéticamente (A→Z) por label.
    items: [
      { href: "/agro",           label: "Agro",           module: "agro" },
      { href: "/derivados",      label: "Derivados",      module: "derivados" },
      { href: "/retorno",        label: "Estrategia",     module: "estrategia" },
      { href: "/ons",            label: "ONs",            module: "renta-fija" },
      { href: "/renta-fija",     label: "Renta Fija",     module: "renta-fija" },
      { href: "/renta-variable", label: "Renta Variable", module: "renta-variable" },
      { href: "/sinteticos",     label: "Sintéticos",     module: "sinteticos" },
    ],
  },
  {
    kind: "group",
    label: "NEGOCIO",
    // Items ordenados alfabéticamente (A→Z) por label.
    items: [
      { href: "/aum",          label: "AUM",          module: "portfolios" },
      { href: "/valuaciones",  label: "Carteras",     module: "portfolios" },
      { href: "/contrapartes", label: "Contrapartes", module: "operaciones" },
      { href: "/operaciones",  label: "Operaciones",  module: "operaciones" },
      { href: "/operadores",   label: "Operadores",   module: "operaciones" },
      { href: "/referidos",    label: "Referidos",    module: "operaciones" },
    ],
  },
  { kind: "link", href: "/back-office", label: "BACK OFFICE", module: "back-office" },
  { kind: "link", href: "/manager",     label: "MANAGER",     module: "manager" },
];

// modules === null → dev mode / backend caído: mostrar todo.
function hasModule(modules: string[] | null, module: string): boolean {
  if (modules === null) return true;
  if (module === "manager") return MANAGER_MODULES.some((m) => modules.includes(m));
  return modules.includes(module);
}

export function Header({ modules = null }: { modules?: string[] | null }) {
  const pathname = usePathname();
  // Portal invitado (www): el menú de mercado va como entradas sueltas (sin el
  // dropdown MERCADOS). El portal interno mantiene el dropdown. Solo UX.
  const isGuest = useIsGuest();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  // Filtrado RBAC: links por su módulo; grupos quedan con sus items visibles
  // y se ocultan si no queda ninguno. Para el invitado, MERCADOS se aplana a
  // links top-level.
  const entries: Entry[] = [];
  for (const e of NAV) {
    if (e.kind === "link") {
      if (hasModule(modules, e.module)) entries.push(e);
      continue;
    }
    const items = e.items.filter((it) => hasModule(modules, it.module));
    if (!items.length) continue;
    if (isGuest && e.label === "MERCADOS") {
      for (const it of items) entries.push({ kind: "link", ...it });
    } else {
      entries.push({ ...e, items });
    }
  }

  const linkClass = (active: boolean) =>
    "px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors " +
    (active
      ? "text-white bg-white/15"
      : "text-white/60 hover:text-white hover:bg-white/10");

  return (
    <header className="relative z-50 flex items-center h-10 px-3 bg-[#094293] border-b border-[#062d66]">
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
        {entries.map((e) => {
          if (e.kind === "link") {
            return (
              <Link key={e.href} href={e.href} className={linkClass(isActive(e.href))}>
                {e.label}
              </Link>
            );
          }
          const groupActive = e.items.some((it) => isActive(it.href));
          return (
            <div key={e.label} className="relative group">
              <button type="button" className={linkClass(groupActive) + " inline-flex items-center gap-1 cursor-default"}>
                {e.label}
                <span className="text-[7px] leading-none opacity-70">▼</span>
              </button>
              {/* Dropdown — aparece on-hover (CSS puro, sin estado). */}
              <div className="absolute left-0 top-full hidden group-hover:block z-50 min-w-[180px] bg-[#073876] border border-[#0b50ad] shadow-xl py-1">
                {e.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={
                      "block px-3 py-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap transition-colors " +
                      (isActive(it.href)
                        ? "text-white bg-white/15"
                        : "text-white/70 hover:text-white hover:bg-white/10")
                    }
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center">
        {VISTA_IA_POR_RUTA[pathname] ? (
          <IaVistaPanel vista={VISTA_IA_POR_RUTA[pathname]} />
        ) : (
          <span className="text-[10px] text-white/40 tracking-widest font-semibold">
            TERMINAL
          </span>
        )}
      </div>
    </header>
  );
}
