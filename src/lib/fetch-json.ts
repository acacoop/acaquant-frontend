// Helper ÚNICO de fetch JSON client-side (antes copiado en 11 componentes con
// TRES semánticas de error distintas — throw / null silencioso / fallback).
//
// Contrato:
//  - fetchJson<T> TIRA con mensaje útil (status + detalle del backend). Es el
//    default para cargas de vista: la vista atrapa y muestra el error.
//  - getJSON<T> devuelve null ante CUALQUIER fallo. Solo para polls/refetches
//    donde un fallo transitorio no debe romper lo ya renderizado. NO usarla
//    para decidir "sin datos": un 403/502 se ve idéntico a vacío (así se
//    perdió una semana la tab ESTRATEGIA — ver use-poll.ts).

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) {
    let detail = "";
    try {
      const j = (await r.json()) as { detail?: unknown; error?: unknown };
      if (typeof j?.detail === "string") detail = ` — ${j.detail}`;
      else if (typeof j?.error === "string") detail = ` — ${j.error}`;
    } catch {
      /* body no era JSON */
    }
    throw new Error(`HTTP ${r.status}${detail}`);
  }
  return (await r.json()) as T;
}

export async function getJSON<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}
