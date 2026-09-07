"use client";

// EL LISTADO PARA TILDAR de `alta_on` (AGENT.md §0.dv) — el mismo problema que
// `alta_cedear` y por eso la misma forma: 1816 publica muchas más ONs de las que
// la mesa quiere seguir, así que el sistema sabe darlas de alta a todas y **no
// puede decidir cuáles**. La lista la tilda una persona.
//
// Lo que se manda para dar de alta es `{unidad: ticker, valor: ""}`. La curva
// de 1816 NO viaja desde acá: el backend la toma de lo que guardó el detector,
// que es la clasificación con la que se decidió que faltaba. Esta lista elige,
// no autoriza: cada ticker vuelve a pasar por el pre-flight entero (baja el
// cuadro, lo convierte, coteja el cronograma contra el de 1816) y la que no
// cierra no se escribe ni frena a las demás.
//
// Ahora manda DOS cosas: los tildados para dar de alta, y los tickers a
// descartar (por ticker, o todas). Sigue sin llamar a la red.
//
// ⚠️ **ESTE ARCHIVO NO LLAMA A LA RED.** La red vive UNA sola vez, en
// `datos.tsx`, y el lint lo hace estructural.
import { useEffect, useMemo, useState } from "react";

export type FilaON = {
  ticker: string;
  emisor?: string;
  vencimiento?: string;
  curva_1816?: string;
  denominacion?: string;
};

export function ListadoOns({ filas, ocupado, onAplicar, onNoInteresan }: {
  filas: FilaON[];
  ocupado: boolean;
  onAplicar: (datos: { unidad: string; valor: string }[]) => Promise<void>;
  onNoInteresan: (tickers: string[], todas: boolean) => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [tildados, setTildados] = useState<Record<string, boolean>>({});
  const [confirmando, setConfirmando] = useState(false);

  // Cualquier cambio de tildados cancela la confirmación de «ninguna me
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
      f.ticker.toUpperCase().includes(q) || (f.emisor ?? "").toUpperCase().includes(q));
  }, [filas, busca]);

  const elegidos = useMemo(
    () => Object.entries(tildados).filter(([, v]) => v).map(([unidad]) => ({ unidad, valor: "" })),
    [tildados]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[var(--t-text-dim)]">
          {filas.length} ON(s) que 1816 publica y no tenemos · tildá las que van
        </span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="filtrar por ticker o emisor…"
          className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-44"
        />
      </div>

      <div className="max-h-72 overflow-y-auto border border-[var(--t-border)]">
        <table className="w-full text-[9px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[var(--t-text-dim)]">
            <tr>
              <th className="px-1.5 py-1 font-normal" />
              <th className="text-left px-1.5 py-1 font-normal">ticker</th>
              <th className="text-left px-1.5 py-1 font-normal">emisor</th>
              <th className="text-left px-1.5 py-1 font-normal">vence</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map((f) => (
              <tr key={f.ticker} className="border-t border-[var(--t-border)] align-middle">
                <td className="px-1.5 py-0.5">
                  <input
                    type="checkbox"
                    checked={!!tildados[f.ticker]}
                    onChange={(e) =>
                      setTildados((x) => ({ ...x, [f.ticker]: e.target.checked }))}
                  />
                </td>
                <td className="px-1.5 py-0.5 text-[var(--t-text)] font-bold">{f.ticker}</td>
                <td className="px-1.5 py-0.5 text-[var(--t-text-muted)]">{f.emisor || "—"}</td>
                <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">{f.vencimiento || "—"}</td>
              </tr>
            ))}
            {!vistas.length && (
              <tr>
                <td colSpan={4} className="px-1.5 py-2 text-[var(--t-text-dim)]">
                  nada que coincida con «{busca}»
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          disabled={ocupado || !elegidos.length}
          onClick={() => void onNoInteresan(elegidos.map((e) => e.unidad), false)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-40"
        >
          no me interesan las {elegidos.length} tildadas
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
            ? `¿descartar las ${filas.length}? · sí, ninguna`
            : "ninguna me interesa · avisar solo las nuevas"}
        </button>
        <span className="text-[var(--t-text-dim)]">
          dar de alta: baja el cronograma de 1816 y lo coteja; la que no
          cierra no se escribe · no me interesan: se descartan por ticker y el
          aviso vuelve solo con las nuevas (se restauran desde Manager → ONs →
          ignoradas)
        </span>
      </div>
    </div>
  );
}
