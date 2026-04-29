"use client";

import { useEffect, useMemo, useState } from "react";
import { MMReplay } from "./replay";
import { MMBacktest } from "./backtest";
import { apiToSpecTrade, buildSessionInfo } from "./adapter";
import { CURVAS, type ApiTrade, type Curva, type CurvaBond, type SessionInfo, type SpecTrade } from "./types";

type Tab = "replay" | "backtest";

interface InitialBondsByCurve {
  [curva: string]: CurvaBond[];
}

export function MMShell({ initialBondsByCurve }: { initialBondsByCurve: InitialBondsByCurve }) {
  const [tab, setTab] = useState<Tab>("replay");
  const [curva, setCurva] = useState<Curva>("soberanos");

  // Bonds del curva actual — viene del SSR pero se puede re-fetchear si
  // el user cambia de curva y la data no estaba pre-cargada.
  const [bondsByCurve, setBondsByCurve] = useState<InitialBondsByCurve>(initialBondsByCurve);

  const bonds = useMemo(() => bondsByCurve[curva] ?? [], [bondsByCurve, curva]);

  // Fetch bonds de una curva si todavía no la tenemos.
  useEffect(() => {
    if (bondsByCurve[curva]) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/analitica/listar-curva?curva=${curva}`, {
          cache: "no-store",
        });
        if (!r.ok || !alive) return;
        const list = (await r.json()) as CurvaBond[];
        setBondsByCurve((prev) => ({ ...prev, [curva]: list }));
      } catch {
        // ignore — el dropdown queda vacío para esa curva
      }
    })();
    return () => {
      alive = false;
    };
  }, [curva, bondsByCurve]);

  // Bond seleccionado — default el más líquido (el de mayor total_money_dia).
  const [tickerCorto, setTickerCorto] = useState<string>("");
  useEffect(() => {
    if (!bonds.length) return;
    if (tickerCorto && bonds.some((b) => b.ticker_corto === tickerCorto)) return;
    // Elegir más líquido. Si todos en 0, el de más nominales.
    const sorted = [...bonds].sort(
      (a, b) =>
        (b.total_money_dia || b.total_nominals_dia) -
        (a.total_money_dia || a.total_nominals_dia),
    );
    setTickerCorto(sorted[0]?.ticker_corto ?? "");
  }, [bonds, tickerCorto]);

  const bond = bonds.find((b) => b.ticker_corto === tickerCorto) ?? null;

  return (
    <div className="h-full flex flex-col bg-black text-[#d0d0d0]">
      {/* Header con selectores + tabs */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[12px] font-bold tracking-widest text-[#ff9900]">
          MM WORKSTATION
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] tracking-widest text-[#666]">CURVA</span>
          <select
            value={curva}
            onChange={(e) => setCurva(e.target.value as Curva)}
            className="bg-black border border-[#2a2a2a] text-[11px] px-2 py-1 text-[#ff9900] font-mono"
          >
            {CURVAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] tracking-widest text-[#666]">INSTRUMENTO</span>
          <select
            value={tickerCorto}
            onChange={(e) => setTickerCorto(e.target.value)}
            className="bg-black border border-[#2a2a2a] text-[11px] px-2 py-1 text-[#ff9900] font-mono min-w-[160px]"
            disabled={!bonds.length}
          >
            {bonds.length === 0 ? (
              <option value="">— sin bonos en la curva —</option>
            ) : (
              [...bonds]
                .sort(
                  (a, b) =>
                    (b.total_money_dia || b.total_nominals_dia) -
                    (a.total_money_dia || a.total_nominals_dia),
                )
                .map((b) => {
                  const liq = b.total_money_dia || 0;
                  const dot = liq > 1e7 ? "🟢" : liq > 1e6 ? "🟡" : "🔴";
                  return (
                    <option key={b.ticker_corto} value={b.ticker_corto}>
                      {dot} {b.ticker_corto}
                    </option>
                  );
                })
            )}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <TabBtn active={tab === "replay"} onClick={() => setTab("replay")}>
            REPLAY
          </TabBtn>
          <TabBtn active={tab === "backtest"} onClick={() => setTab("backtest")}>
            BACKTEST
          </TabBtn>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "replay" ? (
          <ReplayLoader bond={bond} />
        ) : bond ? (
          <MMBacktest instrumentoFull={bond.ticker} />
        ) : (
          <Empty msg="Elegí un instrumento para arrancar." />
        )}
      </div>
    </div>
  );
}

function TabBtn({
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
      className={`px-3 py-1 text-[10px] font-semibold tracking-widest border ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}

// Sub-componente que carga los trades del día y arma SESSION_INFO antes
// de renderizar el REPLAY. Aislado del shell para que cambios de curva /
// instrumento disparen el re-fetch limpio (key={ticker_corto}).
function ReplayLoader({ bond }: { bond: CurvaBond | null }) {
  const [trades, setTrades] = useState<SpecTrade[]>([]);
  const [fecha, setFecha] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bond) {
      setTrades([]);
      setFecha(null);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/mm/trades-dia?instrumento=${encodeURIComponent(bond.ticker)}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as {
          instrumento_full: string;
          fecha: string | null;
          trades: ApiTrade[];
        };
        if (!alive) return;
        setFecha(json.fecha);
        setTrades(json.trades.map(apiToSpecTrade));
      } catch (e) {
        if (!alive) return;
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bond]);

  if (!bond) return <Empty msg="Elegí un instrumento para arrancar." />;
  if (loading) return <Empty msg={`Cargando ${bond.ticker_corto}…`} />;
  if (error) return <Empty msg={`Error: ${error}`} />;
  if (!fecha || trades.length === 0)
    return <Empty msg={`Sin trades disponibles para ${bond.ticker_corto} en los últimos 30 días.`} />;

  const session: SessionInfo = buildSessionInfo(bond, fecha, trades);
  return <MMReplay key={`${bond.ticker_corto}-${fecha}`} trades={trades} session={session} />;
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="h-full flex items-center justify-center text-[#666] text-xs">{msg}</div>
  );
}
