import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACA Valores — Terminal",
  description: "TradingAV — Terminal para mercados argentinos",
};

const NAV_ITEMS = [
  { href: "/mercado", label: "MERCADO" },
  { href: "/opciones", label: "OPCIONES" },
  { href: "/portfolios", label: "PORTFOLIOS" },
  { href: "/operaciones", label: "OPERACIONES" },
  { href: "/aum", label: "AUM" },
];

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
      <body className="min-h-full flex flex-col">
        {/* Top bar */}
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
          <nav className="flex gap-0.5">
            {NAV_ITEMS.map(({ href, label }) => (
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

        {/* Content */}
        <main className="flex-1 overflow-auto">{children}</main>

        {/* Status bar */}
        <footer className="flex items-center h-5 px-3 bg-[#080808] border-t border-[#1a1a1a] text-[10px] text-[#555555]">
          <span>ACA VALORES &middot; MERCADO DE CAPITALES</span>
          <span className="ml-auto">MERVAL / ROFEX</span>
        </footer>
      </body>
    </html>
  );
}
