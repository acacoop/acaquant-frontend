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

/** El motor agro corre L-V 13:00–20:05 UTC. Fuera de esa ventana, datos
 *  viejos = mercado cerrado (normal); dentro = algo se rompió. */
function mercadoAbiertoUTC(d: Date = new Date()): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 13 * 60 && mins <= 20 * 60 + 5;
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
// rojo (bajó) y se desvanece.

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

type EstadoFeed = "live" | "cerrado" | "stale";

function FreshnessPill({ estado }: { estado: EstadoFeed }) {
  const cfg =
    estado === "live"
      ? { dot: "bg-[#4ade80] animate-pulse", txt: "text-[#4ade80]", label: "LIVE" }
      : estado === "cerrado"
        ? { dot: "bg-[#666]", txt: "text-[#888]", label: "MERCADO CERRADO" }
        : { dot: "bg-[#f87171]", txt: "text-[#f87171]", label: "DESACTUALIZADO" };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] tracking-wide">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span className={cfg.txt}>{cfg.label}</span>
    </span>
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
  const estado: EstadoFeed = fresh
    ? "live"
    : mercadoAbiertoUTC()
      ? "stale"
      : "cerrado";
  const dim = !fresh ? "opacity-50" : "";

  // Inyecto extras (frescura + dólar oficial + últ. act) en la fila del shell.
  useEffect(() => {
    setHeaderExtras(
      <>
        <FreshnessPill estado={estado} />
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
    estado,
    oficial,
    oficialSource,
    oficialStale,
    ultimoDisplay,
    setHeaderExtras,
  ]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel title="PASE AGRO — TRIGO · MAÍZ · SOJA" expandable>
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead className="text-[10px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
              <tr>
                <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                  Vto
                </th>
                <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                  Posición
                </th>
                <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                  US$
                </th>
                <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                  Pase
                </th>
                <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                  Valor $
                </th>
                <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                  TNAV
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
                    dim={dim}
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
  dim,
  first,
}: {
  bloque: AgroBloque;
  oficial: number | null;
  canEdit: boolean;
  dim: string;
  first: boolean;
}) {
  return (
    <>
      {!first && (
        <tr>
          <td colSpan={6} className="h-1.5" />
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
              <td className="px-1.5 py-0.5 text-[#666]">
                {r.vencimiento ? fmtFechaVtoFuturo(r.vencimiento) : "—"}
              </td>
              <td className="px-1.5 py-0.5 text-[#888]">{r.posicion}</td>
              <td className="px-1.5 py-0.5 text-right text-[#555]">#N/A</td>
              <td className="px-1.5 py-0.5 text-right text-[#555]">#N/A</td>
              <td className="px-1.5 py-0.5 text-right text-[#555]">#N/A</td>
              <td className="px-1.5 py-0.5 text-right text-[#555]">#N/A</td>
            </tr>
          );
        }
        return (
          <tr
            key={`${bloque.commodity}-${r.ticker ?? i}`}
            className="border-b border-[#101010] hover:bg-[#0d0d0d]"
          >
            <td className={`px-1.5 py-0.5 text-[#a0a0a0] ${dim}`}>
              {fmtFechaVtoFuturo(r.vencimiento)}
            </td>
            <td className={`px-1.5 py-0.5 text-[#d0d0d0] ${dim}`}>
              {r.posicion}
            </td>
            <FlashCell
              value={r.us}
              text={fmtPx(r.us)}
              className={`px-1.5 py-0.5 text-right text-[#d0d0d0] ${dim}`}
            />
            <FlashCell
              value={r.pase}
              text={fmtPx(r.pase)}
              className={`px-1.5 py-0.5 text-right ${pasecolor(r.pase)} ${dim}`}
            />
            <FlashCell
              value={r.ars}
              text={fmtArs(r.ars)}
              className={`px-1.5 py-0.5 text-right text-[#a0a0a0] ${dim}`}
            />
            <FlashCell
              value={r.tnav_us}
              text={fmtPct(r.tnav_us)}
              className={`px-1.5 py-0.5 text-right ${tnavColor(r.tnav_us)} ${dim}`}
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

  return (
    <tr className="border-y border-[#3a2c0a] bg-[#1a1308]">
      <td className="px-1.5 py-1 text-[#e0c890]">
        {canEdit ? (
          <input
            type="date"
            value={vto}
            onChange={(e) => onVtoChange(e.target.value)}
            className="bg-[#0e0e0e] border border-[#3a2c0a] text-[#e0c890] text-[11px] px-1 py-0 font-mono focus:border-[#ff9900] outline-none"
          />
        ) : (
          fmtFechaVtoFuturo(row.vencimiento)
        )}
      </td>
      <td className="px-1.5 py-1 text-[#ff9900] font-semibold tracking-wide">
        {row.posicion}
      </td>
      <td className="px-1.5 py-1 text-right text-[#e0c890] font-semibold">
        {canEdit ? (
          <div className="inline-flex items-center gap-1 justify-end">
            <input
              type="number"
              step="0.01"
              min="0"
              value={us}
              onChange={(e) => onUsChange(e.target.value)}
              className="bg-[#0e0e0e] border border-[#3a2c0a] text-[#e0c890] text-[11px] px-1 py-0 font-mono focus:border-[#ff9900] outline-none w-20 text-right"
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
      <td className="px-1.5 py-1 text-right text-[#666]">—</td>
      <td
        className="px-1.5 py-1 text-right text-[#e0c890] font-semibold"
        style={{
          backgroundColor: arsBg,
          transition: "background-color 0.8s ease-out",
        }}
      >
        {fmtArs(arsCalc ?? row.ars)}
      </td>
      <td className="px-1.5 py-1 text-right text-[#666]">—</td>
    </tr>
  );
}
