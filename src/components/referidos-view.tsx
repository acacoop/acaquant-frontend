"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { ComercialOperacionesView } from "./comercial-operaciones-view";

// /referidos — misma maquinaria que /operadores pero con REFERIDO como lente
// primaria: elegís un referido y ves las cuentas que trajo (chart, clientes,
// portafolio, análisis, informe, cobros futuros — todo lensed by referido).
// Reusa los endpoints /comercial/* (ya filtran por referido) → cero backend nuevo.
// Los otros filtros (operador / nivel_1 / nivel_3) quedan como secundarios y se
// CRUZAN igual que en Operadores.

type Combo = {
  operador_email: string;
  operador_nombre: string | null;
  nivel_1: string | null;
  nivel_3: string | null;
  referido: string | null;
  n_cuentas: number;
};

const TODOS = "__todos__";

export function ReferidosView() {
  const [combos, setCombos] = useState<Combo[]>([]);
  // REFERIDO es la lente primaria. operador/nivel quedan secundarios. "" = Todos.
  const [referido, setReferido] = usePersistedState<string>("referidos.referido", "");
  const [operador, setOperador] = usePersistedState<string>("referidos.operador", "");
  const [nivel1, setNivel1] = usePersistedState<string>("referidos.nivel1", "");
  const [nivel3, setNivel3] = usePersistedState<string>("referidos.nivel3", "");
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD">("referidos.moneda", "ARS");

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/operaciones/comercial/dimensiones", { cache: "no-store" });
        if (!r.ok) return;
        const d: { combos: Combo[] } = await r.json();
        setCombos(Array.isArray(d.combos) ? d.combos : []);
      } catch { /* la vista muestra su propio vacío/error */ }
    })();
  }, []);

  // ── Cross-filter: cada dropdown ofrece SOLO lo compatible con los otros ──
  const matchRef = (c: Combo) => referido === "" || c.referido === referido;
  const matchOp = (c: Combo) => operador === "" || operador === TODOS || c.operador_email === operador;
  const matchN1 = (c: Combo) => nivel1 === "" || c.nivel_1 === nivel1;
  const matchN3 = (c: Combo) => nivel3 === "" || c.nivel_3 === nivel3;

  const referidos = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of combos) {
      if (!matchOp(c) || !matchN1(c) || !matchN3(c) || !c.referido) continue;
      m.set(c.referido, (m.get(c.referido) ?? 0) + c.n_cuentas);
    }
    return [...m.entries()].map(([ref, n]) => ({ ref, n })).sort((a, b) => b.n - a.n);
  }, [combos, operador, nivel1, nivel3]);

  const operadores = useMemo(() => {
    const m = new Map<string, { email: string; nombre: string | null; n: number }>();
    for (const c of combos) {
      if (!matchRef(c) || !matchN1(c) || !matchN3(c)) continue;
      const cur = m.get(c.operador_email) ?? { email: c.operador_email, nombre: c.operador_nombre, n: 0 };
      cur.n += c.n_cuentas;
      m.set(c.operador_email, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [combos, referido, nivel1, nivel3]);

  const niveles1 = useMemo(() => {
    const s = new Set<string>();
    for (const c of combos) if (matchRef(c) && matchOp(c) && matchN3(c) && c.nivel_1) s.add(c.nivel_1);
    return [...s].sort();
  }, [combos, referido, operador, nivel3]);
  const niveles3 = useMemo(() => {
    const s = new Set<string>();
    for (const c of combos) if (matchRef(c) && matchOp(c) && matchN1(c) && c.nivel_3) s.add(c.nivel_3);
    return [...s].sort();
  }, [combos, referido, operador, nivel1]);

  // Si un filtro elegido deja de ser compatible, se resetea.
  useEffect(() => {
    if (referido && referidos.length && !referidos.some((r) => r.ref === referido)) setReferido("");
  }, [referidos, referido, setReferido]);
  useEffect(() => {
    if (operador && operador !== TODOS && operadores.length && !operadores.some((o) => o.email === operador)) setOperador(TODOS);
  }, [operadores, operador, setOperador]);
  useEffect(() => {
    if (nivel1 && niveles1.length && !niveles1.includes(nivel1)) setNivel1("");
  }, [niveles1, nivel1, setNivel1]);
  useEffect(() => {
    if (nivel3 && niveles3.length && !niveles3.includes(nivel3)) setNivel3("");
  }, [niveles3, nivel3, setNivel3]);

  const selectCls =
    "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none";

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Referidos
        </span>
        {combos.length > 0 && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* REFERIDO (lente primaria) */}
            <span className="text-[9px] text-[var(--t-accent)] tracking-widest font-semibold">REFERIDO</span>
            <select value={referido} onChange={(e) => setReferido(e.target.value)} className={selectCls + " max-w-[240px] border-[var(--t-accent)]"}>
              <option value="">— Todos los referidos —</option>
              {referidos.map((r) => <option key={r.ref} value={r.ref}>{r.ref} ({r.n})</option>)}
            </select>
            {/* OPERADOR (secundario) */}
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">OPERADOR</span>
            <select value={operador} onChange={(e) => setOperador(e.target.value)} className={selectCls + " max-w-[200px]"}>
              <option value={TODOS}>— Todos —</option>
              {operadores.map((o) => <option key={o.email} value={o.email}>{(o.nombre || o.email)} ({o.n})</option>)}
            </select>
            {/* NIVEL 1 */}
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">NIVEL 1</span>
            <select value={nivel1} onChange={(e) => setNivel1(e.target.value)} className={selectCls + " max-w-[160px]"}>
              <option value="">— Todos —</option>
              {niveles1.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {/* NIVEL 3 */}
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">NIVEL 3</span>
            <select value={nivel3} onChange={(e) => setNivel3(e.target.value)} className={selectCls + " max-w-[160px]"}>
              <option value="">— Todos —</option>
              {niveles3.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {/* MONEDA */}
            <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {(["ARS", "USD"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={
                    "px-2 py-1 text-[10px] font-semibold " +
                    (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-surface)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                  }
                >{m}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ComercialOperacionesView
          operador={operador || TODOS}
          moneda={moneda}
          nivel1={nivel1}
          nivel3={nivel3}
          referido={referido}
        />
      </div>
    </div>
  );
}
