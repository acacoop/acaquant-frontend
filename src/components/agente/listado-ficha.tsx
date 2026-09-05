"use client";

// EL LISTADO EDITABLE de `completar_ficha` — el único arreglo del agente donde
// una PERSONA elige el valor.
//
// El resto de los arreglos CALCULAN qué van a escribir (qué pata suscribir, qué
// día rehacer) y por eso su pantalla es un botón. Acá no se puede: la clase de
// activo de un título no se deduce de ningún lado — `assets_autofill` corre
// todas las noches y ya completó todo lo que sus reglas saben derivar, así que
// lo que queda es, por definición, lo que ninguna regla resuelve (medido
// 2026-08-27: **0 derivables** en las cuatro reglas).
//
// ⚠️ **Para el EMISOR el valor ahora VIENE PROPUESTO** (2026-09-05, backend
// `agente/emisor.py`): del nombre del título, de la ficha del subyacente en
// Finnhub, o del modelo eligiendo de los emisores que ya existen. Cada fila
// llega con su valor cargado y una etiqueta que dice DE DÓNDE SALIÓ, y el que
// mira **destilda lo que está mal en vez de escribir lo que está bien**.
//
// Lo que NO cambió es quién decide: nada sale hacia el backend hasta apretar
// GUARDAR, y el backend verifica cada unidad contra la lista viva antes de
// escribir. Si el gateway no contesta, las filas llegan sin propuesta y esto
// queda exactamente como estaba — proponer no puede agregar un modo de falla.
//
// La cartera y la clase de activo siguen en blanco a propósito: son criterio de
// la mesa y no hay de dónde derivarlas. Proponerlas sería inventar.
//
// ⚠️ **ESTE ARCHIVO NO LLAMA A LA RED.** Recibe las filas ya calculadas y
// devuelve lo cargado por `onAplicar`. La red vive UNA sola vez, en
// `datos.tsx`, y el lint lo hace estructural — un fetch suelto adentro de una
// tab es cómo nacieron «apliqué y los botones volvieron» y «el informe
// desapareció al cambiar de tab».
import { useId, useMemo, useState } from "react";

export type FilaFicha = {
  unidad: string;
  cartera?: string;
  ticker?: string;
  clase_activo?: string;
  emisor?: string;
  // ⚠️ **EL VALOR PROPUESTO Y DE DÓNDE SALIÓ** (backend `agente/emisor.py`).
  // Solo viene para el EMISOR: la cartera y la clase de activo son criterio de
  // la mesa y no hay de dónde derivarlas, así que proponerlas sería inventar.
  //
  // `fuente` NO es decorado. Confirmar «Finnhub dice Chevron Corp» y confirmar
  // «el modelo eligió IEB» son dos actos distintos, y el que mira tiene que
  // poder distinguirlos SIN abrir nada. Vacío = nadie supo, y la fila queda
  // como estaba: en blanco y tipeable.
  propuesto?: string;
  fuente?: "nombre" | "finnhub" | "modelo" | "";
};

// Qué dice cada fuente, en una palabra. El backend manda la clave; acá solo se
// elige el dibujo — si el mapa viviera allá, la pantalla no podría cambiar una
// etiqueta sin un deploy del backend, y si la clave viviera acá serían dos
// listas para desincronizar (REGLA #9).
const FUENTE: Record<string, { txt: string; ayuda: string }> = {
  nombre: { txt: "nombre", ayuda: "el emisor está escrito en el nombre del título" },
  finnhub: { txt: "finnhub", ayuda: "la ficha del subyacente, según Finnhub" },
  modelo: { txt: "IA", ayuda: "lo eligió el modelo, de los emisores que ya existen" },
};

export function ListadoFicha({ campo, filas, opciones, ocupado, onAplicar }: {
  campo: string;
  filas: FilaFicha[];
  opciones: string[];
  ocupado: boolean;
  onAplicar: (datos: { unidad: string; valor: string }[]) => Promise<void>;
}) {
  // ⚠️⚠️ **EL ID DEL DESPLEGABLE TIENE QUE SER ÚNICO EN TODO EL DOCUMENTO.**
  //
  // La primera versión lo derivaba del PLACEHOLDER, y en las filas el
  // placeholder es «—»: al sacarle los no-alfanuméricos quedaba la cadena
  // vacía, o sea `id="op-"` para TODAS las filas de TODOS los listados
  // abiertos. Y como ENCONTRÓ ordena por severidad, el listado de CARTERA
  // (alta) se dibuja ANTES que el de CLASE_ACTIVO (media) — así que el
  // navegador resolvía `list="op-"` contra el primero que encontraba y
  // **CLASE_ACTIVO ofrecía los valores de CARTERA**.
  //
  // No fallaba: ofrecía opciones plausibles y equivocadas, que es peor.
  // `useId()` da un id estable y único por instancia del componente.
  const listaId = `${useId()}-${campo}`;
  // ⚠️⚠️ **LAS PROPUESTAS ARRANCAN CARGADAS, y eso es todo el cambio.**
  //
  // Antes esto salía vacío y había que tipear los N valores. Ahora el que mira
  // DESTILDA lo que está mal en vez de escribir lo que está bien.
  //
  // Sigue siendo estado de PANTALLA: nada sale hacia el backend hasta apretar
  // GUARDAR, y el backend igual verifica cada unidad contra la lista viva de
  // faltantes antes de escribir. Una propuesta que nadie confirma no toca la
  // base.
  //
  // `useState(() => ...)` y no un `useEffect`: es el valor INICIAL, no una
  // sincronización. Con un efecto, cada recálculo del preview pisaría lo que la
  // persona acaba de corregir a mano.
  const [valores, setValores] = useState<Record<string, string>>(
    () => Object.fromEntries(
      filas.filter((f) => f.propuesto).map((f) => [f.unidad, f.propuesto as string])));
  const [busca, setBusca] = useState("");
  // El valor que se aplica «a todos los que se ven». No es un default global:
  // se escribe en las filas visibles y después se puede corregir una por una
  // antes de guardar. Nada sale hacia el backend hasta apretar GUARDAR.
  const [enMasa, setEnMasa] = useState("");

  const vistas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (!q) return filas;
    return filas.filter((f) =>
      f.unidad.toUpperCase().includes(q)
      || (f.ticker ?? "").toUpperCase().includes(q)
      || (f.cartera ?? "").toUpperCase().includes(q));
  }, [filas, busca]);

  // Solo lo que tiene valor cargado viaja. Una fila en blanco no es un error:
  // es una fila que todavía no se decidió, y mandarla vacía sería pedirle al
  // backend que escriba «nada» sobre un campo que ya está vacío.
  const cargadas = useMemo(
    () => Object.entries(valores)
      .map(([unidad, valor]) => ({ unidad, valor: valor.trim() }))
      .filter((d) => d.valor),
    [valores]);

  function pintarVisibles() {
    if (!enMasa.trim()) return;
    setValores((v) => {
      const out = { ...v };
      for (const f of vistas) out[f.unidad] = enMasa;
      return out;
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* UNO por listado, no uno por fila: con 379 filas eran 379 copias de la
          misma lista en el DOM. */}
      {opciones.length > 0 && (
        <datalist id={listaId}>
          {opciones.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[var(--t-text-dim)]">
          {filas.length} título(s) sin <b className="text-[var(--t-text)]">{campo}</b>
        </span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="filtrar…"
          className="text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] w-32"
        />
        {/* CARGAR EN TANDA. Los que faltan suelen ser del mismo tipo, así que
            tipear 200 veces lo mismo es cómo nacen `HD ` y `hd` — que no fallan
            y rompen los filtros que comparan exacto. */}
        <ValorInput
          valor={enMasa} onChange={setEnMasa} lista={listaId}
          placeholder={`${campo} para los ${vistas.length} visibles`}
          ancho="w-44"
        />
        <button
          type="button"
          disabled={!enMasa.trim() || !vistas.length}
          onClick={pintarVisibles}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          poner en los {vistas.length}
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto border border-[var(--t-border)]">
        <table className="w-full text-[9px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[var(--t-text-dim)]">
            <tr>
              <th className="text-left px-1.5 py-1 font-normal">unidad</th>
              <th className="text-left px-1.5 py-1 font-normal">cartera</th>
              <th className="text-left px-1.5 py-1 font-normal">ticker</th>
              <th className="text-left px-1.5 py-1 font-normal">{campo}</th>
            </tr>
          </thead>
          <tbody>
            {vistas.map((f) => (
              <tr key={f.unidad}
                  className="border-t border-[var(--t-border)] align-middle">
                <td className="px-1.5 py-0.5 text-[var(--t-text)] break-all max-w-[18rem]">
                  {f.unidad}
                </td>
                <td className="px-1.5 py-0.5 text-[var(--t-text-muted)]">
                  {f.cartera || "—"}
                </td>
                <td className="px-1.5 py-0.5 text-[var(--t-text-muted)]">
                  {f.ticker || "—"}
                </td>
                <td className="px-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <ValorInput
                      valor={valores[f.unidad] ?? ""}
                      onChange={(v) => setValores((x) => ({ ...x, [f.unidad]: v }))}
                      lista={listaId}
                      placeholder="—"
                      ancho="w-36"
                    />
                    {/* De dónde salió lo que está escrito ahí. Se apaga en
                        cuanto alguien lo corrige: dejarlo prendido diría que
                        Finnhub propuso algo que en realidad escribió una
                        persona. */}
                    {f.fuente && FUENTE[f.fuente]
                      && valores[f.unidad] === f.propuesto && (
                      <span title={FUENTE[f.fuente].ayuda}
                            className="shrink-0 text-[8px] uppercase tracking-wider px-1 border border-[var(--t-border)] text-[var(--t-text-dim)]">
                        {FUENTE[f.fuente].txt}
                      </span>
                    )}
                  </div>
                </td>
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={ocupado || !cargadas.length}
          onClick={() => void onAplicar(cargadas)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
        >
          {ocupado ? "escribiendo…" : `guardar ${cargadas.length}`}
        </button>
        <span className="text-[var(--t-text-dim)]">
          se escribe en <b className="text-[var(--t-text-muted)]">portafolio.assets</b>
          {" "}y lo cargado sale de la lista
        </span>
      </div>
    </div>
  );
}

// El campo con las opciones que YA existen en el catálogo. Es un `datalist`, no
// un `select`: hay que poder escribir un valor nuevo —el primero de una clase
// tiene que poder entrar— pero lo que ya existe se elige en vez de tipearse.
//
// El `<datalist>` lo dibuja el listado UNA vez y le pasa su id: acá no se
// deriva nada. Derivarlo del placeholder fue lo que hizo que CLASE_ACTIVO
// ofreciera los valores de CARTERA.
function ValorInput({ valor, onChange, lista, placeholder, ancho }: {
  valor: string;
  onChange: (v: string) => void;
  lista: string;
  placeholder: string;
  ancho: string;
}) {
  return (
    <input
      list={lista || undefined}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`text-[9px] px-1.5 py-0.5 bg-[var(--t-surface)] border border-[var(--t-border)] text-[var(--t-text)] ${ancho}`}
    />
  );
}
