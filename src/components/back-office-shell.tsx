"use client";

import { usePersistedState } from "@/lib/use-persisted-state";
import { TitulosMercadoView } from "./titulos-mercado-view";
import { AcreenciasView } from "./acreencias-view";
import { TenenciaValorizadaView } from "./tenencia-valorizada-view";
import { TitulosEnAlquilerView } from "./titulos-en-alquiler-view";
import { ContabilidadView } from "./contabilidad-view";
import { TesoreriaView } from "./tesoreria-view";
import { SenebisView } from "./senebis-view";
import { TitulosNegativosView } from "./titulos-negativos-view";
import { InterbankingView } from "./interbanking-view";

// Tabs del Back Office. Senebis + Tenencia Valorizada + Títulos en Alquiler +
// Tesorería + Títulos / Mercado + Acreencias Clientes + Saldos de Cuentas
// Comitentes; nuevas se suman acá.
// El id de la tab sigue siendo "negativos" a propósito: está PERSISTIDO en el
// almacenamiento del navegador, así que renombrarlo mandaría a todos los que
// tenían esta pestaña abierta de vuelta al default. El nombre visible es lo
// único que cambia.
type Tab = "titulos_mercado" | "acreencias" | "tenencia" | "alquiler" | "contabilidad"
  | "tesoreria" | "senebis" | "negativos" | "interbanking";

export function BackOfficeShell() {
  // Default = Tenencia Valorizada (primera en la barra). Persistido: la
  // pestaña sobrevive a navegar y vuelve donde estabas — y habilita que el
  // guía te traiga directo a una pestaña (navegación asistida, v1.82).
  const [tab, setTab] = usePersistedState<Tab>("backoffice.tab", "tenencia");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 flex items-center gap-1 shrink-0">
        <TabBtn
          active={tab === "senebis"}
          onClick={() => setTab("senebis")}
        >
          Senebis
        </TabBtn>
        <TabBtn
          active={tab === "tenencia"}
          onClick={() => setTab("tenencia")}
        >
          Tenencia Valorizada
        </TabBtn>
        <TabBtn
          active={tab === "alquiler"}
          onClick={() => setTab("alquiler")}
        >
          Títulos en Alquiler
        </TabBtn>
        <TabBtn
          active={tab === "contabilidad"}
          onClick={() => setTab("contabilidad")}
        >
          Contabilidad
        </TabBtn>
        <TabBtn
          active={tab === "tesoreria"}
          onClick={() => setTab("tesoreria")}
        >
          Tesorería
        </TabBtn>
        <TabBtn
          active={tab === "interbanking"}
          onClick={() => setTab("interbanking")}
        >
          Interbanking
        </TabBtn>
        <TabBtn
          active={tab === "titulos_mercado"}
          onClick={() => setTab("titulos_mercado")}
        >
          Títulos / Mercado
        </TabBtn>
        <TabBtn
          active={tab === "acreencias"}
          onClick={() => setTab("acreencias")}
        >
          Acreencias Clientes
        </TabBtn>
        <TabBtn
          active={tab === "negativos"}
          onClick={() => setTab("negativos")}
        >
          Saldos de Cuentas Comitentes
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "senebis" && <SenebisView />}
        {tab === "tesoreria" && <TesoreriaView />}
        {tab === "interbanking" && <InterbankingView />}
        {tab === "titulos_mercado" && <TitulosMercadoView />}
        {tab === "acreencias" && <AcreenciasView />}
        {tab === "tenencia" && <TenenciaValorizadaView />}
        {tab === "alquiler" && <TitulosEnAlquilerView />}
        {tab === "contabilidad" && <ContabilidadView />}
        {tab === "negativos" && <TitulosNegativosView />}
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
      className={`text-[11px] tracking-wide uppercase px-3 py-2 border-b-2 ${
        active
          ? "text-[var(--t-accent)] border-[var(--t-accent)]"
          : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}
