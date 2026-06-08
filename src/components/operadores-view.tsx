"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { ComercialOperacionesView } from "./comercial-operaciones-view";

// /operadores (ex tab COMERCIAL de /operaciones). Barra madre con 3 filtros que
// se CRUZAN (operador / nivel_1 / nivel_3) + moneda. Elegir uno achica las
// opciones de los otros dos y lo que se ve. Todo baja como prop a la vista.

// Un combo (operador, nivel_1, nivel_3) con su nº de cuentas — fuente única para
// poblar y cruzar los 3 dropdowns (endpoint /comercial/dimensiones).
type Combo = {
  operador_email: string;
  operador_nombre: string | null;
  nivel_1: string | null;
  nivel_3: string | null;
  n_cuentas: number;
};

const TODOS = "__todos__";

export function OperadoresView() {
  const [combos, setCombos] = useState<Combo[]>([]);
  // Los 3 filtros + moneda persisten entre rutas. "" = sin filtro (Todos).
  const [operador, setOperador] = usePersistedState<string>("operadores.operador", "");
  const [nivel1, setNivel1] = usePersistedState<string>("operadores.nivel1", "");
  const [nivel3, setNivel3] = usePersistedState<string>("operadores.nivel3", "");
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD">("operadores.moneda", "ARS");

  useEffect(() => {
    void (async () => {
      try {
        const [rDim, rMe] = await Promise.all([
          fetch("/api/operaciones/comercial/dimensiones", { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" }),
        ]);
        if (!rDim.ok) return;
        const d: { combos: Combo[] } = await rDim.json();
        const cs = Array.isArray(d.combos) ? d.combos : [];
        setCombos(cs);

        // Arranca en el operador logueado si está registrado; si no, en Todos.
        let miEmail: string | null = null;
        if (rMe.ok) {
          try { miEmail = ((await rMe.json())?.email ?? null) as string | null; } catch { /* no-JSON */ }
        }
        const mio = miEmail
          ? cs.find((c) => c.operador_email?.toLowerCase() === miEmail!.toLowerCase())
          : undefined;
        setOperador((s) => s || (mio?.operador_email ?? TODOS));
      } catch { /* la vista muestra su propio vacío/error */ }
    })();
  }, []);

  // ── Cross-filter: cada dropdown ofrece SOLO lo compatible con los otros dos ──
  const matchOp = (c: Combo) => operador === "" || operador === TODOS || c.operador_email === operador;
  const matchN1 = (c: Combo) => nivel1 === "" || c.nivel_1 === nivel1;
  const matchN3 = (c: Combo) => nivel3 === "" || c.nivel_3 === nivel3;

  // Operadores compatibles con el nivel_1/nivel_3 elegidos (con nº de cuentas sumado).
  const operadores = useMemo(() => {
    const m = new Map<string, { email: string; nombre: string | null; n: number }>();
    for (const c of combos) {
      if (!matchN1(c) || !matchN3(c)) continue;
      const cur = m.get(c.operador_email) ?? { email: c.operador_email, nombre: c.operador_nombre, n: 0 };
      cur.n += c.n_cuentas;
      m.set(c.operador_email, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [combos, nivel1, nivel3]);

  // Niveles compatibles con los OTROS dos filtros (null/"" se ignoran como opción).
  const niveles1 = useMemo(() => {
    const s = new Set<string>();
    for (const c of combos) if (matchOp(c) && matchN3(c) && c.nivel_1) s.add(c.nivel_1);
    return [...s].sort();
  }, [combos, operador, nivel3]);
  const niveles3 = useMemo(() => {
    const s = new Set<string>();
    for (const c of combos) if (matchOp(c) && matchN1(c) && c.nivel_3) s.add(c.nivel_3);
    return [...s].sort();
  }, [combos, operador, nivel1]);

  // Si un filtro elegido deja de ser compatible (lo achicó otro), se resetea a Todos.
  useEffect(() => {
    if (nivel1 && niveles1.length && !niveles1.includes(nivel1)) setNivel1("");
  }, [niveles1, nivel1, setNivel1]);
  useEffect(() => {
    if (nivel3 && niveles3.length && !niveles3.includes(nivel3)) setNivel3("");
  }, [niveles3, nivel3, setNivel3]);
  useEffect(() => {
    if (operador && operador !== TODOS && operadores.length
      && !operadores.some((o) => o.email === operador)) setOperador(TODOS);
  }, [operadores, operador, setOperador]);

  const selectCls =
    "bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none";

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Operadores
        </span>
        {combos.length > 0 && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* OPERADOR */}
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">OPERADOR</span>
            <select value={operador} onChange={(e) => setOperador(e.target.value)} className={selectCls + " max-w-[240px]"}>
              <option value={TODOS}>— Todos los operadores —</option>
              {operadores.map((o) => (
                <option key={o.email} value={o.email}>
                  {(o.nombre || o.email)} ({o.n})
                </option>
              ))}
            </select>
            {/* NIVEL 1 */}
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">NIVEL 1</span>
            <select value={nivel1} onChange={(e) => setNivel1(e.target.value)} className={selectCls + " max-w-[180px]"}>
              <option value="">— Todos —</option>
              {niveles1.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {/* NIVEL 3 */}
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">NIVEL 3</span>
            <select value={nivel3} onChange={(e) => setNivel3(e.target.value)} className={selectCls + " max-w-[180px]"}>
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
        />
      </div>
    </div>
  );
}
