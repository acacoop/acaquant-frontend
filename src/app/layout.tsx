import type { Metadata } from "next";
import { Header } from "@/components/header";
import { PauseBanner } from "@/components/pause-banner";
import { TopTicker } from "@/components/top-ticker";
import { getMe } from "@/lib/me";
import "./globals.css";

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
  // Si el backend no responde (dev sin API_URL, o caído) → modules=null
  // y el Header muestra todo (modo permissive para no romper local dev).
  const modules = me?.modules ?? null;
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
        <TopTicker />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        <footer className="flex items-center h-5 px-3 bg-[#080808] border-t border-[#1a1a1a] text-[10px] text-[#555555]">
          <span>ACA VALORES &middot; MERCADO DE CAPITALES</span>
          <span className="ml-auto">MERVAL / ROFEX</span>
        </footer>
      </body>
    </html>
  );
}
