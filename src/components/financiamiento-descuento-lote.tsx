"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import {
  API,
  Caja,
  Campo,
  Datos,
  Fila,
  INPUT,
  Instrumento,
  MontoInput,
  VALOR_PARAM,
  aNumero,
  costoDe,
  fmtFecha,
  fmtPct,
  fmtPlata,
} from "./financiamiento-descuento-ui";

/**
 * MODO LOTE del panel DESCUENTO: N cheques/pagarés con el MISMO instrumento y
 * el MISMO aval, en una grilla editable, con totales y CFT del lote entero.
 *
 * A diferencia de la calculadora SIMPLE, esto SÍ persiste — pero solo en
 * `localStorage`, y solo por el día (ver los helpers al final del archivo).
 * Es una decisión del user, no un recorte técnico: son las "operaciones" que
 * el comercial va armando en el día, no un registro — vive en SU navegador y
 * muere al día siguiente, nadie más lo ve. Si algún día hace falta compartirlo
 * entre puestos o auditarlo, ahí sí pasa a ser una tabla del backend.
 */

const DEBOUNCE_MS = 350;
const MAX_FILAS = 50;

type FilaIn = { id: string; monto: string; tasa: string; dias: string };

type FilaLote = {
  n: number;
  monto: number;
  tasa_pct: number;
  dias: number;
  vencimiento: string;
  tasa_directa_pct: number;
  descuento: number;
  monto_descontado: number;
  arancel_aca: number;
  iva_aranceles: number;
  derecho_mercado: number;
  iva_derecho: number;
  a_recibir_cliente: number;
  comision_sgr: number | null;
  neto_final: number;
};

type CalcLote = {
  filas: FilaLote[];
  totales: {
    monto: number;
    descuento: number;
    monto_descontado: number;
    arancel_aca: number;
    iva_aranceles: number;
    derecho_mercado: number;
    iva_derecho: number;
    a_recibir_cliente: number;
    comision_sgr: number | null;
    neto_final: number;
  };
  plazo_ponderado_dias: number;
  cft_pct: number | null;
  flujos: { fecha: string; importe: number }[];
  params: {
    instrumento: string;
    aval: string | null;
    costo_aval_pct: number | null;
    nota_aval: string;
    arancel_aca_pct: number;
    derecho_mercado_pct: number;
    iva_pct: number;
    base_anual: number;
    hoy: string;
  };
};

function nuevoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function nuevaFila(): FilaIn {
  return { id: nuevoId(), monto: "", tasa: "", dias: "" };
}

/** Una fila "cuenta" para el cálculo si tiene los tres campos con forma de
 *  número válido. Estructural: acepta tanto `FilaIn` como las filas crudas que
 *  vienen de un lote guardado en `localStorage` (sin `id`). */
function esCompleta(f: { monto: string; tasa: string; dias: string }): boolean {
  return aNumero(f.monto) > 0 && Number(f.dias) > 0 && !Number.isNaN(Number(f.tasa.replace(",", ".")));
}

function aItem(f: FilaIn) {
  return {
    monto: aNumero(f.monto),
    tasa_pct: Number(f.tasa.replace(",", ".")),
    dias: Number(f.dias),
  };
}

function horaDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function CalculadoraLote({ datos }: { datos: Datos }) {
  const [cliente, setCliente] = useState("");
  const [instrumento, setInstrumento] = useState<Instrumento>("cheque");
  const [aval, setAval] = useState("");
  const [filas, setFilas] = useState<FilaIn[]>(() => [nuevaFila(), nuevaFila(), nuevaFila()]);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [lotes, setLotes] = useState<LoteGuardado[]>([]);
  const [res, setRes] = useState<CalcLote | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [focoEn, setFocoEn] = useState<string | null>(null);

  function mostrarAviso(msg: string) {
    setAviso(msg);
    window.setTimeout(() => setAviso(null), 6000);
  }

  // Ref (no estado) porque el guard tiene que estar visible YA para el efecto
  // del aval por-defecto que corre en el mismo commit de montaje — con estado,
  // ese efecto vería el `aval` todavía vacío (la actualización de este mismo
  // efecto no se refleja hasta el próximo render) y pisaría el aval restaurado
  // con el primero de la lista.
  const restauradoRef = useRef(false);

  // Al montar: si había un borrador de HOY en este navegador, se restaura.
  useEffect(() => {
    const a = leerAlmacen();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLotes(a.lotes);
    if (a.borrador) {
      restauradoRef.current = true;
      const b = a.borrador;
      setCliente(b.cliente);
      setInstrumento(b.instrumento);
      setAval(b.aval);
      setFilas(
        b.filas.length
          ? b.filas.map((f) => ({ ...f, id: nuevoId() }))
          : [nuevaFila(), nuevaFila(), nuevaFila()],
      );
      setLoteId(b.id);
    }
  }, []);

  // Primer aval con costo cargado para el instrumento elegido — igual que en
  // la calculadora simple, pero sin pisar un aval recién restaurado del
  // borrador (`restauradoRef`).
  useEffect(() => {
    if (aval || restauradoRef.current || datos.avales.length === 0) return;
    const primero = datos.avales.find((a) => costoDe(a, instrumento) != null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (primero) setAval(primero.nombre);
  }, [datos.avales, aval, instrumento]);

  // Autosave del borrador — sobrevive a cerrar la pestaña sin querer.
  //
  // El último borrador armado queda también en un ref, porque este componente
  // se DESMONTA al maximizar/minimizar el panel (el contenido pasa a un portal
  // y React lo remonta de cero) y el debounce de 500 ms dejaría afuera lo que
  // se tipeó justo antes del clic. El efecto de más abajo lo escribe al
  // desmontar, sin esperar el timer.
  const pendienteRef = useRef<LoteGuardado | null>(null);
  useEffect(() => {
    const borrador: LoteGuardado = {
      id: loteId ?? "borrador",
      cliente,
      instrumento,
      aval,
      filas: filas.map(({ monto, tasa, dias }) => ({ monto, tasa, dias })),
      guardado_at: new Date().toISOString(),
    };
    pendienteRef.current = borrador;
    const id = window.setTimeout(() => {
      escribirAlmacen({ ...leerAlmacen(), borrador });
      pendienteRef.current = null;
    }, 500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, instrumento, aval, filas]);

  // Flush al desmontar: lo que el debounce todavía no escribió, se escribe acá.
  useEffect(
    () => () => {
      if (pendienteRef.current) escribirAlmacen({ ...leerAlmacen(), borrador: pendienteRef.current });
    },
    [],
  );

  // Enfocar la fila recién agregada (Enter en Días, o "+ fila") y soltar el
  // flag: `autoFocus` del input ya se aplicó al montar ese nodo, no hace falta
  // conservar el estado más allá de ese primer render.
  useEffect(() => {
    if (!focoEn) return;
    const id = window.setTimeout(() => setFocoEn(null), 0);
    return () => window.clearTimeout(id);
  }, [focoEn]);

  const costoElegido = useMemo(() => {
    const a = datos.avales.find((x) => x.nombre === aval);
    return a ? costoDe(a, instrumento) : null;
  }, [datos.avales, aval, instrumento]);

  const notaElegida = useMemo(
    () => datos.avales.find((x) => x.nombre === aval)?.nota ?? "",
    [datos.avales, aval],
  );

  const idsCompletas = useMemo(() => filas.filter(esCompleta).map((f) => f.id), [filas]);
  const completas = idsCompletas.length;

  const filaPorId = useMemo(() => {
    const m = new Map<string, FilaLote>();
    if (res) {
      idsCompletas.forEach((id, k) => {
        const f = res.filas[k];
        if (f) m.set(id, f);
      });
    }
    return m;
  }, [res, idsCompletas]);

  // Debounce + descarte de respuestas fuera de orden, mismo patrón que la
  // calculadora simple.
  const seq = useRef(0);
  useEffect(() => {
    const items = filas.filter(esCompleta).map(aItem);
    if (items.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRes(null);
      setErr(null);
      return;
    }
    const mio = ++seq.current;
    const id = window.setTimeout(async () => {
      setCalculando(true);
      try {
        const r = await fetchJson<CalcLote>(`${API}/calculadora/lote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instrumento, aval: aval || null, items }),
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
  }, [filas, aval, instrumento]);

  function actualizarFila(id: string, patch: Partial<FilaIn>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function borrarFila(id: string) {
    setFilas((prev) => {
      const resto = prev.filter((f) => f.id !== id);
      return resto.length ? resto : [nuevaFila()];
    });
  }

  function agregarFila() {
    if (filas.length >= MAX_FILAS) return;
    const f = nuevaFila();
    setFilas((prev) => [...prev, f]);
    setFocoEn(f.id);
  }

  function cargarLote(l: LoteGuardado) {
    setCliente(l.cliente);
    setInstrumento(l.instrumento);
    setAval(l.aval);
    setFilas(
      l.filas.length ? l.filas.map((f) => ({ ...f, id: nuevoId() })) : [nuevaFila(), nuevaFila(), nuevaFila()],
    );
    setLoteId(l.id);
  }

  function guardarHoy() {
    const a = leerAlmacen();
    const id = loteId && loteId !== "borrador" ? loteId : `lote-${nuevoId()}`;
    const nombreCliente = cliente.trim() || `Lote ${a.lotes.length + 1}`;
    const guardado: LoteGuardado = {
      id,
      cliente: nombreCliente,
      instrumento,
      aval,
      filas: filas.map(({ monto, tasa, dias }) => ({ monto, tasa, dias })),
      guardado_at: new Date().toISOString(),
    };
    const nuevos = [...a.lotes.filter((l) => l.id !== id), guardado];
    escribirAlmacen({ ...a, lotes: nuevos, borrador: guardado });
    setLotes(nuevos);
    setLoteId(id);
    setCliente(nombreCliente);
    mostrarAviso("Guardado · solo por hoy, en este navegador");
  }

  function borrarLoteActual() {
    if (!loteId || loteId === "borrador") return;
    if (!window.confirm("¿Borrar este lote guardado?")) return;
    const a = leerAlmacen();
    const nuevos = a.lotes.filter((l) => l.id !== loteId);
    escribirAlmacen({ ...a, lotes: nuevos });
    setLotes(nuevos);
    setLoteId(null);
    mostrarAviso("Borrado");
  }

  function nuevoLote() {
    setCliente("");
    setFilas([nuevaFila(), nuevaFila(), nuevaFila()]);
    setLoteId(null);
    const a = leerAlmacen();
    escribirAlmacen({ ...a, borrador: null });
  }

  async function copiarImagen() {
    if (!res) return;
    setCopiando(true);
    setAviso(null);
    const { copiarLote } = await import("@/lib/lote-imagen");
    const hayAval = !!res.params.aval;
    const columnas = [
      { titulo: "#", alinear: "izq" as const },
      { titulo: "Monto", alinear: "der" as const },
      { titulo: "Tasa", alinear: "der" as const },
      { titulo: "Días", alinear: "der" as const },
      { titulo: "Vto", alinear: "der" as const },
      { titulo: "Descuento", alinear: "der" as const },
      { titulo: "Monto bruto", alinear: "der" as const },
      { titulo: "Arancel ACA", alinear: "der" as const },
      { titulo: "IVA aranc.", alinear: "der" as const },
      { titulo: "Derecho", alinear: "der" as const },
      { titulo: "IVA der.", alinear: "der" as const },
      { titulo: "A recibir (s/aval)", alinear: "der" as const },
      ...(hayAval
        ? [
            { titulo: "Comisión SGR", alinear: "der" as const },
            { titulo: "Neto final", alinear: "der" as const },
          ]
        : []),
    ];
    const filasImg = res.filas.map((f) => [
      String(f.n),
      fmtPlata(f.monto),
      fmtPct(f.tasa_pct),
      String(f.dias),
      fmtFecha(f.vencimiento),
      fmtPlata(f.descuento),
      fmtPlata(f.monto_descontado),
      fmtPlata(f.arancel_aca),
      fmtPlata(f.iva_aranceles),
      fmtPlata(f.derecho_mercado),
      fmtPlata(f.iva_derecho),
      fmtPlata(f.a_recibir_cliente),
      ...(hayAval ? [fmtPlata(f.comision_sgr), fmtPlata(f.neto_final)] : []),
    ]);
    const t = res.totales;
    const total = [
      "TOTAL",
      fmtPlata(t.monto),
      "",
      "",
      "",
      fmtPlata(t.descuento),
      fmtPlata(t.monto_descontado),
      fmtPlata(t.arancel_aca),
      fmtPlata(t.iva_aranceles),
      fmtPlata(t.derecho_mercado),
      fmtPlata(t.iva_derecho),
      fmtPlata(t.a_recibir_cliente),
      ...(hayAval ? [fmtPlata(t.comision_sgr), fmtPlata(t.neto_final)] : []),
    ];
    const resumen = [
      {
        titulo: "Neto sin aval — total lote",
        filas: [
          { label: "Monto bruto", valor: fmtPlata(t.monto_descontado) },
          { label: "Descuento", valor: fmtPlata(t.descuento) },
          { label: "Arancel ACA Valores", valor: fmtPlata(t.arancel_aca) },
          { label: "Derecho de mercado", valor: fmtPlata(t.derecho_mercado) },
          { label: "IVA d. mercado", valor: fmtPlata(t.iva_derecho) },
          { label: "IVA aranceles", valor: fmtPlata(t.iva_aranceles) },
          { label: "A recibir cliente", valor: fmtPlata(t.a_recibir_cliente), fuerte: true },
        ],
      },
      ...(hayAval
        ? [
            {
              titulo: "Neto con aval — total lote",
              filas: [
                { label: "Costo Aval SGR", valor: fmtPct(res.params.costo_aval_pct) },
                { label: "Comisión SGR", valor: fmtPlata(t.comision_sgr) },
                {
                  label: "Plazo promedio ponderado",
                  valor: `${res.plazo_ponderado_dias.toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`,
                },
                { label: "Neto final", valor: fmtPlata(t.neto_final), fuerte: true },
              ],
            },
          ]
        : []),
      {
        titulo: "Plazo",
        filas: [
          {
            label: "Plazo promedio ponderado",
            valor: `${res.plazo_ponderado_dias.toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`,
          },
          { label: "Cantidad de cheques", valor: String(res.filas.length) },
        ],
      },
    ];
    const r = await copiarLote({
      titulo: "Simulación de descuento · lote",
      fecha: fmtFecha(res.params.hoy),
      firma: "Hecho en ACAQuant",
      logoUrl: "/logo-login.png",
      archivo: `descuento-lote-${res.params.hoy}.png`,
      subtitulo: [
        `Cliente: ${cliente || "—"} · ${instrumento === "pagare" ? "PAGARÉ" : "CHEQUE"} · Aval: ${
          res.params.aval
            ? `${res.params.aval} (${fmtPct(res.params.costo_aval_pct)})`
            : "sin aval (directo)"
        }`,
        `Arancel ACA ${fmtPct(res.params.arancel_aca_pct)} · Derecho de mercado ${fmtPct(
          res.params.derecho_mercado_pct,
        )} · IVA ${fmtPct(res.params.iva_pct, 0)} · Base ${res.params.base_anual} días`,
      ],
      columnas,
      filas: filasImg,
      total,
      resumen,
      destacado: {
        label: "CFT efectiva anual (lote, plazo ponderado)",
        valor: fmtPct(res.cft_pct),
      },
      flujos: res.flujos.map((f) => ({
        fecha: fmtFecha(f.fecha),
        importe: fmtPlata(f.importe),
        negativo: f.importe < 0,
      })),
      nota:
        "Simulador estimativo. Aranceles según los parámetros vigentes de la mesa; el costo del " +
        "aval es el indicativo de cada SGR y puede variar. Vencimientos en días corridos desde la " +
        "fecha de la simulación.",
    });
    setCopiando(false);
    mostrarAviso(
      r === "copiado"
        ? "Copiado · pegalo en el mail"
        : r === "descargado"
          ? "Tu navegador no deja copiar imágenes: se descargó"
          : "No se pudo generar la imagen",
    );
  }

  const loteCargadoExiste = !!loteId && loteId !== "borrador" && lotes.some((l) => l.id === loteId);

  return (
    <div className="p-1.5 flex flex-col gap-1.5">
      {/* ── COMPLETAR ─────────────────────────────────────────────────────── */}
      <Caja titulo="Completar" destacada>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 px-2 py-1.5">
          <Campo label="Cliente">
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="para el reporte"
              className={INPUT + " w-[170px]"}
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
          <Campo label="Costo aval">
            <span className="text-[11px] font-mono text-[var(--t-accent)] leading-[18px]">
              {fmtPct(costoElegido)}
            </span>
          </Campo>
          <Campo label="Arancel ACA">
            <span className={VALOR_PARAM}>{fmtPct(datos.aranceles.arancel_aca)}</span>
          </Campo>
          <Campo label="Derecho">
            <span className={VALOR_PARAM}>{fmtPct(datos.aranceles.derecho_mercado, 2)}</span>
          </Campo>
          <Campo label="IVA">
            <span className={VALOR_PARAM}>{fmtPct(datos.iva_pct, 0)}</span>
          </Campo>
          {notaElegida && (
            <span className="text-[9px] text-[var(--t-text-muted)] leading-[18px]">
              ⓘ {notaElegida} (no entra al cálculo)
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => void copiarImagen()}
              disabled={!res || copiando}
              className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40"
            >
              Copiar imagen
            </button>
            <button
              onClick={guardarHoy}
              className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
            >
              Guardar hoy
            </button>
            <select
              value={loteCargadoExiste ? loteId! : ""}
              onChange={(e) => {
                const l = lotes.find((x) => x.id === e.target.value);
                if (l) cargarLote(l);
              }}
              className={INPUT + " cursor-pointer"}
            >
              <option value="">{`Lotes de hoy (${lotes.length})`}</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${l.cliente} · ${l.filas.filter(esCompleta).length} cheques · ${horaDe(l.guardado_at)}`}
                </option>
              ))}
            </select>
            {loteCargadoExiste && (
              <button
                onClick={borrarLoteActual}
                className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
              >
                Borrar
              </button>
            )}
            <button
              onClick={nuevoLote}
              className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
            >
              Nuevo
            </button>
            {aviso && <span className="text-[9px] text-[var(--t-text-muted)]">{aviso}</span>}
          </div>
        </div>
      </Caja>

      {err && <p className="text-[10px] text-[#ff7777]">{err}</p>}

      {/* ── GRILLA ─────────────────────────────────────────────────────────── */}
      <Caja titulo="Cheques" extra={`${completas} de ${filas.length}`} cargando={calculando}>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono whitespace-nowrap">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
                <th className="text-left px-2 py-1 font-normal">#</th>
                <th className="text-right px-1 py-1 font-normal">Monto</th>
                <th className="text-right px-1 py-1 font-normal">Tasa %</th>
                <th className="text-right px-1 py-1 font-normal">Días</th>
                <th className="text-right px-1 py-1 font-normal">Vto</th>
                <th className="text-right px-1 py-1 font-normal">Descuento</th>
                <th className="text-right px-1 py-1 font-normal">Monto bruto</th>
                <th className="text-right px-1 py-1 font-normal">Arancel ACA</th>
                <th className="text-right px-1 py-1 font-normal">IVA aranc.</th>
                <th className="text-right px-1 py-1 font-normal">Derecho</th>
                <th className="text-right px-1 py-1 font-normal">IVA der.</th>
                <th className="text-right px-1 py-1 font-normal">A recibir (s/aval)</th>
                <th className="text-right px-1 py-1 font-normal">Comisión SGR</th>
                <th className="text-right px-1 py-1 font-normal">Neto final</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => {
                const r = filaPorId.get(f.id);
                return (
                  <tr key={f.id} className="border-t border-[var(--t-border)]">
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{idx + 1}</td>
                    <td className="px-1 py-0.5">
                      <MontoInput
                        value={f.monto}
                        onChange={(v) => actualizarFila(f.id, { monto: v })}
                        className="w-[110px] text-right"
                        autoFocus={focoEn === f.id}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        value={f.tasa}
                        onChange={(e) => actualizarFila(f.id, { tasa: e.target.value })}
                        inputMode="decimal"
                        className={INPUT + " w-[52px] text-right"}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        value={f.dias}
                        onChange={(e) => actualizarFila(f.id, { dias: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          if (idx !== filas.length - 1) return;
                          agregarFila();
                        }}
                        inputMode="numeric"
                        className={INPUT + " w-[46px] text-right"}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? fmtFecha(r.vencimiento) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? fmtPlata(r.descuento) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? (
                        fmtPlata(r.monto_descontado)
                      ) : (
                        <span className="text-[var(--t-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? fmtPlata(r.arancel_aca) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? fmtPlata(r.iva_aranceles) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? (
                        fmtPlata(r.derecho_mercado)
                      ) : (
                        <span className="text-[var(--t-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? fmtPlata(r.iva_derecho) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? (
                        fmtPlata(r.a_recibir_cliente)
                      ) : (
                        <span className="text-[var(--t-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-0.5 text-right">
                      {r ? fmtPlata(r.comision_sgr) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right font-semibold text-[var(--t-accent)]">
                      {r ? fmtPlata(r.neto_final) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-1 py-0.5 text-center">
                      <button
                        onClick={() => borrarFila(f.id)}
                        title="Borrar fila"
                        className="text-[9px] text-[var(--t-text-muted)] hover:text-[#ff7777]"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {res && (
                <tr className="bg-[var(--t-tint-amber)]/60 font-semibold border-t border-[var(--t-border)]">
                  <td className="px-2 py-0.5">TOTAL</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.monto)}</td>
                  <td className="px-1 py-0.5" />
                  <td className="px-1 py-0.5" />
                  <td className="px-1 py-0.5" />
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.descuento)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.monto_descontado)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.arancel_aca)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.iva_aranceles)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.derecho_mercado)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.iva_derecho)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.a_recibir_cliente)}</td>
                  <td className="px-1 py-0.5 text-right">{fmtPlata(res.totales.comision_sgr)}</td>
                  <td className="px-1 py-0.5 text-right text-[var(--t-accent)]">
                    {fmtPlata(res.totales.neto_final)}
                  </td>
                  <td className="px-1 py-0.5" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-2 py-1 border-t border-[var(--t-border)] flex gap-3 text-[9px] text-[var(--t-text-muted)]">
          <button
            onClick={agregarFila}
            disabled={filas.length >= MAX_FILAS}
            className="px-2 py-0.5 text-[10px] uppercase border border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40"
          >
            + fila
          </button>
          <span className="leading-[18px]">
            Enter en Días agrega una fila · las filas incompletas no entran al cálculo
          </span>
        </div>
      </Caja>

      {/* ── TOTALES + CFT ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 items-start">
        <Caja titulo="Neto sin aval — total lote" cargando={calculando}>
          <Fila label="Monto bruto" valor={fmtPlata(res?.totales.monto_descontado)} />
          <Fila label="Descuento" valor={fmtPlata(res?.totales.descuento)} />
          <Fila label="Arancel ACA Valores" valor={fmtPlata(res?.totales.arancel_aca)} />
          <Fila label="Derecho de mercado" valor={fmtPlata(res?.totales.derecho_mercado)} />
          <Fila label="IVA d. mercado" valor={fmtPlata(res?.totales.iva_derecho)} />
          <Fila label="IVA aranceles" valor={fmtPlata(res?.totales.iva_aranceles)} />
          <Fila label="A recibir cliente" valor={fmtPlata(res?.totales.a_recibir_cliente)} fuerte />
          <p className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
            Sin lo que cobra la SGR por el aval.
          </p>
        </Caja>

        <Caja titulo="Neto con aval — total lote" cargando={calculando}>
          {res && !res.params.aval ? (
            <p className="p-2 text-[10px] text-[var(--t-text-dim)]">
              Sin aval: el neto final es lo que recibe el cliente.
            </p>
          ) : (
            <>
              <Fila label="Costo Aval SGR" valor={fmtPct(res?.params.costo_aval_pct)} />
              <Fila label="Comisión SGR" valor={fmtPlata(res?.totales.comision_sgr)} resaltada />
              <Fila
                label="Plazo promedio ponderado"
                valor={
                  res
                    ? `${res.plazo_ponderado_dias.toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`
                    : "—"
                }
              />
              <Fila label="Neto final" valor={fmtPlata(res?.totales.neto_final)} fuerte />
              <p className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)]">
                Con lo que cobra la SGR por el aval.
              </p>
            </>
          )}
        </Caja>

        <Caja titulo="Costo financiero total" cargando={calculando}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
                  CFT efectiva anual
                </span>
                <span className="text-[13px] font-mono text-[var(--t-accent)]">
                  {fmtPct(res?.cft_pct)}
                </span>
              </div>
              <span className="text-[9px] text-[var(--t-text-muted)]">
                Plazo ponderado:{" "}
                {res
                  ? `${res.plazo_ponderado_dias.toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`
                  : "—"}
              </span>
            </div>
            {res && res.flujos.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--t-text-muted)]">
                  Flujos
                </span>
                {res.flujos.map((f, i) => (
                  <span key={`${f.fecha}-${i}`} className="text-[10px] font-mono">
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia intraday — SOLO localStorage, SOLO por el día. Ver el comentario
// de cabecera del archivo: es la carga del comercial en curso, no un registro.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = "acaquant.financiamiento.lotes.v1";

type LoteGuardado = {
  id: string;
  cliente: string;
  instrumento: Instrumento;
  aval: string;
  filas: { monto: string; tasa: string; dias: string }[];
  guardado_at: string;
};

type Almacen = { fecha: string; borrador: LoteGuardado | null; lotes: LoteGuardado[] };

/** "YYYY-MM-DD" en hora LOCAL del navegador — no `toISOString()`, que es UTC y
 *  corre el día a la noche (a las 21hs ART ya sería "mañana" en UTC). */
function hoyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function leerAlmacen(): Almacen {
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (raw) {
      const a = JSON.parse(raw) as Almacen;
      // Los lotes de ayer se DESCARTAN: son "operaciones del día", no un
      // histórico. Si `fecha` no coincide con hoy, arranca de cero.
      if (a && a.fecha === hoyLocal()) return a;
    }
  } catch {
    // localStorage no disponible (modo privado que lo bloquea, storage lleno,
    // etc.): se sigue sin persistir, no rompe la pantalla.
  }
  return { fecha: hoyLocal(), borrador: null, lotes: [] };
}

function escribirAlmacen(a: Almacen): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    // ídem `leerAlmacen`.
  }
}
