"use client";

// EL LISTADO HÍBRIDO de `alta_contraparte` (backend `agente/arreglos.py`,
// habilidad `contraparte_faltante`) — mezcla los otros dos patrones porque el
// problema es doble: el sistema SABE que estas cuentas son candidatas
// (`tipo_cliente` institucional sin fila en `clientes.contrapartes`) pero NO
// puede decidir cuáles de verdad son contraparte — eso lo tilda una persona,
// igual que `alta_on`/`alta_cedear` — y, para las que sí, tampoco sabe el
// NOMBRE de la contraparte ni, salvo una sugerencia, el segmento — eso se
// completa a mano, igual que `completar_ficha`.
//
// El segmento arranca precargado con lo que propone el backend
// (`segmento_sugerido`, la misma función que usa el conciliador de Manager —
// REGLA #9, no hay una copia acá). El nombre de la contraparte arranca
// SIEMPRE vacío: el backend no tiene de dónde sugerirlo.
//
// El cartel que explicaba el efecto sobre el AuM se sacó a pedido del user
// (§0.es): el efecto sigue existiendo —dar de alta saca la cuenta del AuM— y
// está escrito donde importa, en `preview.porque` del backend y en el diario.
// Una advertencia fija que se lee todos los días deja de leerse.
//
// ⚠️ **ESTE ARCHIVO NO LLAMA A LA RED.** Recibe las filas ya calculadas y
// devuelve lo cargado por `onAplicar`. La red vive UNA sola vez, en
// `datos.tsx`, y el lint lo hace estructural.
import { useId, useMemo, useState } from "react";

export type FilaContraparte = {
  cuenta: string;
  denominacion: string;
  tipo_cliente: string;
  segmento_sugerido?: string;
  fuente?: "tipo_cliente" | "nombre" | "";
  // ⚠️ **LA CONTRAPARTE PROPUESTA SALE DE LAS QUE YA ESTÁN CARGADAS, no del
  // nombre de la cuenta** (§0.es). «FCI Consultatio Estrategia IV» parece
  // Consultatio y en la tabla esas cuentas son ONE618: la propuesta ingenua
  // suena razonable y por eso se acepta. `porque` trae la evidencia —«CONSULTATIO
  // está en 3 cuenta(s) de ONE618»— para poder rechazarla sin abrir nada.
  // Vacías las dos = el backend no tuvo evidencia limpia; la fila queda para
  // escribir a mano, igual que antes.
  contraparte_sugerida?: string;
  porque?: string;
};

// Qué dice cada fuente, en una palabra. El backend manda la clave; acá solo
// se elige el dibujo — mismo espíritu que el mapa de `listado-ficha.tsx`,
// pero este es OTRO dato (el segmento de una contraparte, no el emisor de un
// título) y por eso el texto es otro.
const FUENTE: Record<string, { txt: string; ayuda: string }> = {
  tipo_cliente: {
    txt: "Aunesa",
    ayuda: "Aunesa declara esta cuenta como Fondo Común de Inversión: el "
      + "segmento sale de esa clasificación",
  },
  nombre: {
    txt: "nombre",
    ayuda: "el segmento se dedujo de un patrón en la denominación de la cuenta",
  },
};

export function ListadoContrapartes({
  filas, segmentos, nombres, ocupado, onAplicar, onNoInteresan,
}: {
  filas: FilaContraparte[];
  segmentos: string[];
  nombres: string[];
  ocupado: boolean;
  onAplicar: (datos: { cuenta: string; contraparte: string; segmento: string }[]) => void;
  // «Estas NO son contraparte» — mismo patrón que ONs y CEDEARs (§0.eh): se
  // silencian por CUENTA y el aviso vuelve solo con las institucionales nuevas.
  // Es lo único que permite que esta lista llegue a cero.
  onNoInteresan: (cuentas: string[], todas: boolean) => Promise<void>;
}) {
  // ⚠️⚠️ **LOS ID DE LOS DESPLEGABLES TIENEN QUE SER ÚNICOS EN TODO EL
  // DOCUMENTO.** `listado-ficha.tsx` lo explica con el bug que costó: un id
  // derivado del contenido (o fijo) hace que el navegador resuelva `list=`
  // contra el PRIMER `<datalist>` que encuentre con ese id — con varios
  // listados abiertos a la vez, uno termina ofreciéndole al otro sus
  // opciones. `useId()` da un id estable y único por instancia del
  // componente; acá hacen falta dos, uno por desplegable.
  const base = useId();
  const segmentosId = `${base}-segmento`;
  const nombresId = `${base}-contraparte`;

  const [tildados, setTildados] = useState<Record<string, boolean>>({});
  // Dos pasos para «ninguna me interesa»: descarta las 53 de una y no hay
  // pantalla para restaurarlas — el mismo recaudo que toma `listado-ons`.
  const [confirmando, setConfirmando] = useState(false);
  const [contraparte, setContraparte] = useState<Record<string, string>>({});
  // Sólo lo que una PERSONA escribió. La sugerencia del backend no se copia
  // acá: se resuelve al leer, en `segDe` — así una fila que aparece después
  // (el preview se recalcula tras cada GUARDAR) también nace con su
  // sugerencia. Y nada de un efecto que sincronice: pisaría lo ya corregido.
  const [segmento, setSegmento] = useState<Record<string, string>>({});

  // Se deriva de `filas` (no de `Object.entries(tildados)`) para mantener el
  // orden de la tabla y para que una cuenta que ya salió de la lista viva
  // (porque el backend la recalculó tras un GUARDAR anterior) no viaje sola.
  const tildadas = useMemo(
    () => filas.filter((f) => tildados[f.cuenta]),
    [filas, tildados]);

  // ⚠️ El valor que se MUESTRA y el que se GUARDA salen de acá, no del estado
  // pelado. `preview` se recalcula después de cada GUARDAR, así que pueden
  // aparecer filas que no existían cuando se montó el componente: leyendo el
  // estado sin fallback, esas nacían VACÍAS —perdiendo la sugerencia del
  // backend— mientras las de arriba la tenían. Con el `??`, lo editado gana y
  // lo nuevo arranca sugerido. Un `""` puesto a propósito NO es `undefined`,
  // así que borrar el campo a mano sigue borrándolo.
  const segDe = (f: FilaContraparte) =>
    segmento[f.cuenta] ?? f.segmento_sugerido ?? "";
  const cpDe = (f: FilaContraparte) =>
    contraparte[f.cuenta] ?? f.contraparte_sugerida ?? "";

  const sinNombre = useMemo(
    () => tildadas.filter(
      (f) => !(contraparte[f.cuenta] ?? f.contraparte_sugerida ?? "").trim()),
    [tildadas, contraparte]);

  const todasTildadas = filas.length > 0 && filas.every((f) => tildados[f.cuenta]);

  function tildarTodas(v: boolean) {
    setTildados(Object.fromEntries(filas.map((f) => [f.cuenta, v])));
  }

  function guardar() {
    onAplicar(tildadas.map((f) => ({
      cuenta: f.cuenta,
      contraparte: cpDe(f).trim(),
      segmento: segDe(f).trim(),
    })));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* UN `<datalist>` por listado, no uno por fila. */}
      {segmentos.length > 0 && (
        <datalist id={segmentosId}>
          {segmentos.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      {nombres.length > 0 && (
        <datalist id={nombresId}>
          {nombres.map((n) => <option key={n} value={n} />)}
        </datalist>
      )}

      <span className="text-[9px] text-[var(--t-text-dim)]">
        {filas.length} cuenta(s) institucional(es) sin contraparte · tildá las que van
      </span>

      <div className="max-h-72 overflow-y-auto border border-[var(--t-border)]">
        <table className="w-full text-[9px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[var(--t-text-dim)]">
            <tr>
              <th className="px-1.5 py-1 font-normal">
                <input
                  type="checkbox"
                  checked={todasTildadas}
                  onChange={(e) => tildarTodas(e.target.checked)}
                />
              </th>
              <th className="text-left px-1.5 py-1 font-normal">cuenta</th>
              <th className="text-left px-1.5 py-1 font-normal">denominación</th>
              <th className="text-left px-1.5 py-1 font-normal">tipo cliente</th>
              <th className="text-left px-1.5 py-1 font-normal">contraparte</th>
              <th className="text-left px-1.5 py-1 font-normal">segmento</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const on = !!tildados[f.cuenta];
              return (
                <tr key={f.cuenta} className="border-t border-[var(--t-border)] align-middle">
                  <td className="px-1.5 py-0.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setTildados((x) => ({ ...x, [f.cuenta]: e.target.checked }))}
                    />
                  </td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text)] font-bold tabular-nums">
                    {f.cuenta}
                  </td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text-muted)]">
                    {f.denominacion || "—"}
                  </td>
                  <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">
                    {f.tipo_cliente || "—"}
                  </td>
                  <td className="px-1.5 py-0.5">
                    <div className="flex items-center gap-1">
                      <input
                        list={nombresId}
                        value={cpDe(f)}
                        disabled={!on}
                        onChange={(e) =>
                          setContraparte((x) => ({ ...x, [f.cuenta]: e.target.value }))}
                        placeholder="—"
                        className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-32 disabled:opacity-40"
                      />
                      {/* Por qué se propuso ESA. Se apaga en cuanto alguien la
                          corrige: dejarla prendida diría que la tabla propuso
                          algo que en realidad escribió una persona. */}
                      {f.porque && cpDe(f) === (f.contraparte_sugerida ?? "") && (
                        <span title={f.porque}
                              className="shrink-0 text-[8px] uppercase tracking-wider px-1 border border-[var(--t-border)] text-[var(--t-text-dim)]">
                          histórico
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-1.5 py-0.5">
                    <div className="flex items-center gap-1">
                      <input
                        list={segmentosId}
                        value={segDe(f)}
                        disabled={!on}
                        onChange={(e) =>
                          setSegmento((x) => ({ ...x, [f.cuenta]: e.target.value }))}
                        placeholder="—"
                        className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-24 disabled:opacity-40"
                      />
                      {/* De dónde salió la sugerencia. Se apaga en cuanto
                          alguien la corrige, igual que en `listado-ficha.tsx`:
                          dejarla prendida diría que Aunesa propuso algo que en
                          realidad escribió una persona. */}
                      {f.fuente && FUENTE[f.fuente]
                        && segDe(f) === (f.segmento_sugerido ?? "") && (
                        <span title={FUENTE[f.fuente].ayuda}
                              className="shrink-0 text-[8px] uppercase tracking-wider px-1 border border-[var(--t-border)] text-[var(--t-text-dim)]">
                          {FUENTE[f.fuente].txt}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filas.length && (
              <tr>
                <td colSpan={6} className="px-1.5 py-2 text-[var(--t-text-dim)]">
                  no hay cuentas candidatas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={ocupado || !tildadas.length || sinNombre.length > 0}
          onClick={guardar}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
        >
          {ocupado ? "escribiendo…" : `guardar ${tildadas.length}`}
        </button>
        <button
          type="button"
          disabled={ocupado || !tildadas.length}
          onClick={() => void onNoInteresan(tildadas.map((f) => f.cuenta), false)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-40"
        >
          no son contraparte · {tildadas.length}
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
            : "ninguna es contraparte · avisar solo las nuevas"}
        </button>
        <span className="text-[9px] text-[var(--t-text-dim)]">
          {tildadas.length} tildada(s)
          {sinNombre.length > 0 ? ` · ${sinNombre.length} sin nombre` : ""}
          {" · descartar es por cuenta y el aviso vuelve solo con las nuevas"}
        </span>
      </div>
    </div>
  );
}
