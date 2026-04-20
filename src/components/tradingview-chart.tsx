"use client";

import { useEffect, useRef } from "react";

/**
 * TradingView Advanced Chart Widget (gratis, sin API key).
 * Doc: https://www.tradingview.com/widget/advanced-chart/
 */

declare global {
  interface Window {
    TradingView?: { widget: new (config: Record<string, unknown>) => void };
  }
}

/** Traduce nuestros tickers de watchlist al formato de TradingView. */
function mapSymbol(symbol: string): string {
  // Forex vía TV
  if (symbol === "EURUSD") return "FX:EURUSD";
  if (symbol === "USDBRL") return "FX_IDC:USDBRL";
  if (symbol === "USDMXN") return "FX_IDC:USDMXN";

  // Treasury yields (TV los tiene en TVC:)
  if (symbol === "UST 13W") return "TVC:US03MY";
  if (symbol === "UST 5Y")  return "TVC:US05Y";
  if (symbol === "UST 10Y") return "TVC:US10Y";
  if (symbol === "UST 30Y") return "TVC:US30Y";

  // Resto (stocks, ETFs): TradingView auto-resuelve con el símbolo pelado.
  return symbol;
}

interface Props {
  symbol: string;
  /** Alto del contenedor. Default "100%". */
  height?: string;
}

let tvScriptPromise: Promise<void> | null = null;
function loadTvScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No pude cargar el script de TradingView."));
    document.body.appendChild(script);
  });
  return tvScriptPromise;
}

export function TradingViewChart({ symbol, height = "100%" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>(`tv_${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;

    // Limpiar contenedor
    containerRef.current.innerHTML = "";
    const inner = document.createElement("div");
    inner.id = idRef.current;
    inner.style.height = "100%";
    inner.style.width = "100%";
    containerRef.current.appendChild(inner);

    loadTvScript()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        new window.TradingView.widget({
          container_id: idRef.current,
          autosize: true,
          symbol: mapSymbol(symbol),
          interval: "D",
          timezone: "America/Argentina/Buenos_Aires",
          theme: "dark",
          style: "1",
          locale: "es",
          toolbar_bg: "#080808",
          enable_publishing: false,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          hide_legend: false,
          allow_symbol_change: true,
          save_image: false,
          studies: [],
          backgroundColor: "#080808",
          gridColor: "#1a1a1a",
        });
      })
      .catch((e) => {
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML =
            `<div style="color:#ff3333;font-family:monospace;font-size:11px;padding:12px">TradingView: ${String(e)}</div>`;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return <div ref={containerRef} style={{ height, width: "100%" }} />;
}
