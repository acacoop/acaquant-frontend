"use client";

import { useEffect, useState } from "react";
import { DolarMepCompraView } from "./dolar-mep-compra-view";
import { DolarMepTradingView } from "./dolar-mep-trading-view";
import {
  ACCOUNT_DEFAULT,
  Cotizacion,
  Rueda,
  SaldoCuenta,
  fmtTime,
} from "./dolar-mep-shared";

type SubTab = "compra" | "trading";

export function DolarMepShell() {
  // Estado compartido entre las sub-tabs (rueda/monto/comision/account).
  // Cuando el user cambia entre COMPRA y TRADING, los valores se preservan.
  const [tab, setTab] = useState<SubTab>("compra");
  const [rueda, setRueda] = useState<Rueda>("CI");
  const [monto, setMonto] = useState("100000");
  const [comision, setComision] = useState("0.62");
  const [account, setAccount] = useState(ACCOUNT_DEFAULT);

  // Cotización + saldo: shared para no duplicar polls. La cotización se
  // muestra en el header siempre visible; cada sub-tab la usa para preview.
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [saldo, setSaldo] = useState<SaldoCuenta | null>(null);

  useEffect(() => {
    let alive = true;
    async function fetchCot() {
      try {
        const r = await fetch(`/api/operativa/mep/cotizacion?rueda=${rueda}`, { cache: "no-store" });
        if (alive && r.ok) setCot(await r.json());
      } catch {
        // ignore
      }
    }
    async function fetchSaldo() {
      try {
        const r = await fetch(
          `/api/risk/account/saldo?rueda=${rueda}&account=${account}`,
          { cache: "no-store" },
        );
        if (alive) {
          if (r.ok) setSaldo(await r.json());
          else setSaldo(null);
        }
      } catch {
        // ignore
      }
    }
    fetchCot();
    fetchSaldo();
    const idCot = setInterval(fetchCot, 2000);
    const idSal = setInterval(fetchSaldo, 3000);
    return () => {
      alive = false;
      clearInterval(idCot);
      clearInterval(idSal);
    };
  }, [rueda, account]);

  const mep = cot?.mep_implicito ?? null;
  const precioAl30 = cot?.al30?.price ?? null;
  const precioAl30d = cot?.al30d?.price ?? null;

  return (
    <div className="h-full flex flex-col min-h-0 bg-black">
      {/* Cotización en grande — visible en ambas sub-tabs */}
      <div className="flex gap-4 items-end p-3 bg-[#080808] border-b border-[#1a1a1a] shrink-0">
        <div className="flex flex-col">
          <span className="text-[9px] tracking-wider text-[#888]">MEP {rueda}</span>
          <span className="text-[28px] font-bold tracking-wide text-[#ff9900] tabular-nums">
            {mep !== null ? `$${mep.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className="flex flex-col text-[10px] text-[#888] gap-0.5">
          <span>AL30: {precioAl30 !== null ? `$${precioAl30.toFixed(2)}` : "—"}</span>
          <span>AL30D: {precioAl30d !== null ? `US$${precioAl30d.toFixed(2)}` : "—"}</span>
          <span>{cot?.al30?.ts ? `last ${fmtTime(cot.al30.ts)}` : ""}</span>
        </div>
        <div className="ml-auto text-[10px] text-[#666]">refresca cada 2s</div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <SubTabBtn active={tab === "compra"} onClick={() => setTab("compra")}>
          COMPRA
        </SubTabBtn>
        <SubTabBtn active={tab === "trading"} onClick={() => setTab("trading")}>
          TRADING
        </SubTabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "compra" ? (
          <DolarMepCompraView
            rueda={rueda}
            setRueda={setRueda}
            monto={monto}
            setMonto={setMonto}
            comision={comision}
            setComision={setComision}
            account={account}
            setAccount={setAccount}
            cot={cot}
            saldo={saldo}
          />
        ) : (
          <DolarMepTradingView
            rueda={rueda}
            setRueda={setRueda}
            monto={monto}
            setMonto={setMonto}
            comision={comision}
            setComision={setComision}
            account={account}
            setAccount={setAccount}
            cot={cot}
            saldo={saldo}
          />
        )}
      </div>
    </div>
  );
}

function SubTabBtn({
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
      className={`px-3 py-1 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
