"use client";

import { useEffect, useState } from "react";
import { DolarMepCompraView } from "./dolar-mep-compra-view";
import { DolarMepVentaView } from "./dolar-mep-venta-view";
import {
  ACCOUNT_DEFAULT_FALLBACK,
  Cotizacion,
  CuentaDescubierta,
  Rueda,
  SaldoCuenta,
  fmtTime,
} from "./dolar-mep-shared";

type SubTab = "compra" | "venta";

export function DolarMepShell() {
  // Estado compartido entre las sub-tabs (rueda/monto/comision/account).
  // Cuando el user cambia entre COMPRA y TRADING, los valores se preservan.
  const [tab, setTab] = useState<SubTab>("compra");
  const [rueda, setRueda] = useState<Rueda>("CI");
  const [monto, setMonto] = useState("100000");
  const [montoUsd, setMontoUsd] = useState("70");
  const [comision, setComision] = useState("0.62");
  const [account, setAccount] = useState(ACCOUNT_DEFAULT_FALLBACK);

  // Cuentas descubiertas — populadas por jobs.descubrir_cuentas en el
  // backend. El frontend las trae 1 vez al montar (no cambian durante la
  // sesión). Si la lista está vacía, mostramos un mensaje en el form.
  const [cuentas, setCuentas] = useState<CuentaDescubierta[]>([]);

  // Cotización + saldo: shared para no duplicar polls.
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [saldo, setSaldo] = useState<SaldoCuenta | null>(null);

  async function fetchSaldoNow() {
    if (!account) return;
    try {
      const r = await fetch(
        `/api/risk/account/saldo?rueda=${rueda}&account=${account}`,
        { cache: "no-store" },
      );
      if (r.ok) setSaldo(await r.json());
      else setSaldo(null);
    } catch {
      // ignore
    }
  }

  // Cargar listado de cuentas (1 vez al montar). La cuenta arranca SIEMPRE
  // vacía: no se restaura de localStorage (un navegador compartido en la mesa
  // heredaría la cuenta del usuario anterior → disparo a cuenta equivocada).
  // El user debe elegirla manualmente en cada sesión antes de operar.
  useEffect(() => {
    let alive = true;
    async function fetchCuentas() {
      try {
        const r = await fetch("/api/risk/account/listado", { cache: "no-store" });
        if (!alive || !r.ok) return;
        const list = (await r.json()) as CuentaDescubierta[];
        setCuentas(list);
      } catch {
        // ignore
      }
    }
    void fetchCuentas();
    return () => {
      alive = false;
    };
  }, []);

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
      if (!alive) return;
      await fetchSaldoNow();
    }
    fetchCot();
    fetchSaldo();
    // Cotización cada 5s (AL30 saca trade cada varios seg, 5s alcanza).
    // Saldo cada 60s — el broker recalcula los balances con poca
    // frecuencia, refrescar más seguido es desperdicio. El user tiene
    // el botón ↻ del SaldoBox para forzar refresh inmediato post-operativa.
    const idCot = setInterval(fetchCot, 5000);
    const idSal = setInterval(fetchSaldo, 60000);
    return () => {
      alive = false;
      clearInterval(idCot);
      clearInterval(idSal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rueda, account]);

  const mep = cot?.mep_implicito ?? null;
  const precioAl30 = cot?.al30?.price ?? null;
  const precioAl30d = cot?.al30d?.price ?? null;

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--t-panel)]">
      {/* Sub-tabs + cotización en una sola fila compacta */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <div className="flex items-center gap-1">
          <SubTabBtn active={tab === "compra"} onClick={() => setTab("compra")}>
            COMPRA
          </SubTabBtn>
          <SubTabBtn active={tab === "venta"} onClick={() => setTab("venta")}>
            VENTA
          </SubTabBtn>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] tracking-wider text-[var(--t-text-dim)]">MEP {rueda}</span>
          <span className="text-[20px] font-bold tracking-wide text-[var(--t-accent)] tabular-nums leading-none">
            {mep !== null ? `$${mep.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-3 text-[10px] text-[var(--t-text-dim)]">
          <span>AL30: {precioAl30 !== null ? `$${precioAl30.toFixed(2)}` : "—"}</span>
          <span>AL30D: {precioAl30d !== null ? `US$${precioAl30d.toFixed(2)}` : "—"}</span>
          {cot?.al30?.ts && (
            <span className="text-[var(--t-text-muted)]">last {fmtTime(cot.al30.ts)}</span>
          )}
        </div>
        <div className="ml-auto text-[10px] text-[var(--t-text-muted)]">refresca cada 2s</div>
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
            cuentas={cuentas}
            cot={cot}
            saldo={saldo}
            onRefreshSaldo={fetchSaldoNow}
          />
        ) : (
          <DolarMepVentaView
            rueda={rueda}
            setRueda={setRueda}
            montoUsd={montoUsd}
            setMontoUsd={setMontoUsd}
            comision={comision}
            setComision={setComision}
            account={account}
            setAccount={setAccount}
            cuentas={cuentas}
            cot={cot}
            saldo={saldo}
            onRefreshSaldo={fetchSaldoNow}
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
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
