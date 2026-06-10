"use client";

import { useEffect, useMemo, useState } from "react";
import { SensibilidadTable } from "./sensibilidad-table";
import { DescomposicionTab } from "./descomposicion-tab";
import { CompararInversionView, type BonoSeleccionable } from "./comparar-inversion-view";
import { Panel } from "./panel";

// "RETORNO TOTAL" y "CANJE" se migraron a la HOME. Acá quedan las 3 herramientas
// de estrategia, ahora en paneles apilados expandibles (no tabs) con un filtro
// de curva compartido arriba que scopea la selección de instrumentos.

// Agrupa el campo `curva` crudo en familias amigables para el filtro.
function grupoCurva(curva: string): string {
  const c = (curva || "").toLowerCase();
  if (c.startsWith("on")) return "ONs";
  if (c === "cer") return "CER";
  if (c === "tasa_fija") return "Tasa Fija";
  if (c === "dolar_linked") return "Dólar-Linked";
  if (c === "globales" || c === "bonares" || c === "soberanos") return "Soberanos";
  return curva ? curva.charAt(0).toUpperCase() + curva.slice(1) : "Otros";
}

export function RetornoTotalView() {
  const [bonos, setBonos] = useState<BonoSeleccionable[]>([]);
  const [curva, setCurva] = useState<string>("Todas");

  useEffect(() => {
    fetch("/api/comparar/bonos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setBonos(j as BonoSeleccionable[]))
      .catch(() => {
        /* sin lista → Comparar muestra vacío, no rompe la vista */
      });
  }, []);

  // Familias presentes en la data (no hardcodeado) + "Todas".
  const grupos = useMemo(() => {
    const set = new Set(bonos.map((b) => grupoCurva(b.curva)));
    return ["Todas", ...Array.from(set).sort()];
  }, [bonos]);

  const bonosFiltrados = useMemo(
    () => (curva === "Todas" ? bonos : bonos.filter((b) => grupoCurva(b.curva) === curva)),
    [bonos, curva],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Barra: título + filtro de curva (scopea la elección de instrumentos de Comparar) */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-2">
          ESTRATEGIA
        </span>
        <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wide mr-1">
          Curva:
        </span>
        {grupos.map((g) => (
          <FilterPill key={g} label={g} active={curva === g} onClick={() => setCurva(g)} />
        ))}
      </div>

      {/* 3 paneles apilados; cada uno se expande a pantalla completa (botón ⤢) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="h-[380px] shrink-0">
          <Panel title="Comparar Inversión" sub="elegí A y B" fill expandable>
            <CompararInversionView bonos={bonosFiltrados} />
          </Panel>
        </div>
        <div className="h-[380px] shrink-0">
          <Panel title="Análisis de Sensibilidad" fill expandable>
            <SensibilidadTable />
          </Panel>
        </div>
        <div className="h-[460px] shrink-0">
          <Panel title="Descomposición" fill expandable>
            <DescomposicionTab />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {label}
    </button>
  );
}
