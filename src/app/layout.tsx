import type { Metadata } from "next";
import { headers } from "next/headers";
import { Header } from "@/components/header";
import { TopTicker } from "@/components/top-ticker";
import { AutoRefresh } from "@/components/auto-refresh";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACA Valores — Terminal",
  description: "TradingAV — Terminal para mercados argentinos",
};

async function computeIsManager(): Promise<boolean> {
  const managerEmails = (process.env.MANAGER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (managerEmails.length === 0) return true; // dev mode
  const hdrs = await headers();
  const email = (hdrs.get("cf-access-authenticated-user-email") ?? "").toLowerCase();
  return managerEmails.includes(email);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isManager = await computeIsManager();
  return (
    <html lang="es" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full flex flex-col">
        <AutoRefresh intervalMs={5000} />
        <Header isManager={isManager} />
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
