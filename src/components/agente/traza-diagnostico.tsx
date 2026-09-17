"use client";

// EL CICLO de un diagnóstico, en el LAB (backend: `GET /api/agente/diagnostico/{id}`,
// `asistente/diagnostico.traza`, doc `AvAgentAI.md` §15). AHORA muestra la
// conclusión; esto es lo que la produjo: cada vuelta, qué dijo el modelo y
// cuánto le costó, qué pidió, qué le volvió, y la conclusión cruda. Todo sale
// de `ia.eventos_ejecucion` tal cual quedó: acá no se resume ni se suma nada.
//
// Mientras el run está activo se relee cada 3 s (la lectura lleva techo en
// `datos.tsx`). «Diagnosticar de nuevo» encola por la misma puerta que el
// disparo automático; lo que hace el botón lo dice el backend.
import { useCallback, useEffect, useState } from "react";

import type { TrazaDiagnostico as Traza } from "@/components/agente/tipos";
import { VerEvento } from "@/components/agente/ver-evento";

const ACTIVOS = new Set(["queued", "running", "waiting_approval", "cancel_requested"]);

const fecha = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

export function TrazaDiagnostico({ hallazgoId, runInicial, leer, pedir, cancelar, cerrar, cambio }: {
  hallazgoId: number;
  runInicial?: string;
  leer: <T>(url: string) => Promise<T>;
  pedir?: (id: number) => Promise<{ ok: boolean; run_id?: string; error?: string }>;
  cancelar?: (runId: string) => Promise<{ ok: boolean; error?: string }>;
  cerrar?: () => void;
  // Avisa que pidió o canceló algo, para que la lista de arriba se relea.
  cambio?: () => void;
}) {
  const [t, setT] = useState<Traza | null>(null);
  // El padre remonta el componente (key) cuando cambia el hallazgo o el run
  // pedido: por eso el inicial va derecho al estado y no hace falta un effect.
  const [runId, setRunId] = useState(runInicial ?? "");
  const [error, setError] = useState("");
  const [pidiendo, setPidiendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const q = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
      setT(await leer<Traza>(`/api/agente/diagnostico/${hallazgoId}${q}`));
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [hallazgoId, runId, leer]);

  useEffect(() => {
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  const activo = !!t?.run && ACTIVOS.has(t.run.estado);
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => void cargar(), 3000);
    return () => clearInterval(id);
  }, [activo, cargar]);

  async function pedirAhora() {
    if (!pedir || pidiendo) return;
    setPidiendo(true);
    try {
      const r = await pedir(hallazgoId);
      if (r.ok && r.run_id) {
        setRunId(r.run_id);
        cambio?.();
      } else {
        setError(r.error ?? "no se pudo pedir el diagnóstico");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPidiendo(false);
    }
  }

  const run = t?.run ?? null;

  async function cancelarAhora() {
    if (!cancelar || !run) return;
    try {
      const r = await cancelar(run.run_id);
      if (!r.ok) setError(r.error ?? "no se pudo cancelar");
      cambio?.();
      void cargar();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="border border-[var(--t-accent)] p-2 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
          diagnóstico · hallazgo #{hallazgoId}
        </span>
        {(t?.runs.length ?? 0) > 1 && (
          <select
            value={run?.run_id ?? ""}
            onChange={(e) => setRunId(e.target.value)}
            className="text-[9px] bg-[var(--t-surface)] text-[var(--t-text)] border border-[var(--t-border)] px-1"
          >
            {t!.runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {fecha(r.creada_at)} · {r.estado}
              </option>
            ))}
          </select>
        )}
        {pedir && (
          <button
            onClick={() => void pedirAhora()}
            disabled={pidiendo || activo}
            title="Encola un diagnóstico nuevo de este hallazgo, por la misma puerta que el automático"
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            {run?.estado === "queued" ? "en cola…" : activo ? "diagnosticando…" : "diagnosticar de nuevo"}
          </button>
        )}
        {cancelar && activo && (
          <button
            onClick={() => void cancelarAhora()}
            title="En cola: muere ya. Corriendo: el worker corta en el próximo paso."
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-neg)]"
          >
            cancelar
          </button>
        )}
        {cerrar && (
          <button
            onClick={cerrar}
            className="ml-auto text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            cerrar
          </button>
        )}
      </div>

      {error && <p className="text-[10px] text-[var(--t-neg)]">{error}</p>}
      {t && !run && (
        <p className="text-[10px] text-[var(--t-text-muted)]">
          Este hallazgo todavía no tiene ningún diagnóstico corrido.
        </p>
      )}
      {run && (
        <p className="text-[9px] text-[var(--t-text-dim)] tabular-nums">
          run {run.run_id.slice(0, 8)} · {run.estado} · creado {fecha(run.creada_at)}
          {run.finalizada_at && <> · terminó {fecha(run.finalizada_at)}</>}
          {run.error && <span className="text-[var(--t-neg)]"> · {run.error}</span>}
        </p>
      )}
      {run && (
        <div className="bg-[var(--t-surface)] p-1.5 max-h-[28rem] overflow-y-auto flex flex-col gap-0.5">
          {t!.eventos.length === 0 && (
            <p className="text-[9px] text-[var(--t-text-dim)]">
              {run?.estado === "queued"
                ? "en cola: el worker del asistente (asistente-worker.service) todavía no lo tomó"
                : activo ? "corriendo: todavía sin eventos" : "sin eventos guardados"}
            </p>
          )}
          {t!.eventos.map((e, i) => <VerEvento key={e.id ?? i} e={e} />)}
        </div>
      )}
    </div>
  );
}
