import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACAQuant Terminal",
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
        <header className="flex items-center h-8 px-3 bg-[#1a1a2e] border-b border-[#2a2a2a]">
          <Link
            href="/"
            className="text-[#ff6600] font-bold text-sm tracking-wider mr-8"
          >
            ACAQUANT
          </Link>
          <nav className="flex gap-1">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1 text-[11px] font-semibold tracking-wide text-[#808080] hover:text-[#e0e0e0] hover:bg-[#2a2a2a] transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto text-[10px] text-[#555555] tracking-wide">
            TRADING TERMINAL
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">{children}</main>

        {/* Status bar */}
        <footer className="flex items-center h-5 px-3 bg-[#0a0a0a] border-t border-[#1a1a1a] text-[10px] text-[#555555]">
          <span>ACAQUANT v1.0</span>
          <span className="ml-auto">MERVAL/ROFEX</span>
        </footer>
      </body>
    </html>
  );
}
