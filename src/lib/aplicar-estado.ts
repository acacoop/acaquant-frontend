"use client";

/**
 * NAVEGACIÓN ASISTIDA (v1.82): aplicar un estado de vista completo de una.
 *
 * Las vistas ya persisten sus filtros con `usePersistedState` (sessionStorage,
 * claves estables tipo "ops.mercado"). El guía resuelve server-side QUÉ claves
 * setear — validadas contra los catálogos reales, ver
 * api/services/copiloto/navegacion.py — y acá simplemente se escriben y se
 * avisa. Por eso esto funciona en CUALQUIER vista sin tocar su código.
 *
 * Dos casos, los dos cubiertos:
 * - la vista NO está montada (venimos de otra ruta) → al montar, cada
 *   usePersistedState lee sessionStorage y arranca con el filtro puesto;
 * - la vista YA está montada (misma ruta) → el evento la hace releer.
 */

export const ESTADO_APLICADO_EVENT = "acaquant:estado-aplicado";

export function aplicarEstado(estado: Record<string, unknown> | null | undefined): void {
  if (!estado) return;
  try {
    for (const [clave, valor] of Object.entries(estado)) {
      sessionStorage.setItem(clave, JSON.stringify(valor));
    }
  } catch {
    // storage lleno / modo privado: la navegación igual ocurre, sin filtros
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(ESTADO_APLICADO_EVENT));
  } catch {
    // entorno sin CustomEvent (SSR) — no aplica
  }
}
