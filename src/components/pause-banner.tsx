"use client";

import { useEffect, useState } from "react";

/**
 * Banner que aparece durante la ventana de pausa del cluster Atlas +
 * crons de ingesta (para ahorrar consumo nocturno).
 *
 * Ventana: 04:00 – 11:30 UTC = 01:00 – 08:30 ART.
 * Fuera de esa ventana no renderiza nada.
 */

// Configuración de la ventana de pausa (en minutos UTC desde 00:00)
const PAUSE_START_MIN = 4 * 60;       // 04:00 UTC
const PAUSE_END_MIN   = 11 * 60 + 30; // 11:30 UTC

function isPaused(now: Date): boolean {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return m >= PAUSE_START_MIN && m < PAUSE_END_MIN;
}

function nextResume(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(11, 30, 0, 0);
  // si ya pasaron las 11:30 UTC de hoy, el próximo resume es mañana
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (nowMin >= PAUSE_END_MIN) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "ya";
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtArtHHMM(d: Date): string {
  // ART = UTC-3
  const art = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const hh = art.getUTCHours().toString().padStart(2, "0");
  const mm = art.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function PauseBanner() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Seteamos al montar para evitar mismatch hydration (render inicial del server
    // no sabe qué hora es en el cliente). Update cada 30s.
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  if (!now || !isPaused(now)) return null;

  const resume = nextResume(now);
  const countdown = fmtCountdown(resume.getTime() - now.getTime());

  return (
    <div className="bg-[#ff9900]/15 border-b border-[#ff9900]/40 px-3 py-2 text-center shrink-0">
      <span className="text-[11px] font-mono text-[#ff9900] tracking-wide">
        ● <span className="font-semibold">Sistema en pausa nocturna</span> ·
        <span className="text-[#d0d0d0] mx-1">
          cluster Atlas + crons detenidos para ahorro
        </span>
        ·
        <span className="ml-1 font-semibold">
          Vuelve a las {fmtArtHHMM(resume)} ART
        </span>
        <span className="text-[#888888] ml-1">(en {countdown})</span>
      </span>
    </div>
  );
}
