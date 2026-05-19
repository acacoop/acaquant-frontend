"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  oficial: {
    value: number | null;
    ts: string | null;
    source: string;
    age_s?: number | null;
    stale?: boolean;
  };
  ts: string;
  // Freshness — lo agrega el backend (puede faltar si la API es vieja).
  data_fresh?: boolean;
  last_snapshot_at?: string | null;
  snapshot_age_s?: number | null;
  bloques: AgroBloque[];
}

// ─── Formatters ──────────────────────────────────────────────────────────────

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

/** Edad humana: "12s", "4m", "2h". */
function fmtAge(s: number | null | undefined): string {
  if (s === null || s === undefined || !isFinite(s)) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function pasecolor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[#666]";
  return n >= 0 ? "text-[#4ade80]" : "text-[#f87171]";
}
function tnavColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[#666]";
  return n >= 0 ? "text-[#4ade80]" : "text-[#f87171]";
}

// ─── Flash al cambiar de valor ───────────────────────────────────────────────
// Cuando un precio cambia entre dos polls, la celda pulsa verde (subió) o
// rojo (bajó) y se desvanece. El identity del valor es estable porque las
// filas futuro se keyean por ticker.

function useFlashBg(value: number | null | undefined): string {
  const prev = useRef<number | null | undefined>(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p !== null && p !== undefined && value !== null && value !== undefined &&
        value !== p) {
      setDir(value > p ? "up" : "down");
      prev.current = value;
      const t = setTimeout(() => setDir(null), 850);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return dir === "up"
    ? "rgba(74,222,128,0.22)"
    : dir === "down"
      ? "rgba(248,113,113,0.22)"
      : "transparent";
}

function FlashCell({
  value,
  text,
  className,
}: {
  value: number | null | undefined;
  text: string;
  className: string;
}) {
  const bg = useFlashBg(value);
  return (
    <td
      className={className}
      style={{
        backgroundColor: bg,
        transition: "background-color 0.8s ease-out",
      }}
    >
      {text}
    </td>
  );
}

// ─── Indicador de frescura ───────────────────────────────────────────────────

function FreshnessPill({
  fresh,
  ageS,
}: {
  fresh: boolean;
  ageS: number | null;
}) {
  if (fresh) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
        <span className="text-[#4ade80]">LIVE</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-[#f87171]" />
      <span className="text-[#f87171]">
        DESACTUALIZADO {ageS !== null ? `· hace ${fmtAge(ageS)}` : ""}
      </span>
    </span>
  );
}

function StaleBanner({ ageS }: { ageS: number | null }) {
  return (
    <div className="mb-2 px-2.5 py-1.5 border border-[#f87171]/40 bg-[#f87171]/10 text-[10px] text-[#f8a0a0] flex items-center gap-2">
      <span className="text-[#f87171]">⚠</span>
      <span>
        Los precios de los futuros NO son live — el motor agro está detenido
        {ageS !== null ? ` (último snapshot hace ${fmtAge(ageS)})` : ""}. La
        pizarra es editable igual; el pase / TNAV se recalculan al volver el
        feed.
      </span>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function DerivadosAgroPizarra({
  initial,
  canEdit,
  setHeaderExtras,
}: {
  initial: AgroResp;
  canEdit: boolean;
  setHeaderExtras: (n: ReactNode) => void;
}) {
  const { data, lastAt } = usePoll<AgroResp>(
    "/api/derivados-agro",
    initial,
    POLL_MS,
  );

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";
  const oficial = data.oficial?.value ?? null;
  const oficialSource = data.oficial?.source ?? "none";
  const oficialStale = data.oficial?.stale === true;
  // undefined (backend viejo sin freshness) → asumimos fresh para no asustar.
  const fresh = data.data_fresh !== false;
  const snapAge = data.snapshot_age_s ?? null;

  // Inyecto extras (frescura + dólar oficial + últ. act) en la fila del shell.
  useEffect(() => {
    setHeaderExtras(
      <>
        <FreshnessPill fresh={fresh} ageS={snapAge} />
        <span className="text-[10px] text-[#808080] tracking-wide ml-2">
          DÓLAR OF
        </span>
        <span
          className={`font-mono text-[11px] ${
            oficialStale ? "text-[#f87171]" : "text-[#ff9900]"
          }`}
        >
          {oficial ? fmtArs(oficial) : "—"}
        </span>
        <span className="text-[9px] text-[#555]">({oficialSource})</span>
        <span className="text-[10px] text-[#555] ml-3">
          ÚLT {ultimoDisplay}
        </span>
      </>,
    );
    return () => setHeaderExtras(null);
  }, [
    fresh,
    snapAge,
    oficial,
    oficialSource,
    oficialStale,
    ultimoDisplay,
    setHeaderExtras,
  ]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-2">
      {/* Banner fijo arriba — el resto scrollea (3 commodities no entran en
          una pantalla). */}
      {!fresh && <StaleBanner ageS={snapAge} />}
      <div className="flex-1 min-h-0">
        <Panel title="PASE AGRO — TRIGO · MAÍZ · SOJA">
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
                  Valor en $
                </th>
                <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
                  TNAV US$
                </th>
              </tr>
            </thead>
            <tbody>
              {data.bloques.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-3 text-center text-[#666]">
                    Sin data
                  </td>
                </tr>
              ) : (
                data.bloques.map((b, bi) => (
                  <BloqueRows
                    key={b.commodity}
                    bloque={b}
                    oficial={oficial}
                    canEdit={canEdit}
                    stale={!fresh}
                    first={bi === 0}
                  />
                ))
              )}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function BloqueRows({
  bloque,
  oficial,
  canEdit,
  stale,
  first,
}: {
  bloque: AgroBloque;
  oficial: number | null;
  canEdit: boolean;
  stale: boolean;
  first: boolean;
}) {
  return (
    <>
      {!first && (
        <tr>
          <td colSpan={6} className="h-3" />
        </tr>
      )}
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
        const futuroDim = stale ? "opacity-50" : "";
        return (
          <tr
            key={`${bloque.commodity}-${r.ticker ?? i}`}
            className="border-b border-[#101010] hover:bg-[#0d0d0d]"
          >
            <td className={`px-2 py-1 text-[#a0a0a0] ${futuroDim}`}>
              {fmtFechaVtoFuturo(r.vencimiento)}
            </td>
            <td className={`px-2 py-1 text-[#d0d0d0] ${futuroDim}`}>
              {r.posicion}
            </td>
            <FlashCell
              value={r.us}
              text={fmtPx(r.us)}
              className={`px-2 py-1 text-right text-[#d0d0d0] ${futuroDim}`}
            />
            <FlashCell
              value={r.pase}
              text={fmtPx(r.pase)}
              className={`px-2 py-1 text-right ${pasecolor(r.pase)} ${futuroDim}`}
            />
            <FlashCell
              value={r.ars}
              text={fmtArs(r.ars)}
              className={`px-2 py-1 text-right text-[#a0a0a0] ${futuroDim}`}
            />
            <FlashCell
              value={r.tnav_us}
              text={fmtPct(r.tnav_us)}
              className={`px-2 py-1 text-right ${tnavColor(r.tnav_us)} ${futuroDim}`}
            />
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

  // Si otro usuario editó la pizarra, el poll trae el valor nuevo: lo
  // adoptamos salvo que el campo esté tocado localmente con algo distinto.
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
  const arsBg = useFlashBg(arsCalc);

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

  // Marca de auditoría: quién y cuándo tocó la pizarra por última vez.
  const editHint =
    row.updated_by || row.updated_at
      ? `${row.updated_by ?? "—"}${
          row.updated_at
            ? " · " + fmtHoraAR(new Date(row.updated_at).getTime())
            : ""
        }`
      : null;

  return (
    <tr className="border-y border-[#3a2c0a] bg-[#1a1308]">
      <td className="px-2 py-1.5 text-[#e0c890]">
        {canEdit ? (
          <input
            type="date"
            value={vto}
            onChange={(e) => onVtoChange(e.target.value)}
            className="bg-[#0e0e0e] border border-[#3a2c0a] text-[#e0c890] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none"
          />
        ) : (
          fmtFechaVtoFuturo(row.vencimiento)
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[#ff9900] font-semibold tracking-wide">
            {row.posicion}
          </span>
          {editHint && (
            <span
              className="text-[9px] text-[#6a5a30]"
              title="Última edición de la pizarra"
            >
              ✎ {editHint}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right text-[#e0c890] font-semibold">
        {canEdit ? (
          <div className="inline-flex items-center gap-1 justify-end">
            <input
              type="number"
              step="0.01"
              min="0"
              value={us}
              onChange={(e) => onUsChange(e.target.value)}
              className="bg-[#0e0e0e] border border-[#3a2c0a] text-[#e0c890] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none w-20 text-right"
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
      <td className="px-2 py-1.5 text-right text-[#666]">—</td>
      <td
        className="px-2 py-1.5 text-right text-[#e0c890] font-semibold"
        style={{
          backgroundColor: arsBg,
          transition: "background-color 0.8s ease-out",
        }}
      >
        {fmtArs(arsCalc ?? row.ars)}
      </td>
      <td className="px-2 py-1.5 text-right text-[#666]">—</td>
    </tr>
  );
}
