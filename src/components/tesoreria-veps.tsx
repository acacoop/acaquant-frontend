"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Back Office → Tesorería → tab VEPS. Agenda de vencimientos: acá son TODOS
 * EGRESOS, no hay ingresos.
 *
 * Mismo horizonte que los cheques EMITIDOS: es un TABLERO DE SEGUIMIENTO y NO
 * depende de la fecha de la barra — un VEP viejo sin pagar sigue a la vista. Marcarlo
 * `pagado` lo saca de la pantalla pero la fila NO se borra: queda el histórico (el
 * toggle "ver pagados" los trae de vuelta).
 *
 * VENCIDO = fila AMARILLA. Lo decide el BACKEND (campo `vencido`), no el navegador:
 * el día es el de Argentina, no el del reloj de la máquina del usuario. Un VEP ya
 * pagado no se marca aunque su vencimiento haya pasado.
 *
 * NO IMPACTA EL SALDO de la grilla BANCOS, y es a propósito: el egreso del VEP ya
 * entra al banco por REGISTROS MANUALES (tipo 'VEP'). Si además sumara desde acá, el
 * mismo VEP se contaría DOS VECES. Por eso mismo, cuando alguien carga un registro
 * manual de tipo VEP aparece SOLO una fila acá (origen `registro`) con lo que ese
 * registro sabe — importe, banco y moneda —, y el número, el concepto y el
 * vencimiento se completan después desde esta pantalla.
 *
 * La MONEDA no se elige: la define el banco, porque las cuentas operativas ya son
 * específicas por moneda (…ARS / …USD).
 */

const POLL_MS = 20_000;

type Vep = {
  id: number; numero_vep: string | null; concepto: string | null; importe: number;
  banco: string; unidad: string; vencimiento: string | null; estado: string;
  vencido: boolean; origen: string; registro_id: number | null;
  creado_por: string | null;
};
type Banco = { banco: string; unidad: string };
type Totales = Record<string, { total: number; vencido: number; n: number }>;
type Resp = {
  items: Vep[]; totales: Totales; hoy: string; banco_default: string;
  estados: string[]; bancos: Banco[]; puede_editar?: boolean;
};

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fechaCorta = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const TH = "px-2 py-1.5 text-center font-normal";
const TD = "px-2 py-1 text-center";
const WRAP = "whitespace-normal break-words leading-tight";
const NUM = "whitespace-nowrap tabular-nums";
// Vencido y sin pagar → AMARILLO. Se guarda igual, solo se marca.
const AMARILLO = "bg-[#eab308]/25";

const VACIO = {
  numero_vep: "", concepto: "", importe: "", banco: "", unidad: "ARS",
  vencimiento: "", estado: "pendiente",
};

export function TesoreriaVeps() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verPagados, setVerPagados] = useState(false);
  const [form, setForm] = useState({ ...VACIO });
  const [editId, setEditId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    try {
      const r = await fetch(
        `/api/back-office/tesoreria/veps?incluir_pagados=${verPagados}`, { cache: "no-store" });
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
  }, [verPagados]);

  useEffect(() => { cargar(false); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const editable = !!data?.puede_editar;
  const items = data?.items ?? [];
  const bancos = data?.bancos ?? [];
  // El banco por defecto lo manda el backend (AL2): es el que el back office usa
  // casi siempre, así el alta arranca con el caso normal ya elegido.
  const bancoDefault = data?.banco_default ?? "AL2";
  const bancoElegido = form.banco || bancoDefault;
  // La moneda sale del banco, no se carga (las cuentas ya son por moneda).
  const unidadDe = (b: string) => bancos.find((x) => x.banco === b)?.unidad ?? "ARS";

  const enviar = async () => {
    if (!editable || guardando) return;
    setGuardando(true);
    try {
      const url = editId
        ? `/api/back-office/tesoreria/veps/${editId}`
        : "/api/back-office/tesoreria/veps";
      const r = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero_vep: form.numero_vep || null,
          concepto: form.concepto || null,
          importe: Number(form.importe),
          banco: bancoElegido,
          unidad: unidadDe(bancoElegido),
          vencimiento: form.vencimiento || null,
          estado: form.estado,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`));
        return;
      }
      setForm({ ...VACIO }); setEditId(null); setErr(null);
      cargar(true);
    } finally { setGuardando(false); }
  };

  const cambiarEstado = async (v: Vep) => {
    if (!editable) return;
    const nuevo = v.estado === "pagado" ? "pendiente" : "pagado";
    const r = await fetch(`/api/back-office/tesoreria/veps/${v.id}/estado`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`));
      return;
    }
    cargar(true);
  };

  const borrar = async (v: Vep) => {
    if (!editable) return;
    const r = await fetch(`/api/back-office/tesoreria/veps/${v.id}`, { method: "DELETE" });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`));
      return;
    }
    cargar(true);
  };

  const editar = (v: Vep) => {
    setEditId(v.id);
    setForm({
      numero_vep: v.numero_vep ?? "", concepto: v.concepto ?? "",
      importe: String(v.importe), banco: v.banco, unidad: v.unidad,
      vencimiento: v.vencimiento ?? "", estado: v.estado,
    });
  };

  const INPUT = "px-2 py-1 text-[10px] bg-[var(--t-panel)] border border-[var(--t-border-2)] " +
    "text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none";

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          Error en VEPS: {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, el backend todavía no está reiniciado en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}

      <div className="text-[9px] text-[var(--t-text-muted)] shrink-0">
        Tablero de seguimiento: <b>no depende de la fecha de arriba</b>. Todos son
        <b> egresos</b>. Los <b>vencidos</b> van en amarillo y se conservan; marcar
        <b> pagado</b> saca la fila de la vista sin borrarla. Los VEPs <b>no suman al
        saldo de BANCOS</b> — el egreso ya entra por REGISTROS MANUALES, y contarlo dos
        veces inflaría el saldo. Un registro manual de tipo VEP aparece acá solo, para
        completarle número, concepto y vencimiento.
      </div>

      {/* Barra: totales por moneda + toggle de pagados */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 text-[10px]">
        {Object.entries(data?.totales ?? {}).map(([uni, t]) => (
          <span key={uni} className="px-2 py-0.5 border border-[var(--t-border-2)]">
            <span className="text-[var(--t-text-muted)]">PENDIENTE {uni}</span>{" "}
            <b className={NUM}>{fmt(t.total)}</b>
            <span className="text-[var(--t-text-dim)]"> · {t.n} VEP{t.n === 1 ? "" : "s"}</span>
            {t.vencido > 0 && (
              <span className="ml-1 text-[#eab308]">· vencido {fmt(t.vencido)}</span>
            )}
          </span>
        ))}
        <label className="flex items-center gap-1 text-[var(--t-text-dim)] cursor-pointer">
          <input type="checkbox" checked={verPagados}
                 onChange={(e) => setVerPagados(e.target.checked)} />
          ver pagados
        </label>
        {loading && <span className="text-[var(--t-text-muted)]">cargando…</span>}
      </div>

      {/* Alta / edición */}
      {editable && (
        <div className="flex flex-wrap items-end gap-2 shrink-0 border border-[var(--t-border-2)] p-2">
          <Campo label="N° VEP">
            <input className={`${INPUT} w-32`} value={form.numero_vep}
                   onChange={(e) => setForm({ ...form, numero_vep: e.target.value })} />
          </Campo>
          <Campo label="CONCEPTO">
            <input className={`${INPUT} w-56`} value={form.concepto}
                   onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </Campo>
          <Campo label="IMPORTE">
            <input className={`${INPUT} w-32 text-right`} inputMode="decimal" value={form.importe}
                   onChange={(e) => setForm({ ...form, importe: e.target.value })} />
          </Campo>
          <Campo label="BANCO">
            <select className={`${INPUT} w-44`} value={bancoElegido}
                    onChange={(e) => setForm({ ...form, banco: e.target.value })}>
              {/* El default puede no estar en el catálogo todavía: se muestra igual
                  para que el alta arranque con AL2 elegido como pidió la mesa. */}
              {!bancos.some((b) => b.banco === bancoDefault) && (
                <option value={bancoDefault}>{bancoDefault}</option>
              )}
              {bancos.map((b) => (
                <option key={`${b.banco}|${b.unidad}`} value={b.banco}>
                  {b.banco} · {b.unidad}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="VENCIMIENTO">
            <input type="date" className={`${INPUT} w-36`} value={form.vencimiento}
                   onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} />
          </Campo>
          <Campo label="ESTADO">
            <select className={`${INPUT} w-28`} value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {(data?.estados ?? ["pendiente", "pagado"]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Campo>
          <button onClick={enviar} disabled={guardando || !form.importe}
                  className="px-3 py-1 text-[10px] border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40">
            {editId ? "GUARDAR" : "AGREGAR"}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ ...VACIO }); }}
                    className="px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)]">
              CANCELAR
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">
        <table className="w-full table-fixed text-[10px] font-mono">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
            <tr>
              <th className={`${TH} w-28`}>N° VEP</th>
              <th className={TH}>CONCEPTO</th>
              <th className={`${TH} w-32`}>IMPORTE</th>
              <th className={`${TH} w-36`}>BANCO</th>
              <th className={`${TH} w-28`}>VENCIMIENTO</th>
              <th className={`${TH} w-24`}>ESTADO</th>
              {editable && <th className={`${TH} w-20`} />}
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id}
                  className={`border-b border-[var(--t-border-2)] ${v.vencido ? AMARILLO : ""}`}>
                <td className={`${TD} ${WRAP}`}>
                  {cell(v.numero_vep)}
                  {/* Nació de un registro manual y todavía no lo completaron. */}
                  {v.origen === "registro" && !v.numero_vep && (
                    <span className="block text-[8px] text-[var(--t-text-dim)]">
                      de registro manual
                    </span>
                  )}
                </td>
                <td className={`${TD} ${WRAP}`}>{cell(v.concepto)}</td>
                <td className={`${TD} ${NUM} text-right`}>
                  {fmt(v.importe)} <span className="text-[var(--t-text-dim)]">{v.unidad}</span>
                </td>
                <td className={`${TD} ${WRAP}`}>{cell(v.banco)}</td>
                <td className={`${TD} ${NUM}`}>{fechaCorta(v.vencimiento)}</td>
                <td className={TD}>
                  <button onClick={() => cambiarEstado(v)} disabled={!editable}
                          title={editable ? "click para cambiar" : ""}
                          className={`px-1.5 py-0.5 border text-[9px] uppercase ${
                            v.estado === "pagado"
                              ? "border-[var(--t-pos)] text-[var(--t-pos)]"
                              : "border-[var(--t-border-2)] text-[var(--t-text-dim)]"
                          } ${editable ? "hover:border-[var(--t-accent)]" : "cursor-default"}`}>
                    {v.estado}
                  </button>
                </td>
                {editable && (
                  <td className={TD}>
                    <button onClick={() => editar(v)}
                            className="px-1 text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">
                      ✎
                    </button>
                    <button onClick={() => borrar(v)}
                            className="px-1 text-[var(--t-text-dim)] hover:text-[var(--t-neg)]">
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={editable ? 7 : 6}
                    className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  sin VEPs {verPagados ? "" : "pendientes"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[8px] text-[var(--t-text-muted)] uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
