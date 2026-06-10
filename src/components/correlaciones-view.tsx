"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { CorrelationMatrix } from "@/lib/types-estrategia";
import { TickerSearch, fmtPct, useUniverso } from "./estrategia-shared";
import { TableHelp } from "./help-tooltip";

/**
 * CORRELACIONES — heatmap de la matriz de correlación del universo RV.
 *
 * Elegís un set de tickers (o un preset) y una ventana; el backend
 * devuelve la matriz de Pearson sobre retornos diarios alineados por
 * fecha (Trading.PreciosAcciones, USD del subyacente).
 *
 * Lectura: ROJO = correlación positiva (mismo riesgo, suma poco
 * diversificar ahí) · AZUL = negativa (diversifica / cubre).
 *
 * Backend: GET /api/scanner/correlaciones (api/services/rv_motor.py).
 */

const GLOSARIO = [
  { label: "ρ (CELDA)",   text: "Correlación de Pearson entre los retornos diarios de los dos tickers en la ventana. +1 = se mueven idénticos; 0 = independientes; −1 = espejados." },
  { label: "COLORES",     text: "Rojo = positiva (riesgo compartido — un book long de celdas rojas es UNA sola apuesta). Azul = negativa (se cubren entre sí). Más intenso = |ρ| más alta." },
  { label: "VOL",         text: "Volatilidad realizada anualizada de cada ticker en la misma ventana: stdev(retornos) × √252." },
  { label: "VENTANA",     text: "Cantidad de ruedas hábiles COMUNES a todos los tickers seleccionados. Más corta = refleja el régimen actual; más larga = más estable estadísticamente." },
  { label: "N OBS",       text: "Retornos comunes efectivamente usados. Si un ticker tiene poca historia, achica la muestra de TODA la matriz (las fechas se intersectan)." },
  { label: "EXCLUIDOS",   text: "Tickers con menos de 30 observaciones — quedan fuera para no degradar la matriz." },
];

const PRESETS: { label: string; tickers: string[] }[] = [
  { label: "MAG 7",  tickers: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"] },
  { label: "SEMIS",  tickers: ["NVDA", "AMD", "AVGO", "INTC", "MU", "TSM", "QCOM"] },
  { label: "ARG",    tickers: ["GGAL", "YPFD", "PAMP", "BMA", "CEPU", "SUPV", "TGSU2", "MELI"] },
];

const VENTANAS = [60, 120, 252] as const;
const MAX_TICKERS = 30;

function corrColor(v: number): string {
  // rojo ρ>0 / azul ρ<0, alpha por |ρ|. La diagonal (ρ=1) queda roja plena.
  const a = Math.min(Math.abs(v), 1);
  return v >= 0
    ? `rgba(255, 68, 68, ${0.08 + 0.5 * a})`
    : `rgba(64, 128, 255, ${0.08 + 0.5 * a})`;
}

export function CorrelacionesView() {
  const { universo } = useUniverso();
  const [seleccion, setSeleccion] = usePersistedState<string[]>("estrategia.corr.tickers", []);
  const [ventana, setVentana] = usePersistedState<number>("estrategia.corr.ventana", 252);

  // Resultado keyed por (selección, ventana). Todo el estado se setea SOLO
  // en callbacks async (react-hooks/set-state-in-effect): `loading`, `error`
  // y `data` se DERIVAN comparando la key del resultado con la key vigente.
  // Si cambia el set, la matriz vieja no se muestra (sin mismatch chips↔heatmap).
  const [res, setRes] = useState<{ key: string; m?: CorrelationMatrix; err?: string } | null>(null);

  const enUniverso = useMemo(() => new Set(universo.map((u) => u.ticker)), [universo]);
  const reqKey = `${seleccion.join(",")}|${ventana}`;

  useEffect(() => {
    if (seleccion.length < 2) return;
    let alive = true;
    const key = `${seleccion.join(",")}|${ventana}`;
    const qs = new URLSearchParams({
      tickers: seleccion.join(","),
      ventana: String(ventana),
    });
    fetch(`/api/scanner/correlaciones?${qs}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: CorrelationMatrix) => {
        if (alive) setRes({ key, m: j });
      })
      .catch((e: unknown) => {
        if (alive) setRes({ key, err: e instanceof Error ? e.message : "error" });
      });
    return () => {
      alive = false;
    };
  }, [seleccion, ventana]);

  const vigente = seleccion.length >= 2 && res?.key === reqKey ? res : null;
  const data = vigente?.m ?? null;
  const error = vigente?.err ?? null;
  const loading = seleccion.length >= 2 && !vigente;

  const addTicker = (tk: string) =>
    setSeleccion((prev) =>
      prev.includes(tk) || prev.length >= MAX_TICKERS ? prev : [...prev, tk],
    );
  const delTicker = (tk: string) => setSeleccion((prev) => prev.filter((t) => t !== tk));

  const aplicarPreset = (tickers: string[]) => {
    const presentes = tickers.filter((t) => enUniverso.has(t));
    if (presentes.length >= 2) setSeleccion(presentes);
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2 overflow-y-auto">
      {/* ── Controles ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <TickerSearch universo={universo} onSelect={addTicker} placeholder="+ ticker…" />

        {PRESETS.map((p) => {
          const presentes = p.tickers.filter((t) => enUniverso.has(t));
          if (universo.length > 0 && presentes.length < 2) return null;
          return (
            <button
              key={p.label}
              onClick={() => aplicarPreset(p.tickers)}
              className="px-2 py-1 text-[9px] font-semibold tracking-wider border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
            >
              {p.label}
            </button>
          );
        })}

        <span className="flex border border-[var(--t-border-2)] ml-1">
          {VENTANAS.map((v) => (
            <button
              key={v}
              onClick={() => setVentana(v)}
              className={`px-2 py-1 text-[9px] font-semibold tabular-nums transition-colors ${
                ventana === v
                  ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]"
                  : "text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
              }`}
            >
              {v}d
            </button>
          ))}
        </span>

        <TableHelp entries={GLOSARIO} />

        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tabular-nums">
          {loading
            ? "calculando…"
            : error
            ? <span className="text-[var(--t-neg)]">⚠ {error}</span>
            : data
            ? `n_obs ${data.n_obs} · ${data.fecha_desde ?? "?"} → ${data.fecha_hasta ?? "?"}`
            : ""}
        </span>
      </div>

      {/* Chips de selección */}
      {seleccion.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          {seleccion.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold border border-[var(--t-border-2)] text-[var(--t-text)]"
            >
              {t}
              <button
                onClick={() => delTicker(t)}
                className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)] leading-none"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            onClick={() => setSeleccion([])}
            className="text-[9px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] tracking-wider ml-1"
          >
            LIMPIAR
          </button>
          {seleccion.length >= MAX_TICKERS && (
            <span className="text-[9px] text-[var(--t-accent)]">máx {MAX_TICKERS}</span>
          )}
        </div>
      )}

      {/* ── Estado vacío ─────────────────────────────────────────── */}
      {seleccion.length < 2 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-[var(--t-text-muted)] text-[11px] tracking-[0.3em] font-semibold">
            MATRIZ DE CORRELACIÓN
          </div>
          <p className="text-[var(--t-text-dim)] text-xs max-w-[420px]">
            Agregá al menos 2 tickers (o aplicá un preset) para ver cómo se mueven
            entre sí. Rojo = mismo riesgo · Azul = se cubren.
          </p>
        </div>
      )}

      {/* Calculando / error sin matriz vigente */}
      {seleccion.length >= 2 && !data && (
        <div className="flex-1 flex items-center justify-center border border-[var(--t-border)] bg-[var(--t-panel)] min-h-[160px]">
          <span className={`text-xs ${error ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)] animate-pulse"}`}>
            {error ? `⚠ ${error}` : "Calculando matriz…"}
          </span>
        </div>
      )}

      {/* ── Heatmap ──────────────────────────────────────────────── */}
      {seleccion.length >= 2 && data && data.tickers.length >= 2 && (
        <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-[var(--t-panel)] !px-2 !py-1 text-left text-[9px] text-[var(--t-text-muted)]">
                  ρ
                </th>
                <th className="sticky top-0 z-10 bg-[var(--t-panel)] !px-1 !py-1 text-right text-[9px] text-[var(--t-text-muted)]">
                  VOL
                </th>
                {data.tickers.map((t) => (
                  <th
                    key={t}
                    className="sticky top-0 z-10 bg-[var(--t-panel)] !px-1 !py-1 text-center text-[9px] font-mono font-semibold text-[var(--t-accent)] min-w-[44px]"
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.tickers.map((fila, i) => (
                <tr key={fila}>
                  <td className="sticky left-0 z-10 bg-[var(--t-panel)] !px-2 !py-0.5 font-mono font-semibold text-[10px] text-[var(--t-accent)] whitespace-nowrap">
                    {fila}
                  </td>
                  <td className="!px-1 !py-0.5 text-right font-mono tabular-nums text-[9px] text-[var(--t-text-dim)]">
                    {data.vol_anual[fila] != null ? fmtPct((data.vol_anual[fila] as number) * 100, 0) : "--"}
                  </td>
                  {data.tickers.map((col, j) => {
                    const v = data.matriz[i]?.[j];
                    const diag = i === j;
                    return (
                      <td
                        key={col}
                        title={`${fila} × ${col}: ${v != null ? v.toFixed(3) : "n/d"}`}
                        className="!px-0 !py-0 text-center"
                        style={{
                          backgroundColor:
                            v != null && !diag ? corrColor(v) : diag ? "var(--t-border)" : undefined,
                        }}
                      >
                        <span
                          className={`block px-1 py-1 text-[9px] font-mono tabular-nums ${
                            diag ? "text-[var(--t-text-muted)]" : "text-[var(--t-text)]"
                          }`}
                        >
                          {diag ? "—" : v != null ? v.toFixed(2) : "·"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {data.excluidos.length > 0 && (
            <div className="px-2 py-1 text-[9px] text-[var(--t-accent)] border-t border-[var(--t-border)]">
              ⚠ Excluidos (serie &lt; 30 obs): <span className="font-mono">{data.excluidos.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      {seleccion.length >= 2 && data && data.tickers.length < 2 && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[var(--t-text-muted)] text-xs">
            Serie insuficiente para esos tickers (excluidos: {data.excluidos.join(", ") || "—"}).
          </span>
        </div>
      )}
    </div>
  );
}
