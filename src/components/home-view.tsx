"use client";

import { useEffect, useState } from "react";
import { FuturosDlrCurveChart } from "@/components/futuros-dlr-curve-chart";
import { NewsPanel } from "@/components/news-panel";
import { RetornoTotalMini, type Curva, type Ventana } from "@/components/retorno-total-mini";
import { CanjeTab, PARES, type Par } from "@/components/canje-tab";
import { TradingViewChart } from "@/components/tradingview-chart";
import { WatchlistPanel } from "@/components/watchlist-panel";

const DEFAULT_TICKER = "DXY";   // CAPITALCOM:DXY en TradingView (mapSymbol)

// Cualquier ticker DLR (outright, ej "DLR/MAY26") muestra la curva entera —
// TradingView no tiene los outrights de ROFEX y la serie temporal de un
// futuro en particular vale poco; lo que importa es la curva del momento.
function esTickerDlr(t: string): boolean {
  return t.startsWith("DLR/") || t === "FUTUROS ROFEX";
}

// ARGY no tiene chart propio — cuando el user filtra por ARGY o clickea una
// fila MEP/CCL/Oficial, el chart se queda en el default (DXY).
function esTickerArgy(t: string): boolean {
  return (
    t === "ARGY" ||
    t === "DOLAR MEP" ||
    t === "DOLAR CCL" ||
    t === "DOLAR OFICIAL"
  );
}

// Pill chico reutilizable del header (toggle + curva + ventana).
function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

// Recuadro de la home (abajo-izquierda): UN solo header con toggle
// RETORNO TOTAL / CARRY / CANJE + (en retorno/carry) pills de curva y ventana.
// Caja con borde como el box del chart de al lado → alineados, sin título
// duplicado. CARRY = retorno medido en USD (descuenta la variación del MEP).
function RetornoCanjeBox() {
  const [view, setView] = useState<"retorno" | "carry" | "canje">("canje");
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [ventana, setVentana] = useState<Ventana>("7D");
  // Fecha base libre. Cuando está seteada, pisa al preset (7D/14D/MTD) y el
  // retorno/carry se mide desde ese día. Vacío = usa el preset.
  const [desdeCustom, setDesdeCustom] = useState<string>("");
  const [par, setPar] = useState<Par>("AL30");
  const esRetorno = view === "retorno" || view === "carry";
  const setPreset = (v: Ventana) => { setVentana(v); setDesdeCustom(""); };

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Pill active={view === "retorno"} onClick={() => setView("retorno")}>RETORNO TOTAL</Pill>
          <Pill active={view === "carry"} onClick={() => setView("carry")}>CARRY</Pill>
          <Pill active={view === "canje"} onClick={() => setView("canje")}>CANJE</Pill>
        </div>
        {esRetorno ? (
          <>
            <div className="flex items-center gap-1">
              <Pill active={curva === "tasa_fija"} onClick={() => setCurva("tasa_fija")}>TASA FIJA</Pill>
              <Pill active={curva === "cer"} onClick={() => setCurva("cer")}>CER</Pill>
              <Pill active={curva === "soberanos"} onClick={() => setCurva("soberanos")}>HARD DÓLAR</Pill>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <Pill active={!desdeCustom && ventana === "7D"} onClick={() => setPreset("7D")}>7D</Pill>
              <Pill active={!desdeCustom && ventana === "14D"} onClick={() => setPreset("14D")}>14D</Pill>
              <Pill active={!desdeCustom && ventana === "MTD"} onClick={() => setPreset("MTD")}>MTD</Pill>
              <input
                type="date"
                value={desdeCustom}
                onChange={(e) => setDesdeCustom(e.target.value)}
                title="Fecha base libre (desde): mide el retorno/carry desde ese día"
                className={`px-1 py-0.5 text-[10px] font-semibold border bg-transparent ${
                  desdeCustom
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-[var(--t-border-2)] text-[var(--t-text-muted)]"
                }`}
              />
              {desdeCustom && (
                <button
                  onClick={() => setDesdeCustom("")}
                  title="Volver al preset"
                  className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[12px] px-0.5"
                >
                  ✕
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1">
            {PARES.map((p) => (
              <Pill key={p} active={par === p} onClick={() => setPar(p)}>{p}</Pill>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 min-w-0">
        {view === "canje" ? (
          <CanjeTab par={par} />
        ) : (
          <RetornoTotalMini
            curva={curva}
            ventana={ventana}
            mode={view === "carry" ? "carry" : "retorno"}
            desdeOverride={desdeCustom || undefined}
          />
        )}
      </div>
    </div>
  );
}

export function HomeView() {
  const [selectedTicker, setSelectedTicker] = useState<string>(DEFAULT_TICKER);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const isDlr = esTickerDlr(selectedTicker);
  const isArgy = !isDlr && esTickerArgy(selectedTicker);
  const chartContent = isDlr ? (
    <FuturosDlrCurveChart selectedTicker={selectedTicker} />
  ) : (
    <TradingViewChart symbol={isArgy ? DEFAULT_TICKER : selectedTicker} />
  );

  const chartHeader = (
    <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center">
      <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
        Chart
      </span>
      <span className="ml-2 text-[10px] text-[var(--t-text)] font-mono">
        {isArgy ? DEFAULT_TICKER : selectedTicker}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-[9px] text-[var(--t-text-muted)]">
          {isDlr ? "Curva DLR" : "TradingView"}
        </span>
        <button
          onClick={() => setMaximized((m) => !m)}
          aria-label={maximized ? "Minimizar" : "Maximizar"}
          title={maximized ? "Minimizar (Esc)" : "Maximizar"}
          className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors text-[14px] leading-none px-1"
        >
          {maximized ? "⊡" : "⛶"}
        </button>
      </span>
    </div>
  );

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* Columna izquierda: watchlist arriba · RETORNO TOTAL abajo.
            min-w-0 evita el grid blowout: sin esto, el contenido ancho del
            chart (canvas + legend de N bonos) empuja la columna más allá del 50%. */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          <div className="min-w-0 min-h-0">
            <WatchlistPanel
              onSelect={setSelectedTicker}
              selected={selectedTicker}
            />
          </div>
          <div className="min-w-0 min-h-0">
            <RetornoCanjeBox />
          </div>
        </div>

        {/* Columna derecha: news arriba (50%) · chart TradingView abajo (50%) */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          <div className="min-w-0 min-h-0">
            <NewsPanel />
          </div>
          <div className="min-w-0 min-h-0">
            <div className="h-full flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
              {chartHeader}
              <div className="flex-1 min-h-0">
                {!maximized && chartContent}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* El briefing de apertura vive en el footer global (layout.tsx) */}

      {/* Overlay fullscreen del chart */}
      {maximized && (
        <div
          className="fixed inset-0 bg-[var(--t-panel)]/90 z-50 flex items-center justify-center p-4"
          onClick={() => setMaximized(false)}
        >
          <div
            className="bg-[var(--t-panel)] border border-[var(--t-accent)] w-[96vw] h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {chartHeader}
            <div className="flex-1 min-h-0">
              {chartContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
