"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Back Office → Títulos en Alquiler → tab PORTFOLIO ALQUILER.
 * Layout tipo Tenencia Valorizada (izquierda fechas desde 01/06/2026 · derecha
 * títulos con PX / 100 / 255 / 256 / Total) pero acá lo que se ve/edita son los
 * NOMINALES EN ALQUILER: cada celda de cuenta es un input; lo cargado un día
 * RIGE de ese día en adelante hasta la próxima edición (carry-forward). La
 * valuación usa el precio de la tenencia de ese día. Los títulos se agregan con
 * la fila "+" (buscador sobre todos los instrumentos) y se quitan con ✕.
 * Este portfolio es la fuente del filtro SIN ALQUILER de Tenencia Valorizada.
 */

const CUENTAS = ["100", "255", "256"] as const;
type Cuenta = (typeof CUENTAS)[number];

type DiaRow = { fecha: string; tc: number | null; total: number } & Record<Cuenta, number>;
type DiasResp = {
  cuentas: string[]; unidades: string[]; dias: DiaRow[]; ultima_fecha: string | null;
};
type PosRow = {
  unidad: string; precio: number | null; total: number; total_cant: number;
  cant: Record<Cuenta, number>; ten_cant: Record<Cuenta, number>; sin_precio: boolean;
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

  const refresh = useCallback(async () => {
    await reloadDias(sel);
    await reloadPos(sel);
  }, [reloadDias, reloadPos, sel]);

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
        await refresh();
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

  const nuevoValido = nuevo.trim() !== "" && catalogo.includes(nuevo.trim())
    && !unidades.includes(nuevo.trim());

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      <div className="flex-1 min-h-0 grid grid-cols-[0.8fr_1.2fr] gap-3 overflow-hidden">
        {/* IZQUIERDA — serie diaria del portfolio (valuación de lo alquilado) */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className={HDR}>
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
              Portfolio Alquiler por día
            </span>
            <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">
              desde 01/06/26 · {unidades.length} título(s) · en ARS
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
                Sin fechas de tenencia desde el 01/06 — ¿corrió el backfill diario?
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
                        <td className="!px-2 text-right tabular-nums font-semibold">{r.total ? fmtFull(r.total) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* DERECHA — nominales EN ALQUILER del día (editables) + fila "+" */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className={HDR}>
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
              Nominales en alquiler · {sel ? fmtFecha(sel) : "—"}
            </span>
            {pos && (
              <span className="ml-auto text-[9px] font-mono text-[var(--t-text-muted)]">
                TC {fmtTC(pos.tc)} · Valor alquilado{" "}
                <span className="font-semibold text-[var(--t-accent)]">{fmtFull(pos.total)}</span> ARS
              </span>
            )}
          </div>
          <div className="px-3 py-1 text-[9px] text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
            Lo que cargás un día <span className="text-[var(--t-text-dim)]">rige de ese día en adelante</span>{" "}
            hasta la próxima edición (0 = corta el alquiler). Se descuenta en Tenencia Valorizada
            con el filtro SIN ALQUILER.
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[var(--t-panel)]"><tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">Título</th>
                <th className="text-right !px-2">PX</th>
                {CUENTAS.map((c) => <th key={c} className="text-right !px-2">{c}</th>)}
                <th className="text-right !px-2">Valor alq.</th>
                <th className="!px-1 w-6" />
              </tr></thead>
              <tbody>
                {(pos?.posiciones ?? []).map((p) => (
                  <PortfolioRow key={p.unidad} row={p} fecha={sel} tc={pos?.tc ?? null}
                                saving={saving} onQuitar={() => setTitulo(p.unidad, false)}
                                onSaved={refresh} />
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
                : "En cada celda: nominales en alquiler de esa cuenta (abajo, en gris, lo que hay en cartera ese día). Lista compartida."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fila de título: cada cuenta es un input de NOMINALES (debounce → POST /nominal
// con la fecha seleccionada). Muestra abajo la valuación de lo cargado y, como
// referencia, la cantidad en cartera ese día.
function PortfolioRow({
  row, fecha, tc: _tc, saving, onQuitar, onSaved,
}: {
  row: PosRow; fecha: string | null; tc: number | null;
  saving: boolean; onQuitar: () => void; onSaved: () => void;
}) {
  const [vals, setVals] = useState<Record<Cuenta, string>>({
    "100": row.cant["100"] ? String(row.cant["100"]) : "",
    "255": row.cant["255"] ? String(row.cant["255"]) : "",
    "256": row.cant["256"] ? String(row.cant["256"]) : "",
  });
  const [ok, setOk] = useState<null | boolean>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopta lo remoto al cambiar de día/refresh (sin pisar lo que se tipea).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVals({
      "100": row.cant["100"] ? String(row.cant["100"]) : "",
      "255": row.cant["255"] ? String(row.cant["255"]) : "",
      "256": row.cant["256"] ? String(row.cant["256"]) : "",
    });
  }, [row.cant]);

  const guardar = (c: Cuenta, v: string) => {
    setVals((prev) => ({ ...prev, [c]: v }));
    if (!fecha) return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      const cant = v.trim() === "" ? 0 : Number(v.replace(",", "."));
      if (!isFinite(cant) || cant < 0) { setOk(false); return; }
      try {
        const r = await fetch("/api/back-office/tenencia-hd/portfolio-alquiler/nominal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unidad: row.unidad, id_cuenta: c, fecha, cantidad: cant }),
        });
        setOk(r.ok);
        if (r.ok) onSaved();
      } catch {
        setOk(false);
      } finally {
        setTimeout(() => setOk(null), 1500);
      }
    }, 700);
  };

  return (
    <tr className="hover:bg-[var(--t-border)] align-top">
      <td className="!px-2">
        {row.unidad}
        {row.sin_precio && (
          <span className="ml-1 text-[8px] text-amber-400" title="Sin tenencia ese día — no se puede valuar">
            SIN PX
          </span>
        )}
      </td>
      <td className="!px-2 text-right tabular-nums text-[var(--t-text-muted)]">{fmtNum(row.precio)}</td>
      {CUENTAS.map((c) => (
        <td key={c} className="!px-1 text-right">
          <input
            value={vals[c]}
            onChange={(e) => guardar(c, e.target.value)}
            inputMode="decimal"
            placeholder="—"
            title={`En cartera ese día: ${fmtNum(row.ten_cant[c])}`}
            className="w-24 bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-right font-mono text-[10px] tabular-nums outline-none focus:border-[var(--t-accent)]"
          />
          <div className="text-[8px] text-[var(--t-text-muted)] tabular-nums pr-1">
            {row[c] ? `$ ${fmtFull(row[c])}` : ""}
            {row.ten_cant[c] ? ` · cart. ${fmtNum(row.ten_cant[c])}` : ""}
          </div>
        </td>
      ))}
      <td className="!px-2 text-right tabular-nums font-semibold">
        {row.total ? fmtFull(row.total) : "—"}
        {ok === true && <span className="ml-1 text-[var(--t-pos)]">✓</span>}
        {ok === false && <span className="ml-1 text-[var(--t-neg)]">✗</span>}
      </td>
      <td className="!px-1 text-center">
        <button
          onClick={onQuitar}
          disabled={saving}
          title="Quitar del portfolio"
          className="text-[var(--t-text-muted)] hover:text-red-400 text-[11px] px-1 disabled:opacity-40"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
