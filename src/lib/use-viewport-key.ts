"use client";

import { useEffect, useState } from "react";

/**
 * Contador que incrementa cuando cambia algo del entorno visual: resize,
 * DPR, movimiento entre monitores (screenX/Y/availWidth/availHeight),
 * vuelta de foco al tab, o ResizeObserver del html. Sirve como `key` en
 * ResponsiveContainer para forzar remount — recharts a veces mide 0 en
 * transiciones y no se recupera solo.
 */
export function useViewportKey(): number {
  const [key, setKey] = useState(0);

  useEffect(() => {
    let raf: number | null = null;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    let lastDpr = window.devicePixelRatio;
    let lastScreenX = window.screenX;
    let lastScreenY = window.screenY;
    let lastAvailW = window.screen?.availWidth ?? 0;
    let lastAvailH = window.screen?.availHeight ?? 0;

    const bump = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setKey((k) => k + 1));
    };

    const checkAndBump = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio;
      const sx = window.screenX;
      const sy = window.screenY;
      const aw = window.screen?.availWidth ?? 0;
      const ah = window.screen?.availHeight ?? 0;
      if (
        w !== lastW ||
        h !== lastH ||
        dpr !== lastDpr ||
        sx !== lastScreenX ||
        sy !== lastScreenY ||
        aw !== lastAvailW ||
        ah !== lastAvailH
      ) {
        lastW = w;
        lastH = h;
        lastDpr = dpr;
        lastScreenX = sx;
        lastScreenY = sy;
        lastAvailW = aw;
        lastAvailH = ah;
        bump();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkAndBump();
    };

    window.addEventListener("resize", bump);
    window.addEventListener("pageshow", bump);
    window.addEventListener("focus", checkAndBump);
    document.addEventListener("visibilitychange", onVisibility);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", bump);

    const mql = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );
    mql.addEventListener?.("change", bump);

    const ro = new ResizeObserver(() => bump());
    ro.observe(document.documentElement);

    const pollId = window.setInterval(checkAndBump, 1000);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", bump);
      window.removeEventListener("pageshow", bump);
      window.removeEventListener("focus", checkAndBump);
      document.removeEventListener("visibilitychange", onVisibility);
      vv?.removeEventListener("resize", bump);
      mql.removeEventListener?.("change", bump);
      ro.disconnect();
      window.clearInterval(pollId);
    };
  }, []);

  return key;
}
