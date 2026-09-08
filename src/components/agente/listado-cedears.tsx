"use client";

// EL LISTADO PARA TILDAR de `alta_cedear` (AGENT.md §0.dl) — el segundo arreglo
// del agente que pide datos, por la razón opuesta a `completar_ficha`: acá el
// sistema SABE escribirlo todo (símbolo, subyacente, historia, ADR,
// suscripción); lo que no puede decidir es CUÁLES. Primary lista muchos más
// CEDEARs de los que la mesa mira, y un botón que los sume a todos convertiría
// el scanner en la guía telefónica.
//
// Lo que se manda es `{unidad: ticker corto, valor: subyacente US}`. El
// subyacente sale prellenado con el mismo ticker (la convención de siempre);
// se corrige a mano cuando difiere (BRKB → BRK-B). El backend re-verifica cada
// uno contra Primary antes de escribir: esta lista no es una autorización.
//
// La columna «subyacente Primary» es lo que Primary DECLARA en `f.subyacente_primary`,
// de solo lectura. No se usa como default del campo editable de al lado porque
// no está medido qué pone Primary ahí (REGLA #2 — verificar antes de asumir):
// se muestra para que quien tilda lo vea, y nada más.
//
// Ahora manda DOS cosas: los tildados para dar de alta, y los tickers a
// descartar (por ticker, o todos). Sigue sin llamar a la red.
//
// ⚠️ **ESTE ARCHIVO NO LLAMA A LA RED.** La red vive UNA sola vez, en
// `datos.tsx`, y el lint lo hace estructural.
import { useEffect, useMemo, useState } from "react";

export type FilaCedear = {
  unidad: string;
  simbolo: string;
  cficode?: string;
  moneda?: string;
  subyacente_primary?: string;
  segmento?: string;
};

export function ListadoCedears({ filas, motor, ocupado, onAplicar, onNoInteresan }: {
  filas: FilaCedear[];
  motor?: { estado?: string; detalle?: string } | null;
  ocupado: boolean;
  onAplicar: (datos: { unidad: string; valor: string }[]) => Promise<void>;
  onNoInteresan: (tickers: string[], todas: boolean) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [tildados, setTildados] = useState<Record<string, boolean>>({});
  const [subyacente, setSubyacente] = useState<Record<string, string>>({});
  // «Cualquier CEDEAR que yo elija»: uno que no esté en la lista (la foto de
  // Primary puede tener un día) se pide por su ticker y el backend le pregunta
  // a Primary EN VIVO.
  const [otro, setOtro] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  // Cualquier cambio de tildados cancela la confirmación de «ninguno me
  // interesa» en curso: no queremos que un segundo clic tardío dispare el
  // descarte total sobre un tilde distinto al que el usuario tenía en mente.
  // Ajuste durante el render (no en un efecto): React lo admite para resetear
  // estado ante un cambio, sin el round-trip de un efecto.
  const [tildadosVisto, setTildadosVisto] = useState(tildados);
  if (tildadosVisto !== tildados) {
    setTildadosVisto(tildados);
    setConfirmando(false);
  }

  // La confirmación tiene techo: 5s sin el segundo clic y vuelve a pedirlo.
  useEffect(() => {
    if (!confirmando) return;
    const id = setTimeout(() => setConfirmando(false), 5_000);
    return () => clearTimeout(id);
  }, [confirmando]);

  const vistas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return filas;
    return filas.filter((f) =>
      f.unidad.toUpperCase().includes(q) || f.simbolo.toUpperCase().includes(q));
  }, [filas, busca]);

  const elegidos = useMemo(() => {
    const out = Object.entries(tildados)
      .filter(([, v]) => v)
      .map(([unidad]) => ({ unidad, valor: (subyacente[unidad] ?? "").trim() }));
    const extra = otro.trim().toUpperCase();
    if (extra && !out.some((d) => d.unidad === extra)) out.push({ unidad: extra, valor: "" });
    return out;
  }, [tildados, subyacente, otro]);

  // Los tickers a descartar son los tildados (sin el «otro»: ese no está en
  // la lista de Primary, no tiene sentido silenciarlo).
  const tildadosTickers = useMemo(
    () => Object.entries(tildados).filter(([, v]) => v).map(([unidad]) => unidad),
    [tildados]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[var(--t-text-dim)]">
          {filas.length} CEDEAR(s) que Primary lista y no tenemos · tildá los que van
        </span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="filtrar…"
          className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-32"
        />
      </div>

      <div className="max-h-72 overflow-y-auto border border-[var(--t-border)]">
        <table className="w-full text-[9px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[var(--t-text-dim)]">
            <tr>
              <th className="px-1.5 py-1 font-normal" />
              <th className="text-left px-1.5 py-1 font-normal">ticker</th>
              <th className="text-left px-1.5 py-1 font-normal">símbolo Primary</th>
              <th className="text-left px-1.5 py-1 font-normal">ficha</th>
              <th className="text-left px-1.5 py-1 font-normal">subyacente Primary</th>
              <th className="text-left px-1.5 py-1 font-normal">subyacente US</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map((f) => {
              const on = !!tildados[f.unidad];
              return (
                <tr key={f.simbolo}
                    className="border-t border-[var(--t-border)] align-middle">
                  <td className="px-1.5 py-0.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setTildados((x) => ({ ...x, [f.unidad]: e.target.checked }))}
                    />
                  </td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text)] font-bold">{f.unidad}</td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text-muted)] font-mono">{f.simbolo}</td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">
                    {f.cficode || "—"}{f.moneda ? ` · ${f.moneda}` : ""}
                  </td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">
                    {f.subyacente_primary || "—"}
                  </td>
                  <td className="px-1.5 py-0.5">
                    <input
                      value={subyacente[f.unidad] ?? f.unidad}
                      disabled={!on}
                      onChange={(e) => setSubyacente((x) => ({ ...x, [f.unidad]: e.target.value }))}
                      className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-24 disabled:opacity-40"
                    />
                  </td>
                </tr>
              );
            })}
            {!vistas.length && (
              <tr>
                <td colSpan={6} className="px-1.5 py-2 text-[var(--t-text-dim)]">
                  nada que coincida con «{busca}»
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={otro}
          onChange={(e) => setOtro(e.target.value)}
          placeholder="otro ticker (no está en la lista)"
          className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-44"
        />
        <button
          type="button"
          disabled={ocupado || !elegidos.length}
          onClick={() => void onAplicar(elegidos)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
        >
          {ocupado ? "dando de alta…" : `dar de alta ${elegidos.length}`}
        </button>
        <button
          type="button"
          disabled={ocupado || !tildadosTickers.length}
          onClick={() => void onNoInteresan(tildadosTickers, false)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-40"
        >
          no me interesan las {tildadosTickers.length} tildadas
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            if (!confirmando) { setConfirmando(true); return; }
            setConfirmando(false);
            void onNoInteresan([], true);
          }}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-40"
        >
          {confirmando
            ? `¿descartar los ${filas.length}? · sí, ninguno`
            : "ninguna me interesa · avisar solo las nuevas"}
        </button>
        <span className="text-[var(--t-text-dim)]">
          dar de alta: entra al master, al motor y al scanner · no me
          interesan: quedan apagados en el master y el aviso vuelve solo con
          los nuevos (se reactivan desde Manager → RENTA VARIABLE)
        </span>
      </div>
      {motor?.detalle && (
        <p className={motor.estado === "ok" ? "text-[var(--t-text-dim)]" : "text-[var(--t-accent)]"}>
          {motor.estado === "ok" ? "· " : "⚠ "}{motor.detalle}
        </p>
      )}
    </div>
  );
}
