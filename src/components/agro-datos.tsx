"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, fmtHoraAR } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 10_000;
const SAVE_DEBOUNCE_MS = 800;

const CEREALES = ["TRIGO", "MAIZ", "GIRASOL", "SOJA", "SORGO"] as const;
type Cereal = (typeof CEREALES)[number];

type ManualLeg = "ars" | "usd";

// SOJA se carga en ARS; el resto en USD. La otra pata la deriva el backend con
// el dólar Banco Nación.
function manualLeg(cereal: string): ManualLeg {
  return cereal === "SOJA" ? "ars" : "usd";
}

interface CamaraRow {
  cereal: Cereal;
  precio_ars: number | null;
  precio_usd: number | null;
  manual_leg: ManualLeg;
  updated_by: string | null;
  updated_at: string | null;
}

interface CamaraResp {
  ts: string;
  dolar_bna: number | null;
  cereales: CamaraRow[];
}

interface TasasResp {
  tasa_on: number | null;
  tasa_pagare: number | null;
  tasa_caucion_7d: number | null;
  tasa_caucion_7d_usd: number | null;
  updated_by: string | null;
  updated_at: string | null;
}

const EMPTY_TASAS: TasasResp = {
  tasa_on: null,
  tasa_pagare: null,
  tasa_caucion_7d: null,
  tasa_caucion_7d_usd: null,
  updated_by: null,
  updated_at: null,
};

interface DescuentoCaucionRow {
  commodity: string;
  precio_ars: number | null;
  descuento_cau_7d: number | null;
}

interface DescuentoCaucionResp {
  ts: string;
  tasa_caucion_7d: number | null;
  commodities: DescuentoCaucionRow[];
}

const EMPTY_DESCUENTO: DescuentoCaucionResp = {
  ts: "",
  tasa_caucion_7d: null,
  commodities: [],
};

interface DolaresResp {
  dolar_bna: number | null;
  dolar_matba: number | null;
  bna_comprador_t1: number | null;
  updated_by: string | null;
  updated_at: string | null;
}

const EMPTY_DOLARES: DolaresResp = {
  dolar_bna: null,
  dolar_matba: null,
  bna_comprador_t1: null,
  updated_by: null,
  updated_at: null,
};

const EMPTY: CamaraResp = {
  ts: "",
  dolar_bna: null,
  cereales: CEREALES.map((c) => ({
    cereal: c,
    precio_ars: null,
    precio_usd: null,
    manual_leg: manualLeg(c),
    updated_by: null,
    updated_at: null,
  })),
};

function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function AgroDatos() {
  const { data } = usePoll<CamaraResp>(
    "/api/derivados-agro/camara",
    EMPTY,
    POLL_MS,
    { fetchOnMount: true },
  );

  return (
    <div className="h-full min-h-0 p-3 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
      <div className="flex flex-col gap-3">
        <DolaresReferenciaPanel />
        <TasasCoberturaPanel />
        <DescuentoCaucionPanel />
      </div>
      <div>
        <Panel title="CÁMARA ARBITRAL DE CEREALES — ROSARIO" expandable>
          <div className="px-2 pt-1 pb-2 text-[10px] text-[var(--t-text-muted)] leading-snug">
            El trader carga <span className="text-[var(--t-text-dim)]">UNA sola
            pata</span>: SOJA en ARS, el resto (Trigo/Maíz/Girasol/Sorgo) en USD.
            La otra se calcula sola con el{" "}
            <span className="text-[var(--t-text-dim)]">Dólar Banco Nación</span>{" "}
            {data.dolar_bna
              ? `($${fmtNum(data.dolar_bna, 2)})`
              : "(⚠ cargalo en Dólares de Referencia)"}
            . La celda en gris es la automática. Se reutiliza en Mejoras Dispo,
            Pase, etc.
          </div>
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)]">
              <tr>
                <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">
                  Cereal
                </th>
                <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                  Precio ARS
                </th>
                <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                  Precio USD
                </th>
                <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                  Últ. edición
                </th>
              </tr>
            </thead>
            <tbody>
              {CEREALES.map((cereal) => {
                const row =
                  data.cereales.find((r) => r.cereal === cereal) ??
                  ({
                    cereal,
                    precio_ars: null,
                    precio_usd: null,
                    manual_leg: manualLeg(cereal),
                    updated_by: null,
                    updated_at: null,
                  } as CamaraRow);
                return <CerealRow key={cereal} row={row} />;
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function CerealRow({ row }: { row: CamaraRow }) {
  const legArs = row.manual_leg === "ars";
  // Valor de la pata MANUAL (el editable) y de la DERIVADA (read-only).
  const manualVal = legArs ? row.precio_ars : row.precio_usd;
  const derivedVal = legArs ? row.precio_usd : row.precio_ars;

  const [txt, setTxt] = useState<string>(fmtNum(manualVal, 2));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState<null | boolean>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remote = useRef<string>(fmtNum(manualVal, 2));

  // Adopta el valor remoto si otro user editó, sin pisar lo que estoy tipeando.
  useEffect(() => {
    const next = fmtNum(manualVal, 2);
    if (next !== remote.current) {
      remote.current = next;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (txt !== next) setTxt(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualVal]);

  function parseInput(s: string): number | null {
    // Acepta "1.234,56" (es-AR) o "1234.56".
    if (!s) return null;
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }

  function onChange(v: string) {
    setTxt(v);
    const n = parseInput(v);
    if (n === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setSavedOk(null);
      try {
        // Solo se manda la pata manual; la otra la calcula el backend.
        const body = legArs ? { precio_ars: n } : { precio_usd: n };
        const res = await fetch(`/api/derivados-agro/camara/${row.cereal}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setSavedOk(res.ok);
      } catch {
        setSavedOk(false);
      } finally {
        setSaving(false);
        setTimeout(() => setSavedOk(null), 1500);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  const editHint = row.updated_at
    ? fmtHoraAR(new Date(row.updated_at).getTime())
    : "—";

  // Celda editable (pata manual) — input con prefijo de moneda + estado.
  const manualCell = (prefix: string, width: string) => (
    <div className="inline-flex items-center gap-1 justify-end">
      <span className="text-[var(--t-text-muted)] text-[10px]">{prefix}</span>
      <input
        type="text"
        inputMode="decimal"
        value={txt}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={`bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none ${width} text-right`}
      />
      {saving && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
      {savedOk === true && <span className="text-[9px] text-[var(--t-pos)]">✓</span>}
      {savedOk === false && <span className="text-[9px] text-[var(--t-neg)]">✗</span>}
    </div>
  );

  // Celda derivada (automática) — texto en gris, no editable.
  const derivedCell = (prefix: string) => (
    <span
      className="text-[var(--t-text-muted)]"
      title="Automático: calculado con el Dólar Banco Nación"
    >
      {derivedVal === null ? "—" : `${prefix}${fmtNum(derivedVal, 2)}`}
    </span>
  );

  return (
    <tr className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
      <td className="px-2 py-1.5 text-[var(--t-accent)] font-semibold tracking-wide">
        {row.cereal}
      </td>
      <td className="px-2 py-1.5 text-right">
        {legArs ? manualCell("$", "w-28") : derivedCell("$")}
      </td>
      <td className="px-2 py-1.5 text-right">
        {legArs ? derivedCell("US$ ") : manualCell("US$", "w-24")}
      </td>
      <td className="px-2 py-1.5 text-right text-[9px] text-[var(--t-text-muted)]">
        {editHint}
      </td>
    </tr>
  );
}

// ─── Tasas de cobertura (ON / Pagaré) ────────────────────────────────────────
// Dos inputs manuales GLOBALES (no por cereal). Alimentan las columnas
// Pagaré / ON del "Pase con Cobertura". El cálculo se define con la mesa;
// por ahora solo se persisten y se muestran.

function TasasCoberturaPanel() {
  const { data } = usePoll<TasasResp>(
    "/api/derivados-agro/tasas-cobertura",
    EMPTY_TASAS,
    POLL_MS,
    { fetchOnMount: true },
  );

  return (
    <div>
      <Panel title="TASAS DE COBERTURA — ON · PAGARÉ · CAUCIÓN 7D" expandable>
        <div className="px-2 pt-1 pb-2 text-[10px] text-[var(--t-text-muted)] leading-snug">
          Tasas manuales (TNA %) que carga el trader. ON y Pagaré alimentan esas
          columnas del <span className="text-[var(--t-text-dim)]">Pase con
          Cobertura</span>; Caución 7D calcula el{" "}
          <span className="text-[var(--t-text-dim)]">Descuento a Tasa de
          Caución</span> de abajo.
        </div>
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)]">
            <tr>
              <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">
                Instrumento
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Tasa (TNA %)
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Últ. edición
              </th>
            </tr>
          </thead>
          <tbody>
            <TasaRow
              label="PAGARÉ"
              field="tasa_pagare"
              value={data.tasa_pagare}
              updatedAt={data.updated_at}
            />
            <TasaRow
              label="ON"
              field="tasa_on"
              value={data.tasa_on}
              updatedAt={data.updated_at}
            />
            <TasaRow
              label="CAUCIÓN 7D ARS"
              field="tasa_caucion_7d"
              value={data.tasa_caucion_7d}
              updatedAt={data.updated_at}
            />
            <TasaRow
              label="CAUCIÓN 7D USD"
              field="tasa_caucion_7d_usd"
              value={data.tasa_caucion_7d_usd}
              updatedAt={data.updated_at}
            />
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ─── Descuento a Tasa de Caución de 7D (derivado, read-only) ─────────────────
// Precio disponible (Cámara) descontado a la tasa de caución 7D:
//   descuento = precio_ars × (1 − (tasa_caucion_7d/100) × 7/365)
// Es el "Monto Pesos Cau 7D" que consume cada card del Pase con Cobertura.
// Se calcula en el backend (única fuente de la fórmula); acá solo se muestra.

function DescuentoCaucionPanel() {
  const { data } = usePoll<DescuentoCaucionResp>(
    "/api/derivados-agro/descuento-caucion",
    EMPTY_DESCUENTO,
    POLL_MS,
    { fetchOnMount: true },
  );

  const sinTasa = data.tasa_caucion_7d === null;

  return (
    <div>
      <Panel title="DESCUENTO A TASA DE CAUCIÓN DE 7D" expandable>
        <div className="px-2 pt-1 pb-2 text-[10px] text-[var(--t-text-muted)] leading-snug">
          Precio disponible descontado a la tasa de caución 7D — calculado, no
          editable. {sinTasa && (
            <span className="text-[var(--t-warn,#c79a2e)]">
              Cargá la tasa Caución 7D arriba para verlo.
            </span>
          )}
        </div>
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)]">
            <tr>
              <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">
                Cereal
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Precio dispo ARS
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Descuento Cau 7D
              </th>
            </tr>
          </thead>
          <tbody>
            {data.commodities.map((r) => (
              <tr
                key={r.commodity}
                className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]"
              >
                <td className="px-2 py-1.5 text-[var(--t-accent)] font-semibold tracking-wide">
                  {r.commodity}
                </td>
                <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">
                  {r.precio_ars === null ? "—" : `$${fmtNum(r.precio_ars, 2)}`}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-[var(--t-text)]">
                  {r.descuento_cau_7d === null
                    ? "—"
                    : `$${fmtNum(r.descuento_cau_7d, 2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ─── Dólares de referencia (Banco Nación / Matba Rofex) ──────────────────────
// Dos cotizaciones manuales GLOBALES (no por cereal) que carga el trader.
// Alimentarán el cálculo del "Pase con Cobertura". Mismo patrón que las tasas:
// input con debounce → PATCH → confirmación inline.

function DolaresReferenciaPanel() {
  const { data } = usePoll<DolaresResp>(
    "/api/derivados-agro/dolares-referencia",
    EMPTY_DOLARES,
    POLL_MS,
    { fetchOnMount: true },
  );

  return (
    <div>
      <Panel title="DÓLARES DE REFERENCIA — BANCO NACIÓN · MATBA ROFEX" expandable>
        <div className="px-2 pt-1 pb-2 text-[10px] text-[var(--t-text-muted)] leading-snug">
          Banco Nación y BNA T-1 se cargan a mano; <span className="text-[var(--t-text-dim)]">MATBA ROFEX</span>{" "}
          sale automático del dólar oficial live (el mismo de la watchlist). Alimentan
          el <span className="text-[var(--t-text-dim)]">Pase con Cobertura</span>.
        </div>
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)]">
            <tr>
              <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">
                Dólar
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Cotización ($)
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Últ. edición
              </th>
            </tr>
          </thead>
          <tbody>
            <DolarRow
              label="BANCO NACIÓN"
              field="dolar_bna"
              value={data.dolar_bna}
              updatedAt={data.updated_at}
            />
            <DolarRow
              label="MATBA ROFEX"
              field="dolar_matba"
              value={data.dolar_matba}
              updatedAt={data.updated_at}
              auto
            />
            <DolarRow
              label="BNA COMPRADOR T-1"
              field="bna_comprador_t1"
              value={data.bna_comprador_t1}
              updatedAt={data.updated_at}
            />
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function DolarRow({
  label,
  field,
  value,
  updatedAt,
  auto = false,
}: {
  label: string;
  field: "dolar_bna" | "dolar_matba" | "bna_comprador_t1";
  value: number | null;
  updatedAt: string | null;
  // auto=true → valor read-only que sale del dólar oficial live (no editable).
  auto?: boolean;
}) {
  const [txt, setTxt] = useState<string>(fmtNum(value, 2));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState<null | boolean>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remote = useRef<string>(fmtNum(value, 2));

  // Adopta el valor remoto si otro user editó, sin pisar lo que estoy tipeando.
  useEffect(() => {
    const next = fmtNum(value, 2);
    if (next !== remote.current) {
      remote.current = next;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (txt !== next) setTxt(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function parseInput(s: string): number | null {
    if (!s) return null;
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }

  function onChange(v: string) {
    setTxt(v);
    const n = parseInput(v);
    if (n === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setSavedOk(null);
      try {
        const res = await fetch("/api/derivados-agro/dolares-referencia", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: n }),
        });
        setSavedOk(res.ok);
      } catch {
        setSavedOk(false);
      } finally {
        setSaving(false);
        setTimeout(() => setSavedOk(null), 1500);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  const editHint = auto
    ? "auto · dólar oficial"
    : updatedAt
    ? fmtHoraAR(new Date(updatedAt).getTime())
    : "—";

  return (
    <tr className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
      <td className="px-2 py-1.5 text-[var(--t-accent)] font-semibold tracking-wide">
        {label}
      </td>
      <td className="px-2 py-1.5 text-right">
        {auto ? (
          <span className="inline-flex items-center gap-1 justify-end" title="Sale del dólar oficial live (watchlist) — en real time, no se carga a mano">
            <span className="text-[var(--t-text-muted)] text-[10px]">$</span>
            <span className="w-28 inline-block text-right text-[11px] font-mono text-[var(--t-text)]">{txt || "—"}</span>
          </span>
        ) : (
          <div className="inline-flex items-center gap-1 justify-end">
            <span className="text-[var(--t-text-muted)] text-[10px]">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={txt}
              onChange={(e) => onChange(e.target.value)}
              placeholder="—"
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-28 text-right"
            />
            {saving && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
            {savedOk === true && (
              <span className="text-[9px] text-[var(--t-pos)]">✓</span>
            )}
            {savedOk === false && (
              <span className="text-[9px] text-[var(--t-neg)]">✗</span>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right text-[9px] text-[var(--t-text-muted)]">
        {editHint}
      </td>
    </tr>
  );
}

function TasaRow({
  label,
  field,
  value,
  updatedAt,
}: {
  label: string;
  field: "tasa_on" | "tasa_pagare" | "tasa_caucion_7d" | "tasa_caucion_7d_usd";
  value: number | null;
  updatedAt: string | null;
}) {
  const [txt, setTxt] = useState<string>(fmtNum(value, 2));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState<null | boolean>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remote = useRef<string>(fmtNum(value, 2));

  // Adopta el valor remoto si otro user editó, sin pisar lo que estoy tipeando.
  useEffect(() => {
    const next = fmtNum(value, 2);
    if (next !== remote.current) {
      remote.current = next;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (txt !== next) setTxt(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function parseInput(s: string): number | null {
    if (!s) return null;
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }

  function onChange(v: string) {
    setTxt(v);
    const n = parseInput(v);
    if (n === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setSavedOk(null);
      try {
        const res = await fetch("/api/derivados-agro/tasas-cobertura", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: n }),
        });
        setSavedOk(res.ok);
      } catch {
        setSavedOk(false);
      } finally {
        setSaving(false);
        setTimeout(() => setSavedOk(null), 1500);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  const editHint = updatedAt
    ? fmtHoraAR(new Date(updatedAt).getTime())
    : "—";

  return (
    <tr className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
      <td className="px-2 py-1.5 text-[var(--t-accent)] font-semibold tracking-wide">
        {label}
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex items-center gap-1 justify-end">
          <input
            type="text"
            inputMode="decimal"
            value={txt}
            onChange={(e) => onChange(e.target.value)}
            placeholder="—"
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-24 text-right"
          />
          <span className="text-[var(--t-text-muted)] text-[10px]">%</span>
          {saving && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
          {savedOk === true && (
            <span className="text-[9px] text-[var(--t-pos)]">✓</span>
          )}
          {savedOk === false && (
            <span className="text-[9px] text-[var(--t-neg)]">✗</span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right text-[9px] text-[var(--t-text-muted)]">
        {editHint}
      </td>
    </tr>
  );
}
