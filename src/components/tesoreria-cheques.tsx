"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Back Office → Tesorería → tab CHEQUES. Pantalla partida 50/50:
 *
 *   IZQUIERDA — RECIBIDOS: los e-cheq que entraron ese día. Salen LIVE de Aunesa
 *               (mismos movimientos de la tab MOVIMIENTOS, filtrados por RIEL
 *               e-cheq + tipo ingreso). No se cargan a mano.
 *   DERECHA   — EMITIDOS: los carga el back office, igual que una orden de SENEBIS.
 *               COMITENTE sale del padrón de clientes (autocomplete por número o
 *               nombre, trae el CUIT solo) y BANCO del catálogo de cuentas
 *               operativas — los mismos bancos que las cards de la tab BANCOS.
 *
 * Escritura gobernada server-side por la allowlist de Tesorería (+ admin).
 */

const POLL_MS = 20_000;

type Recibido = {
  hora: string; cliente: string | null; cuit: string | null; banco: string;
  importe: number; unidad: string; estado: string | null; cuenta: string | null;
};
type Emitido = {
  id: number; comitente: string | null; comitente_denominacion: string | null;
  cuit: string | null; banco: string; unidad: string; importe: number;
  estado: string; fecha_pago: string | null; creado_por: string | null;
};
type Banco = { banco: string; unidad: string };
type Resp = {
  fecha: string; fecha_iso: string;
  recibidos: Recibido[]; recibidos_error?: string; emitidos: Emitido[];
  bancos: Banco[]; estados: string[]; puede_editar?: boolean; actualizado_at?: string;
};
type Comitente = { id_cuenta: string; denominacion: string | null; cuit: string | null };

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fechaCorta = (iso: string | null) =>
  iso ? iso.split("-").reverse().join("/") : "—";

const VACIO = {
  comitente: "", comitente_denominacion: "", cuit: "", banco: "", unidad: "ARS",
  importe: "", estado: "pendiente", fecha_pago: "",
};

export function TesoreriaCheques({ fecha }: { fecha: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    try {
      const r = await fetch(`/api/back-office/tesoreria/cheques?fecha=${fecha}`, { cache: "no-store" });
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
      if (alive.current && !silencioso) { setErr(e instanceof Error ? e.message : String(e)); }
    } finally { if (alive.current) setLoading(false); }
  }, [fecha]);

  useEffect(() => { cargar(false); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const editable = !!data?.puede_editar;

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          Error al consultar CHEQUES: {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, el backend todavía no está reiniciado en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}

      {/* 50/50 — recibidos a la izquierda, emitidos a la derecha */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Recibidos filas={data?.recibidos ?? []} error={data?.recibidos_error} loading={loading} />
        <Emitidos filas={data?.emitidos ?? []} bancos={data?.bancos ?? []}
          estados={data?.estados ?? ["pendiente", "pagado"]}
          editable={editable} onChanged={() => cargar(true)} />
      </div>
    </div>
  );
}


function Panel({ titulo, extra, children }: {
  titulo: string; extra?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex flex-col">
      <div className="px-2 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold flex items-center gap-2 shrink-0">
        <span className="flex-1 text-center">{titulo}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">{children}</div>
    </div>
  );
}

const TH = "px-2 py-1.5 text-center";
const TD = "px-2 py-1 text-center";


// ── IZQUIERDA: e-cheq recibidos (live desde Aunesa, no se cargan a mano) ──────
function Recibidos({ filas, error, loading }: {
  filas: Recibido[]; error?: string; loading: boolean;
}) {
  const total = filas.reduce((a, f) => a + f.importe, 0);
  return (
    <Panel titulo={`E-CHEQS RECIBIDOS · ${filas.length}`}
      extra={<span className="text-[10px] tabular-nums normal-case">{fmt(total)}</span>}>
      <table className="text-[11px] tabular-nums whitespace-nowrap w-full">
        <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
          <tr className="border-b border-[var(--t-border)]">
            <th className={TH}>Hora</th><th className={TH}>Cliente</th><th className={TH}>CUIT</th>
            <th className={TH}>Banco</th><th className={TH}>Importe</th><th className={TH}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
              <td className={TD}>{cell(f.hora)}</td>
              <td className={TD}>{cell(f.cliente)}</td>
              <td className={TD}>{cell(f.cuit)}</td>
              <td className={TD}>{cell(f.banco)}</td>
              <td className={TD + " text-[var(--t-pos)]"}>+{fmt(f.importe)} {f.unidad}</td>
              <td className={TD + " text-[var(--t-text-dim)]"}>{cell(f.estado)}</td>
            </tr>
          ))}
          {!filas.length && (
            <tr><td colSpan={6} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
              {error ? `no pude leer Aunesa: ${error}` : loading ? "cargando…" : "sin e-cheqs recibidos ese día"}
            </td></tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}


// ── DERECHA: cheques emitidos (carga manual, patrón SENEBIS) ─────────────────
function Emitidos({ filas, bancos, estados, editable, onChanged }: {
  filas: Emitido[]; bancos: Banco[]; estados: string[];
  editable: boolean; onChanged: () => void;
}) {
  const [alta, setAlta] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const total = filas.reduce((a, f) => a + f.importe, 0);

  return (
    <Panel titulo={`CHEQUES EMITIDOS · ${filas.length}`}
      extra={
        <span className="flex items-center gap-2 normal-case">
          <span className="text-[10px] tabular-nums">{fmt(total)}</span>
          {editable && (
            <button onClick={() => { setAlta((v) => !v); setEditId(null); }}
              className="text-[9px] uppercase tracking-widest border border-white/40 px-1.5 py-0.5 hover:bg-white/10">
              {alta ? "cancelar" : "+ nuevo"}
            </button>
          )}
        </span>
      }>
      {alta && (
        <FormCheque bancos={bancos} estados={estados}
          onCerrar={() => setAlta(false)} onOk={() => { setAlta(false); onChanged(); }} />
      )}
      <table className="text-[11px] tabular-nums whitespace-nowrap w-full">
        <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
          <tr className="border-b border-[var(--t-border)]">
            <th className={TH}>Comitente</th><th className={TH}>CUIT</th><th className={TH}>Banco</th>
            <th className={TH}>Importe</th><th className={TH}>Estado</th><th className={TH}>Fecha de pago</th>
            {editable && <th className={TH} />}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            editId === f.id ? (
              <tr key={f.id}><td colSpan={editable ? 7 : 6} className="p-0">
                <FormCheque bancos={bancos} estados={estados} inicial={f}
                  onCerrar={() => setEditId(null)} onOk={() => { setEditId(null); onChanged(); }} />
              </td></tr>
            ) : (
              <tr key={f.id} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                <td className={TD}>{cell(f.comitente_denominacion ?? f.comitente)}</td>
                <td className={TD}>{cell(f.cuit)}</td>
                <td className={TD}>{cell(f.banco)}</td>
                <td className={TD + " text-[var(--t-neg)]"}>−{fmt(f.importe)} {f.unidad}</td>
                <td className={TD}>
                  <span className={f.estado === "pagado" ? "text-[var(--t-pos)]" : "text-[var(--t-text-dim)]"}>
                    {f.estado}
                  </span>
                </td>
                <td className={TD}>{fechaCorta(f.fecha_pago)}</td>
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
            <tr><td colSpan={editable ? 7 : 6} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
              sin cheques emitidos cargados
            </td></tr>
          )}
        </tbody>
      </table>
      {!editable && (
        <div className="text-[9px] text-[var(--t-text-muted)] p-2">
          Solo lectura: no tenés permiso para cargar cheques (se habilita en Manager → MESA).
        </div>
      )}
    </Panel>
  );
}


// Alta/edición. `inicial` presente = edición (PUT); ausente = alta (POST).
function FormCheque({ bancos, estados, inicial, onCerrar, onOk }: {
  bancos: Banco[]; estados: string[]; inicial?: Emitido;
  onCerrar: () => void; onOk: () => void;
}) {
  const [f, setF] = useState(() => inicial ? {
    comitente: inicial.comitente ?? "",
    comitente_denominacion: inicial.comitente_denominacion ?? "",
    cuit: inicial.cuit ?? "", banco: inicial.banco, unidad: inicial.unidad,
    importe: String(inicial.importe), estado: inicial.estado,
    fecha_pago: inicial.fecha_pago ?? "",
  } : { ...VACIO });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(inicial?.comitente_denominacion ?? "");
  const [sug, setSug] = useState<Comitente[]>([]);

  const set = (k: keyof typeof VACIO, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Autocomplete de comitentes: mismo padrón de clientes que usa SENEBIS.
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2 || t === f.comitente_denominacion) { setSug([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/back-office/tesoreria/cheques/comitentes?q=${encodeURIComponent(t)}`,
          { cache: "no-store" });
        if (!r.ok) return;
        const b = await r.json();
        setSug(Array.isArray(b?.comitentes) ? b.comitentes.slice(0, 8) : []);
      } catch { /* autocomplete es best-effort */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, f.comitente_denominacion]);

  const elegir = (c: Comitente) => {
    setF((p) => ({ ...p, comitente: c.id_cuenta,
      comitente_denominacion: c.denominacion ?? c.id_cuenta, cuit: c.cuit ?? p.cuit }));
    setQ(c.denominacion ?? c.id_cuenta);
    setSug([]);
  };

  const guardar = async () => {
    const imp = Number(f.importe.trim().replace(/\./g, "").replace(",", "."));
    if (!f.banco) { setErr("elegí un banco"); return; }
    if (!Number.isFinite(imp) || imp <= 0) { setErr("importe inválido"); return; }
    setBusy(true); setErr(null);
    try {
      const url = inicial
        ? `/api/back-office/tesoreria/cheques/${inicial.id}`
        : "/api/back-office/tesoreria/cheques";
      const r = await fetch(url, {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, importe: imp, fecha_pago: f.fecha_pago || null }),
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
      const r = await fetch(`/api/back-office/tesoreria/cheques/${inicial.id}`, { method: "DELETE" });
      if (!r.ok) { setErr(`no se pudo borrar (HTTP ${r.status})`); return; }
      onOk();
    } finally { setBusy(false); }
  };

  const input = "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]";

  return (
    <div className="p-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex flex-wrap items-end gap-2 text-[10px]">
      <label className="flex flex-col gap-0.5 relative">
        <span className="uppercase tracking-widest text-[var(--t-text-muted)]">Comitente</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="número o nombre…"
          className={input + " w-[180px]"} />
        {!!sug.length && (
          <div className="absolute z-30 top-full left-0 mt-0.5 w-[260px] max-h-[180px] overflow-auto border border-[var(--t-border-2)] bg-[var(--t-panel)] shadow-lg">
            {sug.map((c) => (
              <button key={c.id_cuenta} onClick={() => elegir(c)}
                className="block w-full text-left px-2 py-1 text-[10px] hover:bg-[var(--t-surface)]">
                <b>{c.id_cuenta}</b> · {c.denominacion ?? "—"}
              </button>
            ))}
          </div>
        )}
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="uppercase tracking-widest text-[var(--t-text-muted)]">CUIT</span>
        <input value={f.cuit} onChange={(e) => set("cuit", e.target.value)} className={input + " w-[110px]"} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="uppercase tracking-widest text-[var(--t-text-muted)]">Banco</span>
        <select value={`${f.banco}|${f.unidad}`}
          onChange={(e) => { const [b, u] = e.target.value.split("|"); setF((p) => ({ ...p, banco: b, unidad: u })); }}
          className={input + " w-[200px]"}>
          <option value="|ARS">— elegir —</option>
          {bancos.map((b) => (
            <option key={`${b.banco}|${b.unidad}`} value={`${b.banco}|${b.unidad}`}>
              {b.banco} [{b.unidad}]
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="uppercase tracking-widest text-[var(--t-text-muted)]">Importe</span>
        <input value={f.importe} onChange={(e) => set("importe", e.target.value)}
          className={input + " w-[110px] text-right"} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="uppercase tracking-widest text-[var(--t-text-muted)]">Estado</span>
        <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={input}>
          {estados.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="uppercase tracking-widest text-[var(--t-text-muted)]">Fecha de pago</span>
        <input type="date" value={f.fecha_pago} onChange={(e) => set("fecha_pago", e.target.value)}
          className={input} />
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
