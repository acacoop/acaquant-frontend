"use client";

import { useCallback, useEffect, useState } from "react";
import { NumeroInput } from "@/components/numero-input";

// ── AJUSTES DE PnL (vista CARTERAS/VALUACIONES) ──────────────────────────────
// Un evento corporativo (split de CEDEAR, canje de especie, posición pre-data)
// NO genera boleto en Aunesa → el cost-basis del motor de PnL queda desfasado
// de la tenencia y el PnL no realizado se rompe (caso YPF 10:1: pérdida
// fantasma de ~90%). Este modal es el ABM de `operaciones.pnl_ajustes`:
//   - split: factor multiplica la cantidad viva (10 = 10:1, 0,1 = reverse).
//     NO toca el costo — la plata invertida no cambia con un split.
//   - cantidad: delta con signo; >0 suma con costo opcional, <0 libera costo
//     proporcional sin generar realizado (canjes).
//   - CUENTA vacía = GLOBAL: aplica a TODAS las cuentas con boletos del ticker
//     (un split se carga UNA vez).
// La sección DESFASES DETECTADOS lee /pnl-ajustes/candidatos (cache de
// TOTALES): si todas las cuentas de un ticker comparten el ratio
// qty_aum/qty_calc, eso ES un evento corporativo y el ratio sugiere el factor.
// Escritura SOLO admin — el front esconde el form sin `puede_escribir`, pero
// el enforcement real es server-side (403 + audit en pnl_ajustes_audit).

interface Ajuste {
  id: number;
  tipo: "split" | "cantidad";
  ticker: string;
  id_cuenta: string | null;
  fecha: string;
  factor: number | null;
  cantidad: number | null;
  costo: number | null;
  moneda: string;
  nota: string | null;
  activo: boolean;
  ticker_conocido: boolean;
  creado_por: string | null;
  creado_at: string | null;
  actualizado_por: string | null;
  actualizado_at: string | null;
}

interface CandidatoTicker {
  ticker: string;
  n_cuentas: number;
  ratio_mediana: number;
  consistente: boolean;
  factor_sugerido: number | null;
}

interface FormState {
  tipo: "split" | "cantidad";
  ticker: string;
  fecha: string;
  id_cuenta: string;
  factor: string;      // crudo NumeroInput "10" / "0,1"
  cantidad: string;    // crudo con signo
  costo: string;
  moneda: string;
  nota: string;
}

const FORM_VACIO: FormState = {
  tipo: "split", ticker: "", fecha: "", id_cuenta: "",
  factor: "", cantidad: "", costo: "", moneda: "ARS", nota: "",
};

const num = (raw: string): number | null => {
  const t = (raw || "").trim().replace(",", ".");
  if (!t || t === "-") return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
};

const fmt = (v: number | null | undefined, dec = 2): string =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("es-AR", { maximumFractionDigits: dec });

const INPUT_CLS =
  "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 " +
  "text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark] w-full";

export function PnlAjustesModal({
  onCerrar,
  onCambio,
}: {
  onCerrar: () => void;
  /** Se llama tras cada escritura para que la vista refresque el PnL. */
  onCambio: () => void;
}) {
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [puedeEscribir, setPuedeEscribir] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoTicker[]>([]);
  const [nCandidatos, setNCandidatos] = useState(0);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [verCandidatos, setVerCandidatos] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/portfolio/pnl-ajustes", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAjustes(d.ajustes || []);
      setPuedeEscribir(!!d.puede_escribir);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const cargarCandidatos = useCallback(async () => {
    try {
      const r = await fetch("/api/portfolio/pnl-ajustes/candidatos", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setCandidatos(d.por_ticker || []);
      setNCandidatos((d.candidatos || []).length);
    } catch {
      /* la detección es best-effort — el ABM funciona igual sin ella */
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarCandidatos();
  }, [cargar, cargarCandidatos]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCerrar]);

  const escribir = useCallback(
    async (metodo: string, url: string, body?: unknown): Promise<boolean> => {
      setBusy(true);
      setErr(null);
      try {
        const r = await fetch(url, {
          method: metodo,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`));
          return false;
        }
        await cargar();
        onCambio();
        return true;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [cargar, onCambio],
  );

  const guardar = async () => {
    const body = {
      tipo: form.tipo,
      ticker: form.ticker.trim().toUpperCase(),
      fecha: form.fecha,
      id_cuenta: form.id_cuenta.trim() || null,
      factor: form.tipo === "split" ? num(form.factor) : null,
      cantidad: form.tipo === "cantidad" ? num(form.cantidad) : null,
      costo: form.tipo === "cantidad" ? num(form.costo) : null,
      moneda: form.moneda,
      nota: form.nota.trim() || null,
    };
    const ok = editandoId !== null
      ? await escribir("PUT", `/api/portfolio/pnl-ajustes/${editandoId}`, body)
      : await escribir("POST", "/api/portfolio/pnl-ajustes", body);
    if (ok) {
      setForm(FORM_VACIO);
      setEditandoId(null);
    }
  };

  const editar = (a: Ajuste) => {
    setEditandoId(a.id);
    setForm({
      tipo: a.tipo,
      ticker: a.ticker,
      fecha: a.fecha || "",
      id_cuenta: a.id_cuenta || "",
      factor: a.factor !== null ? String(a.factor).replace(".", ",") : "",
      cantidad: a.cantidad !== null ? String(a.cantidad).replace(".", ",") : "",
      costo: a.costo !== null ? String(a.costo).replace(".", ",") : "",
      moneda: a.moneda || "ARS",
      nota: a.nota || "",
    });
  };

  const borrar = async (a: Ajuste) => {
    if (!window.confirm(`¿Borrar el ajuste #${a.id} (${a.ticker})? Queda auditado.`)) return;
    await escribir("DELETE", `/api/portfolio/pnl-ajustes/${a.id}`);
  };

  const toggleActivo = async (a: Ajuste) => {
    await escribir("PUT", `/api/portfolio/pnl-ajustes/${a.id}`, { activo: !a.activo });
  };

  const usarCandidato = (c: CandidatoTicker) => {
    setEditandoId(null);
    setForm({
      ...FORM_VACIO,
      tipo: "split",
      ticker: c.ticker,
      factor: c.factor_sugerido !== null
        ? String(c.factor_sugerido).replace(".", ",")
        : String(c.ratio_mediana).replace(".", ","),
      nota: `Split detectado (ratio ${fmt(c.ratio_mediana, 4)} en ${c.n_cuentas} cuentas)`,
    });
    setVerCandidatos(false);
  };

  const esSplit = form.tipo === "split";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-[#094293] text-white px-3 py-2 shrink-0">
          <span className="text-[11px] uppercase tracking-widest font-semibold">
            Ajustes de PnL — eventos corporativos
          </span>
          <button onClick={onCerrar} className="text-white/80 hover:text-white text-[13px] px-1">
            ✕
          </button>
        </div>

        {/* Ayuda */}
        <div className="px-3 py-1.5 text-[10px] text-[var(--t-text-dim)] bg-[var(--t-surface)] border-b border-[var(--t-border)] shrink-0">
          Para eventos que NO generan boleto y rompen el cost-basis: <b>SPLIT</b> multiplica la
          cantidad sin tocar el costo (10 = split 10:1 · 0,1 = reverse 1:10); <b>CANTIDAD</b> suma/resta
          nominales (positivo con costo opcional; negativo libera costo proporcional, sin realizado).
          CUENTA vacía = aplica a <b>todas</b> las cuentas con boletos del ticker. El ajuste rige desde
          su FECHA (antes de los boletos de ese día). PNL TÍTULOS impacta al instante; TOTALES en la
          próxima corrida del cache (~30&apos; en rueda).
        </div>

        {err && (
          <div className="px-3 py-1 text-[10px] text-[var(--t-neg)] border-b border-[var(--t-border)] shrink-0">
            {err}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {/* Alta / edición */}
          {puedeEscribir && (
            <div className="px-3 py-2 border-b border-[var(--t-border)]">
              <div className="text-[9px] tracking-widest text-[var(--t-text-muted)] mb-1">
                {editandoId !== null ? `EDITANDO AJUSTE #${editandoId}` : "NUEVO AJUSTE"}
              </div>
              <div className="grid grid-cols-8 gap-2 items-end">
                <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                  TIPO
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm({ ...form, tipo: e.target.value as FormState["tipo"] })}
                    className={INPUT_CLS}
                  >
                    <option value="split">SPLIT</option>
                    <option value="cantidad">CANTIDAD</option>
                  </select>
                </label>
                <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                  TICKER
                  <input
                    value={form.ticker}
                    onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                    placeholder="YPFD"
                    className={INPUT_CLS}
                  />
                </label>
                <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                  FECHA
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className={INPUT_CLS}
                  />
                </label>
                <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                  CUENTA (opc.)
                  <input
                    value={form.id_cuenta}
                    onChange={(e) => setForm({ ...form, id_cuenta: e.target.value })}
                    placeholder="todas"
                    className={INPUT_CLS}
                  />
                </label>
                {esSplit ? (
                  <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                    FACTOR
                    <NumeroInput
                      value={form.factor}
                      onChange={(raw) => setForm({ ...form, factor: raw })}
                      placeholder="10"
                      className={INPUT_CLS}
                    />
                  </label>
                ) : (
                  <>
                    <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                      CANTIDAD ±
                      <NumeroInput
                        value={form.cantidad}
                        onChange={(raw) => setForm({ ...form, cantidad: raw })}
                        placeholder="-100"
                        className={INPUT_CLS}
                      />
                    </label>
                    <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                      COSTO (opc.)
                      <NumeroInput
                        value={form.costo}
                        onChange={(raw) => setForm({ ...form, costo: raw })}
                        className={INPUT_CLS}
                      />
                    </label>
                    <label className="col-span-1 text-[9px] text-[var(--t-text-muted)]">
                      MONEDA
                      <select
                        value={form.moneda}
                        onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                        className={INPUT_CLS}
                      >
                        <option>ARS</option>
                        <option>USD</option>
                        <option>USDC</option>
                      </select>
                    </label>
                  </>
                )}
                <label
                  className={`${esSplit ? "col-span-3" : "col-span-1"} text-[9px] text-[var(--t-text-muted)]`}
                >
                  NOTA
                  <input
                    value={form.nota}
                    onChange={(e) => setForm({ ...form, nota: e.target.value })}
                    placeholder="Split 10:1 CEDEAR YPF"
                    className={INPUT_CLS}
                  />
                </label>
                <div className="col-span-1 flex gap-1">
                  <button
                    onClick={guardar}
                    disabled={
                      busy || !form.ticker.trim() || !form.fecha ||
                      (esSplit ? num(form.factor) === null : num(form.cantidad) === null)
                    }
                    className="flex-1 px-2 py-1 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40"
                  >
                    {busy ? "…" : editandoId !== null ? "GUARDAR" : "REGISTRAR"}
                  </button>
                  {editandoId !== null && (
                    <button
                      onClick={() => {
                        setEditandoId(null);
                        setForm(FORM_VACIO);
                      }}
                      className="px-2 py-1 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Desfases detectados */}
          <div className="px-3 py-2 border-b border-[var(--t-border)]">
            <button
              onClick={() => setVerCandidatos((v) => !v)}
              className="text-[9px] tracking-widest text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
            >
              {verCandidatos ? "▾" : "▸"} DESFASES DETECTADOS ({candidatos.length} tickers ·{" "}
              {nCandidatos} posiciones con boletos que no reconcilian con la tenencia)
            </button>
            {verCandidatos && (
              <table className="w-full text-[10px] font-mono mt-1">
                <thead>
                  <tr className="text-[9px] text-[var(--t-text-muted)] text-left">
                    <th className="px-2 py-0.5">TICKER</th>
                    <th className="px-2 py-0.5 text-right"># CUENTAS</th>
                    <th className="px-2 py-0.5 text-right">RATIO AUM/CALC</th>
                    <th className="px-2 py-0.5">CONSISTENTE</th>
                    <th className="px-2 py-0.5 text-right">FACTOR SUGERIDO</th>
                    <th className="px-2 py-0.5" />
                  </tr>
                </thead>
                <tbody>
                  {candidatos.map((c) => (
                    <tr key={c.ticker} className="border-t border-[var(--t-border)]">
                      <td className="px-2 py-0.5">{c.ticker}</td>
                      <td className="px-2 py-0.5 text-right">{c.n_cuentas}</td>
                      <td className="px-2 py-0.5 text-right">{fmt(c.ratio_mediana, 4)}</td>
                      <td className="px-2 py-0.5">
                        {c.consistente ? (
                          <span className="text-[var(--t-pos)]">SÍ</span>
                        ) : (
                          <span className="text-[var(--t-text-muted)]">no</span>
                        )}
                      </td>
                      <td className="px-2 py-0.5 text-right">
                        {c.factor_sugerido !== null ? `×${fmt(c.factor_sugerido, 4)}` : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-right">
                        {puedeEscribir && (
                          <button
                            onClick={() => usarCandidato(c)}
                            className="px-1.5 text-[9px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                            title="Precarga el formulario con este ticker y factor — revisá la FECHA real del evento antes de registrar"
                          >
                            USAR
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!candidatos.length && (
                    <tr>
                      <td colSpan={6} className="px-2 py-1 text-[var(--t-text-muted)]">
                        Sin desfases consistentes en el cache de TOTALES.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            <div className="text-[9px] text-[var(--t-text-muted)] mt-0.5">
              El factor sugerido sale del ratio entre tenencia y boletos — la FECHA del evento la
              ponés vos (la fecha real del split).
            </div>
          </div>

          {/* Tabla de ajustes */}
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-[9px] text-[var(--t-text-muted)] text-left">
                <th className="px-2 py-1">ON</th>
                <th className="px-2 py-1">FECHA</th>
                <th className="px-2 py-1">TIPO</th>
                <th className="px-2 py-1">TICKER</th>
                <th className="px-2 py-1">ALCANCE</th>
                <th className="px-2 py-1 text-right">FACTOR</th>
                <th className="px-2 py-1 text-right">CANTIDAD</th>
                <th className="px-2 py-1 text-right">COSTO</th>
                <th className="px-2 py-1">NOTA</th>
                <th className="px-2 py-1">POR</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {ajustes.map((a) => (
                <tr
                  key={a.id}
                  className={`border-t border-[var(--t-border)] ${a.activo ? "" : "opacity-40"}`}
                >
                  <td className="px-2 py-0.5">
                    <button
                      onClick={() => puedeEscribir && toggleActivo(a)}
                      disabled={!puedeEscribir || busy}
                      title={a.activo ? "Activo — click para apagar sin borrar" : "Apagado — no impacta el PnL"}
                      className={a.activo ? "text-[var(--t-pos)]" : "text-[var(--t-text-muted)]"}
                    >
                      {a.activo ? "●" : "○"}
                    </button>
                  </td>
                  <td className="px-2 py-0.5">{a.fecha}</td>
                  <td className="px-2 py-0.5">{a.tipo.toUpperCase()}</td>
                  <td className="px-2 py-0.5">
                    {a.ticker}
                    {!a.ticker_conocido && (
                      <span
                        className="text-[var(--t-accent)] ml-1"
                        title="Ticker no encontrado en el catálogo de assets — puede ser un typo (el ajuste no pegaría en nada)"
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-0.5">{a.id_cuenta || "TODAS"}</td>
                  <td className="px-2 py-0.5 text-right">
                    {a.factor !== null ? `×${fmt(a.factor, 4)}` : "—"}
                  </td>
                  <td className="px-2 py-0.5 text-right">{fmt(a.cantidad, 4)}</td>
                  <td className="px-2 py-0.5 text-right">
                    {a.costo !== null ? `${fmt(a.costo)} ${a.moneda}` : "—"}
                  </td>
                  <td className="px-2 py-0.5 text-[var(--t-text-dim)] max-w-[180px] truncate" title={a.nota || ""}>
                    {a.nota || ""}
                  </td>
                  <td
                    className="px-2 py-0.5 text-[var(--t-text-muted)]"
                    title={`creado ${a.creado_at || "?"}${a.actualizado_por ? ` · editado por ${a.actualizado_por} ${a.actualizado_at || ""}` : ""}`}
                  >
                    {(a.creado_por || "").split("@")[0]}
                  </td>
                  <td className="px-2 py-0.5 text-right whitespace-nowrap">
                    {puedeEscribir && (
                      <>
                        <button
                          onClick={() => editar(a)}
                          disabled={busy}
                          className="px-1 text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => borrar(a)}
                          disabled={busy}
                          className="px-1 text-[var(--t-text-dim)] hover:text-[var(--t-neg)]"
                          title="Borrar (queda auditado)"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!ajustes.length && (
                <tr>
                  <td colSpan={11} className="px-2 py-2 text-[var(--t-text-muted)]">
                    Sin ajustes cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
