"use client";

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos espejados del schema responder_cartera (api/agent/structured/cartera.py)
// ─────────────────────────────────────────────────────────────────────────────

export interface CarteraInstrumento {
  ticker: string;
  peso_pct: number;
  metrica_clave: string;
  justificacion: string;
}

export interface CarteraData {
  tesis: string;
  cartera: CarteraInstrumento[];
  que_invalida: string;
  alertas_data?: string[];
}

interface Props {
  data: CarteraData | null;
  pesos_ok: boolean;
  pesos_suma: number;
  meta?: { steps: number; elapsed_s: number; tokens?: number; model?: string };
  error?: string | null;
  onModificar?: () => void;
}

export function CarteraResponse({
  data,
  pesos_ok,
  pesos_suma,
  meta,
  error,
  onModificar,
}: Props) {
  if (error || !data) {
    return (
      <div className="border border-[#ff3333]/50 bg-[#ff3333]/5 p-3 font-mono">
        <div className="text-[10px] text-[#ff3333] uppercase tracking-wide mb-1">
          No se pudo generar cartera
        </div>
        <div className="text-[11px] text-[var(--t-text)]">
          {error ?? "Sin output estructurado del modelo."}
        </div>
        {onModificar && (
          <button
            onClick={onModificar}
            className="mt-2 text-[10px] px-2 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] uppercase tracking-wide"
          >
            Modificar parámetros
          </button>
        )}
      </div>
    );
  }

  const cartera = data.cartera ?? [];
  const alertas = data.alertas_data ?? [];

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-3 font-mono space-y-3">
      {/* Tesis arriba destacada */}
      <div className="border-l-2 border-[var(--t-accent)] pl-2">
        <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-wide mb-0.5">Tesis</div>
        <div className="text-[12px] text-[var(--t-text)] leading-snug">{data.tesis}</div>
      </div>

      {/* Alertas (si hay) */}
      {alertas.length > 0 && (
        <div className="border border-[var(--t-accent)]/40 bg-[var(--t-accent)]/5 px-2 py-1.5">
          <div className="text-[9px] text-[var(--t-accent)] uppercase tracking-wide mb-0.5">
            Alertas de data ({alertas.length})
          </div>
          <ul className="text-[10px] text-[var(--t-text)] space-y-0.5">
            {alertas.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabla de instrumentos con expand */}
      {cartera.length === 0 ? (
        <div className="text-[11px] text-[var(--t-text-dim)] italic">
          (Sin instrumentos — el modelo no pudo armar la cartera con los datos disponibles)
        </div>
      ) : (
        <div>
          <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-wide mb-1">
            Cartera ({cartera.length} instrumentos)
            {!pesos_ok && (
              <span className="ml-2 text-[var(--t-accent)]">⚠ pesos suman {pesos_suma}%</span>
            )}
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
                <th className="text-left px-1 py-0.5 w-[60px]">Ticker</th>
                <th className="text-right px-1 py-0.5 w-[50px]">Peso</th>
                <th className="text-left px-1 py-0.5">Métrica clave</th>
                <th className="w-[20px]"></th>
              </tr>
            </thead>
            <tbody>
              {cartera.map((inst, i) => (
                <CarteraRow key={`${inst.ticker}-${i}`} inst={inst} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Qué invalida */}
      <div className="border-t border-[var(--t-border)] pt-2">
        <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-wide mb-0.5">
          Qué invalida la tesis
        </div>
        <div className="text-[11px] text-[var(--t-text)] leading-snug">{data.que_invalida}</div>
      </div>

      {/* Footer: meta + acciones */}
      <div className="flex items-center justify-between border-t border-[var(--t-border)] pt-2">
        <div className="flex items-center gap-3">
          {onModificar && (
            <button
              onClick={onModificar}
              className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] uppercase tracking-wide"
            >
              Modificar parámetros
            </button>
          )}
          <button
            onClick={() => {
              // Stub — implementar export real después.
              console.log("[cartera] export to Excel:", data);
              alert("Exportar a Excel: pendiente de implementar.");
            }}
            className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-text-dim)] uppercase tracking-wide"
          >
            Exportar Excel
          </button>
        </div>
        {meta && (
          <div className="text-[9px] text-[var(--t-text-muted)] tracking-wide uppercase">
            {meta.steps} step{meta.steps !== 1 ? "s" : ""} · {meta.elapsed_s}s
            {meta.tokens ? ` · ${meta.tokens} tok` : ""}
            {meta.model ? ` · ${meta.model}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function CarteraRow({ inst }: { inst: CarteraInstrumento }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-border)]/40"
      >
        <td className="px-1 py-1 text-[var(--t-accent)] font-semibold">{inst.ticker}</td>
        <td className="px-1 py-1 text-right text-[var(--t-text)] font-mono">
          {inst.peso_pct.toFixed(0)}%
        </td>
        <td className="px-1 py-1 text-[var(--t-text-dim)]">{inst.metrica_clave}</td>
        <td className="px-1 py-1 text-right text-[var(--t-text-muted)]">{open ? "▾" : "▸"}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="bg-[var(--t-panel)] px-2 py-1.5 text-[10px] text-[var(--t-text-dim)] leading-relaxed">
            {inst.justificacion}
          </td>
        </tr>
      )}
    </>
  );
}
