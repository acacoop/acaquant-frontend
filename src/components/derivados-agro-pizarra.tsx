"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, fmtHoraAR } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 5_000;
const SAVE_DEBOUNCE_MS = 800;

type Commodity = "TRIGO" | "MAIZ" | "SOJA";

interface AgroRow {
  tipo: "pizarra" | "dispo" | "futuro";
  ticker?: string;
  vencimiento: string | null;
  posicion: string;
  us: number | null;
  pase: number | null;
  ars: number | null;
  tnav_us: number | null;
  bid?: number | null;
  offer?: number | null;
  vol_efectivo?: number | null;
  dias_a_vto?: number;
  updated_at?: string | null;
  updated_by?: string | null;
}

interface AgroBloque {
  commodity: Commodity;
  rows: AgroRow[];
}

export interface AgroResp {
  oficial: { value: number | null; ts: string | null; source: string };
  ts: string;
  bloques: AgroBloque[];
}

const COMMODITIES: Commodity[] = ["TRIGO", "MAIZ", "SOJA"];

function fmtPx(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtArs(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtFechaVtoFuturo(yyyymmdd: string | null): string {
  if (!yyyymmdd) return "—";
  const s = yyyymmdd.replace(/-/g, "");
  if (s.length !== 8) return yyyymmdd;
  const dd = s.slice(6, 8);
  const mm = s.slice(4, 6);
  const yyyy = s.slice(0, 4);
  return `${dd}/${mm}/${yyyy}`;
}

function isoFromAny(s: string | null | undefined): string {
  if (!s) return "";
  if (s.includes("-")) return s.slice(0, 10);
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return "";
}

function pasecolor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[#666]";
  return n >= 0 ? "text-[#4ade80]" : "text-[#f87171]";
}
function tnavColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[#666]";
  return n >= 0 ? "text-[#4ade80]" : "text-[#f87171]";
}

export function DerivadosAgroPizarra({
  initial,
  canEdit,
  commodity,
  setCommodity,
}: {
  initial: AgroResp;
  canEdit: boolean;
  commodity: Commodity;
  setCommodity: (c: Commodity) => void;
}) {
  const { data, lastAt } = usePoll<AgroResp>(
    "/api/derivados-agro",
    initial,
    POLL_MS,
  );

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";

  const oficial = data.oficial?.value ?? null;
  const oficialSource = data.oficial?.source ?? "none";

  const bloque = useMemo(
    () => data.bloques.find((b) => b.commodity === commodity),
    [data.bloques, commodity],
  );

  const counts = useMemo(() => {
    const m: Record<Commodity, number> = { TRIGO: 0, MAIZ: 0, SOJA: 0 };
    for (const b of data.bloques) {
      m[b.commodity] = b.rows.filter((r) => r.tipo === "futuro").length;
    }
    return m;
  }, [data.bloques]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-3">
      <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2 flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#808080] tracking-wide">
            DÓLAR OFICIAL
          </span>
          <span className="text-[#ff9900] font-mono text-[11px]">
            {oficial ? fmtArs(oficial) : "—"}
          </span>
          <span className="text-[9px] text-[#555]">({oficialSource})</span>
        </div>

        <div className="flex items-center gap-1 ml-3">
          {COMMODITIES.map((c) => (
            <CommodityBtn
              key={c}
              active={c === commodity}
              onClick={() => setCommodity(c)}
            >
              {c} ({counts[c]})
            </CommodityBtn>
          ))}
        </div>

        <span className="ml-auto text-[10px] text-[#555]">
          ÚLT. ACT {ultimoDisplay}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Panel title={`PASE AGRO — ${commodity}`} fill>
          <table className="w-full text-[11px] font-mono">
            <thead className="text-[10px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
              <tr>
                <th className="text-left px-2 py-1.5 border-b border-[#1a1a1a]">
                  Vencimiento
                </th>
                <th className="text-left px-2 py-1.5 border-b border-[#1a1a1a]">
                  Posición
                </th>
                <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
                  US$
                </th>
                <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
                  Pase
                </th>
                <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
                  $
                </th>
                <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
                  TNAV US$
                </th>
              </tr>
            </thead>
            <tbody>
              {bloque ? (
                <BloqueRows
                  bloque={bloque}
                  oficial={oficial}
                  canEdit={canEdit}
                />
              ) : (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-center text-[#666]">
                    Sin data para {commodity}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function CommodityBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] tracking-wide uppercase px-2.5 py-1 border ${
        active
          ? "bg-[#ff9900]/10 text-[#ff9900] border-[#ff9900]"
          : "text-[#808080] border-[#2a2a2a] hover:text-[#d0d0d0] hover:border-[#3a3a3a]"
      }`}
    >
      {children}
    </button>
  );
}

function BloqueRows({
  bloque,
  oficial,
  canEdit,
}: {
  bloque: AgroBloque;
  oficial: number | null;
  canEdit: boolean;
}) {
  return (
    <>
      {bloque.rows.map((r, i) => {
        if (r.tipo === "pizarra") {
          return (
            <PizarraRow
              key={`${bloque.commodity}-pizarra`}
              commodity={bloque.commodity}
              row={r}
              oficial={oficial}
              canEdit={canEdit}
            />
          );
        }
        if (r.tipo === "dispo") {
          return (
            <tr
              key={`${bloque.commodity}-dispo`}
              className="border-b border-[#101010]"
            >
              <td className="px-2 py-1 text-[#666]">
                {r.vencimiento ? fmtFechaVtoFuturo(r.vencimiento) : "—"}
              </td>
              <td className="px-2 py-1 text-[#888]">{r.posicion}</td>
              <td className="px-2 py-1 text-right text-[#555]">#N/A</td>
              <td className="px-2 py-1 text-right text-[#555]">#N/A</td>
              <td className="px-2 py-1 text-right text-[#555]">#N/A</td>
              <td className="px-2 py-1 text-right text-[#555]">#N/A</td>
            </tr>
          );
        }
        return (
          <tr
            key={`${bloque.commodity}-${i}`}
            className="border-b border-[#101010] hover:bg-[#0d0d0d]"
          >
            <td className="px-2 py-1 text-[#a0a0a0]">
              {fmtFechaVtoFuturo(r.vencimiento)}
            </td>
            <td className="px-2 py-1 text-[#d0d0d0]">{r.posicion}</td>
            <td className="px-2 py-1 text-right text-[#d0d0d0]">
              {fmtPx(r.us)}
            </td>
            <td className={`px-2 py-1 text-right ${pasecolor(r.pase)}`}>
              {fmtPx(r.pase)}
            </td>
            <td className="px-2 py-1 text-right text-[#a0a0a0]">
              {fmtArs(r.ars)}
            </td>
            <td className={`px-2 py-1 text-right ${tnavColor(r.tnav_us)}`}>
              {fmtPct(r.tnav_us)}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function PizarraRow({
  commodity,
  row,
  oficial,
  canEdit,
}: {
  commodity: Commodity;
  row: AgroRow;
  oficial: number | null;
  canEdit: boolean;
}) {
  const [vto, setVto] = useState<string>(isoFromAny(row.vencimiento));
  const [us, setUs] = useState<string>(row.us != null ? String(row.us) : "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState<null | boolean>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteVtoRef = useRef(isoFromAny(row.vencimiento));
  const remoteUsRef = useRef(row.us != null ? String(row.us) : "");

  useEffect(() => {
    const newVto = isoFromAny(row.vencimiento);
    if (newVto !== remoteVtoRef.current) {
      remoteVtoRef.current = newVto;
      if (vto !== remoteVtoRef.current) setVto(newVto);
    }
    const newUs = row.us != null ? String(row.us) : "";
    if (newUs !== remoteUsRef.current) {
      remoteUsRef.current = newUs;
      if (us !== remoteUsRef.current) setUs(newUs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.vencimiento, row.us]);

  const arsCalc = useMemo(() => {
    const v = parseFloat(us);
    if (!isFinite(v) || !oficial) return null;
    return v * oficial;
  }, [us, oficial]);

  function scheduleSave(payload: {
    vencimiento_pizarra?: string;
    us_pizarra?: number;
  }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      setSavedOk(null);
      try {
        const res = await fetch(`/api/derivados-agro/pizarra/${commodity}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

  function onVtoChange(v: string) {
    setVto(v);
    if (v) scheduleSave({ vencimiento_pizarra: v });
  }
  function onUsChange(v: string) {
    setUs(v);
    const n = parseFloat(v);
    if (isFinite(n) && n > 0) scheduleSave({ us_pizarra: n });
  }

  return (
    <tr className="border-b border-[#1a1a1a] bg-[#0a0a0a] font-semibold">
      <td className="px-2 py-1 text-[#d0d0d0]">
        {canEdit ? (
          <input
            type="date"
            value={vto}
            onChange={(e) => onVtoChange(e.target.value)}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none"
          />
        ) : (
          fmtFechaVtoFuturo(row.vencimiento)
        )}
      </td>
      <td className="px-2 py-1 text-[#ff9900]">{row.posicion}</td>
      <td className="px-2 py-1 text-right text-[#d0d0d0]">
        {canEdit ? (
          <div className="inline-flex items-center gap-1 justify-end">
            <input
              type="number"
              step="0.01"
              min="0"
              value={us}
              onChange={(e) => onUsChange(e.target.value)}
              className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none w-20 text-right"
            />
            {saving && <span className="text-[9px] text-[#888]">…</span>}
            {savedOk === true && (
              <span className="text-[9px] text-[#4ade80]">✓</span>
            )}
            {savedOk === false && (
              <span className="text-[9px] text-[#f87171]">✗</span>
            )}
          </div>
        ) : (
          fmtPx(row.us)
        )}
      </td>
      <td className="px-2 py-1 text-right text-[#666]">—</td>
      <td className="px-2 py-1 text-right text-[#d0d0d0]">
        {fmtArs(arsCalc ?? row.ars)}
      </td>
      <td className="px-2 py-1 text-right text-[#666]">—</td>
    </tr>
  );
}
