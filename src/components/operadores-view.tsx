"use client";

import { useEffect, useState } from "react";
import { ComercialOperacionesView, type Operador } from "./comercial-operaciones-view";

// /operadores (ex tab COMERCIAL de /operaciones). El selector de operador +
// moneda vive en la barra de arriba y se pasa como prop a la vista.
export function OperadoresView() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operador, setOperador] = useState<string>("");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");

  useEffect(() => {
    void (async () => {
      try {
        // Traigo la lista de operadores y, en paralelo, mi identidad (/api/me).
        const [rOps, rMe] = await Promise.all([
          fetch("/api/operaciones/comercial/operadores", { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" }),
        ]);
        if (!rOps.ok) return;
        const d: Operador[] = await rOps.json();
        setOperadores(d);

        // Email del usuario logueado (si /api/me falla, queda null y caemos
        // al comportamiento previo: primer operador de la lista).
        let miEmail: string | null = null;
        if (rMe.ok) {
          try {
            miEmail = ((await rMe.json())?.email ?? null) as string | null;
          } catch {
            /* body no-JSON — ignoramos */
          }
        }

        // Si tu email está registrado como operador, arrancás viendo el TUYO.
        // Si no sos operador (manager/admin/etc.), primer operador de la lista
        // (igual que antes). Match case-insensitive.
        const mio = miEmail
          ? d.find((o) => o.operador_email?.toLowerCase() === miEmail.toLowerCase())
          : undefined;
        setOperador((s) => s || (mio?.operador_email ?? d[0]?.operador_email ?? ""));
      } catch {
        // silencioso — la vista muestra su propio estado de error/vacío.
      }
    })();
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Operadores
        </span>
        {operadores.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">OPERADOR</span>
            <select
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none max-w-[280px]"
            >
              <option value="__todos__">— Todos los operadores —</option>
              {operadores.map((o) => (
                <option key={o.operador_email} value={o.operador_email}>
                  {(o.operador_nombre || o.operador_email)} ({o.n_cuentas})
                </option>
              ))}
            </select>
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
        <ComercialOperacionesView operador={operador} moneda={moneda} />
      </div>
    </div>
  );
}
