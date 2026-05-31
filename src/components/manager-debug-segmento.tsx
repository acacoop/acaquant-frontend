"use client";

/**
 * Panel "DEBUG SEGMENTO" — /manager → VALIDACIONES → DEBUG SEGMENTO.
 *
 * Audit auditable del cálculo de nivel_3 (segmento patrimonial) para una
 * cuenta puntual: muestra el cupo crudo, el tipo de cambio usado (MEP o
 * UVA), la conversión paso a paso, y compara el nivel_3 que está en Mongo
 * vs lo que daría recalculado ahora. Sirve para validar manualmente que
 * el motor de segmentación clasificó bien — sin tener que entrar a Mongo.
 *
 * Consume: GET /api/manager/comercial/debug-segmento?id_cuenta=X
 */
import { useEffect, useMemo, useState } from "react";

type Cuenta = { id_cuenta: string; denominacion?: string | null };

type DebugResp = {
  id_cuenta: string;
  denominacion: string | null;
  tipo_cliente: string | null;
  clasificacion: "PH" | "PJ" | null;
  nivel_1: string | null;
  cupo: {
    transaccional_ars: number | null;
    usado_ars: number | null;
    cargado_en: string | null;
    fuente: string | null;
  };
  tc: {
    factor: number | null;
    unidad: "USD" | "UVA" | null;
    fuente: string | null;
    mep_timestamp: string | null;
  };
  cupo_convertido: number | null;
  nivel_3_actual: string | null;
  nivel_3_recalculado: string | null;
  sincronizado: boolean;
  umbrales: {
    PH_USD: Record<string, string>;
    PJ_UVA: Record<string, string>;
  };
};

const fmtArs = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return "$ " + Math.round(n).toLocaleString("es-AR");
};
const fmt2 = (n: number | null | undefined, suf = ""): string => {
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + suf;
};
const fmtFecha = (s: string | null): string => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString("es-AR");
};

export function ManagerDebugSegmentoPanel() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [pick, setPick] = useState<string>("");
  const [data, setData] = useState<DebugResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar el master de cuentas para el datalist (1 vez al montar).
  useEffect(() => {
    fetch("/api/manager/clientes")
      .then((r) => r.json())
      .then((d: { clientes: Cuenta[] }) => setCuentas(d.clientes || []))
      .catch(() => setCuentas([]));
  }, []);

  const cuentasIdx = useMemo(() => {
    const m = new Map<string, Cuenta>();
    for (const c of cuentas) m.set(c.id_cuenta, c);
    return m;
  }, [cuentas]);

  // El usuario escribe / pega un valor del datalist con formato "ID — denominacion".
  // Extraemos el id_cuenta (antes del " — ").
  const idFromPick = (s: string): string => s.split(" — ")[0].trim();

  const onConsultar = async () => {
    const id = idFromPick(pick);
    if (!id) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/manager/comercial/debug-segmento?id_cuenta=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} — ${t.slice(0, 200) || r.statusText}`);
      }
      setData((await r.json()) as DebugResp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3 font-mono text-[11px]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-widest">Cuenta:</span>
        <input
          list="cuentas-list"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onConsultar(); }}
          placeholder="ID o denominación…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[420px]"
        />
        <datalist id="cuentas-list">
          {cuentas.map((c) => (
            <option key={c.id_cuenta} value={`${c.id_cuenta} — ${c.denominacion || ""}`} />
          ))}
        </datalist>
        <button
          onClick={onConsultar}
          disabled={loading || !pick}
          className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {loading ? "Consultando…" : "Consultar"}
        </button>
        <span className="text-[10px] text-[var(--t-text-muted)]">{cuentas.length} cuentas cargadas</span>
      </div>

      {error && (
        <div className="px-3 py-2 mb-3 text-[11px] bg-[#1a0c0c] text-red-400 border border-[#2a1010]">
          {error}
        </div>
      )}

      {!data && !error && !loading && (
        <div className="text-[var(--t-text-muted)] text-[11px]">
          Elegí una cuenta y dale Consultar para ver cómo se calcula su nivel_3 (segmento patrimonial).
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-3">
          {/* IZQUIERDA — Identificación + cupo crudo */}
          <Section title="CUENTA">
            <Row k="id_cuenta" v={data.id_cuenta} />
            <Row k="denominación" v={data.denominacion ?? "—"} />
            <Row k="tipo_cliente" v={data.tipo_cliente ?? "—"} />
            <Row k="clasificación" v={
              <span className={data.clasificacion === "PH" ? "text-[#5fa8d0]" : data.clasificacion === "PJ" ? "text-[#5dd6a0]" : "text-[var(--t-text-dim)]"}>
                {data.clasificacion ?? "(sin clasificar)"}
              </span>
            } />
            <Row k="nivel_1" v={data.nivel_1 ?? "—"} />
          </Section>

          <Section title="CUPO (CRUDO desde Mongo)">
            <Row k="transaccional ARS" v={<span className="text-[var(--t-accent)] font-semibold">{fmtArs(data.cupo.transaccional_ars)}</span>} />
            <Row k="usado ARS" v={fmtArs(data.cupo.usado_ars)} />
            <Row k="cargado_en" v={fmtFecha(data.cupo.cargado_en)} />
            <Row k="fuente" v={data.cupo.fuente ?? "—"} />
          </Section>

          {/* DERECHA — TC + cálculo + resultado */}
          <Section title={`TIPO DE CAMBIO USADO (${data.tc.unidad ?? "—"})`}>
            <Row k="factor" v={
              <span className="text-[var(--t-text)]">{fmt2(data.tc.factor)} <span className="text-[var(--t-text-muted)] ml-1">({data.tc.unidad ?? "—"} / ARS)</span></span>
            } />
            <Row k="fuente" v={data.tc.fuente ?? "—"} />
            {data.tc.mep_timestamp && <Row k="mep timestamp" v={fmtFecha(data.tc.mep_timestamp)} />}
          </Section>

          <Section title="CÁLCULO">
            {data.cupo.transaccional_ars != null && data.tc.factor != null ? (
              <>
                <Row k="paso 1" v={
                  <span className="text-[var(--t-text-dim)]">
                    {fmtArs(data.cupo.transaccional_ars)} <span className="text-[var(--t-text-muted)]">/</span> {fmt2(data.tc.factor)}
                  </span>
                } />
                <Row k="resultado" v={
                  <span className="text-[var(--t-accent)] font-semibold">
                    {fmt2(data.cupo_convertido, ` ${data.tc.unidad ?? ""}`)}
                  </span>
                } />
              </>
            ) : (
              <div className="text-[var(--t-text-dim)] text-[10px]">
                No se puede calcular: falta cupo cargado o factor de conversión (MEP/UVA).
              </div>
            )}
          </Section>

          {/* RESULTADO + chequeo de sincronización */}
          <div className="col-span-2">
            <Section title="RESULTADO — NIVEL_3">
              <Row k="actual (en Mongo)" v={<span className="text-[var(--t-text)]">{data.nivel_3_actual ?? "—"}</span>} />
              <Row k="recalculado AHORA" v={<span className="text-[var(--t-text)]">{data.nivel_3_recalculado ?? "—"}</span>} />
              <Row k="¿sincronizado?" v={
                data.sincronizado ? (
                  <span className="text-[#5dd6a0] font-semibold">✓ SÍ (la base está al día)</span>
                ) : (
                  <span className="text-[#ff5d6c] font-semibold">✗ NO — correr `jobs.segmentar_patrimonial --apply` para alinear</span>
                )
              } />
            </Section>
          </div>

          {/* Umbrales — referencia */}
          <div className="col-span-2">
            <Section title="UMBRALES (referencia)">
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div>
                  <div className="text-[10px] text-[#5fa8d0] mb-1">PH (USD vía MEP)</div>
                  {Object.entries(data.umbrales.PH_USD).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-[var(--t-border)] py-0.5">
                      <span className="text-[var(--t-text)]">{k}</span>
                      <span className="text-[var(--t-text-dim)]">{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[10px] text-[#5dd6a0] mb-1">PJ (UVAs)</div>
                  {Object.entries(data.umbrales.PJ_UVA).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-[var(--t-border)] py-0.5">
                      <span className="text-[var(--t-text)]">{k}</span>
                      <span className="text-[var(--t-text-dim)]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 text-[10px] font-semibold text-[var(--t-accent)] tracking-wider uppercase">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--t-border)] py-1">
      <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-widest">{k}</span>
      <span className="text-[11px]">{v}</span>
    </div>
  );
}
