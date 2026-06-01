"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Marca el <body> con data-section="mercados" cuando la ruta es de Mercados.
// Lo usa globals.css para poner la marca de agua del logo SOLO en los charts de
// esas vistas (y solo en modo claro). Sin tocar el layout de cada vista.
const MERCADOS = ["/renta-fija", "/derivados", "/agro", "/sinteticos", "/renta-variable", "/retorno"];

export function SectionMarker() {
  const pathname = usePathname();
  useEffect(() => {
    const isMercados = MERCADOS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (isMercados) document.body.setAttribute("data-section", "mercados");
    else document.body.removeAttribute("data-section");
  }, [pathname]);
  return null;
}
