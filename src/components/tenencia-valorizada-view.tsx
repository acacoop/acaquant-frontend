"use client";

import { useEffect, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Back Office → Tenencia Valorizada. Cuentas propias 100/255/256.
 * Filtro CARTERA arriba (USD = HD hard-dollar / ARS = todo lo no-HD): adapta toda la vista.
 * Izquierda (50%): 1 fila por día (fecha snapshot) × AuM de cada cuenta + total, con el
 * TC (MEP) usado ese día. Derecha (50%): posiciones por título del día seleccionado.
 * Switch ARS/USD = moneda de DISPLAY (USD = ARS ÷ TC congelado del día). Números completos
 * (sin abreviar). Lee SQL portafolio.tenencia vía /api/back-office/tenencia-hd?cartera=.
 */

const CUENTAS = ["100", "255", "256"] as const;
type Cuenta = (typeof CUENTAS)[number];

type DiaRow = { fecha: string; tc: number | null; total: number } & Record<Cuenta, number>;
type PosRow = {
  unidad: string; total: number;
  precio?: number | null; cant?: Record<Cuenta, number>; total_cant?: number;
} & Record<Cuenta, number>;
type DiasResp = { cuentas: string[]; cartera?: string; dias: DiaRow[]; ultima_fecha: string | null };
type PosResp = { fecha: string; cartera?: string; tc: number | null; total: number; posiciones: PosRow[] };

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";
const fmtFecha = (s: string) => { const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y.slice(2)}` : s; };
// Número completo, sin abreviar (separador de miles es-AR), 0 decimales.
const fmtFull = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("es-AR"));
const fmtTC = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// Cantidad nominal: hasta 2 decimales, sin abreviar.
const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: 2 }));

async function getJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; }
}

export function TenenciaValorizadaView() {
  const [dias, setDias] = useState<DiaRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [pos, setPos] = useState<PosResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartera, setCartera] = usePersistedState<"HD" | "ARS">("tenencia.cartera", "HD");
  // La moneda la define la CARTERA: USD (HD) se muestra en USD (ARS ÷ TC); ARS en ARS.
  const carteraNom = cartera === "HD" ? "USD" : "ARS";
  const usd = cartera === "HD";
  const [vista, setVista] = usePersistedState<"dinero" | "nominal">("tenencia.vista", "dinero");
  const nominal = vista === "nominal";
  const [edUnidad, setEdUnidad] = useState("");
  const [edPrecio, setEdPrecio] = useState("");
  const [saving, setSaving] = useState(false);
  const [edMsg, setEdMsg] = useState<string | null>(null);
  const [div100, setDiv100] = useState(true);   // ÷100 (paridad HD) on/off para el cálculo

  // Convierte un valor ARS a la moneda elegida usando el TC (MEP) de ESE día.
  const cv = (ars: number | null | undefined, tc: number | null): number | null => {
    if (ars == null) return null;
    if (!usd) return ars;
    return tc ? ars / tc : null;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const d = await getJson<DiasResp>(`/api/back-office/tenencia-hd?cartera=${cartera}`);
      if (!alive) return;
      setDias(d?.dias ?? []);
      setSel(d?.ultima_fecha ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [cartera]);

  useEffect(() => {
    if (!sel) { setPos(null); return; }
    let alive = true;
    void (async () => {
      const d = await getJson<PosResp>(`/api/back-office/tenencia-hd/posiciones?fecha=${sel}&cartera=${cartera}`);
      if (alive) setPos(d);
    })();
    return () => { alive = false; };
  }, [sel, cartera]);

  // Pre-cargar el precio actual al elegir una unidad en el editor.
  useEffect(() => {
    const p = pos?.posiciones.find((x) => x.unidad === edUnidad);
    setEdPrecio(p?.precio != null ? String(p.precio) : "");
    setEdMsg(null);
  }, [edUnidad, pos]);

  const guardarPrecio = async () => {
    if (!sel || !edUnidad || edPrecio.trim() === "") return;
    const precio = Number(edPrecio.replace(",", "."));
    if (!isFinite(precio)) { setEdMsg("precio inválido"); return; }
    setSaving(true); setEdMsg(null);
    try {
      const r = await fetch("/api/back-office/tenencia-hd/precio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: sel, unidad: edUnidad, precio, dividir_100: div100, cartera }),
      });
      const txt = await r.text();
      let j: { ok?: boolean; error?: string } | null = null;
      try { j = txt ? JSON.parse(txt) : null; } catch { /* respuesta no-JSON (405/HTML) */ }
      if (r.ok && j?.ok) {
        setEdMsg(`✓ ${edUnidad} actualizado`);
        setPos(await getJson<PosResp>(`/api/back-office/tenencia-hd/posiciones?fecha=${sel}&cartera=${cartera}`));
        setDias((await getJson<DiasResp>(`/api/back-office/tenencia-hd?cartera=${cartera}`))?.dias ?? []);
      } else {
        setEdMsg(j?.error ?? `HTTP ${r.status}${txt ? ": " + txt.slice(0, 100) : ""}`);
      }
    } catch (e) { setEdMsg("error de red: " + (e instanceof Error ? e.message : String(e))); }
    finally { setSaving(false); }
  };

  // Preview en vivo del editor: posición elegida + valuación nueva = cantidad × precio / 100 (HD).
  const selPos = pos?.posiciones.find((x) => x.unidad === edUnidad) ?? null;
  const precioNum = Number(edPrecio.replace(",", "."));
  const valNuevaBase =
    selPos && selPos.total_cant != null && edPrecio.trim() !== "" && isFinite(precioNum)
      ? (selPos.total_cant * precioNum) / (div100 ? 100 : 1)
      : null;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      {/* TOP — filtro de CARTERA: adapta toda la vista (USD = HD / ARS = todo lo no-HD) */}
      <div className="shrink-0 flex items-center gap-3 border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Cartera</span>
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {([["HD", "CARTERA USD"], ["ARS", "CARTERA ARS"]] as const).map(([c, lbl]) => (
            <button key={c} onClick={() => setCartera(c)}
              className={"px-3 py-1 text-[10px] font-semibold " + (cartera === c ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-surface)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{lbl}</button>
          ))}
        </div>
        <span className="text-[9px] text-[var(--t-text-muted)]">
          {cartera === "HD" ? "Hard-dollar (HD)" : "Pesos — todo lo que no es HD"} · cuentas 100 / 255 / 256
        </span>
      </div>

      {/* GRID — izquierda serie diaria (~10% más angosta) · derecha posiciones + editor */}
      <div className="flex-1 min-h-0 grid grid-cols-[0.9fr_1.1fr] gap-3 overflow-hidden">
      {/* IZQUIERDA — serie diaria por cuenta */}
      <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className={HDR}>
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Tenencia Cartera {carteraNom} por día</span>
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">{dias.length} días · 100 / 255 / 256 · en {carteraNom}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
            : dias.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos. ¿Corrió el backfill / el job diario?</p>
            : (
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
                        {CUENTAS.map((c) => <td key={c} className="!px-2 text-right tabular-nums">{fmtFull(cv(r[c], r.tc))}</td>)}
                        <td className="!px-2 text-right tabular-nums font-semibold">{fmtFull(cv(r.total, r.tc))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* DERECHA — arriba posiciones (DINERO/NOMINAL), abajo editor de precio */}
      <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
        {/* ARRIBA — posiciones del día */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className={HDR}>
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Posiciones {carteraNom} · {sel ? fmtFecha(sel) : "—"} · {nominal ? "NOMINAL" : carteraNom}</span>
            <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {([["dinero", "DINERO"], ["nominal", "NOMINAL"]] as const).map(([v, lbl]) => (
                <button key={v} onClick={() => setVista(v)}
                  className={"px-2 py-0.5 text-[10px] font-semibold " + (vista === v ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-surface)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{lbl}</button>
              ))}
            </div>
            {pos && (
              <span className="w-full text-[9px] font-mono text-[var(--t-text-muted)]">
                {nominal
                  ? <>Total nominal <span className="font-semibold text-[var(--t-accent)]">{fmtNum(pos.posiciones.reduce((a, p) => a + (p.total_cant ?? 0), 0))}</span></>
                  : <>TC {fmtTC(pos.tc)} · Total <span className="font-semibold text-[var(--t-accent)]">{fmtFull(cv(pos.total, pos.tc))}</span></>}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {!sel ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Elegí un día a la izquierda.</p>
              : !pos ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
              : !nominal && usd && !pos.tc ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin TC para ese día — no se puede dolarizar.</p>
              : pos.posiciones.length === 0 ? <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin posiciones {carteraNom} ese día.</p>
              : (
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                    <th className="text-left !px-2">Título</th>
                    <th className="text-right !px-2">PX</th>
                    {CUENTAS.map((c) => <th key={c} className="text-right !px-2">{c}</th>)}
                    <th className="text-right !px-2">Total</th>
                  </tr></thead>
                  <tbody>
                    {pos.posiciones.map((p, i) => (
                      <tr key={`${p.unidad}-${i}`} className="hover:bg-[var(--t-border)]">
                        <td className="!px-2">{p.unidad}</td>
                        <td className="!px-2 text-right tabular-nums text-[var(--t-text-muted)]">{fmtNum(p.precio)}</td>
                        {CUENTAS.map((c) => (
                          <td key={c} className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">
                            {nominal ? fmtNum(p.cant?.[c]) : (p[c] ? fmtFull(cv(p[c], pos.tc)) : "—")}
                          </td>
                        ))}
                        <td className="!px-2 text-right tabular-nums font-semibold">
                          {nominal ? fmtNum(p.total_cant) : fmtFull(cv(p.total, pos.tc))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>

        {/* ABAJO — editor manual de precio (recalcula la valuación HD) */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className={HDR}>
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Editar precio</span>
            <span className="text-[9px] text-[var(--t-text-muted)]">valuación = cantidad × precio{div100 ? " ÷ 100 (paridad)" : " (pleno)"}</span>
          </div>
          <div className="p-3 flex flex-col gap-2 text-[11px] overflow-auto">
            <label className="flex items-center gap-2">
              <span className="w-14 text-[var(--t-text-muted)]">Día</span>
              <select value={sel ?? ""} onChange={(e) => setSel(e.target.value)}
                className="flex-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[var(--t-text)] [color-scheme:dark]">
                {dias.map((d) => <option key={d.fecha} value={d.fecha}>{fmtFecha(d.fecha)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-14 text-[var(--t-text-muted)]">Unidad</span>
              <select value={edUnidad} onChange={(e) => setEdUnidad(e.target.value)}
                className="flex-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[var(--t-text)] [color-scheme:dark]">
                <option value="">— elegí —</option>
                {(pos?.posiciones ?? []).map((p) => <option key={p.unidad} value={p.unidad}>{p.unidad}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-14 text-[var(--t-text-muted)]">Precio</span>
              <input value={edPrecio} onChange={(e) => setEdPrecio(e.target.value)} inputMode="decimal" placeholder="precio nuevo"
                className="flex-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 font-mono text-[var(--t-text)]" />
            </label>
            {selPos && (
              <div className="rounded border border-[var(--t-border-2)] bg-[var(--t-surface)]/40 p-2 flex flex-col gap-1 text-[10px]">
                <label className="flex items-center justify-between cursor-pointer pb-1 mb-0.5 border-b border-[var(--t-border-2)]">
                  <span className="text-[var(--t-text-muted)]">Dividir ÷100 (paridad)</span>
                  <input type="checkbox" checked={div100} onChange={(e) => setDiv100(e.target.checked)} />
                </label>
                <div className="flex justify-between">
                  <span className="text-[var(--t-text-muted)]">Cantidad (nominal)</span>
                  <span className="font-mono tabular-nums">{fmtNum(selPos.total_cant)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--t-text-muted)]">Precio actual</span>
                  <span className="font-mono tabular-nums">{selPos.precio != null ? fmtNum(selPos.precio) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--t-text-muted)]">Valuación actual</span>
                  <span className="font-mono tabular-nums">{fmtFull(cv(selPos.total, pos?.tc ?? null))} {carteraNom}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--t-border-2)] pt-1">
                  <span className="text-[var(--t-accent)] font-semibold">Valuación nueva</span>
                  <span className="font-mono tabular-nums font-semibold text-[var(--t-accent)]">
                    {valNuevaBase != null ? `${fmtFull(cv(valNuevaBase, pos?.tc ?? null))} ${carteraNom}` : "—"}
                  </span>
                </div>
                <div className="text-[9px] text-[var(--t-text-muted)] text-right">
                  cantidad × precio{div100 ? " ÷ 100" : ""}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={guardarPrecio} disabled={saving || !sel || !edUnidad || edPrecio.trim() === ""}
                className="px-3 py-1 text-[11px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40">
                {saving ? "Guardando…" : "Guardar"}
              </button>
              {edMsg && <span className={"text-[10px] " + (edMsg.startsWith("✓") ? "text-[var(--t-pos)]" : "text-red-400")}>{edMsg}</span>}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
