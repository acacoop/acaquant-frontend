"use client";

import { useMemo, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from "recharts";
import { ForwardMatrix } from "./forward-matrix";
import { ForwardMatrixZscore } from "./forward-matrix-zscore";
import { InfoIcon } from "./info-icon";
import { fmtTs, shortTicker } from "./ui";
import { useViewportKey } from "@/lib/use-viewport-key";
import { usePoll } from "@/lib/use-poll";
import type { ForwardZscoreDoc } from "@/lib/types";

interface ForwardDoc {
  curva: string;
  tickers?: string[];
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

interface ForwardHistDoc {
  curva: string;
  fecha: string;
  matrix: Record<string, Record<string, number>>;
}

type Curva = "tasa_fija" | "cer";
type Modo = "live" | "grafico" | "zscore";

// Coeficientes (media/desvío) cambian 1x/día post-cierre. Polleamos lento
// para que cuando llega el cierre, el front lo refleje sin esperar a que
// el usuario recargue.
const POLL_ZSCORE_MS = 5 * 60 * 1000;

const PALETA = [
  "#ff9900",
  "#4a9eff",
  "#00cc66",
  "#ff3333",
  "#bb66ff",
  "#00cccc",
  "#ffee44",
  "#ff66aa",
];

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ForwardsPanel({
  forwards,
  historico,
  zscoreInicial,
}: {
  forwards: ForwardDoc[];
  historico?: ForwardHistDoc[];
  zscoreInicial?: ForwardZscoreDoc[];
}) {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [modo, setModo] = useState<Modo>("live");
  const vpKey = useViewportKey();

  const { data: zscoreDocs } = usePoll<ForwardZscoreDoc[]>(
    "/api/cotizaciones/forwards-zscore",
    zscoreInicial ?? [],
    POLL_ZSCORE_MS,
  );
  const zStats = useMemo(
    () => zscoreDocs.find((d) => d.curva === curva)?.stats,
    [zscoreDocs, curva],
  );
  const hayZscore = !!zStats && Object.keys(zStats).length > 0;

  const fw = forwards.find((f) => f.curva === curva);
  const hasData = !!fw?.matrix && !!fw?.tickers && fw.tickers.length >= 2;

  const histCurva = useMemo(
    () => (historico ?? []).filter((d) => d.curva === curva).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [historico, curva]
  );

  const paresDisp = useMemo(() => {
    if (!histCurva.length) return [] as string[];
    const ultima = histCurva[histCurva.length - 1];
    const pares: string[] = [];
    for (const [tLargo, inner] of Object.entries(ultima.matrix || {})) {
      for (const [tCorto, val] of Object.entries(inner || {})) {
        if (val !== null && val !== undefined) {
          pares.push(`${tLargo}→${tCorto}`);
        }
      }
    }
    return pares.sort();
  }, [histCurva]);

  const [paresSel, setParesSel] = useState<string[]>([]);
  const [parSearch, setParSearch] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const paresEfectivos = useMemo(() => {
    if (paresSel.length) return paresSel;
    return paresDisp.slice(0, 2);
  }, [paresSel, paresDisp]);

  const chartData = useMemo(() => {
    if (!histCurva.length || !paresEfectivos.length) return [] as Array<Record<string, string | number>>;
    return histCurva.map((doc) => {
      const row: Record<string, string | number> = { fecha: doc.fecha };
      for (const par of paresEfectivos) {
        const [tLargo, tCorto] = par.split("→");
        const v = doc.matrix?.[tLargo]?.[tCorto];
        if (v !== null && v !== undefined) {
          row[par] = +(v * 100).toFixed(3);
        }
      }
      return row;
    });
  }, [histCurva, paresEfectivos]);

  const togglePar = (par: string) => {
    setParesSel((prev) => {
      if (prev.length === 0) {
        const base = paresDisp.slice(0, 2);
        const next = base.includes(par) ? base.filter((p) => p !== par) : [...base, par];
        return next;
      }
      return prev.includes(par) ? prev.filter((p) => p !== par) : [...prev, par];
    });
  };

  const hayHistorico = histCurva.length > 0 && paresDisp.length > 0;

  const filteredPares = useMemo(() => {
    const q = parSearch.toLowerCase();
    if (!q) return paresDisp;
    return paresDisp.filter((par) => {
      const [tL, tC] = par.split("→");
      return (
        shortTicker(tL).toLowerCase().includes(q) ||
        shortTicker(tC).toLowerCase().includes(q) ||
        par.toLowerCase().includes(q)
      );
    });
  }, [paresDisp, parSearch]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <FilterBtn
          active={curva === "tasa_fija"}
          onClick={() => setCurva("tasa_fija")}
        >
          TASA FIJA
        </FilterBtn>
        <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
          CER
        </FilterBtn>
        <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
        <FilterBtn active={modo === "live"} onClick={() => setModo("live")}>
          LIVE
        </FilterBtn>
        <FilterBtn
          active={modo === "grafico"}
          onClick={() => hayHistorico && setModo("grafico")}
          disabled={!hayHistorico}
        >
          GRÁFICO
        </FilterBtn>
        <FilterBtn
          active={modo === "zscore"}
          onClick={() => hayZscore && setModo("zscore")}
          disabled={!hayZscore}
        >
          Z-SCORE
        </FilterBtn>
        {modo === "grafico" && (
          <div className="relative ml-1">
            <input
              ref={searchRef}
              type="text"
              value={parSearch}
              onFocus={() => setDropOpen(true)}
              onChange={(e) => { setParSearch(e.target.value); setDropOpen(true); }}
              onBlur={() => setTimeout(() => setDropOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDropOpen(false);
                if (e.key === "Enter" && filteredPares.length > 0) {
                  togglePar(filteredPares[0]);
                  setParSearch("");
                  setDropOpen(false);
                }
              }}
              placeholder="agregar par…"
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-[130px]"
            />
            {dropOpen && filteredPares.length > 0 && (
              <div
                ref={dropRef}
                className="absolute top-full left-0 mt-px z-50 bg-[var(--t-surface)] border border-[var(--t-border-2)] max-h-[200px] overflow-y-auto w-[160px]"
              >
                {filteredPares.map((par) => {
                  const activo = paresEfectivos.includes(par);
                  const [tLargo, tCorto] = par.split("→");
                  return (
                    <div
                      key={par}
                      onMouseDown={() => { togglePar(par); setParSearch(""); setDropOpen(false); }}
                      className={`px-2 py-0.5 text-[10px] font-mono cursor-pointer hover:bg-[var(--t-accent)]/10 flex items-center gap-1.5 ${activo ? "text-[var(--t-accent)]" : "text-[var(--t-text)]"}`}
                    >
                      <span className="w-3 text-center">{activo ? "✓" : ""}</span>
                      {shortTicker(tLargo)}→{shortTicker(tCorto)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {fw?.updated_at && modo === "live" && (
          <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
            {fmtTs(fw.updated_at)}
          </span>
        )}
        {modo === "grafico" && histCurva.length > 0 && (
          <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
            {histCurva.length} días
          </span>
        )}
        {modo === "zscore" && fw?.updated_at && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-[var(--t-text-muted)]">
            {fmtTs(fw.updated_at)} · 30d
            <InfoIcon width="380px" align="right" tip={<ForwardsZScoreHelp />} />
          </span>
        )}
      </div>

      {modo === "live" ? (
        <div className="h-[380px] overflow-auto">
          {hasData ? (
            <ForwardMatrix tickers={fw!.tickers!} matrix={fw!.matrix!} />
          ) : (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              SIN DATOS — MERCADO CERRADO
            </p>
          )}
        </div>
      ) : modo === "zscore" ? (
        <div className="h-[380px] overflow-auto">
          {hasData && hayZscore ? (
            <ForwardMatrixZscore
              tickers={fw!.tickers!}
              matrix={fw!.matrix!}
              stats={zStats}
            />
          ) : !hasData ? (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              SIN DATOS LIVE — MERCADO CERRADO
            </p>
          ) : (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              SIN DATOS DE Z-SCORE — ESPERAR CIERRE
            </p>
          )}
        </div>
      ) : (
        <div className="h-[380px] min-h-0">
          <div className="h-full min-h-0 min-w-0">
            {paresEfectivos.length === 0 || chartData.length === 0 ? (
              <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                Seleccioná al menos un par.
              </p>
            ) : (
              <ResponsiveContainer key={vpKey} width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
                  <CartesianGrid stroke="#1a1a1a" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    angle={-35}
                    textAnchor="end"
                    height={40}
                    tickFormatter={fmtFechaCorta}
                    interval={Math.max(0, Math.floor(chartData.length / 10))}
                  />
                  <YAxis
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                    width={55}
                    domain={[
                      (dataMin: number) => dataMin - 0.5,
                      (dataMax: number) => dataMax + 0.5,
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelStyle={{ color: "#ff9900" }}
                    labelFormatter={(v) => fmtFechaCorta(String(v))}
                    formatter={(v, name) => {
                      const [tLargo, tCorto] = String(name).split("→");
                      return [
                        `${Number(v).toFixed(3)}%`,
                        `${shortTicker(tLargo)}→${shortTicker(tCorto)}`,
                      ];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={20}
                    wrapperStyle={{ fontSize: 10 }}
                    formatter={(value) => {
                      const [tLargo, tCorto] = String(value).split("→");
                      return `${shortTicker(tLargo)}→${shortTicker(tCorto)}`;
                    }}
                  />
                  {paresEfectivos.map((par, i) => (
                    <Line
                      key={par}
                      type="monotone"
                      dataKey={par}
                      stroke={PALETA[i % PALETA.length]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Texto explicativo del tooltip — separado del componente principal
// para que sea fácil de editar/mantener.
function ForwardsZScoreHelp() {
  return (
    <>
      <h4>QUÉ ES UN FORWARD</h4>
      <p>
        Es la tasa <strong>implícita</strong> entre dos Lecaps (uno corto y uno
        largo) — la tasa que el mercado pricea entre sus dos vencimientos.
      </p>
      <p>
        Si el corto vence en 30 días y el largo en 90, el forward es lo que
        vas a rendir desde el día 30 hasta el día 90 si comprás hoy.
      </p>

      <h4>FÓRMULA</h4>
      <p>
        <code>(1 + TEA_largo)^t_largo / (1 + TEA_corto)^t_corto</code>
        <br />
        anualizado por el plazo (t_largo − t_corto).
      </p>

      <h4>QUÉ ES EL Z-SCORE</h4>
      <p>
        Mide cuánto se aparta el forward de HOY de su nivel típico de los
        últimos 30 días.
      </p>
      <p>
        <code>Z = (forward hoy − media 30d) / desvío 30d</code>
      </p>

      <h4>CÓMO INTERPRETAR</h4>
      <ul>
        <li>
          <strong className="text-[#7fff7f]">{">"} +1.5</strong> · verde fuerte:
          forward HOY más ANCHO de lo normal. El mercado pricea más
          devaluación / inflación que en el último mes.
        </li>
        <li>
          <strong className="text-[#3fbf6f]">+0.5 a +1.5</strong> · verde clara:
          un poco más ancho.
        </li>
        <li>
          <strong className="text-[var(--t-text-dim)]">±0.5</strong> · gris: neutral.
        </li>
        <li>
          <strong className="text-[#d97706]">−0.5 a −1.5</strong> · naranja: un
          poco más comprimido.
        </li>
        <li>
          <strong className="text-[#c0271a]">{"<"} −1.5</strong> · rojo:
          forward COMPRIMIDO. Mercado pricea menos que en el último mes.
        </li>
      </ul>

      <h4>IMPORTANTE</h4>
      <p>
        El Z mide <strong>desviación</strong>, no valor absoluto.
      </p>
      <p>
        Un forward del 2% puede ser Z negativo si venía rindiendo 4%. Y uno
        del 5% puede ser Z positivo si venía en 3%. La señal es relativa al
        régimen reciente, no a un nivel objetivo.
      </p>
    </>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        disabled
          ? "bg-transparent text-[#333333] border-[var(--t-border)] cursor-not-allowed"
          : active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
