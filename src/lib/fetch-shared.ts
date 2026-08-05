// Cache módulo-level para listas de filtros compartidas entre vistas
// (/ops/fechas, /ops/segmentos, /comercial/operadores…). Las tabs de
// /operaciones son keep-alive: abrir OPERACIONES → ARANCELES → AGRO disparaba
// 3-4 copias de las MISMAS requests en el camino crítico de cada tab.
//
// Dedupea requests en vuelo (misma URL → misma promise) y cachea la respuesta
// ttlMs en memoria. Un fallo NO se cachea (el próximo caller reintenta).
// Contrato null-silencioso, igual que getJSON: estas listas son secundarias
// (filtros) — si fallan, la vista sigue con el dato principal.

const _cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function fetchShared<T>(url: string, ttlMs = 5 * 60_000): Promise<T | null> {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T | null>;
  const promise: Promise<T | null> = fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
  _cache.set(url, { at: Date.now(), promise });
  void promise.then((v) => {
    if (v === null) _cache.delete(url);
  });
  return promise;
}
