"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLOR,
  ChequeoExpandido,
  ChequeoFila,
  hhmm,
  setAlertaChequeo,
  useChequeoDetalle,
  type Chequeo,
  type SaludResp,
} from "@/components/salud-chequeo";

/**
 * Indicador de SALUD en la barra de estado inferior — SOLO admin.
 *
 * Va INLINE al lado de BRIEFING, no flotando: un botón suelto encima del contenido
 * se ve fuera de lugar y tapa cosas (reporte 2026-08-09). La barra de estado ya
 * existe, vive en todas las páginas y es exactamente donde se espera un indicador
 * de estado del sistema.
 *
 * El modal automático solo aparece ante un incidente CONFIRMADO (roto y sin
 * arreglarse por más de 30'). Este botón es la otra mitad: poder mirar cuando uno
 * quiere, sin esperar a que algo se rompa ni entrar a Manager.
 *
 * El mini-panel que abre es la MISMA vista de SALUD, no un resumen (reporte
 * 2026-08-10): cada chequeo se despliega acá con su evidencia, su diagnóstico, el
 * detalle crudo (corridas con log, fechas cargadas, anomalías), el historial y el
 * toggle para silenciarlo o volver a activarlo. Antes solo mostraba título y motivo
 * y para cualquier otra cosa había que irse a Manager — eso convertía cada aviso en
 * una navegación, justo lo que hacía que no se mirara. "Ver todo →" queda, pero es
 * una opción, no el único camino.
 *
 * Lleva el número de chequeos rotos encima, así el estado del sistema está visible
 * en TODA la app sin ocupar lugar. Si no hay nada roto queda apagado y discreto.
 *
 * Solo admin: el endpoint está gateado y un 403 hace que el botón no se muestre.
 */

const POLL_MS = 5 * 60_000;

export function SaludBoton({ onAbrir }: { onAbrir?: () => void }) {
  const [data, setData] = useState<SaludResp | null>(null);
  const [abierto, setAbierto] = useState(false);
  // Lo verde se esconde por default, igual que en Manager: se ve lo que hay que
  // atender. El toggle está acá para poder confirmar que algo puntual está bien.
  const [verOk, setVerOk] = useState(false);
  const { abierto: expandido, detalle, historial, diag, abrir } = useChequeoDetalle();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async () => {
    try {
      // Se pide el panel COMPLETO (no `solo_problemas`): el backend evalúa todo
      // igual, filtrarlo server-side solo impedía el toggle "ver lo que está bien".
      const r = await fetch("/api/manager/salud", { cache: "no-store" });
      if (!r.ok || !alive.current) return;          // 403 = no es admin → botón oculto
      setData(await r.json() as SaludResp);
    } catch { /* nunca puede romper la app */ }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const toggleAlerta = async (c: Chequeo) => {
    if (await setAlertaChequeo(c.id, !(c.alertar ?? true))) cargar();
  };

  if (!data) return null;                            // sin permiso o sin datos: no existe
  const conteo = data.conteo ?? {};
  const rotos = conteo.error ?? 0;
  const avisos = conteo.warn ?? 0;
  const chequeos = (data.chequeos ?? []).filter((c) => verOk || c.estado !== "ok");

  return (
    <>
      <button
        onClick={() => { setAbierto((v) => !v); onAbrir?.(); }}
        title="Salud del sistema"
        className={"inline-flex items-center gap-1 px-1.5 leading-none text-[10px] "
          + "font-semibold transition-colors hover:text-[var(--t-accent)] "
          + (rotos ? "text-[var(--t-neg)]"
            : avisos ? "text-[#eab308]" : "text-[var(--t-text-muted)]")}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{
          background: rotos ? "var(--t-neg)" : avisos ? "#eab308" : "var(--t-pos)",
        }} />
        <span className="tracking-widest">
          {rotos ? `SALUD ${rotos}` : avisos ? `SALUD ${avisos}` : "SALUD"}
        </span>
      </button>

      {abierto && (
        <div className="fixed bottom-6 right-3 z-40 w-[min(44rem,calc(100vw-1.5rem))] max-h-[72vh] flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)] shadow-xl">
          <div className="px-3 py-2 border-b border-[var(--t-border)] flex flex-wrap items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full" style={{ background: COLOR[data.veredicto ?? "ok"] }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--t-text)]">
              Salud del sistema
            </span>
            <span className="text-[9px] text-[var(--t-text-dim)]">
              {rotos} rotas · {avisos} con avisos · {conteo.ok ?? 0} bien
            </span>
            <label className="ml-auto flex items-center gap-1 text-[9px] text-[var(--t-text-dim)] cursor-pointer">
              <input type="checkbox" checked={verOk} onChange={(e) => setVerOk(e.target.checked)} />
              ver también lo que está bien
            </label>
            <span className="text-[9px] text-[var(--t-text-muted)]">{hhmm(data.evaluado_at)}</span>
            <a href="/manager" className="text-[9px] text-[var(--t-accent)] hover:underline">
              ver todo →
            </a>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--t-border-2)]">
            {chequeos.map((c) => (
              <div key={c.id}>
                <ChequeoFila c={c} onClick={() => abrir(c)} />
                {expandido === c.id && (
                  <ChequeoExpandido c={c} detalle={detalle[c.id]} historial={historial[c.id]}
                                    diag={diag[c.id]} onToggleAlerta={toggleAlerta} />
                )}
              </div>
            ))}
            {chequeos.length === 0 && (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--t-text-muted)]">
                No hay nada roto.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
