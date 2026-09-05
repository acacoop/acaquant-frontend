"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

// (2026-08-19) Acá vivía el botón CONSULTALE A LA IA del header, con su mapa de
// ruta → vista del copiloto. Se dio de baja junto con el copiloto entero: la IA
// de la plataforma pasa a ser el AV AGENT (backend `docs/AGENT.md`), que tiene su
// propio botón en la barra inferior.

const NAV: Entry[] = [
  { kind: "link", href: "/",            label: "HOME",        module: "home" },
  { kind: "link", href: "/operar",      label: "OPERAR",      module: "operar" },
  { kind: "link", href: "/trading",     label: "TRADING",     module: "trading" },
  { kind: "link", href: "/research",     label: "RESEARCH",    module: "research" },
  // ACA: vista PROPIA de primer nivel, no un item de NEGOCIO — es la cartera de
  // la casa y la mira gerencia, no es una vista más de la operación diaria.
  // Módulo `aca` del RBAC (rol EMPLEADO ACA); el backend además se lo agrega a
  // me.modules a quien pueda escribir (allowlist de Mesa de Dinero) aunque no
  // tenga el rol — escribir implica ver.
  { kind: "link", href: "/aca",         label: "ACA",         module: "aca" },
  {
    kind: "group",
    label: "MERCADOS",
    // El orden lo pone `ordenarAZ` en el render — acá se agrega donde caiga.
    items: [
      { href: "/agro",           label: "Agro",           module: "agro" },
      { href: "/derivados",      label: "Derivados",      module: "derivados" },
      { href: "/renta-fija",     label: "Renta Fija",     module: "renta-fija" },
      { href: "/renta-variable", label: "Renta Variable", module: "renta-variable" },
      { href: "/sinteticos",     label: "Sintéticos",     module: "sinteticos" },
    ],
  },
  {
    kind: "group",
    label: "NEGOCIO",
    // El orden lo pone `ordenarAZ` en el render — acá se agrega donde caiga.
    items: [
      { href: "/aum",          label: "AUM",           module: "portfolios" },
      { href: "/valuaciones",  label: "Carteras",      module: "portfolios" },
      { href: "/contrapartes", label: "Contrapartes",  module: "operaciones" },
      // `mesa-dinero` NO es un módulo del RBAC: es una CAPACIDAD per-usuario que
      // /api/me publica dentro de `modules` cuando el email está en la allowlist
      // (Manager → MESA → ACCESO). Se filtra igual que un módulo a propósito, para
      // no duplicar el mecanismo de nav.
      { href: "/mesa-dinero",  label: "Mesa de Dinero", module: "mesa-dinero" },
      { href: "/operaciones",  label: "Operaciones",   module: "operaciones" },
      { href: "/operadores",   label: "Operadores",    module: "operaciones" },
      { href: "/referidos",    label: "Referidos",     module: "operaciones" },
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

// Orden A→Z de la nav, con HOME SIEMPRE primero (es la vista por default: sacarla
// de la izquierda rompería el reflejo de todo el mundo).
//
// Ordena en español (`es`) para que los acentos no manden SINTÉTICOS al final, y
// ordena TAMBIÉN los items de cada grupo: así una vista nueva entra en su lugar
// sola, sin depender de que quien la agregue se acuerde de insertarla ordenada —
// que es exactamente cómo esta lista se había desordenado.
//
// Lo usan los DOS portales (interno e invitado): el criterio de orden existe una
// sola vez, así el nav no puede quedar ordenado de una forma acá y de otra allá.
function ordenarAZ(entries: Entry[]): Entry[] {
  const porLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, "es");
  return [...entries]
    .map((e) => (e.kind === "link" ? e : { ...e, items: [...e.items].sort(porLabel) }))
    .sort((a, b) => {
      const aHome = a.kind === "link" && a.href === "/";
      const bHome = b.kind === "link" && b.href === "/";
      if (aHome !== bHome) return aHome ? -1 : 1;
      return porLabel(a, b);
    });
}

// Portal invitado: la nav es una fila plana y TODA en mayúscula. El ORDEN lo pone
// `ordenarAZ` (el mismo del portal interno); acá solo se cambia la grafía.
function navInvitado(entries: Entry[]): Entry[] {
  return ordenarAZ(
    entries.map((e) =>
      e.kind === "link"
        ? { ...e, label: e.label.toUpperCase() }
        : { ...e, label: e.label.toUpperCase(), items: e.items.map((it) => ({ ...it, label: it.label.toUpperCase() })) },
    ),
  );
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
  const crudas: Entry[] = [];
  for (const e of NAV) {
    if (e.kind === "link") {
      if (hasModule(modules, e.module)) crudas.push(e);
      continue;
    }
    const items = e.items.filter((it) => hasModule(modules, it.module));
    if (!items.length) continue;
    if (isGuest && e.label === "MERCADOS") {
      for (const it of items) crudas.push({ kind: "link", ...it });
    } else {
      crudas.push({ ...e, items });
    }
  }
  const entries = isGuest ? navInvitado(crudas) : ordenarAZ(crudas);

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
      </div>
    </header>
  );
}
