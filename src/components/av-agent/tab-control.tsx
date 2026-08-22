"use client";

// El ⚙: parada de emergencia y estado de las fuentes.
import { useState } from "react";
import { Control, haceCuanto, TITULO, SUB, FUENTE_ICONO,
         FUENTE_COLOR } from "@/components/av-agent/tipos";

export function TabControl({ ctrl, setParada, recargar }: {
  ctrl: Control | null;
  setParada: (activa: boolean, motivo: string) => void | Promise<void>;
  recargar: () => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const frenado = ctrl?.parada.parada ?? false;

  if (!ctrl) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[var(--t-neg)]">
          No se pudo leer el tablero de control.
        </span>
        <button
          onClick={() => void recargar()}
          className="self-start text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── LA PARADA ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline gap-2 mb-1.5">
          <h3 className={TITULO}>PARADA DE EMERGENCIA</h3>
          <span className={SUB}>
            {frenado ? "el agente NO está escribiendo" : "el agente puede escribir"}
          </span>
        </div>
        <div className={`border p-3 flex flex-col gap-2 ${
          frenado ? "border-[var(--t-neg)]" : "border-[var(--t-border)]"}`}>
          {frenado ? (
            <>
              <span className="text-[11px] text-[var(--t-neg)] font-semibold">
                ■ FRENADO{ctrl.parada.por ? ` por ${ctrl.parada.por}` : ""}
                {ctrl.parada.cambiado_at
                  ? ` · ${haceCuanto(ctrl.parada.cambiado_at)}`
                  : ""}
              </span>
              <span className="text-[11px] text-[var(--t-text-muted)]">
                {ctrl.parada.motivo}
              </span>
              <button
                onClick={() => void setParada(false, "")}
                className="self-start text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]"
              >
                Reanudar el agente
              </button>
            </>
          ) : (
            <>
              {/* El MOTIVO es obligatorio y lo exige el backend, no el front:
                  la regla es de negocio y tiene que valer también para quien
                  llame al endpoint directo. Acá solo se pide antes para no
                  mandar un request que ya sabemos que va a ser rechazado. */}
              <div className="flex items-center gap-2">
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && motivo.trim()) {
                      void setParada(true, motivo.trim());
                      setMotivo("");
                    }
                  }}
                  placeholder="¿Por qué lo frenás? (obligatorio)"
                  className="flex-1 bg-transparent border border-[var(--t-border)] px-2 py-1 text-[11px] text-[var(--t-text)] outline-none focus:border-[var(--t-neg)]"
                />
                <button
                  disabled={!motivo.trim()}
                  onClick={() => { void setParada(true, motivo.trim()); setMotivo(""); }}
                  className="shrink-0 text-[9px] uppercase tracking-widest px-3 py-1 border border-[var(--t-neg)] text-[var(--t-neg)] hover:bg-[var(--t-neg)] hover:text-[var(--t-on-accent)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--t-neg)]"
                >
                  ■ Frenar
                </button>
              </div>
              <span className="text-[10px] text-[var(--t-text-dim)] leading-relaxed">
                Sin el motivo no se puede frenar: el que se lo encuentre parado
                tiene que poder decidir si lo reanuda sin ir a preguntar.
              </span>
            </>
          )}
          {/* QUÉ cubre exactamente. Una parada de alcance ambiguo es peor que
              ninguna: uno no sabe si puede seguir trabajando. */}
          <div className="text-[10px] text-[var(--t-text-dim)] leading-relaxed border-t border-[var(--t-border)] pt-2">
            <span className="text-[var(--t-text-muted)]">Frena</span> el alta de un
            bono, completar flujos, arreglar un insumo y crear una curva — todo lo
            que escribe datos de mercado.{" "}
            <span className="text-[var(--t-text-muted)]">No frena</span> los
            diagnósticos, ignorar un ticker ni cerrar un aviso: con la mano frenada
            se tiene que poder seguir mirando y triando, o el primer reflejo ante
            una duda sería quedarse sin la herramienta.
          </div>
        </div>
      </section>

      {/* ── LAS FUENTES ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline gap-2 mb-1.5">
          <h3 className={TITULO}>DE DÓNDE LEE</h3>
          <span className={SUB}>
            {ctrl.resumen.bloquea + ctrl.resumen.revisar === 0
              ? "todo en verde"
              : `${ctrl.resumen.bloquea} caídas · ${ctrl.resumen.revisar} a revisar`}
          </span>
          <button
            onClick={() => void recargar()}
            title="Releer el tablero (no gasta créditos de 1816)"
            className="ml-auto text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
          >
            ↻
          </button>
        </div>
        <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
          {ctrl.fuentes.map((f) => (
            <div key={f.clave}
                 className="grid grid-cols-[16px_190px_1fr] items-baseline gap-2 px-2 py-1.5">
              <span className="text-[11px]" style={{ color: FUENTE_COLOR[f.estado] }}>
                {FUENTE_ICONO[f.estado] ?? "·"}
              </span>
              <span className="text-[11px] font-bold text-[var(--t-text)] truncate"
                    title={f.titulo}>
                {f.titulo}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] text-[var(--t-text-muted)] leading-snug">
                  {f.detalle}
                </div>
                {/* PARA QUÉ sirve esta fuente. «1816 sin token» no dice nada si
                    uno no sabe que de ahí sale el cronograma del bono — y el que
                    mira el tablero en una emergencia no tiene por qué saberlo. */}
                {f.para && (
                  <div className="text-[9px] text-[var(--t-text-dim)] leading-snug">
                    alimenta: {f.para}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
