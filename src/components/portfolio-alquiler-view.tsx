"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Back Office → Títulos en Alquiler → tab PORTFOLIO ALQUILER.
 * Igual layout que Tenencia Valorizada (izquierda: serie diaria por fecha;
 * derecha: posiciones del día con PX / 100 / 255 / 256 / Total), pero SOLO con
 * los títulos que el back office ELIGE: la tabla arranca vacía y cada título se
 * agrega con la fila "+" (buscador sobre TODOS los instrumentos, tipeando).
 * La selección es durable y compartida (SQL portafolio.alquiler_portfolio);
 * la valuación sale de portafolio.tenencia EN BRUTO (sin netear marcas).
 */

const CUENTAS = ["100", "255", "256"] as const;
type Cuenta = (typeof CUENTAS)[number];

type DiaRow = { fecha: string; tc: number | null; total: number } & Record<Cuenta, number>;
type DiasResp = {
  cuentas: string[]; unidades: string[]; dias: DiaRow[]; ultima_fecha: string | null;
};
type PosRow = {
  unidad: string; precio: number | null; total: number; total_cant: number;
  cant: Record<Cuenta, number>;
} & Record<Cuenta, number>;
type PosResp = { fecha: string; tc: number | null; total: number; posiciones: PosRow[] };

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";
const fmtFecha = (s: string) => { const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y.slice(2)}` : s; };
const fmtFull = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("es-AR"));
const fmtTC = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: 2 }));

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function PortfolioAlquilerView() {
  const [dias, setDias] = useState<DiaRow[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [pos, setPos] = useState<PosResp | null>(null);
  const [loading, setLoading] = useState(true);
  // Catálogo completo para el buscador del "+" (se pide una sola vez).
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reloadDias = useCallback(async (keepSel?: string | null) => {
    const d = await getJson<DiasResp>("/api/back-office/tenencia-hd/portfolio-alquiler");
    setDias(d?.dias ?? []);
    setUnidades(d?.unidades ?? []);
    // mantiene el día elegido si sigue existiendo; si no, va al último
    const fechas = new Set((d?.dias ?? []).map((r) => r.fecha));
    setSel(keepSel && fechas.has(keepSel) ? keepSel : d?.ultima_fecha ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void reloadDias(); }, [reloadDias]);

  useEffect(() => {
    void (async () => {
      const c = await getJson<{ unidades: string[] }>(
        "/api/back-office/tenencia-hd/portfolio-alquiler/instrumentos",
      );
      setCatalogo(c?.unidades ?? []);
    })();
  }, []);

  const reloadPos = useCallback(async (fecha: string | null) => {
    if (!fecha) { setPos(null); return; }
    setPos(await getJson<PosResp>(
      `/api/back-office/tenencia-hd/portfolio-alquiler/posiciones?fecha=${fecha}`,
    ));
  }, []);

  useEffect(() => { void reloadPos(sel); }, [sel, reloadPos]);

  const setTitulo = async (unidad: string, enPortfolio: boolean) => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/back-office/tenencia-hd/portfolio-alquiler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unidad, en_portfolio: enPortfolio }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (r.ok && j?.ok) {
        setNuevo("");
        setMsg(enPortfolio ? "✓ agregado" : "✓ quitado");
        await reloadDias(sel);
        await reloadPos(sel);
      } else {
        setMsg(j?.error ?? `HTTP ${r.status}`);
      }
    } catch (e) {
      setMsg("error de red: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2000);
    }
  };

  // El "+" exige un instrumento EXACTO del catálogo (tipeando el datalist
  // autocompleta por cualquier parte del texto — código, ticker o descripción).
  const nuevoValido = nuevo.trim() !== "" && catalogo.includes(nuevo.trim())
    && !unidades.includes(nuevo.trim());

  // Filas de posiciones: si el día elegido no devolvió (o no hay días todavía),
  // igual mostramos los títulos elegidos con "—" para poder quitarlos.
  const filasPos: PosRow[] = pos?.posiciones
    ?? unidades.map((u) => ({
      unidad: u, precio: null, total: 0, total_cant: 0,
      cant: { "100": 0, "255": 0, "256": 0 },
      "100": 0, "255": 0, "256": 0,
    }));

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      <div className="flex-1 min-h-0 grid grid-cols-[0.8fr_1.2fr] gap-3 overflow-hidden">
        {/* IZQUIERDA — serie diaria del portfolio elegido */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className={HDR}>
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
              Portfolio Alquiler por día
            </span>
            <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">
              {unidades.length} título(s) · 100 / 255 / 256 · en ARS
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {loading ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            ) : unidades.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">
                Todavía no hay títulos en el portfolio — agregalos con el ＋ de la derecha.
              </p>
            ) : dias.length === 0 ? (
              <p className="p-3 text-[11px] text-[var(--t-text-dim)]">
                Los títulos elegidos no tienen tenencia registrada en las cuentas propias.
              </p>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                  <th className="text-left !px-2">Fecha</th>
                  <th className="text-right !px-2">TC</th>
                  {CUENTAS.map((c) => <th key={c} className="text-right !px-2">{c}</th>)}
                  <th className="text-right !px-2">Total</th>
                </tr></thead>
                <tbody>
                  {[...dias].reverse().map((r) => {
                    const on = r.fecha === sel;
                    return (
                      <tr key={r.fecha} onClick={() => setSel(r.fecha)}
                          className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}>
                        <td className="!px-2 tabular-nums text-[var(--t-text-dim)]">{fmtFecha(r.fecha)}</td>
                        <td className="!px-2 text-right tabular-nums text-[var(--t-text-muted)]">{fmtTC(r.tc)}</td>
                        {CUENTAS.map((c) => (
                          <td key={c} className="!px-2 text-right tabular-nums">{r[c] ? fmtFull(r[c]) : "—"}</td>
                        ))}
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtFull(r.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* DERECHA — posiciones del día elegido, SOLO títulos elegidos + fila "+" */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className={HDR}>
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
              Títulos del portfolio · {sel ? fmtFecha(sel) : "—"}
            </span>
            {pos && (
              <span className="ml-auto text-[9px] font-mono text-[var(--t-text-muted)]">
                TC {fmtTC(pos.tc)} · Total{" "}
                <span className="font-semibold text-[var(--t-accent)]">{fmtFull(pos.total)}</span> ARS
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">Título</th>
                <th className="text-right !px-2">PX</th>
                {CUENTAS.map((c) => <th key={c} className="text-right !px-2">{c}</th>)}
                <th className="text-right !px-2">Total</th>
                <th className="!px-1 w-6" />
              </tr></thead>
              <tbody>
                {filasPos.map((p) => (
                  <tr key={p.unidad} className="hover:bg-[var(--t-border)]">
                    <td className="!px-2">{p.unidad}</td>
                    <td className="!px-2 text-right tabular-nums text-[var(--t-text-muted)]">{fmtNum(p.precio)}</td>
                    {CUENTAS.map((c) => (
                      <td key={c} className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">
                        {p[c] ? fmtFull(p[c]) : "—"}
                      </td>
                    ))}
                    <td className="!px-2 text-right tabular-nums font-semibold">
                      {p.total ? fmtFull(p.total) : "—"}
                    </td>
                    <td className="!px-1 text-center">
                      <button
                        onClick={() => setTitulo(p.unidad, false)}
                        disabled={saving}
                        title="Quitar del portfolio"
                        className="text-[var(--t-text-muted)] hover:text-red-400 text-[11px] px-1 disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Fila "+": buscador sobre TODOS los instrumentos (tipeá para filtrar) */}
                <tr className="border-t border-[var(--t-border-2)]">
                  <td className="!px-2" colSpan={5}>
                    <div className="flex items-center gap-2 py-1">
                      <span className="text-[var(--t-accent)] font-bold text-[13px]">＋</span>
                      <input
                        list="pa-instrumentos"
                        value={nuevo}
                        onChange={(e) => setNuevo(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && nuevoValido) void setTitulo(nuevo.trim(), true); }}
                        placeholder="Agregar título… (tipeá código, ticker o nombre)"
                        className="flex-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
                      />
                      <datalist id="pa-instrumentos">
                        {catalogo.map((u) => <option key={u} value={u} />)}
                      </datalist>
                    </div>
                  </td>
                  <td className="!px-1 text-right" colSpan={2}>
                    <button
                      onClick={() => void setTitulo(nuevo.trim(), true)}
                      disabled={saving || !nuevoValido}
                      className="px-2 py-1 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40"
                    >
                      {saving ? "…" : "Agregar"}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="px-3 py-1 text-[9px] text-[var(--t-text-muted)]">
              {msg
                ? <span className={msg.startsWith("✓") ? "text-[var(--t-pos)]" : "text-red-400"}>{msg}</span>
                : "La lista es compartida (queda guardada para todo el back office). Valuación en ARS, en bruto."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
