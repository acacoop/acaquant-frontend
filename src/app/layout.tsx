import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AnuncioChicagoModal } from "@/components/anuncio-chicago-modal";
import { AnuncioDiferenciasDiariasModal } from "@/components/anuncio-diferencias-diarias-modal";
import { AnuncioDolarFuturoModal } from "@/components/anuncio-dolar-futuro-modal";
import { SaludAlertasModal } from "@/components/salud-alertas-modal";
import { SaludBoton } from "@/components/salud-boton";
import { AnuncioResearchModal } from "@/components/anuncio-research-modal";
import { BriefingModal } from "@/components/briefing-modal";
import { Header } from "@/components/header";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <html lang="es" className={`h-full light ${jbMono.variable}`}>
      <head>
        {/* Anti-parpadeo: el DEFAULT es claro (clase 'light' en <html>). Solo se
            saca si el usuario eligió oscuro explícitamente. Corre antes del paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('aca-theme')==='dark')document.documentElement.classList.remove('light')}catch(e){}",
          }}
        />
      </head>
      <body className="h-full flex flex-col">
        <Header modules={modules} />

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>

        {/* SALUD: avisa al admin cuando algo se rompe, en vez de esperar a que
            entre a mirar. Solo se abre ante una transición NUEVA sin ver. */}
        <SaludAlertasModal />

        {/* Botón flotante: el modal automático solo salta ante un incidente
            confirmado; esto permite mirar cuando uno quiere, sin entrar a Manager. */}
        <SaludBoton />

        {/* Anuncio de lanzamiento de la nueva vista RESEARCH (solo 20-21 jul 2026). */}
        <AnuncioResearchModal />

        {/* Anuncio de los precios de CHICAGO en AGRO (solo 24 jul 2026). */}
        <AnuncioChicagoModal />

        {/* Anuncio de la nueva vista OPERACIONES → DÓLAR FUTURO (mesa, no invitado). */}
        <AnuncioDolarFuturoModal />

        {/* Anuncio de la nueva vista OPERACIONES → DIFERENCIAS DIARIAS (mesa, no invitado). */}
        <AnuncioDiferenciasDiariasModal />


        <footer className="flex items-center gap-3 h-5 px-3 bg-[var(--t-panel)] border-t border-[var(--t-border)] text-[10px] text-[var(--t-text-muted)]">
          <ThemeToggle />
          <span>ACA VALORES &middot; MERCADO DE CAPITALES</span>
          <div className="ml-auto flex items-center gap-3">
            {/* Briefing de apertura (QuantAI P1): botón inline + modal.
                Se auto-oculta sin módulo `ia` (decide el backend). */}
            <BriefingModal />
            <span>MERVAL / ROFEX</span>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
