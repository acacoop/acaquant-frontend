import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/header";
import { PauseBanner } from "@/components/pause-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { SectionMarker } from "@/components/section-marker";
import { getMe } from "@/lib/me";
import "./globals.css";

// CRÍTICO para RBAC: el layout se renderea por user (cada user puede tener
// modules distintos). Sin esto, Vercel/Next cachea el render del layout y
// puede servir el HTML de un admin a un trader → el nav muestra MANAGER
// que el trader no debería ver. force-dynamic obliga a re-renderear cada
// request (con su cookie/headers de CF Access).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ACAQuant",
  description: "TradingAV — Terminal para mercados argentinos",
};

// Self-host de la fuente (antes era un <link> render-blocking a Google Fonts).
// Setea --font-jb-mono, que globals.css usa como primaria de --font-mono.
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jb-mono",
  display: "swap",
});

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
    <html lang="es" className={`h-full ${jbMono.variable}`}>
      <head>
        {/* Anti-parpadeo: aplica el tema guardado ANTES del primer paint, así
            no se ve un flash de oscuro→claro al recargar en modo claro. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('aca-theme')==='light')document.documentElement.classList.add('light')}catch(e){}",
          }}
        />
      </head>
      <body className="h-full flex flex-col">
        <SectionMarker />
        <Header modules={modules} />
        <PauseBanner />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        <footer className="flex items-center gap-3 h-5 px-3 bg-[var(--t-panel)] border-t border-[var(--t-border)] text-[10px] text-[var(--t-text-muted)]">
          <ThemeToggle />
          <span>ACA VALORES &middot; MERCADO DE CAPITALES</span>
          <span className="ml-auto">MERVAL / ROFEX</span>
        </footer>
      </body>
    </html>
  );
}
