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
 * Manager → OBSERVABILIDAD → SALUD. La pantalla que responde UNA pregunta:
 * ¿está todo bien?
 *
 * Antes había que recorrer seis tabs (CONTROLES / DIAGNÓSTICO / JOBS / BASE /
 * LATENCIA / IA) y ninguna respondía eso: la card de AuM estaba en VERDE con el job
 * muerto hacía 48 h porque mostraba cómo salieron las corridas que hubo, no si el
 * sistema estaba sano (incidente 2026-08-07).
 *
 * Decisiones de diseño:
 *  - Lo VERDE se esconde por default. Un tablero donde el 95% está bien entrena a
 *    ignorarlo; acá se ve lo que hay que atender y nada más.
 *  - Cada fila dice QUÉ controla y POR QUÉ está así, en castellano. El detalle
 *    técnico (la evidencia) va debajo, en mono.
 *  - Un click abre el HISTORIAL de ese chequeo: cuándo se rompió y cuándo volvió.
 *    Es lo que no se puede reconstruir después, porque una vez que el job vuelve a
 *    correr el motivo de la falla ya no existe en ningún lado.
 *  - El toggle de alerta es por chequeo. Silenciar NO lo saca de esta lista: sigue
 *    rojo acá, solo deja de abrir el modal.
 *
 * Los chequeos se generan solos: los jobs salen de `deploy/crontab.txt` (un cron
 * nuevo aparece sin tocar nada) y los datos, de los contratos de frescura del
 * backend. No hay lista que mantener a mano.
 *
 * La fila y su detalle viven en `salud-chequeo.tsx`, compartidos con el mini-panel
 * del botón SALUD de la barra inferior: dos vistas del mismo chequeo no pueden
 * contradecirse si renderizan el mismo componente.
 */

const POLL_MS = 60_000;

export function SaludPanel() {
  const [data, setData] = useState<SaludResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [verOk, setVerOk] = useState(false);
  const { abierto, detalle, historial, diag, abrir } = useChequeoDetalle();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/salud", { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 160)}`));
        return;
      }
      setErr(null); setData(body as SaludResp);
    } catch (e) {
      if (alive.current) setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const toggleAlerta = async (c: Chequeo) => {
    if (await setAlertaChequeo(c.id, !(c.alertar ?? true))) cargar();
  };

  const chequeos = (data?.chequeos ?? []).filter((c) => verOk || c.estado !== "ok");
  const conteo = data?.conteo ?? {};
  const veredicto = data?.veredicto ?? "ok";

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, falta reiniciar el backend en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}

      {/* El veredicto, en una línea. Es lo único que hay que mirar. */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 border border-[var(--t-border-2)] px-3 py-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR[veredicto] }} />
        <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--t-text)]">
          {veredicto === "ok"
            ? "TODO BIEN"
            : `${(conteo.error ?? 0) + (conteo.warn ?? 0)} COSAS PARA MIRAR`}
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">
          {conteo.error ?? 0} rotas · {conteo.warn ?? 0} con avisos · {conteo.ok ?? 0} bien
        </span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-[var(--t-text-dim)] cursor-pointer">
          <input type="checkbox" checked={verOk} onChange={(e) => setVerOk(e.target.checked)} />
          ver también lo que está bien
        </label>
        <span className="text-[9px] text-[var(--t-text-muted)]">{hhmm(data?.evaluado_at)}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto border border-[var(--t-border)] divide-y divide-[var(--t-border-2)]">
        {chequeos.map((c) => (
          <div key={c.id}>
            <ChequeoFila c={c} onClick={() => abrir(c)} />
            {abierto === c.id && (
              <ChequeoExpandido c={c} detalle={detalle[c.id]} historial={historial[c.id]}
                                diag={diag[c.id]} onToggleAlerta={toggleAlerta} />
            )}
          </div>
        ))}

        {chequeos.length === 0 && !err && (
          <div className="px-3 py-8 text-center text-[11px] text-[var(--t-text-muted)]">
            {data ? "No hay nada roto." : "cargando…"}
          </div>
        )}
      </div>
    </div>
  );
}
