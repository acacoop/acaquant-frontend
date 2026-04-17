"use client";

import { useEffect, useState } from "react";

/**
 * Devuelve un contador que se incrementa en cada resize (o cambio de DPR al
 * mover la ventana entre monitores). Usar como `key` en ResponsiveContainer
 * de recharts para forzar un remount cuando el contenedor fue medido a 0 por
 * un transition glitch.
 */
export function useViewportKey(): number {
  const [key, setKey] = useState(0);

  useEffect(() => {
    let raf: number | null = null;
    const bump = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setKey((k) => k + 1));
    };

    window.addEventListener("resize", bump);
    window.addEventListener("pageshow", bump);

    const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mql.addEventListener?.("change", bump);

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", bump);
      window.removeEventListener("pageshow", bump);
      mql.removeEventListener?.("change", bump);
    };
  }, []);

  return key;
}
