"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, fmtHoraAR } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 10_000;
const SAVE_DEBOUNCE_MS = 800;

const CEREALES = ["TRIGO", "MAIZ", "GIRASOL", "SOJA", "SORGO"] as const;
type Cereal = (typeof CEREALES)[number];

interface CamaraRow {
  cereal: Cereal;
  precio_ars: number | null;
  precio_usd: number | null;
  updated_by: string | null;
  updated_at: string | null;
}

interface CamaraResp {
  ts: string;
  cereales: CamaraRow[];
}

const EMPTY: CamaraResp = {
  ts: "",
  cereales: CEREALES.map((c) => ({
    cereal: c,
    precio_ars: null,
    precio_usd: null,
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
    <div className="h-full min-h-0 p-3 flex flex-col gap-3">
      <div className="max-w-2xl">
        <Panel title="CÁMARA ARBITRAL DE CEREALES — ROSARIO" expandable>
          <div className="px-2 pt-1 pb-2 text-[10px] text-[var(--t-text-muted)] leading-snug">
            Inputs manuales del trader. Ambas columnas (ARS y USD) se cargan
            por separado — no hay fórmula entre ellas. Estos valores se
            reutilizan en otras vistas (Mejoras Precio Dispo, etc.).
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
  const [ars, setArs] = useState<string>(fmtNum(row.precio_ars, 2));
  const [usd, setUsd] = useState<string>(fmtNum(row.precio_usd, 2));
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState<null | boolean>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteArs = useRef<string>(fmtNum(row.precio_ars, 2));
  const remoteUsd = useRef<string>(fmtNum(row.precio_usd, 2));

  // Sync con remoto si otro user editó (sin pisar lo que estoy tipeando).
  // Mismo pattern que PizarraRow — setState es para adoptar lo que llegó por
  // poll, no para reaccionar a un valor derivado: el lint rule no aplica.
  useEffect(() => {
    const newArs = fmtNum(row.precio_ars, 2);
    if (newArs !== remoteArs.current) {
      remoteArs.current = newArs;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (ars !== newArs) setArs(newArs);
    }
    const newUsd = fmtNum(row.precio_usd, 2);
    if (newUsd !== remoteUsd.current) {
      remoteUsd.current = newUsd;
      if (usd !== newUsd) setUsd(newUsd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.precio_ars, row.precio_usd]);

  function parseInput(s: string): number | null {
    // Acepta "1.234,56" (es-AR) o "1234.56".
    if (!s) return null;
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }

  function scheduleSave(payload: {
    precio_ars?: number;
    precio_usd?: number;
  }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setSavedOk(null);
      try {
        const res = await fetch(
          `/api/derivados-agro/camara/${row.cereal}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        setSavedOk(res.ok);
      } catch {
        setSavedOk(false);
      } finally {
        setSaving(false);
        setTimeout(() => setSavedOk(null), 1500);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function onArsChange(v: string) {
    setArs(v);
    const n = parseInput(v);
    if (n !== null) scheduleSave({ precio_ars: n });
  }
  function onUsdChange(v: string) {
    setUsd(v);
    const n = parseInput(v);
    if (n !== null) scheduleSave({ precio_usd: n });
  }

  const editHint =
    row.updated_at
      ? fmtHoraAR(new Date(row.updated_at).getTime())
      : "—";

  return (
    <tr className="border-b border-[#101010] hover:bg-[var(--t-surface)]">
      <td className="px-2 py-1.5 text-[var(--t-accent)] font-semibold tracking-wide">
        {row.cereal}
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex items-center gap-1 justify-end">
          <span className="text-[var(--t-text-muted)] text-[10px]">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={ars}
            onChange={(e) => onArsChange(e.target.value)}
            placeholder="—"
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-28 text-right"
          />
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex items-center gap-1 justify-end">
          <span className="text-[var(--t-text-muted)] text-[10px]">US$</span>
          <input
            type="text"
            inputMode="decimal"
            value={usd}
            onChange={(e) => onUsdChange(e.target.value)}
            placeholder="—"
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1.5 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-24 text-right"
          />
          {saving && <span className="text-[9px] text-[var(--t-text-dim)]">…</span>}
          {savedOk === true && (
            <span className="text-[9px] text-[#4ade80]">✓</span>
          )}
          {savedOk === false && (
            <span className="text-[9px] text-[#f87171]">✗</span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right text-[9px] text-[var(--t-text-muted)]">
        {editHint}
      </td>
    </tr>
  );
}
