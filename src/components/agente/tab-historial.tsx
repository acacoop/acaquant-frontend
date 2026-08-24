"use client";

// HISTORIAL — EL LIBRO DE AUDITORÍA. Doc: `docs/AGENT_2.0.md` §6.6.
//
// Es la única pantalla del agente viejo que no tenía el vicio de las otras: no
// opina. Dice quién tocó qué, cuándo, de qué valor a qué valor, y en qué tabla
// escribió. Eso es lo que hace confiable a algo que escribe en la base.
//
// Tres cosas cambiaron:
//
//   1. UNA fuente, UN tope, PAGINADO del backend. Antes se armaba en el
//      navegador juntando tres fuentes con topes distintos (100 acciones, 40
//      respuestas, 80 votos): cuando el más chico se agotaba, la línea de
//      tiempo perdía un tipo de evento y no los otros, sin decirlo.
//   2. EL FILTRO también es del backend. Un buscador que solo mira lo que ya
//      bajó no es un buscador.
//   3. Cada acción guarda `habilidad + sujeto + regla`, así que la columna HOY
//      —«¿quedó arreglado?»— puede contestar. Antes la mayoría de las acciones
//      no guardaban qué las motivó.
import { useCallback, useEffect, useState } from "react";

import { fechaHora, type Accion, type Historial } from "@/components/agente/tipos";

const ESTADO: Record<string, { txt: string; color: string }> = {
  nuevo: { txt: "sigue abierto", color: "var(--t-neg)" },
  en_curso: { txt: "esperando confirmación", color: "var(--t-accent)" },
  resuelto: { txt: "quedó arreglado", color: "var(--t-pos)" },
  reincidio: { txt: "⚠ volvió", color: "var(--t-neg)" },
  ignorado: { txt: "ignorado", color: "var(--t-text-dim)" },
};

export function TabHistorial({ leer }: { leer: <T>(url: string) => Promise<T> }) {
  const [datos, setDatos] = useState<Historial | null>(null);
  const [q, setQ] = useState("");
  const [soloMalas, setSoloMalas] = useState(false);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async (desdeId?: number) => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ limite: "200" });
      if (q.trim()) p.set("q", q.trim());
      if (soloMalas) p.set("solo_malas", "true");
      if (desdeId) p.set("desde_id", String(desdeId));
      const d = await leer<Historial>(`/api/agente/historial?${p}`);
      setDatos((prev) => desdeId && prev
        ? { ...d, filas: [...prev.filas, ...d.filas] } : d);
    } finally { setCargando(false); }
  }, [leer, q, soloMalas]);

  // Se recarga al cambiar el filtro: es del backend, no del navegador.
  useEffect(() => {
    const id = setTimeout(() => void cargar(), 250);
    return () => clearTimeout(id);
  }, [cargar]);

  const filas: Accion[] = datos?.filas ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar (bono, arreglo, tabla, quién)…"
          className="text-[10px] bg-[var(--t-panel)] border border-[var(--t-border)] px-2 py-1 flex-1 min-w-[180px] text-[var(--t-text)]"
        />
        <label className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] flex items-center gap-1">
          <input type="checkbox" checked={soloMalas}
                 onChange={(e) => setSoloMalas(e.target.checked)} />
          solo las que fallaron
        </label>
      </div>

      {!filas.length && !cargando && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          El agente todavía no escribió nada.
        </p>
      )}

      <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {filas.map((a) => {
          const est = a.estado_hoy ? ESTADO[a.estado_hoy] : null;
          return (
            <div key={a.id} className="px-2 py-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
                {fechaHora(a.at)}
              </span>
              <span className={`text-[10px] font-bold ${
                a.ok ? "text-[var(--t-text)]" : "text-[var(--t-neg)]"}`}>
                {a.arreglo}
              </span>
              <span className="text-[10px] text-[var(--t-text-muted)]">{a.sujeto}</span>
              {/* La REGLA que la motivó: es lo que le permite a la columna
                  HOY decir de qué problema habla. */}
              <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                {a.habilidad} · {a.regla}
              </span>
              {(a.antes || a.despues) && (
                <span className="text-[9px] tabular-nums text-[var(--t-text-muted)]">
                  {a.campo}: <s>{a.antes || "—"}</s> → <b>{a.despues || "—"}</b>
                </span>
              )}
              {a.donde && (
                <span className="text-[8px] text-[var(--t-text-dim)]">→ {a.donde}</span>
              )}
              {a.por && (
                <span className="text-[8px] text-[var(--t-text-dim)]">{a.por}</span>
              )}
              {est && (
                <span className="text-[9px] font-bold ml-auto whitespace-nowrap"
                      style={{ color: est.color }}>{est.txt}</span>
              )}
              {!a.ok && a.error && (
                <span className="text-[9px] text-[var(--t-neg)] w-full">{a.error}</span>
              )}
            </div>
          );
        })}
      </div>

      {datos?.hay_mas && (
        <button
          disabled={cargando}
          onClick={() => void cargar(datos.ultimo_id ?? undefined)}
          className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {cargando ? "…" : "ver más"}
        </button>
      )}
    </div>
  );
}
