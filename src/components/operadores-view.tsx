"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { ComercialOperacionesView } from "./comercial-operaciones-view";

// /operadores. Barra madre con filtros MULTI-SELECT que se CRUZAN (operador / nivel_1 /
// nivel_2 / nivel_3 / nivel_4 / nivel_5 / referido) + moneda. Cada filtro acepta varios
// valores; elegir en uno achica las opciones de los otros. Todo baja como array al backend (= ANY).

type Combo = {
  operador_email: string;
  operador_nombre: string | null;
  nivel_1: string | null;
  nivel_2: string | null;
  nivel_3: string | null;
  nivel_4: string | null;
  nivel_5: string | null;
  referido: string | null;
  n_cuentas: number;
};

// ── Multi-select (dropdown con checkboxes) ────────────────────────────────
type Opt = { value: string; label: string; n?: number };
function MultiSelect({
  label, options, selected, onChange, width = "max-w-[220px]",
}: {
  label: string;
  options: Opt[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const sel = new Set(selected);
  const toggle = (v: string) =>
    onChange(sel.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const resumen = selected.length === 0
    ? "— Todos —"
    : selected.length === 1
    ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
    : `${selected.length} seleccionados`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={"flex items-center gap-1 bg-[var(--t-surface)] border text-[11px] px-2 py-1 font-mono outline-none " + width + " "
          + (selected.length ? "border-[var(--t-accent)] text-[var(--t-text)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]")}
        title={selected.join(", ")}
      >
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">{label}</span>
        <span className="truncate flex-1 text-left">{resumen}</span>
        <span className="text-[8px] opacity-70">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-[200px] max-h-[280px] overflow-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-xl">
          <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--t-border)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
            <span>{label}</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-[var(--t-accent)] hover:underline">limpiar</button>
            )}
          </div>
          {options.length === 0 && <div className="px-2 py-2 text-[10px] text-[var(--t-text-muted)]">sin opciones</div>}
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-[var(--t-surface)] cursor-pointer">
              <input type="checkbox" checked={sel.has(o.value)} onChange={() => toggle(o.value)}
                className="accent-[var(--t-accent)]" />
              <span className="truncate flex-1" title={o.label}>{o.label}</span>
              {o.n != null && <span className="text-[9px] text-[var(--t-text-muted)]">({o.n})</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function OperadoresView() {
  const [combos, setCombos] = useState<Combo[]>([]);
  // Filtros multi (arrays) + moneda, persisten entre rutas. [] = sin filtro (Todos).
  const [operador, setOperador] = usePersistedState<string[]>("operadores.operador", []);
  const [nivel1, setNivel1] = usePersistedState<string[]>("operadores.nivel1", []);
  const [nivel2, setNivel2] = usePersistedState<string[]>("operadores.nivel2", []);
  const [nivel3, setNivel3] = usePersistedState<string[]>("operadores.nivel3", []);
  const [nivel4, setNivel4] = usePersistedState<string[]>("operadores.nivel4", []);
  const [nivel5, setNivel5] = usePersistedState<string[]>("operadores.nivel5", []);
  const [referido, setReferido] = usePersistedState<string[]>("operadores.referido", []);
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

        // Arranca en el operador logueado si está registrado (y si no hay selección previa).
        let miEmail: string | null = null;
        if (rMe.ok) {
          try { miEmail = ((await rMe.json())?.email ?? null) as string | null; } catch { /* no-JSON */ }
        }
        const mio = miEmail
          ? cs.find((c) => c.operador_email?.toLowerCase() === miEmail!.toLowerCase())
          : undefined;
        if (mio) setOperador((s) => (s.length ? s : [mio.operador_email]));
      } catch { /* la vista muestra su propio vacío/error */ }
    })();
  }, []);

  // ── Cross-filter: cada dropdown ofrece SOLO lo compatible con los OTROS. ──
  const S = (a: string[]) => new Set(a);
  const opSet = S(operador), n1Set = S(nivel1), n2Set = S(nivel2), n3Set = S(nivel3),
        n4Set = S(nivel4), n5Set = S(nivel5), refSet = S(referido);
  const mOp  = (c: Combo) => opSet.size === 0 || (!!c.operador_email && opSet.has(c.operador_email));
  const mN1  = (c: Combo) => n1Set.size === 0 || (!!c.nivel_1 && n1Set.has(c.nivel_1));
  const mN2  = (c: Combo) => n2Set.size === 0 || (!!c.nivel_2 && n2Set.has(c.nivel_2));
  const mN3  = (c: Combo) => n3Set.size === 0 || (!!c.nivel_3 && n3Set.has(c.nivel_3));
  const mN4  = (c: Combo) => n4Set.size === 0 || (!!c.nivel_4 && n4Set.has(c.nivel_4));
  const mN5  = (c: Combo) => n5Set.size === 0 || (!!c.nivel_5 && n5Set.has(c.nivel_5));
  const mRef = (c: Combo) => refSet.size === 0 || (!!c.referido && refSet.has(c.referido));

  // Operadores compatibles con los OTROS filtros (con nº de cuentas sumado).
  const operadores = useMemo(() => {
    const m = new Map<string, { email: string; nombre: string | null; n: number }>();
    for (const c of combos) {
      if (!mN1(c) || !mN2(c) || !mN3(c) || !mN4(c) || !mN5(c) || !mRef(c)) continue;
      if (!c.operador_email) continue;
      const cur = m.get(c.operador_email) ?? { email: c.operador_email, nombre: c.operador_nombre, n: 0 };
      cur.n += c.n_cuentas;
      m.set(c.operador_email, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [combos, nivel1, nivel2, nivel3, nivel4, nivel5, referido]);

  // Cada nivel/referido ofrece solo lo compatible con las OTRAS dimensiones.
  const valoresDe = (campo: keyof Combo, omit: (c: Combo) => boolean) => {
    const s = new Set<string>();
    for (const c of combos) {
      if (omit(c)) continue;
      const v = c[campo];
      if (typeof v === "string" && v) s.add(v);
    }
    return [...s].sort();
  };
  const niveles1 = useMemo(() => valoresDe("nivel_1", (c) => !(mOp(c) && mN2(c) && mN3(c) && mN4(c) && mN5(c) && mRef(c))),
    [combos, operador, nivel2, nivel3, nivel4, nivel5, referido]);
  const niveles2 = useMemo(() => valoresDe("nivel_2", (c) => !(mOp(c) && mN1(c) && mN3(c) && mN4(c) && mN5(c) && mRef(c))),
    [combos, operador, nivel1, nivel3, nivel4, nivel5, referido]);
  const niveles3 = useMemo(() => valoresDe("nivel_3", (c) => !(mOp(c) && mN1(c) && mN2(c) && mN4(c) && mN5(c) && mRef(c))),
    [combos, operador, nivel1, nivel2, nivel4, nivel5, referido]);
  const niveles4 = useMemo(() => valoresDe("nivel_4", (c) => !(mOp(c) && mN1(c) && mN2(c) && mN3(c) && mN5(c) && mRef(c))),
    [combos, operador, nivel1, nivel2, nivel3, nivel5, referido]);
  const niveles5 = useMemo(() => valoresDe("nivel_5", (c) => !(mOp(c) && mN1(c) && mN2(c) && mN3(c) && mN4(c) && mRef(c))),
    [combos, operador, nivel1, nivel2, nivel3, nivel4, referido]);
  const referidos = useMemo(() => valoresDe("referido", (c) => !(mOp(c) && mN1(c) && mN2(c) && mN3(c) && mN4(c) && mN5(c))),
    [combos, operador, nivel1, nivel2, nivel3, nivel4, nivel5]);

  // Si una selección dejó de ser compatible (la achicó otra), la podamos.
  const prune = (sel: string[], validos: string[], set: (v: string[]) => void) => {
    if (sel.length && validos.length) {
      const ok = new Set(validos);
      const next = sel.filter((v) => ok.has(v));
      if (next.length !== sel.length) set(next);
    }
  };
  useEffect(() => { prune(nivel1, niveles1, setNivel1); }, [niveles1]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prune(nivel2, niveles2, setNivel2); }, [niveles2]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prune(nivel3, niveles3, setNivel3); }, [niveles3]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prune(nivel4, niveles4, setNivel4); }, [niveles4]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prune(nivel5, niveles5, setNivel5); }, [niveles5]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prune(referido, referidos, setReferido); }, [referidos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (operador.length && operadores.length) {
      const ok = new Set(operadores.map((o) => o.email));
      const next = operador.filter((v) => ok.has(v));
      if (next.length !== operador.length) setOperador(next);
    }
  }, [operadores]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Operadores
        </span>
        {combos.length > 0 && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <MultiSelect label="Operador" selected={operador} onChange={setOperador}
              options={operadores.map((o) => ({ value: o.email, label: o.nombre || o.email, n: o.n }))} width="max-w-[240px]" />
            <MultiSelect label="Nivel 1" selected={nivel1} onChange={setNivel1}
              options={niveles1.map((n) => ({ value: n, label: n }))} width="max-w-[180px]" />
            <MultiSelect label="Nivel 2" selected={nivel2} onChange={setNivel2}
              options={niveles2.map((n) => ({ value: n, label: n }))} width="max-w-[180px]" />
            <MultiSelect label="Nivel 3" selected={nivel3} onChange={setNivel3}
              options={niveles3.map((n) => ({ value: n, label: n }))} width="max-w-[180px]" />
            <MultiSelect label="Nivel 4" selected={nivel4} onChange={setNivel4}
              options={niveles4.map((n) => ({ value: n, label: n }))} width="max-w-[180px]" />
            <MultiSelect label="Nivel 5" selected={nivel5} onChange={setNivel5}
              options={niveles5.map((n) => ({ value: n, label: n }))} width="max-w-[180px]" />
            <MultiSelect label="Referido" selected={referido} onChange={setReferido}
              options={referidos.map((n) => ({ value: n, label: n }))} width="max-w-[180px]" />
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
          operador={operador}
          moneda={moneda}
          nivel1={nivel1}
          nivel2={nivel2}
          nivel3={nivel3}
          nivel4={nivel4}
          nivel5={nivel5}
          referido={referido}
        />
      </div>
    </div>
  );
}
