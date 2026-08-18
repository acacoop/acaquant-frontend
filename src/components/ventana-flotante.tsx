"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Ventana FLOTANTE: se arrastra, se redimensiona y vive por ENCIMA de la vista
 * sin sacarle lugar.
 *
 * Por qué existe (pedido del user, 2026-08-18): el LIBRO era una pill más, así
 * que mirar el time & sales de un bono te TAPABA la tabla y la curva de las que
 * lo estabas mirando — justo las dos cosas contra las que se lo compara. Un
 * panel que reemplaza a otro obliga a elegir; una ventana deja ver las dos.
 *
 * NO es un modal: no hay backdrop, no bloquea el fondo y no roba el foco. La
 * vista de atrás sigue viva y polleando — se puede seguir cambiando de pill, de
 * emisor y de tab con el libro abierto.
 *
 * La GEOMETRÍA se persiste en localStorage (no sessionStorage): dónde ponés tu
 * ventana es una preferencia, no un filtro transitorio. Se guarda por
 * `storageKey`, así dos ventanas distintas no se pisan.
 */

interface Geo { x: number; y: number; w: number; h: number }

const MIN_W = 280;
const MIN_H = 220;
const MARGEN = 8;   // nunca dejar la ventana pegada al borde exacto

export function VentanaFlotante({
  titulo,
  onClose,
  storageKey,
  anchoInicial = 440,
  altoInicial = 520,
  sub,
  children,
}: {
  titulo: string;
  onClose: () => void;
  storageKey: string;
  anchoInicial?: number;
  altoInicial?: number;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [geo, setGeo] = usePersistedState<Geo | null>(storageKey, null, "local");

  // El portal se monta DESPUÉS de hidratar. `typeof document === "undefined"`
  // parece equivalente y no lo es: con eso el server renderiza `null` y el
  // cliente renderiza la ventana en el MISMO paso, y React tira
  // "Hydration failed... server rendered HTML didn't match". Hoy no se dispara
  // porque la ventana nace cerrada, pero cualquiera que la abra por default
  // —o que persista el abierto/cerrado— se lo come sin entender por qué.
  // Verificado en browser: con este patrón la consola queda limpia.
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMontado(true);
  }, []);

  // Acotar SIEMPRE contra el viewport actual. Sin esto, una ventana guardada en
  // un monitor grande queda fuera de pantalla al abrir la app en el notebook —
  // y como no se ve, no hay forma de arrastrarla de vuelta.
  const acotar = useCallback((v: Geo): Geo => {
    const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
    const vh = typeof window === "undefined" ? 800 : window.innerHeight;
    const w = Math.min(Math.max(MIN_W, v.w), vw - MARGEN * 2);
    const h = Math.min(Math.max(MIN_H, v.h), vh - MARGEN * 2);
    return {
      w, h,
      x: Math.min(Math.max(MARGEN, v.x), vw - w - MARGEN),
      y: Math.min(Math.max(MARGEN, v.y), vh - h - MARGEN),
    };
  }, []);

  // Default: arriba a la DERECHA. Es donde no tapa ni la tabla ARS (izquierda)
  // ni el filtro de emisor (arriba a la izquierda).
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const g: Geo = geo ?? acotar({
    x: vw - anchoInicial - 24, y: 88, w: anchoInicial, h: altoInicial,
  });

  const arrastre = useRef<{ dx: number; dy: number } | null>(null);
  const escala   = useRef<{ x0: number; y0: number; w0: number; h0: number } | null>(null);

  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    const r = escala.current;
    if (a) {
      setGeo((prev) => acotar({ ...(prev ?? g), x: e.clientX - a.dx, y: e.clientY - a.dy }));
    } else if (r) {
      setGeo((prev) => acotar({
        ...(prev ?? g),
        w: r.w0 + (e.clientX - r.x0),
        h: r.h0 + (e.clientY - r.y0),
      }));
    }
  };

  const soltar = (e: React.PointerEvent) => {
    arrastre.current = null;
    escala.current = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
  };

  // Re-acotar si cambia el tamaño de la ventana del browser (o se cierra un
  // monitor): la ventana se mete sola de vuelta en pantalla.
  useEffect(() => {
    const on = () => setGeo((prev) => (prev ? acotar(prev) : prev));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [setGeo, acotar]);

  // ESC cierra. Es lo que espera cualquiera que la abrió sin querer.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  if (!montado) return null;

  return createPortal(
    <div
      className="fixed z-[70] flex flex-col border border-[var(--t-accent)]/40 bg-[var(--t-panel)] shadow-2xl shadow-black/50"
      style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
    >
      {/* La BARRA es el asa: el cursor lo dice (`cursor-move`) y `touch-none`
          evita que en trackpad/touch el gesto se lo coma el scroll de la página. */}
      <div
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          arrastre.current = { dx: e.clientX - g.x, dy: e.clientY - g.y };
        }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/15 cursor-move select-none touch-none shrink-0"
      >
        <span className="text-[10px] text-[var(--t-accent)]/60 tracking-widest">⠿</span>
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          {titulo}
        </span>
        {sub}
        <button
          onClick={onClose}
          // El botón no debe arrastrar: sin esto, un click con micro-movimiento
          // mueve la ventana en vez de cerrarla.
          onPointerDown={(e) => e.stopPropagation()}
          className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-neg)] transition-colors text-xs leading-none px-1"
          title="Cerrar (Esc)"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 p-2">{children}</div>

      {/* Agarradera de RESIZE. Es un div propio y no un `resize: both` de CSS
          porque ese no funciona sobre un contenedor flex con overflow oculto. */}
      <div
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          escala.current = { x0: e.clientX, y0: e.clientY, w0: g.w, h0: g.h };
        }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize touch-none"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, var(--t-accent) 50%, var(--t-accent) 60%, transparent 60%, transparent 75%, var(--t-accent) 75%)",
          opacity: 0.5,
        }}
        title="Redimensionar"
      />
    </div>,
    document.body,
  );
}
