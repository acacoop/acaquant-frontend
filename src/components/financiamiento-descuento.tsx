"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchJson } from "@/lib/fetch-json";

/**
 * CALCULADORA DE DESCUENTO — panel 4 de la vista FINANCIAMIENTO.
 *
 * Reemplaza la planilla Excel con la que la mesa cotizaba cuánta plata recibe un
 * cliente HOY si descuenta un cheque / pagaré, y cuánto le termina costando en
 * tasa anual. Dos tabs:
 *
 *   CALCULADORA — el usuario carga MONTO / TASA / DÍAS, elige instrumento
 *     (CHEQUE o PAGARÉ) y el AVAL (SGR) por nombre. Devuelve NETO SIN AVAL,
 *     NETO CON AVAL, el CFT y los dos flujos de efectivo. **NO PERSISTE NADA**:
 *     lo corre cualquiera que entre a la vista y se lo lleva puesto al salir.
 *   DATOS — lo único que persiste: catálogo de SGRs con su costo por
 *     instrumento, arancel de ACA Valores y derecho de mercado. Editable por
 *     cualquiera que tenga acceso a FINANCIAMIENTO (módulo `operaciones`).
 *
 * LAS CUENTAS NO ESTÁN ACÁ, A PROPÓSITO. Las hace el backend
 * (`api/services/financiamiento_calc.py`) y este componente solo pinta lo que
 * recibe. Es el mismo criterio que el detalle por celda de Tesorería: si el
 * front replicara las fórmulas, el día que cambie un parámetro la pantalla
 * podría contradecir a la API sin que nadie se entere. Además el costo del aval
 * NO viaja en el request — se manda el NOMBRE y el backend resuelve el número,
 * así nadie cotiza con un costo que no es el vigente.
 *
 * El POST va con debounce: escribir el monto dispara una llamada por pausa, no
 * por tecla.
 */

const DEBOUNCE_MS = 350;

type Aval = {
  nombre: string;
  costo_cheque: number | null;
  costo_pagare: number | null;
  nota: string;
  orden: number;
  actualizado_por: string | null;
  actualizado_at: string | null;
};

type Aranceles = {
  arancel_aca: number | null;
  derecho_mercado: number | null;
  actualizado_por: string | null;
  actualizado_at: string | null;
};

type Datos = {
  avales: Aval[];
  aranceles: Aranceles;
  iva_pct: number;
  base_anual: number;
  disponible: boolean;
};

type Calc = {
  sin_aval: {
    monto_descontado: number;
    tasa_directa_pct: number;
    arancel_aca: number;
    derecho_mercado: number;
    iva_derecho: number;
    iva_aranceles: number;
    a_recibir_cliente: number;
  };
  con_aval: {
    costo_aval_pct: number;
    comision_sgr: number;
    tasa_final_pct: number;
    monto_descontado: number;
  } | null;
  cft_pct: number | null;
  flujos: { fecha: string; importe: number }[];
  params: {
    monto: number;
    tasa_pct: number;
    dias: number;
    aval: string | null;
    instrumento: string;
    nota_aval: string;
    arancel_aca_pct: number;
    derecho_mercado_pct: number;
    iva_pct: number;
    base_anual: number;
  };
};

type Instrumento = "cheque" | "pagare";
type Tab = "calc" | "datos";

const API = "/api/operaciones/financiamiento";

/** Plata con 2 decimales y separadores AR. Acá SÍ lleva "$": son pesos, no
 *  nominales (a diferencia del resto de la vista FINANCIAMIENTO). */
function fmtPlata(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number | null | undefined, dec = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}%`;
}

/** "2026-12-17" → "17/12/2026". Se parte el string en vez de usar Date, que lo
 *  interpretaría en UTC y correría el día. */
function fmtFecha(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Puntos de miles MIENTRAS se escribe: "100000" → "100.000".
 *
 * Escribir 50 millones sin separadores es la forma más fácil de cotizar un
 * cero de más y no verlo. Se formatea en cada tecla en vez de al salir del
 * campo, que es cuando ya te equivocaste.
 *
 * Formato argentino: "." para miles y "," para decimales. Descarta todo lo que
 * no sea dígito o coma, y deja UNA sola coma (pegar "1.234,56" o "1,2,3" no
 * rompe nada). El parseo inverso lo hace `aNumero`.
 */
function conMiles(s: string): string {
  const limpio = s.replace(/[^\d,]/g, "");
  const [entero, ...resto] = limpio.split(",");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return resto.length ? `${conPuntos},${resto.join("")}` : conPuntos;
}

/** "45.058.947,42" → 45058947.42. Inverso de `conMiles`. */
function aNumero(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export function FinanciamientoDescuento() {
  const [tab, setTab] = useState<Tab>("calc");
  const [max, setMax] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errDatos, setErrDatos] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      setDatos(await fetchJson<Datos>(`${API}/datos`));
      setErrDatos(null);
    } catch (e) {
      setErrDatos(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarDatos();
  }, [cargarDatos]);

  // Este componente arma su PROPIA caja (mismas clases que el `Panel` de
  // financiamiento-view) en vez de ir adentro de una: así el título del panel
  // y las tabs comparten UNA sola barra. Con dos barras apiladas se perdían
  // ~28px de alto y el bloque del CFT quedaba abajo del corte, obligando a
  // scrollear un panel que tiene que entrar entero de un vistazo.
  // Cerrar con Escape: es un modal, y el reflejo de cualquiera es apretar Esc.
  useEffect(() => {
    if (!max) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMax(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [max]);

  // Cabecera y contenido van SEPARADOS, igual que el `Panel` genérico. Si armara
  // la caja entera y la pintara en los dos lados, la Calculadora se montaria DOS
  // veces: dos estados independientes y dos POST con debounce por cada tecla.
  const header = (
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        {/* El panel se llama DESCUENTO y no CALCULADORA: una de las tabs YA se
            llama así, y repetir la palabra al lado no agrega nada. */}
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] shrink-0">
          Descuento
        </span>
        <span className="text-[9px] text-[var(--t-text-muted)] truncate hidden sm:inline">
          cheques / pagarés
        </span>
        <div className="flex items-center gap-1 ml-1">
          <TabBtn active={tab === "calc"} onClick={() => setTab("calc")}>
            Calculadora
          </TabBtn>
          <TabBtn active={tab === "datos"} onClick={() => setTab("datos")}>
            Datos
          </TabBtn>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {tab === "calc" && (
            <span className="text-[9px] text-[var(--t-text-muted)]">
              no persiste — simulador
            </span>
          )}
          <button
            onClick={() => setMax((v) => !v)}
            className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors p-0.5"
            title={max ? "Minimizar (Esc)" : "Maximizar — para leerla o recortarla"}
          >
            {max ? <IconoMinimizar /> : <IconoMaximizar />}
          </button>
        </div>
      </div>
  );

  const contenido = (
      <div className="flex-1 min-h-0 overflow-auto">
        {errDatos ? (
          <p className="p-3 text-[11px] text-[#ff7777]">{errDatos}</p>
        ) : !datos ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
        ) : (
          <>
            {/* El backend degrada a vacío si las tablas todavía no existen (para
                no tumbar la vista FINANCIAMIENTO entera). Sin este aviso el
                síntoma era engañoso: aranceles en $ 0,00 —una cotización MÁS
                BARATA que la real— y un HTTP 500 pelado al querer cargar algo. */}
            {!datos.disponible && (
              <p className="m-1.5 px-2 py-1 text-[10px] border border-[var(--t-accent)]/50 bg-[var(--t-tint-amber)] text-[var(--t-text)]">
                ⚠ Las tablas de la calculadora todavía no existen en la base. Se puede simular,
                pero <b>los aranceles cuentan como 0</b> y la cotización sale más barata que la
                real. Falta correr <code>apply_schema</code> + restart de la API en el Droplet.
              </p>
            )}
            {tab === "calc" ? (
              <Calculadora datos={datos} />
            ) : (
              <TabDatos datos={datos} onCambio={cargarDatos} />
            )}
          </>
        )}
      </div>
  );

  const caja = (contenidoAdentro: boolean) => (
    <div className="h-full min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      {header}
      {contenidoAdentro && contenido}
    </div>
  );

  if (!max) return caja(true);

  // MAXIMIZADO = modal CENTRADO y ACOTADO, no pantalla completa.
  //
  // El `Panel` genérico de la app expande con `fixed inset-0` (todo el viewport
  // menos 12px). Acá eso es exactamente lo que NO sirve: esta cotización se
  // recorta de la pantalla y se le manda al cliente, y estirada a 2000px de
  // ancho quedan tres números perdidos en un mar de vacío. Con ancho tope y
  // centrado, el recorte sale prolijo y legible.
  //
  // 92vw/88vh como techo para que en una pantalla chica siga entrando entero, y
  // el backdrop oscurece el resto — que además ayuda a encuadrar el recorte.
  return (
    <>
      {/* La caja de la grilla queda con la cabecera sola mientras el modal está
          abierto: el hueco marca de dónde salió, sin duplicar el contenido. */}
      {caja(false)}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setMax(false)}
          >
            <div
              className="w-[min(880px,92vw)] max-h-[88vh] flex flex-col shadow-2xl"
              // El clic adentro NO cierra: si no, tipear en un campo del
              // simulador cerraría el modal en el primer clic.
              onClick={(e) => e.stopPropagation()}
            >
              {caja(true)}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function IconoMaximizar() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5" />
    </svg>
  );
}

function IconoMinimizar() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor"
         strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.5 1v3.5H1M11 4.5H7.5V1M7.5 11V7.5H11M1 7.5h3.5V11" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CALCULADORA
// ─────────────────────────────────────────────────────────────────────────────

function Calculadora({ datos }: { datos: Datos }) {
  const [monto, setMonto] = useState("50.000.000");
  const [tasa, setTasa] = useState("25");
  const [dias, setDias] = useState("127");
  const [instrumento, setInstrumento] = useState<Instrumento>("cheque");
  const [aval, setAval] = useState<string>("");
  const [res, setRes] = useState<Calc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Primer aval con costo cargado para el instrumento elegido — así la pantalla
  // no arranca pidiendo un click para mostrar algo.
  useEffect(() => {
    if (aval || datos.avales.length === 0) return;
    const primero = datos.avales.find((a) => costoDe(a, instrumento) != null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (primero) setAval(primero.nombre);
  }, [datos.avales, aval, instrumento]);

  const costoElegido = useMemo(() => {
    const a = datos.avales.find((x) => x.nombre === aval);
    return a ? costoDe(a, instrumento) : null;
  }, [datos.avales, aval, instrumento]);

  const notaElegida = useMemo(
    () => datos.avales.find((x) => x.nombre === aval)?.nota ?? "",
    [datos.avales, aval],
  );

  // Monto con puntos de miles en vivo. Reformatear en cada tecla manda el cursor
  // al final del campo, así que se cuenta cuántos DÍGITOS había antes del cursor
  // y se lo devuelve después del mismo dígito — insertar un punto no le mueve el
  // lugar a nadie. Sin esto, editar el medio de "50.000.000" es imposible.
  const montoRef = useRef<HTMLInputElement>(null);
  const onMontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const caret = e.target.selectionStart ?? e.target.value.length;
    const digitosAntes = e.target.value.slice(0, caret).replace(/\D/g, "").length;
    const fmt = conMiles(e.target.value);
    setMonto(fmt);
    requestAnimationFrame(() => {
      const el = montoRef.current;
      if (!el) return;
      let i = 0;
      let vistos = 0;
      while (i < fmt.length && vistos < digitosAntes) {
        if (/\d/.test(fmt[i])) vistos++;
        i++;
      }
      el.setSelectionRange(i, i);
    });
  };

  // Debounce: una llamada por pausa de tipeo, no una por tecla. El ref guarda el
  // token del último request para descartar respuestas fuera de orden (una
  // llamada lenta que vuelve después de una rápida pintaría datos viejos).
  const seq = useRef(0);
  useEffect(() => {
    const m = aNumero(monto);
    const t = Number(tasa.replace(",", "."));
    const d = Number(dias);
    if (!(m > 0) || !(d > 0) || Number.isNaN(t)) {
      // Entrada incompleta (el usuario está borrando el monto para retipearlo):
      // se limpia el resultado en vez de dejar en pantalla la cotización vieja,
      // que ya no corresponde a lo que dicen los campos.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRes(null);
      setErr(null);
      return;
    }
    const mio = ++seq.current;
    const id = setTimeout(async () => {
      setCalculando(true);
      try {
        const r = await fetchJson<Calc>(`${API}/calculadora`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            monto: m,
            tasa_pct: t,
            dias: d,
            aval: aval || null,
            instrumento,
          }),
        });
        if (mio === seq.current) {
          setRes(r);
          setErr(null);
        }
      } catch (e) {
        if (mio === seq.current) {
          setErr(String(e instanceof Error ? e.message : e));
          setRes(null);
        }
      } finally {
        if (mio === seq.current) setCalculando(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [monto, tasa, dias, aval, instrumento]);

  return (
    // COMPLETAR es una TIRA horizontal arriba (ocupa lo mínimo: los 6 campos en
    // una línea) y abajo los dos NETO uno al lado del otro, que es como se
    // comparan. En pantalla angosta el grid cae a una columna solo.
    <div className="p-1.5 flex flex-col gap-1.5">
      {/* ── COMPLETAR ─────────────────────────────────────────────────────── */}
      <Caja titulo="Completar" destacada>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 px-2 py-1.5">
          <Campo label="Monto a descontar">
            <input
              ref={montoRef}
              value={monto}
              onChange={onMontoChange}
              inputMode="decimal"
              className={INPUT + " w-[130px] text-right"}
            />
          </Campo>
          <Campo label="Tasa %">
            <input
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              inputMode="decimal"
              className={INPUT + " w-[58px] text-right"}
            />
          </Campo>
          <Campo label="Días">
            <input
              value={dias}
              onChange={(e) => setDias(e.target.value)}
              inputMode="numeric"
              className={INPUT + " w-[52px] text-right"}
            />
          </Campo>
          <Campo label="Instrumento">
            <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {(["cheque", "pagare"] as Instrumento[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setInstrumento(i)}
                  className={
                    "px-1.5 py-[3px] text-[10px] uppercase " +
                    (instrumento === i
                      ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]"
                      : "text-[var(--t-text-dim)] hover:text-[var(--t-text)]")
                  }
                >
                  {i === "pagare" ? "Pagaré" : "Cheque"}
                </button>
              ))}
            </div>
          </Campo>
          <Campo label="Aval (SGR)">
            <select
              value={aval}
              onChange={(e) => setAval(e.target.value)}
              className={INPUT + " w-[150px] cursor-pointer"}
            >
              <option value="">— sin aval —</option>
              {datos.avales.map((a) => (
                <option key={a.nombre} value={a.nombre} disabled={costoDe(a, instrumento) == null}>
                  {a.nombre}
                  {costoDe(a, instrumento) == null
                    ? " (sin costo cargado)"
                    : ` — ${fmtPct(costoDe(a, instrumento))}`}
                </option>
              ))}
            </select>
          </Campo>
          {/* El costo se muestra aparte de la lista: es el número que entra al
              cálculo y tiene que estar a la vista sin desplegar el combo. */}
          <Campo label="Costo aval">
            <span className="text-[11px] font-mono text-[var(--t-accent)] leading-[18px]">
              {fmtPct(costoElegido)}
            </span>
          </Campo>
          {/* Los parámetros vigentes son CAMPOS de la misma tira, no un renglón
              aparte: así se leen igual (etiqueta arriba, valor abajo) y no
              cuestan un solo pixel de alto extra. Van apagados porque no se
              editan acá — se cargan en la tab DATOS. */}
          <Campo label="Arancel ACA">
            <span className={VALOR_PARAM}>{fmtPct(datos.aranceles.arancel_aca)}</span>
          </Campo>
          <Campo label="Derecho">
            <span className={VALOR_PARAM}>{fmtPct(datos.aranceles.derecho_mercado, 2)}</span>
          </Campo>
          <Campo label="IVA">
            <span className={VALOR_PARAM}>{fmtPct(datos.iva_pct, 0)}</span>
          </Campo>
          {/* Informativa: NO entra a ninguna fórmula (decisión del user). */}
          {notaElegida && (
            <span className="text-[9px] text-[var(--t-text-muted)] leading-[18px]">
              ⓘ {notaElegida} (no entra al cálculo)
            </span>
          )}
        </div>
      </Caja>

      {err && <p className="text-[10px] text-[#ff7777]">{err}</p>}

      {/* ── LOS DOS NETO, UNO AL LADO DEL OTRO ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 items-start">
        <Caja titulo="Neto sin aval" cargando={calculando}>
          <Fila label="Monto descontado" valor={fmtPlata(res?.sin_aval.monto_descontado)} fuerte />
          <Fila label="Tasa directa" valor={fmtPct(res?.sin_aval.tasa_directa_pct)} />
          <Fila label="Arancel ACA Valores" valor={fmtPlata(res?.sin_aval.arancel_aca)} />
          <Fila label="Derecho de mercado" valor={fmtPlata(res?.sin_aval.derecho_mercado)} />
          <Fila label="IVA d. mercado" valor={fmtPlata(res?.sin_aval.iva_derecho)} />
          <Fila label="IVA aranceles" valor={fmtPlata(res?.sin_aval.iva_aranceles)} />
          <Fila label="A recibir cliente" valor={fmtPlata(res?.sin_aval.a_recibir_cliente)} fuerte />
          <p className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
            Sin lo que cobra la SGR por el aval.
          </p>
        </Caja>

        <Caja titulo="Neto con aval" cargando={calculando}>
          {res && !res.con_aval ? (
            <p className="p-2 text-[10px] text-[var(--t-text-dim)]">
              Elegí un aval para ver este bloque.
            </p>
          ) : (
            <>
              <Fila label="Costo Aval SGR" valor={fmtPct(res?.con_aval?.costo_aval_pct)} />
              <Fila label="Comisión SGR" valor={fmtPlata(res?.con_aval?.comision_sgr)} resaltada />
              <Fila label="Tasa final" valor={fmtPct(res?.con_aval?.tasa_final_pct)} />
              <Fila
                label="Monto descontado"
                valor={fmtPlata(res?.con_aval?.monto_descontado)}
                fuerte
              />
              <p className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
                Con lo que cobra la SGR por el aval.
              </p>
            </>
          )}
        </Caja>
      </div>

      {/* CFT + los dos flujos en UNA línea: son tres números, no merecen una
          tabla. El CFT va primero y grande — es el costo real de la operación. */}
      <Caja titulo="Costo financiero total" cargando={calculando}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
              CFT efectiva anual
            </span>
            <span className="text-[13px] font-mono text-[var(--t-accent)]">
              {fmtPct(res?.cft_pct)}
            </span>
          </div>
          {res && res.flujos.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
                Flujos
              </span>
              {res.flujos.map((f) => (
                <span key={f.fecha} className="text-[10px] font-mono">
                  <span className="text-[var(--t-text-dim)]">{fmtFecha(f.fecha)}</span>{" "}
                  <span className={f.importe < 0 ? "text-[#ff7777]" : "text-[var(--t-text)]"}>
                    {fmtPlata(f.importe)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </Caja>
    </div>
  );
}

function costoDe(a: Aval, i: Instrumento): number | null {
  return i === "cheque" ? a.costo_cheque : a.costo_pagare;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB DATOS — lo único que persiste
// ─────────────────────────────────────────────────────────────────────────────

function TabDatos({ datos, onCambio }: { datos: Datos; onCambio: () => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState("");

  const llamar = useCallback(
    async (url: string, init: RequestInit) => {
      setGuardando(true);
      try {
        await fetchJson(url, init);
        setErr(null);
        await onCambio();
      } catch (e) {
        setErr(String(e instanceof Error ? e.message : e));
      } finally {
        setGuardando(false);
      }
    },
    [onCambio],
  );

  const guardarAval = (a: Aval, patch: Partial<Aval>) =>
    llamar(`${API}/datos/aval`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nombre: a.nombre,
        costo_cheque: a.costo_cheque,
        costo_pagare: a.costo_pagare,
        nota: a.nota,
        orden: a.orden,
        ...patch,
      }),
    });

  const borrarAval = (nombre: string) => {
    if (!window.confirm(`¿Borrar ${nombre} del catálogo?`)) return;
    void llamar(`${API}/datos/aval?nombre=${encodeURIComponent(nombre)}`, { method: "DELETE" });
  };

  const agregar = () => {
    const n = nuevo.trim();
    if (!n) return;
    setNuevo("");
    void llamar(`${API}/datos/aval`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: n, orden: datos.avales.length }),
    });
  };

  const guardarAranceles = (patch: Partial<Aranceles>) =>
    llamar(`${API}/datos/aranceles`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        arancel_aca: datos.aranceles.arancel_aca,
        derecho_mercado: datos.aranceles.derecho_mercado,
        ...patch,
      }),
    });

  return (
    <div className="p-2 flex flex-col gap-2">
      {err && <p className="text-[10px] text-[#ff7777]">{err}</p>}

      <Caja titulo="Costo aval SGR" extra="% anual" cargando={guardando}>
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
              <th className="text-left px-2 py-1 font-normal">SGR</th>
              <th className="text-right px-2 py-1 font-normal">Cheque</th>
              <th className="text-right px-2 py-1 font-normal">Pagaré</th>
              <th className="text-left px-2 py-1 font-normal">Observación</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {datos.avales.map((a) => (
              <tr key={a.nombre} className="border-t border-[var(--t-border)]">
                <td className="px-2 py-0.5">{a.nombre}</td>
                <td className="px-1 py-0.5 text-right">
                  <CeldaPct valor={a.costo_cheque} onGuardar={(v) => guardarAval(a, { costo_cheque: v })} />
                </td>
                <td className="px-1 py-0.5 text-right">
                  <CeldaPct valor={a.costo_pagare} onGuardar={(v) => guardarAval(a, { costo_pagare: v })} />
                </td>
                <td className="px-1 py-0.5">
                  <CeldaTexto valor={a.nota} onGuardar={(v) => guardarAval(a, { nota: v })} />
                </td>
                <td className="px-1 py-0.5 text-center">
                  <button
                    onClick={() => borrarAval(a.nombre)}
                    title="Borrar del catálogo"
                    className="text-[9px] text-[var(--t-text-muted)] hover:text-[#ff7777]"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {datos.avales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-[var(--t-text-dim)]">
                  Sin SGRs cargadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center gap-1 px-2 py-1 border-t border-[var(--t-border)]">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            placeholder="nombre de la SGR"
            className={INPUT + " flex-1"}
          />
          <button
            onClick={agregar}
            className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
          >
            Agregar
          </button>
        </div>
        <p className="px-2 py-1 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
          La observación es informativa — NO entra a ninguna fórmula.
        </p>
      </Caja>

      <Caja titulo="Aranceles" extra="% anual / % sobre descontado" cargando={guardando}>
        <Fila
          label="Arancel ACA Valores"
          valor={
            <CeldaPct
              valor={datos.aranceles.arancel_aca}
              onGuardar={(v) => guardarAranceles({ arancel_aca: v })}
            />
          }
        />
        <Fila
          label="Derecho de mercado"
          valor={
            <CeldaPct
              valor={datos.aranceles.derecho_mercado}
              onGuardar={(v) => guardarAranceles({ derecho_mercado: v })}
            />
          }
        />
        <Fila label="IVA" valor={`${fmtPct(datos.iva_pct, 0)} (fijo)`} />
        <p className="px-2 py-1 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
          El arancel de ACA se prorratea por días sobre el monto NOMINAL; el derecho de mercado va
          sobre el monto DESCONTADO, sin prorratear. El IVA no se edita: es una alícuota fiscal.
          {datos.aranceles.actualizado_por &&
            ` · último cambio: ${datos.aranceles.actualizado_por}`}
        </p>
      </Caja>
    </div>
  );
}

/**
 * Celda editable de porcentaje. Guarda al salir del foco o con Enter — no por
 * tecla, para no mandar un PUT por dígito.
 *
 * LLEVA EL "%" AL LADO, y no es cosmético. El valor se guarda COMO PORCENTAJE
 * (1 = 1 %, 0,06 = 0,06 %), pero mostrando el número pelado la celda no dice si
 * ese "1" es uno por ciento o el 100 % escrito como fracción — y confundirse en
 * ese factor son dos órdenes de magnitud en el arancel que se le cobra al
 * cliente. El signo saca la duda sin tener que leer ninguna ayuda.
 */
function CeldaPct({
  valor,
  onGuardar,
}: {
  valor: number | null;
  onGuardar: (v: number | null) => void | Promise<void>;
}) {
  const [txt, setTxt] = useState(valor == null ? "" : String(valor));
  // Resincroniza el buffer local cuando el valor vuelve del servidor (el padre
  // recarga los datos después de cada guardado). Sin esto, un valor normalizado
  // por el backend no se vería reflejado en la celda.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTxt(valor == null ? "" : String(valor));
  }, [valor]);

  const commit = () => {
    const limpio = txt.trim().replace(",", ".");
    const v = limpio === "" ? null : Number(limpio);
    if (v != null && Number.isNaN(v)) {
      setTxt(valor == null ? "" : String(valor));
      return;
    }
    if (v !== valor) void onGuardar(v);
  };

  return (
    <span className="inline-flex items-baseline justify-end gap-[1px]">
      <input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTxt(valor == null ? "" : String(valor));
        }}
        inputMode="decimal"
        placeholder="—"
        className="w-14 bg-transparent text-right text-[10px] font-mono text-[var(--t-text)] outline-none border-b border-transparent focus:border-[var(--t-accent)]"
      />
      {/* Ancho fijo aunque esté vacío: sin esto, cargar el primer valor corre la
          columna entera un par de píxeles. */}
      <span className="w-[9px] text-[10px] font-mono text-[var(--t-text-muted)]">
        {txt.trim() === "" ? "" : "%"}
      </span>
    </span>
  );
}

function CeldaTexto({
  valor,
  onGuardar,
}: {
  valor: string;
  onGuardar: (v: string) => void | Promise<void>;
}) {
  const [txt, setTxt] = useState(valor);
  // Ídem CeldaPct: el buffer local sigue al valor persistido.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTxt(valor), [valor]);
  return (
    <input
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => txt !== valor && void onGuardar(txt)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setTxt(valor);
      }}
      placeholder="—"
      className="w-full bg-transparent text-[10px] text-[var(--t-text)] outline-none border-b border-transparent focus:border-[var(--t-accent)]"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas visuales — replican la planilla: cajas con encabezado y filas label/valor
// ─────────────────────────────────────────────────────────────────────────────

// Sin `w-full`: cada uso fija su ancho (los campos de la tira COMPLETAR van
// dimensionados al dato que llevan, no estirados). Mezclar `w-full` acá con un
// `w-[130px]` en el call site deja el ancho a merced del orden del CSS.
const INPUT =
  "bg-transparent text-[10px] font-mono text-[var(--t-text)] outline-none " +
  "border border-[var(--t-border-2)] px-1 py-0.5 focus:border-[var(--t-accent)]";

/** Valor de solo-lectura en la tira COMPLETAR (arancel, derecho, IVA). Apagado
 *  a propósito: no se editan acá, se cargan en la tab DATOS. */
const VALOR_PARAM = "text-[10px] font-mono text-[var(--t-text-dim)] leading-[18px]";

function Caja({
  titulo,
  extra,
  destacada = false,
  cargando = false,
  children,
}: {
  titulo: string;
  extra?: string;
  destacada?: boolean;
  cargando?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--t-border)]">
      <div
        className={
          "px-2 py-1 flex items-center gap-2 text-[9px] uppercase tracking-widest " +
          (destacada
            ? "bg-[var(--t-accent)] text-white"
            : "bg-[var(--t-accent)]/10 text-[var(--t-accent)]")
        }
      >
        <span>{titulo}</span>
        {extra && <span className="opacity-70 normal-case tracking-normal">{extra}</span>}
        {cargando && <span className="ml-auto opacity-70">·····</span>}
      </div>
      {children}
    </div>
  );
}

/** Campo de la tira COMPLETAR: etiqueta chiquita ARRIBA del control.
 *  Apilado ocupa la mitad de ancho que "etiqueta a la izquierda", que es lo que
 *  permite meter los seis campos en una sola línea. */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function Fila({
  label,
  valor,
  fuerte = false,
  resaltada = false,
  negativo = false,
}: {
  label: string;
  valor: React.ReactNode;
  fuerte?: boolean;
  resaltada?: boolean;
  negativo?: boolean;
}) {
  return (
    // `fuerte` marca los TRES números que la mesa realmente le dice al cliente
    // (monto descontado, a recibir, y el neto con aval): fondo tenue + negrita
    // para pescarlos sin leer la tabla entera. El resto son los componentes que
    // explican cómo se llegó ahí.
    //
    // Los DOS fondos salen de `--t-tint-amber`, el token del tema, y NO de un
    // color fijo. Un pastel hardcodeado (#ffe9b0 al 25%) se ve bien en claro
    // pero sobre el negro da una banda GRIS sucia — el token ya trae el par
    // (#fbf3df en claro, #1a1308 en oscuro) y es lo que usan pizarra agro y
    // operar. `resaltada` va al 100% (es el resaltado que la planilla original
    // tenía pintado a mano en la comisión SGR) y `fuerte` al 60%, para que las
    // tres filas destacadas no le compitan a esa.
    <div
      className={
        "flex items-center gap-2 px-2 py-0.5 border-t border-[var(--t-border)] " +
        (resaltada
          ? "bg-[var(--t-tint-amber)]"
          : fuerte
            ? "bg-[var(--t-tint-amber)]/60"
            : "")
      }
    >
      <span
        className={
          "text-[10px] flex-1 min-w-0 truncate " +
          (fuerte ? "font-semibold text-[var(--t-text)]" : "text-[var(--t-text-dim)]")
        }
      >
        {label}
      </span>
      <span
        className={
          "text-[10px] font-mono shrink-0 " +
          (negativo
            ? "text-[#ff7777]"
            : fuerte
              ? "font-semibold text-[var(--t-accent)]"
              : "text-[var(--t-text)]")
        }
      >
        {valor}
      </span>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-[10px] uppercase tracking-wide px-2 py-0.5 border " +
        (active
          ? "border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10"
          : "border-transparent text-[var(--t-text-dim)] hover:text-[var(--t-text)]")
      }
    >
      {children}
    </button>
  );
}
