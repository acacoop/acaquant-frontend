import type { Metadata } from "next";
import { Header } from "@/components/header";
import { PauseBanner } from "@/components/pause-banner";
import { getMe } from "@/lib/me";
import "./globals.css";

// CRÍTICO para RBAC: el layout se renderea por user (cada user puede tener
// modules distintos). Sin esto, Vercel/Next cachea el render del layout y
// puede servir el HTML de un admin a un trader → el nav muestra MANAGER
// que el trader no debería ver. force-dynamic obliga a re-renderear cada
// request (con su cookie/headers de CF Access).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ACA Valores — Terminal",
  description: "TradingAV — Terminal para mercados argentinos",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const me = await getMe();
  // Si el backend no responde:
  //   - dev (sin API_URL definido) → modules=null = mostrar todo, no romper
  //     el local dev sin Cloudflare Access.
  //   - prod (API_URL definido pero el fetch falla) → modules=[] = solo
  //     módulos públicos. Antes era null/permissive y se filtraba MANAGER
  //     en el nav cuando el getMe fallaba. Fail-closed por seguridad.
  const isProd = !!process.env.API_URL;
  const modules = me?.modules ?? (isProd ? [] : null);
  return (
    <html lang="es" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full flex flex-col">
        <Header modules={modules} />
        <PauseBanner />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        <footer className="flex items-center h-5 px-3 bg-[#080808] border-t border-[#1a1a1a] text-[10px] text-[#555555]">
          <span>ACA VALORES &middot; MERCADO DE CAPITALES</span>
          <span className="ml-auto">MERVAL / ROFEX</span>
        </footer>
      </body>
    </html>
  );
}
