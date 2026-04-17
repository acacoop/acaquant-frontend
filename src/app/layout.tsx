import type { Metadata } from "next";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACA Valores — Terminal",
  description: "TradingAV — Terminal para mercados argentinos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full flex flex-col">
        <Header />
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        <footer className="flex items-center h-5 px-3 bg-[#080808] border-t border-[#1a1a1a] text-[10px] text-[#555555]">
          <span>ACA VALORES &middot; MERCADO DE CAPITALES</span>
          <span className="ml-auto">MERVAL / ROFEX</span>
        </footer>
      </body>
    </html>
  );
}
