"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Back Office → Tesorería → tab BANCO A BANCO. Transferencias INTERNAS entre
 * cuentas propias: el equipo mueve saldo de un banco a otro para dejarlos
 * cubiertos.
 *
 * No es plata que entra o sale de la ALyC — la suma de las dos patas es CERO.
 * Cambia cómo queda repartido el saldo entre bancos, no el total del día. Por eso
 * en la grilla BANCOS aparece como DOS filas: (+) en la cuenta que recibe y (−)
 * en la que entrega.
 *
 * Las dos cuentas salen del catálogo (no hay texto libre ni vacío) y tienen que
 * ser de la MISMA moneda: con un solo importe no se puede representar un cambio
 * de divisa. Todo validado también server-side.
 */

const POLL_MS = 20_000;

type Fila = {
  id: number; fecha: string; cta_debito: string; cta_credito: string;
  unidad: string; importe: number; estado: string; creado_por: string | null;
};
type Banco = { banco: string; unidad: string };
type Resp = {
  fecha: string; fecha_iso: string; filas: Fila[]; bancos: Banco[];
  estados: string[]; puede_editar?: boolean;
};

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TH = "px-2 py-1.5 text-center font-normal";
const TD = "px-2 py-1 text-center";
const WRAP = "whitespace-normal break-words leading-tight";
const NUM = "whitespace-nowrap tabular-nums";

export function TesoreriaBancoABanco({ fecha }: { fecha: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [alta, setAlta] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    try {
      const r = await fetch(`/api/back-office/tesoreria/banco-a-banco?fecha=${fecha}`,
        { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 200)}`));
        if (!silencioso) setData(null);
      } else { setErr(null); setData(body as Resp); }
    } catch (e) {
      if (alive.current && !silencioso) setErr(e instanceof Error ? e.message : String(e));
    } finally { if (alive.current) setLoading(false); }
  }, [fecha]);

  useEffect(() => { cargar(false); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const filas = data?.filas ?? [];
  const bancos = data?.bancos ?? [];
  const estados = data?.estados ?? ["pendiente", "completado"];
  const editable = !!data?.puede_editar;
  const recargar = () => cargar(true);

  // Total por moneda: es lo que se mueve, no lo que se gana ni se pierde.
  const totales = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of filas) t[f.unidad] = (t[f.unidad] ?? 0) + f.importe;
    return t;
  }, [filas]);

  const cambiarEstado = async (f: Fila, estado: string) => {
    setErr(null);
    try {
      const r = await fetch(`/api/back-office/tesoreria/banco-a-banco/${f.id}/estado`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `no se pudo cambiar el estado (HTTP ${r.status})`));
        return;
      }
      recargar();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const nCols = 5 + (editable ? 1 : 0);

  // Asiento de ajuste para HYGIRUS. El archivo se genera SIEMPRE (sin pendientes
  // sale solo la cabecera). El backend responde 200 con el contenido dentro de un
  // JSON: el proxy de Next parsea todo como JSON y convierte cualquier error en
  // un 502 sin mensaje.
  const descargarTxt = async () => {
    setErr(null);
    try {
      const r = await fetch(
        `/api/back-office/tesoreria/banco-a-banco/export-txt?fecha=${fecha}`,
        { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || typeof j?.contenido !== "string") {
        setErr(String(j?.error ?? j?.detail ?? `no se pudo generar el TXT (HTTP ${r.status})`));
        return;
      }
      const blob = new Blob([j.contenido], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String(j.nombre || "Bco a Bco.txt");
      a.click();
      URL.revokeObjectURL(url);
      // El archivo baja igual; el aviso es para que nadie lo cargue en HYGIRUS
      // con la cuenta en blanco sin darse cuenta.
      if (j.faltantes?.length) {
        setErr(`OJO: el archivo salió con la cuenta VACÍA en ${j.faltantes.join(", ")}`
          + " — falta cargarle el N° HYGIRUS al banco en la tab BANCOS.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col p-3 gap-2">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          Error al consultar BANCO A BANCO: {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, el backend todavía no está reiniciado en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}
      <div className="text-[9px] text-[var(--t-text-muted)] shrink-0">
        Transferencias internas del día {data?.fecha ?? ""}: mueven saldo de un banco a
        otro para dejarlos cubiertos. <b>No cambian el total</b> — en BANCOS suman en la
        cuenta de crédito y restan en la de débito. Las dos cuentas tienen que estar en
        el catálogo y ser de la misma moneda.
      </div>

      <div className="min-w-0 flex flex-col border border-[var(--t-border)]">
        <div className="px-2 py-1 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-center text-[10px] uppercase tracking-widest font-semibold">
            BANCO A BANCO · {filas.length}
          </span>
          <span className="text-[10px] tabular-nums normal-case">
            {Object.keys(totales).sort().map((u) => `${fmt(totales[u])} ${u}`).join(" · ") || "—"}
          </span>
          <button onClick={descargarTxt} title="Asiento de ajuste con las transferencias NO completadas"
            className="text-[9px] uppercase tracking-widest border border-white/40 px-1.5 py-0.5 hover:bg-white/10">
            txt hygirus
          </button>
          {editable && (
            <button onClick={() => { setAlta((v) => !v); setEditId(null); }}
              className="text-[9px] uppercase tracking-widest border border-white/40 px-1.5 py-0.5 hover:bg-white/10">
              {alta ? "cancelar" : "+ nuevo"}
            </button>
          )}
        </div>

        {alta && (
          <Form bancos={bancos} estados={estados} fecha={fecha}
            onCerrar={() => setAlta(false)} onOk={() => { setAlta(false); recargar(); }} />
        )}

        <div className="max-h-[420px] overflow-auto">
          <table className="text-[11px] w-full table-fixed">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className={TH + " w-[28%]"}>Cta débito</th>
                <th className={TH + " w-[28%]"}>Cta crédito</th>
                <th className={TH + " w-[18%]"}>Importe</th>
                <th className={TH + " w-[8%]"}>Moneda</th>
                <th className={TH + " w-[13%]"}>Estado</th>
                {editable && <th className={TH + " w-[8%]"} />}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                editId === f.id ? (
                  <tr key={f.id}><td colSpan={nCols} className="p-0">
                    <Form bancos={bancos} estados={estados} fecha={fecha} inicial={f}
                      onCerrar={() => setEditId(null)}
                      onOk={() => { setEditId(null); recargar(); }} />
                  </td></tr>
                ) : (
                  <tr key={f.id} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className={TD + " " + WRAP + " text-[var(--t-neg)]"}>{f.cta_debito}</td>
                    <td className={TD + " " + WRAP + " text-[var(--t-pos)]"}>{f.cta_credito}</td>
                    <td className={TD + " " + NUM}>{fmt(f.importe)}</td>
                    <td className={TD + " text-[var(--t-text-dim)]"}>{f.unidad}</td>
                    <td className={TD}>
                      {editable ? (
                        <select value={f.estado} onChange={(e) => cambiarEstado(f, e.target.value)}
                          className="w-full max-w-full bg-transparent border border-[var(--t-border-2)] px-1 text-[10px] text-[var(--t-text)] outline-none cursor-pointer [color-scheme:dark]">
                          {estados.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : <span className="text-[var(--t-text-dim)]">{f.estado}</span>}
                    </td>
                    {editable && (
                      <td className={TD}>
                        <button onClick={() => { setEditId(f.id); setAlta(false); }}
                          className="text-[9px] text-[var(--t-accent)] hover:underline">editar</button>
                      </td>
                    )}
                  </tr>
                )
              ))}
              {!filas.length && (
                <tr><td colSpan={nCols} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  {loading ? "cargando…" : "sin transferencias ese día"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function Form({ bancos, estados, fecha, inicial, onCerrar, onOk }: {
  bancos: Banco[]; estados: string[]; fecha: string; inicial?: Fila;
  onCerrar: () => void; onOk: () => void;
}) {
  const [f, setF] = useState(() => ({
    cta_debito: inicial?.cta_debito ?? "",
    cta_credito: inicial?.cta_credito ?? "",
    unidad: inicial?.unidad ?? "ARS",
    importe: inicial ? String(inicial.importe) : "",
    estado: inicial?.estado ?? (estados[0] ?? "pendiente"),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Solo bancos de la moneda elegida: una transferencia con un único importe no
  // puede cruzar monedas (eso sería un cambio, con TC y dos importes).
  const delaMoneda = bancos.filter((b) => b.unidad === f.unidad);

  const guardar = async () => {
    const imp = Number(f.importe.trim().replace(/\./g, "").replace(",", "."));
    if (!f.cta_debito || !f.cta_credito) { setErr("elegí las dos cuentas"); return; }
    if (f.cta_debito === f.cta_credito) { setErr("tienen que ser cuentas distintas"); return; }
    if (!Number.isFinite(imp) || imp <= 0) { setErr("importe inválido"); return; }
    setBusy(true); setErr(null);
    try {
      const url = inicial
        ? `/api/back-office/tesoreria/banco-a-banco/${inicial.id}`
        : "/api/back-office/tesoreria/banco-a-banco";
      const r = await fetch(url, {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, fecha, importe: imp }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `no se pudo guardar (HTTP ${r.status})`));
        return;
      }
      onOk();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const borrar = async () => {
    if (!inicial) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/back-office/tesoreria/banco-a-banco/${inicial.id}`,
        { method: "DELETE" });
      if (!r.ok) { setErr(`no se pudo borrar (HTTP ${r.status})`); return; }
      onOk();
    } finally { setBusy(false); }
  };

  const input = "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 " +
    "text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]";
  const lbl = "uppercase tracking-widest text-[var(--t-text-muted)]";

  const selectorBanco = (k: "cta_debito" | "cta_credito", etiqueta: string) => (
    <label className="flex flex-col gap-0.5">
      <span className={lbl}>{etiqueta}</span>
      <select value={f[k]} onChange={(e) => set(k, e.target.value)}
        className={input + " w-[220px] max-w-full"}>
        <option value="">— elegir —</option>
        {delaMoneda.map((b) => (
          <option key={b.banco} value={b.banco}>{b.banco}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="p-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex flex-wrap items-end gap-2 text-[10px] min-w-0">
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Moneda</span>
        {/* Primero la moneda: define qué bancos se pueden elegir. */}
        <select value={f.unidad}
          onChange={(e) => setF((p) => ({ ...p, unidad: e.target.value,
            cta_debito: "", cta_credito: "" }))}
          className={input}>
          {["ARS", "USD"].map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      {selectorBanco("cta_debito", "Cta débito (sale)")}
      {selectorBanco("cta_credito", "Cta crédito (entra)")}
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Importe ({f.unidad})</span>
        <input value={f.importe} onChange={(e) => set("importe", e.target.value)}
          className={input + " w-[130px] max-w-full text-right"} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Estado</span>
        <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={input}>
          {estados.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <button onClick={guardar} disabled={busy}
        className="px-2 py-1 uppercase tracking-widest border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
        {inicial ? "guardar" : "cargar"}
      </button>
      <button onClick={onCerrar} disabled={busy}
        className="px-2 py-1 uppercase tracking-widest text-[var(--t-text-muted)] hover:text-[var(--t-text)]">
        cancelar
      </button>
      {inicial && (
        <button onClick={borrar} disabled={busy}
          className="px-2 py-1 uppercase tracking-widest text-[var(--t-neg)] hover:underline disabled:opacity-40">
          borrar
        </button>
      )}
      {err && <span className="text-[var(--t-neg)]">{err}</span>}
    </div>
  );
}
