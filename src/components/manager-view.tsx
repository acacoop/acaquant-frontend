"use client";

import { usePersistedState } from "@/lib/use-persisted-state";
// Imports estáticos: la carga diferida (next/dynamic) hacía que cada tab trajera
// su chunk al entrar → se sentía lento (sobre todo Clientes). Con imports
// estáticos las tabs son instantáneas (cuesta un poco más el load inicial, pero
// Manager es admin-only y se prioriza la velocidad de navegación entre tabs).
import { AunesaExplorarPanel } from "./aunesa-explorar-panel";
import { AunesaAumPanel } from "./aunesa-aum-panel";
import { AunesaPosicionPanel } from "./aunesa-posicion-panel";
import { AunesaBoletosPanel } from "./aunesa-boletos-panel";
import { GruposPanel } from "./grupos-panel";
import { TabContrapartes } from "./manager-contrapartes-view";
import { TabAcaValores } from "./manager-aca-valores-view";
import { TabMesa } from "./manager-mesa-panel";
import { TabAca } from "./manager-aca-panel";
import { TabDocumentos } from "./manager-documentos-view";
import { ManagerDebugXirrPanel } from "./manager-debug-xirr";
import { ManagerDebugTeaPanel } from "./manager-debug-tea";
import { RolesPanel } from "./roles-panel";
import { UsuariosPanel } from "./usuarios-panel";
import { GROUP_HEADER, GROUP_TITLE, Pill } from "./manager-shared";
import { OpcionesExpiriesPanel, TabValidaciones } from "./manager-validaciones-panel";
import { TabClientes } from "./manager-clientes-panel";
import { TitulosGroup } from "./manager-titulos-panel";
import { ImportTenenciaPanel, OperacionesBackfillPanel } from "./manager-operaciones-panel";

// ── Panel: Opciones → elegir vencimientos a trackear ───────────────────────

type Tab =
  | "validaciones"
  | "titulos"
  | "clientes"
  | "contrapartes"
  | "aca-valores"
  | "aca"
  | "aunesa"
  | "operaciones"
  | "mesa"
  | "documentos"
  | "usuarios";

// AUNESA es un grupo con tres sub-vistas:
//  - FLUJO:    explorador de movimientos de Aunesa.
//  - AUM:      consulta de Valuaciones.AuM (la base) por cuenta/fecha.
//  - POSICIÓN: pega EN VIVO a Aunesa (posicionValuada) — para comparar
//              lo que Aunesa manda contra lo persistido en AUM.
// ── Grupos consolidados (sub-tabs con Pill, patrón AunesaGroup) ───────────────


// (2026-09-09) Acá vivían OBSERVABILIDAD (DIAGNÓSTICO → ÁRBOL + LOGS, y BASE) y
// antes LatenciaPanel. **Se dieron de baja las PANTALLAS, no los motores.**
//
// El user: *«no quiero más estas vistas dentro de MANAGER, ni DIAGNÓSTICO ni
// BASE»*. Es el mismo argumento que ya se aplicó a SALUD (2026-08-19), a IA y a
// LATENCIA: tener el estado del sistema en dos lugares —una pantalla que hay que
// acordarse de abrir y el AV AGENT que te busca— es tener dos verdades sin
// árbitro (REGLA #9). Gana el agente, que es el que avisa solo.
//
// Lo que NO se tocó, porque es del agente y no de la pantalla:
//   · `api/services/diagnostico.py::arbol()`  → lo lee el detector `motor_caido`.
//   · `api/services/diagnostico_registry.py`  → el registro de motores/jobs.
//   · `api/services/salud.py`                 → el motor de chequeos (detector `salud`).
//   · `api/services/logs_sistema.py`          → la lectura de journalctl (AGENT.md §0.ac).
// Se fueron los endpoints `/api/manager/diagnostico`, `/db-observabilidad`,
// `/logs` y `/logs/services`, y con ellos `api/services/db_obs.py`, que no tenía
// otro cliente. El peso de las tablas ya lo mide el agente en `agente/peso.py`.

// VALIDACIONES: checks + Opciones Vto (relocalizado de Backfills) + Debug XIRR.
function ValidacionesGroup() {
  const [sub, setSub] = usePersistedState<"checks" | "opciones" | "xirr" | "tea">("manager.valid.sub", "checks");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>VALIDACIONES</span>
        <Pill label="VALIDACIONES" active={sub === "checks"} onClick={() => setSub("checks")} />
        <Pill label="OPCIONES VTO" active={sub === "opciones"} onClick={() => setSub("opciones")} />
        <Pill label="DEBUG XIRR" active={sub === "xirr"} onClick={() => setSub("xirr")} />
        <Pill label="DEBUG TEA" active={sub === "tea"} onClick={() => setSub("tea")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "checks"   && <TabValidaciones />}
        {sub === "opciones" && <div className="h-full overflow-y-auto p-3"><OpcionesExpiriesPanel /></div>}
        {sub === "xirr"     && <ManagerDebugXirrPanel />}
        {sub === "tea"      && <ManagerDebugTeaPanel />}
      </div>
    </div>
  );
}

// USUARIOS: Usuarios + Roles y Permisos + Grupos.
function UsuariosGroup() {
  const [sub, setSub] = usePersistedState<"usuarios" | "roles" | "grupos">("manager.usuarios.sub", "usuarios");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>USUARIOS</span>
        <Pill label="USUARIOS" active={sub === "usuarios"} onClick={() => setSub("usuarios")} />
        <Pill label="ROLES Y PERMISOS" active={sub === "roles"} onClick={() => setSub("roles")} />
        <Pill label="GRUPOS" active={sub === "grupos"} onClick={() => setSub("grupos")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "usuarios" && <UsuariosPanel />}
        {sub === "roles"    && <RolesPanel />}
        {sub === "grupos"   && <GruposPanel />}
      </div>
    </div>
  );
}

function AunesaGroup({ modules }: { modules?: string[] | null }) {
  const has = (m: string) => modules == null || modules.includes(m);
  // `manager` (admin) ve todas las sub-vistas; `manager_aunesa` (asistente_comercial) SOLO Importar.
  const full = has("manager");
  const [sub, setSub] = usePersistedState<"flujo" | "aum" | "posicion" | "boletos" | "importar">("manager.aunesa.sub", "flujo");
  const subEff = full ? sub : "importar";
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2">AUNESA</span>
        {full && <Pill label="FLUJO" active={subEff === "flujo"} onClick={() => setSub("flujo")} />}
        {full && <Pill label="AUM" active={subEff === "aum"} onClick={() => setSub("aum")} />}
        {full && <Pill label="POSICIÓN" active={subEff === "posicion"} onClick={() => setSub("posicion")} />}
        {full && <Pill label="BOLETOS" active={subEff === "boletos"} onClick={() => setSub("boletos")} />}
        <Pill label="IMPORTAR AUM" active={subEff === "importar"} onClick={() => setSub("importar")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {full && subEff === "flujo"    && <AunesaExplorarPanel />}
        {full && subEff === "aum"      && <AunesaAumPanel />}
        {full && subEff === "posicion" && <AunesaPosicionPanel />}
        {full && subEff === "boletos"  && <AunesaBoletosPanel />}
        {subEff === "importar" && <ImportTenenciaPanel />}
      </div>
    </div>
  );
}

// Cada tab habilita con CUALQUIERA de los módulos listados (OR). El umbrella
// `manager` da acceso a todas (admin); las tabs que también listan un sub-módulo
// (comercial, clientes) son accesibles a `asistente_comercial` aunque NO tenga
// `manager`. Mantener sincronizado con el gating server-side en
// api/routers/manager/__init__.py — la API es la fuente de verdad.
const TAB_MODULES: Record<Tab, string[]> = {
  validaciones: ["manager"],
  titulos:      ["manager", "manager_titulos", "manager_instrumentos"],
  clientes:     ["manager", "manager_clientes"],
  contrapartes: ["manager", "manager_contrapartes"],
  "aca-valores": ["manager", "manager_clientes"],
  // ACA NO la da el umbrella `manager`: la da poder ESCRIBIR en ACA (allowlist
  // de Mesa de Dinero ∪ admin). `manager-aca` es una CAPACIDAD que publica
  // /api/me dentro de `modules` (no es un módulo del RBAC, igual que
  // `mesa-dinero`) — así un `asistente_comercial` que carga el histórico ve la
  // tab sin ser admin, y un admin sin allowlist tampoco entra por accidente.
  // Server-side lo enforcea `_ACA` en api/routers/manager/__init__.py.
  aca:          ["manager-aca"],
  aunesa:       ["manager", "manager_aunesa"],
  operaciones:  ["manager"],
  mesa:         ["manager"],
  documentos:   ["manager"],
  usuarios:     ["manager"],
};

export function ManagerView({ modules = null }: { modules?: string[] | null }) {
  const allTabs: { id: Tab; label: string }[] = [
    { id: "validaciones", label: "VALIDACIONES" },
    { id: "titulos",      label: "TÍTULOS"      },
    { id: "clientes",     label: "CLIENTES"     },
    { id: "contrapartes", label: "CONTRAPARTES" },
    { id: "aca-valores",  label: "ACA VALORES"  },
    // ACA: histórico de rendimientos + configuración de la vista /aca
    // (regla de moneda, emisores/clases de las métricas, series). Distinta de
    // ACA VALORES, que es el informe de retorno del FCI.
    { id: "aca",          label: "ACA"          },
    { id: "aunesa",       label: "AUNESA"       },
    { id: "operaciones",  label: "OPERACIONES"  },
    { id: "mesa",         label: "MESA"         },
    { id: "documentos",   label: "DOCUMENTOS"   },
    { id: "usuarios",     label: "USUARIOS"     },
  ];
  // modules === null → dev / backend caído: mostrar todo (sin RBAC en cliente).
  const tabs =
    modules === null
      ? allTabs
      : allTabs.filter((t) =>
          TAB_MODULES[t.id].some((m) => modules.includes(m)),
        );
  // canBulk: `manager` (admin) o `manager_clientes_bulk` (rol futuro con bulks pero sin umbrella).
  const canBulk =
    modules === null ||
    modules.includes("manager") ||
    modules.includes("manager_clientes_bulk");
  const [tabRaw, setTab] = usePersistedState<Tab>("manager.tab", tabs[0]?.id ?? "clientes");
  // Migración de tabs viejas persistidas: diagnostico/controles/jobs se habían
  // consolidado en observabilidad, y observabilidad se dio de baja entera
  // (2026-09-09). Sin este guard, a quien la tenía elegida la pantalla le abre
  // VACÍA y parece rota — cae a la primera tab que su rol sí tiene.
  const tab: Tab = tabs.some((t) => t.id === tabRaw)
    ? tabRaw
    : (tabs[0]?.id ?? "clientes");

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">MANAGER</span>
        {tabs.map((t) => (
          <Pill key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "validaciones" && <ValidacionesGroup />}
        {tab === "titulos"      && <TitulosGroup modules={modules} />}
        {tab === "clientes"     && <TabClientes canBulk={canBulk} />}
        {tab === "contrapartes" && <TabContrapartes />}
        {tab === "aca-valores"  && <TabAcaValores />}
        {tab === "aca"          && <TabAca />}
        {tab === "aunesa"       && <AunesaGroup modules={modules} />}
        {tab === "operaciones"  && <OperacionesBackfillPanel />}
        {tab === "mesa"         && <TabMesa />}
        {tab === "documentos"   && <TabDocumentos />}
        {tab === "usuarios"     && <UsuariosGroup />}
      </div>
    </div>
  );
}
