"use client";

// EL SLOT DE LA BARRA INFERIOR — cómo una vista pone sus botones ahí abajo.
//
// La barra de estado (el `<footer>` de `app/layout.tsx`) ya era el lugar de lo
// que se consulta de vez en cuando y no querés en el medio de la pantalla:
// BRIEFING, PARA VOS, AV AGENT. Esto abre esa barra a las VISTAS, para que una
// pantalla pueda bajar ahí sus acciones secundarias —AJUSTES y TOTALES en
// CARTERAS— y dejar la barra de arriba solo con lo que es el trabajo.
//
// ── El problema ────────────────────────────────────────────────────────────
// El footer vive en el ROOT LAYOUT, o sea ARRIBA de la vista en el árbol. Una
// vista no puede renderizar hacia arriba. Hay tres formas de cruzar eso y dos
// están mal para este caso:
//
//   · Que el footer lea la ruta y dibuje él los botones. **NO**: los botones
//     necesitan el ESTADO de la vista (AJUSTES tiene que bumpear la versión para
//     que PNL TÍTULOS refetchee; TOTALES tiene que mover la sub-tab). Si los
//     dibuja el footer, necesita su propia copia de ese estado — dos verdades
//     para lo mismo, que es el patrón de la REGLA #9 del repo: no rompe nada,
//     los dos lados simplemente dejan de estar de acuerdo.
//   · Un store con los datos de los botones. Da una vuelta de más: el `onClick`
//     igual tiene que cerrar sobre el estado de la vista, así que terminarías
//     pasando funciones por el store.
//   · **Un PORTAL a un nodo que publica el footer.** ← esto. Los botones se
//     DEFINEN adentro de la vista (cierran sobre su estado con naturalidad, y el
//     modal que abren sigue viviendo donde vivía) y solo se DIBUJAN abajo.
//
// Es el mismo patrón que ya usa Tesorería para portalizar sus ABM de catálogo a
// la barra de tabs (`tesoreria-view.tsx` → `tesoreria-mercados.tsx`), estirado
// un nivel más: hasta el layout.
//
// ── Lo que sale gratis ─────────────────────────────────────────────────────
// **«Solo cuando la vista está abierta» no hay que programarlo.** El portal vive
// adentro de la vista: si navegás a otra pantalla, React la desmonta y el portal
// se va con ella. Sin matcheo de rutas, sin registro que alguien tenga que
// mantener, y sin la posibilidad de que quede un botón fantasma de una pantalla
// que ya no estás mirando.
//
// ── La regla que NO se puede romper ────────────────────────────────────────
// **El slot no consulta nada ni decide permisos.** Solo dibuja lo que le pasó
// una vista que YA está gateada por su módulo. El footer se renderiza también en
// el portal invitado (www), así que si el slot pudiera pedir datos por su cuenta
// sería una superficie nueva sin gate. Mismo criterio con el que AV AGENT se
// decide server-side en el layout.

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// El nodo del footer, publicado por `SlotBarraInferior` y leído por `EnLaBarra`.
// Store de módulo (no context) para que montar el slot NO re-renderice el árbol
// entero de la app: lo único que se entera es quien está portalizando.
let _nodo: HTMLElement | null = null;
const _oyentes = new Set<() => void>();

function _publicar(n: HTMLElement | null) {
  _nodo = n;
  for (const f of _oyentes) f();
}
function _suscribir(f: () => void) {
  _oyentes.add(f);
  return () => { _oyentes.delete(f); };
}

/**
 * Va UNA vez, en el `<footer>` del layout. Es un contenedor vacío: mientras
 * ninguna vista publique nada no ocupa ni un píxel (`:empty` lo esconde) y los
 * botones globales quedan exactamente donde estaban.
 */
export function SlotBarraInferior() {
  return (
    <span
      ref={_publicar}
      // El separador y el espacio SOLO existen con contenido adentro. Se resuelve
      // con `:empty` y no con un flag de React porque el contenido entra por un
      // portal: el footer no puede saber si hay algo — el DOM sí.
      className="flex items-center gap-3 [&:not(:empty)]:pr-3 [&:not(:empty)]:mr-1 [&:not(:empty)]:border-r [&:not(:empty)]:border-[var(--t-border-2)]"
    />
  );
}

/**
 * Lo que envuelva esto se dibuja en la barra inferior mientras el componente
 * esté montado. Al desmontarse desaparece solo.
 *
 * El primer render devuelve `null` y eso es lo que hace que hidrate bien, sin
 * necesidad de un flag de «ya monté»: en el servidor no hay DOM (el tercer
 * argumento devuelve null) y en el primer render del cliente el nodo TODAVÍA no
 * existe, porque React engancha los `ref` en el commit, después de renderizar.
 * O sea que las dos pasadas coinciden. Cuando el ref del footer se engancha, el
 * store avisa y `useSyncExternalStore` re-renderiza con el nodo puesto.
 */
export function EnLaBarra({ children }: { children: React.ReactNode }) {
  const nodo = useSyncExternalStore(_suscribir, () => _nodo, () => null);
  return nodo ? createPortal(children, nodo) : null;
}

/** El look de un botón de la barra inferior — el mismo de BRIEFING y AV AGENT.
 *  Vive acá para que una vista no tenga que adivinarlo (ni inventar otro). */
export function BotonBarra({ label, icono, onClick, activo = false, title }: {
  label: string; icono?: string; onClick: () => void; activo?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold transition-colors ${
        activo
          ? "text-[var(--t-accent)]"
          : "text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"}`}
    >
      {icono && <span>{icono}</span>}
      <span className="tracking-widest">{label}</span>
    </button>
  );
}
