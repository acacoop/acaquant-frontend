"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function FinanciamientoDescuento() {
  const [tab, setTab] = useState<Tab>("calc");
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

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--t-border)] shrink-0">
        <TabBtn active={tab === "calc"} onClick={() => setTab("calc")}>
          Calculadora
        </TabBtn>
        <TabBtn active={tab === "datos"} onClick={() => setTab("datos")}>
          Datos
        </TabBtn>
        {tab === "calc" && (
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">
            no persiste — simulador
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {errDatos ? (
          <p className="p-3 text-[11px] text-[#ff7777]">{errDatos}</p>
        ) : !datos ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
        ) : tab === "calc" ? (
          <Calculadora datos={datos} />
        ) : (
          <TabDatos datos={datos} onCambio={cargarDatos} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CALCULADORA
// ─────────────────────────────────────────────────────────────────────────────

function Calculadora({ datos }: { datos: Datos }) {
  const [monto, setMonto] = useState("50000000");
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

  // Debounce: una llamada por pausa de tipeo, no una por tecla. El ref guarda el
  // token del último request para descartar respuestas fuera de orden (una
  // llamada lenta que vuelve después de una rápida pintaría datos viejos).
  const seq = useRef(0);
  useEffect(() => {
    const m = Number(monto.replace(/\./g, "").replace(",", "."));
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
    <div className="p-2 grid grid-cols-1 xl:grid-cols-2 gap-2 items-start">
      {/* ── COMPLETAR ─────────────────────────────────────────────────────── */}
      <Caja titulo="Completar" destacada>
        <Campo label="Monto a descontar">
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            className={INPUT}
          />
        </Campo>
        <Campo label="Tasa">
          <div className="flex items-center gap-1">
            <input
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              inputMode="decimal"
              className={INPUT}
            />
            <span className="text-[10px] text-[var(--t-text-muted)]">%</span>
          </div>
        </Campo>
        <Campo label="Días">
          <input
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            inputMode="numeric"
            className={INPUT}
          />
        </Campo>
        <Campo label="Instrumento">
          <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
            {(["cheque", "pagare"] as Instrumento[]).map((i) => (
              <button
                key={i}
                onClick={() => setInstrumento(i)}
                className={
                  "px-2 py-0.5 text-[10px] uppercase " +
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
            className={INPUT + " cursor-pointer"}
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
        <Campo label="Costo Aval SGR">
          <span className="text-[11px] font-mono text-[var(--t-accent)]">
            {fmtPct(costoElegido)}
          </span>
        </Campo>
        {notaElegida && (
          // Informativa: NO entra a ninguna fórmula (decisión del user).
          <p className="px-2 py-1 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
            ⓘ {notaElegida} — no entra al cálculo
          </p>
        )}
        <p className="px-2 py-1 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
          arancel ACA {fmtPct(datos.aranceles.arancel_aca)} · derecho de mercado{" "}
          {fmtPct(datos.aranceles.derecho_mercado, 2)} · IVA {fmtPct(datos.iva_pct, 0)} · base{" "}
          {datos.base_anual}d
        </p>
      </Caja>

      {/* ── RESULTADOS ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {err && <p className="text-[10px] text-[#ff7777]">{err}</p>}

        <Caja titulo="Neto sin aval" cargando={calculando}>
          <Fila label="Monto descontado" valor={fmtPlata(res?.sin_aval.monto_descontado)} fuerte />
          <Fila label="Tasa directa" valor={fmtPct(res?.sin_aval.tasa_directa_pct)} />
          <Fila label="Arancel ACA Valores" valor={fmtPlata(res?.sin_aval.arancel_aca)} />
          <Fila label="Derecho de mercado" valor={fmtPlata(res?.sin_aval.derecho_mercado)} />
          <Fila label="IVA d. mercado" valor={fmtPlata(res?.sin_aval.iva_derecho)} />
          <Fila label="IVA aranceles" valor={fmtPlata(res?.sin_aval.iva_aranceles)} />
          <Fila label="A recibir cliente" valor={fmtPlata(res?.sin_aval.a_recibir_cliente)} fuerte />
          <p className="px-2 py-1 text-[9px] text-[var(--t-text-muted)]">
            No se considera lo que cobra la SGR por el aval.
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
              <p className="px-2 py-1 text-[9px] text-[var(--t-text-muted)]">
                Se considera lo que cobra la SGR por el aval.
              </p>
            </>
          )}
        </Caja>

        <Caja titulo="Costo financiero total" cargando={calculando}>
          <Fila label="CFT (efectiva anual)" valor={fmtPct(res?.cft_pct)} fuerte />
          {res && res.flujos.length > 0 && (
            <div className="border-t border-[var(--t-border)]">
              <div className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
                Flujos de efectivo
              </div>
              {res.flujos.map((f) => (
                <Fila
                  key={f.fecha}
                  label={fmtFecha(f.fecha)}
                  valor={fmtPlata(f.importe)}
                  negativo={f.importe < 0}
                />
              ))}
            </div>
          )}
        </Caja>
      </div>
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

/** Celda editable de porcentaje. Guarda al salir del foco o con Enter — no por
 *  tecla, para no mandar un PUT por dígito. */
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
      className="w-16 bg-transparent text-right text-[10px] font-mono text-[var(--t-text)] outline-none border-b border-transparent focus:border-[var(--t-accent)]"
    />
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

const INPUT =
  "bg-transparent text-[10px] font-mono text-[var(--t-text)] outline-none " +
  "border border-[var(--t-border-2)] px-1 py-0.5 w-full focus:border-[var(--t-accent)]";

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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-0.5 border-t border-[var(--t-border)]">
      <span className="text-[10px] text-[var(--t-text-dim)] w-[110px] shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
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
    <div
      className={
        "flex items-center gap-2 px-2 py-0.5 border-t border-[var(--t-border)] " +
        (resaltada ? "bg-[#ffe9b0]/25" : "")
      }
    >
      <span
        className={
          "text-[10px] flex-1 min-w-0 truncate " +
          (fuerte ? "text-[var(--t-text)]" : "text-[var(--t-text-dim)]")
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
              ? "text-[var(--t-accent)]"
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
