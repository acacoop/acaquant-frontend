"use client";

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos sincronizados con CarteraRequest del backend (api/agent/structured/cartera.py)
// ─────────────────────────────────────────────────────────────────────────────

export type Perfil = "conservador" | "moderado" | "agresivo";
export type Exposicion = "pesos" | "usd" | "mixta";
export type Plazo = "corto" | "medio" | "largo";
export type Benchmark = "inflacion" | "mep" | "tasa_caucion" | "sin_benchmark";

export interface CarteraRequest {
  perfil: Perfil;
  exposicion: Exposicion;
  plazo: Plazo;
  benchmark: Benchmark;
  monto_estimado_ars?: number | null;
  restricciones?: string[];
}

const PERFIL_OPTS: { v: Perfil; label: string }[] = [
  { v: "conservador", label: "Conservador" },
  { v: "moderado", label: "Moderado" },
  { v: "agresivo", label: "Agresivo" },
];

const EXPOSICION_OPTS: { v: Exposicion; label: string }[] = [
  { v: "pesos", label: "Pesos" },
  { v: "usd", label: "Dólares" },
  { v: "mixta", label: "Mixta" },
];

const PLAZO_OPTS: { v: Plazo; label: string; help: string }[] = [
  { v: "corto", label: "Corto", help: "<6m" },
  { v: "medio", label: "Medio", help: "6-18m" },
  { v: "largo", label: "Largo", help: ">18m" },
];

const BENCHMARK_OPTS: { v: Benchmark; label: string }[] = [
  { v: "inflacion", label: "Inflación" },
  { v: "mep", label: "MEP" },
  { v: "tasa_caucion", label: "Tasa caución" },
  { v: "sin_benchmark", label: "Sin benchmark" },
];

interface Props {
  initial?: Partial<CarteraRequest>;
  onSubmit: (req: CarteraRequest) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function CarteraForm({ initial, onSubmit, onCancel, loading = false }: Props) {
  const [perfil, setPerfil] = useState<Perfil>(initial?.perfil ?? "moderado");
  const [exposicion, setExposicion] = useState<Exposicion>(initial?.exposicion ?? "pesos");
  const [plazo, setPlazo] = useState<Plazo>(initial?.plazo ?? "medio");
  const [benchmark, setBenchmark] = useState<Benchmark>(initial?.benchmark ?? "inflacion");
  const [monto, setMonto] = useState<string>(
    initial?.monto_estimado_ars ? String(initial.monto_estimado_ars) : "",
  );
  const [restricciones, setRestricciones] = useState<string>(
    initial?.restricciones?.join(", ") ?? "",
  );

  function handleSubmit() {
    const req: CarteraRequest = {
      perfil,
      exposicion,
      plazo,
      benchmark,
    };
    const montoNum = monto.trim() ? parseInt(monto.replace(/\D/g, ""), 10) : null;
    if (montoNum && !Number.isNaN(montoNum) && montoNum > 0) {
      req.monto_estimado_ars = montoNum;
    }
    const restList = restricciones
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (restList.length > 0) {
      req.restricciones = restList;
    }
    onSubmit(req);
  }

  return (
    <div className="border border-[#ff9900]/40 bg-[#ff9900]/5 p-3 font-mono text-[11px]">
      <div className="text-[10px] text-[#ff9900] uppercase tracking-widest mb-2">
        Recomendar cartera
      </div>

      <Field label="PERFIL DE RIESGO">
        <ChipGroup
          options={PERFIL_OPTS}
          value={perfil}
          onChange={(v) => setPerfil(v as Perfil)}
          disabled={loading}
        />
      </Field>

      <Field label="EXPOSICIÓN">
        <ChipGroup
          options={EXPOSICION_OPTS}
          value={exposicion}
          onChange={(v) => setExposicion(v as Exposicion)}
          disabled={loading}
        />
      </Field>

      <Field label="PLAZO">
        <ChipGroup
          options={PLAZO_OPTS}
          value={plazo}
          onChange={(v) => setPlazo(v as Plazo)}
          disabled={loading}
        />
      </Field>

      <Field label="BENCHMARK">
        <ChipGroup
          options={BENCHMARK_OPTS}
          value={benchmark}
          onChange={(v) => setBenchmark(v as Benchmark)}
          disabled={loading}
        />
      </Field>

      <Field label="MONTO ESTIMADO (ARS, opcional)">
        <input
          type="text"
          inputMode="numeric"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="ej: 50000000"
          disabled={loading}
          className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none disabled:opacity-50"
        />
      </Field>

      <Field label="RESTRICCIONES (opcional, separadas por coma)">
        <input
          type="text"
          value={restricciones}
          onChange={(e) => setRestricciones(e.target.value)}
          placeholder="ej: sin_HD, sin_duration_mayor_1y"
          disabled={loading}
          className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none disabled:opacity-50"
        />
      </Field>

      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-[#1a1a1a]">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="text-[10px] px-3 py-1 bg-[#ff9900] text-black hover:bg-[#ffb84d] disabled:bg-[#1a1a1a] disabled:text-[#555555] uppercase tracking-wide font-semibold"
        >
          {loading ? "Generando…" : "Generar cartera"}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="text-[10px] px-2 py-1 text-[#888888] hover:text-[#d0d0d0] uppercase tracking-wide disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[9px] text-[#555555] uppercase tracking-wide mb-1">{label}</div>
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { v: string; label: string; help?: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          disabled={disabled}
          className={`px-2 py-0.5 text-[10px] border ${
            value === o.v
              ? "bg-[#ff9900] text-black border-[#ff9900]"
              : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
          } disabled:opacity-40`}
        >
          {o.label}
          {o.help && <span className="ml-1 text-[8px] opacity-70">{o.help}</span>}
        </button>
      ))}
    </div>
  );
}
