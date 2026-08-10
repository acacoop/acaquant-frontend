"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * Modal de ABM tipo planilla — una tabla donde se dan de alta, editan y bajan las
 * filas de un catálogo. Lo comparten los catálogos de Tesorería (BANCOS y
 * MERCADOS/FCI) para que se vean y se comporten igual.
 *
 * Genérico a propósito: recibe la definición de columnas y tres callbacks; no sabe
 * nada del dominio. La validación REAL vive en el backend — esto es solo la UI.
 *
 * Cada fila se edita in-place y se guarda con "✓". `onBaja` es opcional: si no se
 * pasa, no se ofrece dar de baja (los catálogos con históricos usan baja lógica).
 */

export type AbmCampo = {
  key: string;
  label: string;
  ancho?: string;              // clase de tailwind, ej. "w-[30%]"
  opciones?: string[];         // si viene, se edita con un <select>
  soloAlta?: boolean;          // no editable después de creada (ej. la moneda: es PK)
  placeholder?: string;
};
export type AbmFila = Record<string, string> & { _id: string };

const INPUT = "w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 " +
  "text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]";

export function AbmModal({
  titulo, ayuda, aviso, campos, filas, onAlta, onGuardar, onBaja, textoBaja = "baja",
  bloqueado, onCerrar,
}: {
  titulo: string;
  ayuda?: string;
  // Bloque libre debajo de la ayuda, para lo que el catálogo necesite ADVERTIR (ej.
  // bancos que están en la grilla y no acá). Es un slot: el modal sigue sin saber
  // nada del dominio.
  aviso?: ReactNode;
  campos: AbmCampo[];
  filas: AbmFila[];
  onAlta: (v: Record<string, string>) => Promise<string | null>;      // null = OK
  onGuardar: (f: AbmFila, v: Record<string, string>) => Promise<string | null>;
  onBaja?: (f: AbmFila) => Promise<string | null>;
  textoBaja?: string;
  // Bloqueo por FILA (`soloAlta` es por columna): ej. el nombre de un banco que
  // manda la fuente y no se puede tocar.
  bloqueado?: (f: AbmFila, c: AbmCampo) => boolean;
  onCerrar: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [nueva, setNueva] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Escape cierra: es un modal, tiene que poder salirse sin mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const correr = async (fn: () => Promise<string | null>, alCerrar?: () => void) => {
    setBusy(true); setErr(null);
    const e = await fn();
    setBusy(false);
    if (e) { setErr(e); return; }
    alCerrar?.();
  };

  const abrirEdicion = (f: AbmFila) => {
    setEditId(f._id);
    setBorrador(Object.fromEntries(campos.map((c) => [c.key, f[c.key] ?? ""])));
    setErr(null);
  };

  const celdaEditable = (c: AbmCampo, val: string, set: (v: string) => void,
                         deshabilitado = false) => (
    c.opciones
      ? (
        <select value={val} onChange={(e) => set(e.target.value)}
          disabled={deshabilitado} className={INPUT + " disabled:opacity-40"}>
          {c.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={val} onChange={(e) => set(e.target.value)} disabled={deshabilitado}
          placeholder={c.placeholder} className={INPUT + " disabled:opacity-40"} />
      )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div className="w-full max-w-[820px] max-h-[80vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold">{titulo}</span>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70">✕</button>
        </div>
        {ayuda && (
          <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
            {ayuda}
          </div>
        )}
        {aviso && <div className="shrink-0">{aviso}</div>}
        {err && <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)] shrink-0">{err}</div>}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full table-fixed text-[11px]">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              <tr className="border-b border-[var(--t-border)]">
                {campos.map((c) => (
                  <th key={c.key} className={"px-2 py-1.5 text-left font-normal " + (c.ancho ?? "")}>
                    {c.label}
                  </th>
                ))}
                <th className="px-2 py-1.5 w-[110px]" />
              </tr>
            </thead>
            <tbody>
              {/* Fila de ALTA, siempre arriba */}
              <tr className="border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                {campos.map((c) => (
                  <td key={c.key} className="px-2 py-1">
                    {celdaEditable(c, nueva[c.key] ?? (c.opciones?.[0] ?? ""),
                      (v) => setNueva((p) => ({ ...p, [c.key]: v })))}
                  </td>
                ))}
                <td className="px-2 py-1 text-right">
                  <button disabled={busy}
                    onClick={() => correr(
                      () => onAlta(Object.fromEntries(campos.map(
                        (c) => [c.key, nueva[c.key] ?? (c.opciones?.[0] ?? "")]))),
                      () => setNueva({}))}
                    className="text-[9px] uppercase tracking-widest border border-[var(--t-accent)] px-2 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
                    + alta
                  </button>
                </td>
              </tr>

              {filas.map((f) => (
                <tr key={f._id} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  {campos.map((c) => (
                    <td key={c.key} className="px-2 py-1 break-words">
                      {editId === f._id
                        ? celdaEditable(c, borrador[c.key] ?? "",
                            (v) => setBorrador((p) => ({ ...p, [c.key]: v })),
                            !!c.soloAlta || !!bloqueado?.(f, c))
                        : <span className="text-[var(--t-text)]">{f[c.key] || "—"}</span>}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {editId === f._id ? (
                      <>
                        <button disabled={busy}
                          onClick={() => correr(() => onGuardar(f, borrador), () => setEditId(null))}
                          className="text-[9px] text-[var(--t-accent)] hover:underline disabled:opacity-40">✓ guardar</button>
                        <button onClick={() => setEditId(null)}
                          className="ml-2 text-[9px] text-[var(--t-text-muted)] hover:underline">✕</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => abrirEdicion(f)}
                          className="text-[9px] text-[var(--t-accent)] hover:underline">editar</button>
                        {onBaja && (
                          <button disabled={busy} onClick={() => correr(() => onBaja(f))}
                            className="ml-2 text-[9px] text-[var(--t-neg)] hover:underline disabled:opacity-40">{textoBaja}</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!filas.length && (
                <tr><td colSpan={campos.length + 1} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  sin registros — cargá el primero arriba
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
