"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Modal REGISTROS MANUALES (tab BANCOS). Partido 50/50:
 *
 *   IZQUIERDA — la carga: TIPO · IMPORTE · BANCO · EGRESO/INGRESO, más el USUARIO
 *               y la HORA de quien la registró (los pone el backend, no se tipean).
 *   DERECHA   — el resumen por TIPO de lo cargado. La fila SALDOS es MANUAL: no
 *               sale de los registros, se escribe a mano y se persiste aparte.
 *
 * Es una FUENTE NUEVA de movimientos: no viene de la API. Cada registro impacta el
 * saldo del banco elegido según su sentido (egreso por default) sumándose a las
 * filas Ingresos / Egresos de la grilla — y en el detalle de esa celda aparece
 * marcado como "registro manual", para que se distinga de lo que trae la API.
 *
 * Persiste por día, así que sobrevive a recargar y al cambio de turno.
 */

type Fila = {
  id: number; tipo: string; banco: string; unidad: string;
  importe: number; sentido: string; usuario: string | null; hora: string;
};
type Banco = { banco: string; unidad: string };
type ResumenFila = { tipo: string; importe: number; manual: boolean };
type Resp = {
  fecha: string; fecha_iso: string; unidad: string;
  filas: Fila[]; resumen: ResumenFila[]; total: number;
  saldo_manual: number; saldo_por: string | null;
  tipos: string[]; sentidos: string[]; bancos: Banco[]; puede_editar?: boolean;
};

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aNumero = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", "."));

const INPUT = "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 " +
  "text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]";
const TH = "px-2 py-1.5 text-left font-normal";
const TD = "px-2 py-1";

export function TesoreriaRegistros({ fecha, onCerrar, onCambio }: {
  fecha: string; onCerrar: () => void; onCambio: () => void;
}) {
  const [unidad, setUnidad] = useState("ARS");
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nueva, setNueva] = useState({ tipo: "", importe: "", banco: "", sentido: "egreso" });
  const [saldoTxt, setSaldoTxt] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/back-office/tesoreria/registros?fecha=${fecha}&unidad=${unidad}`,
        { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`)); return; }
      setErr(null);
      setD(b as Resp);
      setSaldoTxt(String((b as Resp).saldo_manual ?? 0));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [fecha, unidad]);

  useEffect(() => { cargar(); }, [cargar]);

  // Toda escritura refresca el modal Y avisa a la grilla: los registros impactan
  // el saldo del banco, así que BANCOS tiene que recalcularse.
  const escribir = async (metodo: string, url: string, body?: unknown) => {
    setBusy(true); setErr(null);
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
    } finally { setBusy(false); }
  };

  const editable = !!d?.puede_editar;
  const bancos = (d?.bancos ?? []).filter((b) => b.unidad === unidad);
  const filas = (d?.filas ?? []).filter((f) => f.unidad === unidad);

  const agregar = async () => {
    const imp = aNumero(nueva.importe);
    if (!nueva.tipo) { setErr("elegí el tipo"); return; }
    if (!nueva.banco) { setErr("elegí el banco"); return; }
    if (!Number.isFinite(imp) || imp <= 0) { setErr("importe inválido"); return; }
    const ok = await escribir("POST", "/api/back-office/tesoreria/registros", {
      fecha, tipo: nueva.tipo, banco: nueva.banco, unidad,
      importe: imp, sentido: nueva.sentido,
    });
    if (ok) setNueva({ tipo: "", importe: "", banco: "", sentido: "egreso" });
  };

  const guardarSaldo = async () => {
    const imp = aNumero(saldoTxt || "0");
    if (!Number.isFinite(imp)) { setErr("saldo inválido"); return; }
    await escribir("PUT", "/api/back-office/tesoreria/registros-saldo",
      { fecha, unidad, importe: imp });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div className="w-full max-w-[1100px] max-h-[85vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold">
            Registros manuales · {d?.fecha ?? ""}
          </span>
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)}
            className="bg-transparent border border-white/40 px-1 text-[10px] outline-none [color-scheme:dark]">
            {["ARS", "USD"].map((u) => <option key={u} value={u} className="text-black">{u}</option>)}
          </select>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70">✕</button>
        </div>
        <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
          Fuente propia de movimientos: no viene de la API. Cada registro impacta el saldo
          del banco elegido según su sentido, y en el detalle de esa celda aparece marcado
          como <b>registro manual</b>.
        </div>
        {err && <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)] shrink-0">{err}</div>}

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 overflow-auto">
          {/* ── IZQUIERDA: la carga ─────────────────────────────────────── */}
          <div className="min-w-0 flex flex-col border border-[var(--t-border)]">
            <div className="px-2 py-1 bg-[var(--t-surface)] border-b border-[var(--t-border)] text-[10px] uppercase tracking-widest font-semibold text-center shrink-0">
              Movimientos · {filas.length}
            </div>
            {editable && (
              <div className="p-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex flex-wrap items-end gap-2 text-[10px] min-w-0">
                <select value={nueva.tipo} onChange={(e) => setNueva((p) => ({ ...p, tipo: e.target.value }))}
                  className={INPUT + " w-[130px] max-w-full"}>
                  <option value="">— tipo —</option>
                  {(d?.tipos ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={nueva.importe} placeholder="importe"
                  onChange={(e) => setNueva((p) => ({ ...p, importe: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
                  className={INPUT + " w-[110px] max-w-full text-right"} />
                <select value={nueva.banco} onChange={(e) => setNueva((p) => ({ ...p, banco: e.target.value }))}
                  className={INPUT + " w-[180px] max-w-full"}>
                  <option value="">— banco —</option>
                  {bancos.map((b) => <option key={b.banco} value={b.banco}>{b.banco}</option>)}
                </select>
                <select value={nueva.sentido} onChange={(e) => setNueva((p) => ({ ...p, sentido: e.target.value }))}
                  className={INPUT}>
                  {(d?.sentidos ?? ["egreso", "ingreso"]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button onClick={agregar} disabled={busy}
                  className="px-2 py-1 uppercase tracking-widest border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
                  + agregar
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full table-fixed text-[11px]">
                <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className={TH + " w-[22%]"}>Tipo</th>
                    <th className={TH + " w-[20%] text-right"}>Importe</th>
                    <th className={TH + " w-[24%]"}>Banco</th>
                    <th className={TH + " w-[14%]"}>Sentido</th>
                    <th className={TH + " w-[20%]"}>Usuario · hora</th>
                    {editable && <th className={TH + " w-[8%]"} />}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                      <td className={TD + " break-words"}>{f.tipo}</td>
                      <td className={TD + " text-right tabular-nums"}>{fmt(f.importe)}</td>
                      <td className={TD + " break-words"}>{f.banco}</td>
                      <td className={TD + (f.sentido === "egreso"
                        ? " text-[var(--t-neg)]" : " text-[var(--t-pos)]")}>{f.sentido}</td>
                      <td className={TD + " text-[9px] text-[var(--t-text-dim)] break-words"}>
                        {(f.usuario ?? "—").split("@")[0]} · {f.hora || "—"}
                      </td>
                      {editable && (
                        <td className={TD + " text-right"}>
                          <button disabled={busy}
                            onClick={() => escribir("DELETE",
                              `/api/back-office/tesoreria/registros/${f.id}`)}
                            className="text-[9px] text-[var(--t-neg)] hover:underline disabled:opacity-40">
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!filas.length && (
                    <tr><td colSpan={editable ? 6 : 5} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                      sin registros ese día
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── DERECHA: el resumen por tipo ────────────────────────────── */}
          <div className="min-w-0 flex flex-col border border-[var(--t-border)] self-start w-full">
            <div className="px-2 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold text-center shrink-0">
              Rescate ACA Valores
            </div>
            <table className="w-full table-fixed text-[11px]">
              <tbody>
                {(d?.resumen ?? []).map((r) => (
                  <tr key={r.tipo} className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 font-semibold text-[var(--t-text)] w-[55%]">
                      {r.tipo}
                      {r.manual && (
                        <span className="ml-1 text-[8px] font-normal text-[var(--t-text-muted)]"
                          title="Carga manual: no sale de los registros">manual</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.manual && editable ? (
                        <span className="flex items-center gap-1 justify-end">
                          <input value={saldoTxt} onChange={(e) => setSaldoTxt(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") guardarSaldo(); }}
                            className={INPUT + " w-[110px] text-right"} />
                          <button onClick={guardarSaldo} disabled={busy}
                            className="text-[9px] text-[var(--t-accent)] hover:underline disabled:opacity-40">ok</button>
                        </span>
                      ) : (r.importe ? fmt(r.importe) : "-")}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--t-surface)] font-bold">
                  <td className="px-2 py-1.5">TOTAL</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(d?.total ?? 0)}</td>
                </tr>
              </tbody>
            </table>
            {d?.saldo_por && (
              <div className="px-2 py-1 text-[9px] text-[var(--t-text-muted)]">
                SALDOS cargado por {d.saldo_por.split("@")[0]}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
