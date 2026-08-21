"use client";

import { useEffect, useState } from "react";
import { CarterasEvolucionView } from "@/components/carteras-evolucion-view";
import { CarterasInformeView, type InformeTab } from "@/components/carteras-informe-view";
import dynamic from "next/dynamic";
import { PnLTitulosView } from "@/components/pnl-titulos-view";
import { CuentaCombobox, type CuentaDoc } from "@/components/aum-view";
import { Pill } from "@/components/ui/informe";
import { BotonBarra, EnLaBarra } from "@/components/ui/slot-barra-inferior";

// TOTALES y AJUSTES salen del bundle de la vista y se bajan recién al abrirlos.
//
// No es micro-optimización: TOTALES arrastra el consolidado de TODAS las cuentas
// (`por-cuenta-view` + sus tablas) y AJUSTES un ABM entero, y hasta ahora los
// pagaba en cada carga TODO el que entraba a mirar una cartera — aunque no los
// tocara nunca, que es el caso normal. Con el gate de admin de `page.tsx`
// encima, para el resto de la mesa este código directamente no existe.
//
// `ssr: false` porque ninguno de los dos aporta nada al HTML inicial: no se ven
// hasta que alguien hace click.
const PnLTotalesView = dynamic(
  () => import("@/components/pnl-totales-view").then((m) => m.PnLTotalesView),
  { ssr: false, loading: () => <Cargando que="TOTALES" /> },
);
const PnlAjustesModal = dynamic(
  () => import("@/components/pnl-ajustes-modal").then((m) => m.PnlAjustesModal),
  { ssr: false },
);

function Cargando({ que }: { que: string }) {
  return (
    <div className="h-full flex items-center justify-center text-[12px] text-[var(--t-text-muted)]">
      Cargando {que}…
    </div>
  );
}

// NEGOCIO → CARTERAS — la barra de la vista y el estado que comparten sus tabs.
//
// **Refactor 2026-08-21.** La tab PORTAFOLIO era un tablero de cuatro paneles
// apretados donde cada número había que buscarlo. Se partió en las tres tabs con
// las que la mesa ya lee una cartera en `/aca` —RESUMEN, ACTIVOS, MÉTRICAS— más
// EVOLUCIÓN, que es la mitad de abajo del tablero viejo (el chart y la tabla
// mensual) y la única pantalla que cuenta el RENDIMIENTO en vez de una foto.
//
// PNL TÍTULOS y TOTALES no cambiaron por dentro: son otra pregunta (el PnL
// boleto por boleto y el consolidado de TODAS las cuentas, que ni siquiera mira
// el selector de cuenta).
//
// **AJUSTES y TOTALES viven en la BARRA INFERIOR** (2026-08-21), al lado de
// BRIEFING y AV AGENT, y solo mientras esta vista está abierta. El motivo es de
// jerarquía: la barra de arriba es el informe —cuatro tabs que se recorren
// leyendo— y meter ahí un botón de escritura de eventos corporativos y una
// pantalla que ni mira la cuenta elegida las ponía a competir con lo que la
// gente entra a hacer. Abajo es exactamente donde ya vive lo que se consulta
// cada tanto. Cómo cruzan del árbol de la vista al del layout:
// `ui/slot-barra-inferior.tsx`.
//
// TOTALES sigue siendo una sub-tab de verdad (mismo `sub=` en la URL, mismo
// componente, mismo cuerpo de la pantalla): lo único que se mudó es POR DÓNDE se
// entra. Un link viejo a `?sub=totales` sigue funcionando igual.
//
// Las tres primeras las sirve UN componente y UN fetch (`/vista`): moverse entre
// RESUMEN y MÉTRICAS no vuelve a pegarle a la base ni a correr el motor de PnL.
// Por eso `CarterasInformeView` se renderiza desde la MISMA rama del árbol para
// las tres — si cada tab lo montara por su lado, React lo desmontaría y cada
// click volvería a pagar la consulta.

// Sub-vistas, en el orden en que se leen. `sub` y `cuenta` viven en la URL para
// no perder la posición al refrescar (y para poder mandar un link).
const _VAL_SUBTABS = ["resumen", "activos", "metricas", "evolucion",
                      "pnl_titulos", "totales"] as const;
type ValSubtab = (typeof _VAL_SUBTABS)[number];

const _LABEL: Record<ValSubtab, string> = {
  resumen: "RESUMEN",
  activos: "ACTIVOS",
  metricas: "MÉTRICAS",
  evolucion: "EVOLUCIÓN",
  pnl_titulos: "PNL TÍTULOS",
  totales: "TOTALES",
};

const _TABS_INFORME = ["resumen", "activos", "metricas"] as const;
const _esInforme = (t: ValSubtab): t is InformeTab =>
  (_TABS_INFORME as readonly string[]).includes(t);

// Las que se dibujan como pill ARRIBA. TOTALES queda afuera —se entra por la
// barra de abajo— pero sigue siendo una sub-tab válida en todo lo demás.
const _PILLS = _VAL_SUBTABS.filter((t) => t !== "totales");

function _readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
function _writeUrlParams(params: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url.toString());
}

export function ValuacionesShell({ esAdmin = false }: { esAdmin?: boolean }) {
  const [cuentas, setCuentas] = useState<CuentaDoc[]>([]);
  const [valCuenta, setValCuenta] = useState<string>(
    () => _readUrlParam("cuenta") || "",
  );
  const [valSubtab, setValSubtab] = useState<ValSubtab>(() => {
    const v = _readUrlParam("sub");
    // Un `?sub=totales` de alguien que no es admin cae en RESUMEN en vez de
    // dejar la pantalla en blanco: la tab existe, pero para esa persona no.
    if (v === "totales" && !esAdmin) return "resumen";
    return (_VAL_SUBTABS as readonly string[]).includes(v || "")
      ? (v as ValSubtab)
      : "resumen";
  });
  // Modal de AJUSTES DE PnL (eventos corporativos sin boleto: splits, canjes).
  // `ajustesVersion` se bumpea tras cada escritura y remonta PNL TÍTULOS
  // (key) para que refetchee el PnL recalculado con el ajuste nuevo.
  const [ajustesAbierto, setAjustesAbierto] = useState(false);
  const [ajustesVersion, setAjustesVersion] = useState(0);

  // Sync subtab + cuenta a la URL (replaceState para no llenar el history).
  useEffect(() => {
    _writeUrlParams({
      sub: valSubtab !== "resumen" ? valSubtab : null,
      cuenta: valCuenta || null,
    });
  }, [valSubtab, valCuenta]);

  // Lista de cuentas — mismo fetch que tenía AumView. Si no había selección
  // previa (ni desde URL) defaulteamos a [100] ACA VALORES S.A. (la cuenta propia);
  // fallback a la primera de la lista si por algún motivo no estuviera.
  useEffect(() => {
    fetch("/api/portfolio-cuentas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { cuentas: CuentaDoc[] }) => {
        const list = d.cuentas || [];
        setCuentas(list);
        // Default via updater: no leer valCuenta del closure → la dep queda []
        // (con [valCuenta] la lista COMPLETA se re-bajaba en cada cambio de
        // cuenta — navegar 10 cuentas con ▶ eran 10 fetches redundantes).
        if (list.length) {
          setValCuenta((prev) =>
            prev || (list.find((c) => c.id_cuenta === "100") || list[0]).id_cuenta);
        }
      })
      .catch(() => {
        /* sin lista — el selector queda vacío */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idx = cuentas.findIndex((c) => c.id_cuenta === valCuenta);
  const prev = idx > 0 ? cuentas[idx - 1].id_cuenta : null;
  const next =
    idx >= 0 && idx < cuentas.length - 1 ? cuentas[idx + 1].id_cuenta : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CUENTA</span>
          <button
            onClick={() => prev && setValCuenta(prev)}
            disabled={!prev}
            title="Cuenta anterior"
            className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
          >
            ◀
          </button>
          <CuentaCombobox
            cuentas={cuentas}
            value={valCuenta}
            onChange={setValCuenta}
          />
          <button
            onClick={() => next && setValCuenta(next)}
            disabled={!next}
            title="Cuenta siguiente"
            className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
          >
            ▶
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {_PILLS.map((s) => (
            <Pill key={s} label={_LABEL[s]} active={valSubtab === s}
                  onClick={() => setValSubtab(s)} />
          ))}
        </div>
      </div>

      {/* AJUSTES y TOTALES, abajo y SOLO PARA ADMIN. El portal se desmonta con
          esta vista, así que «solo cuando la vista está abierta» no es una
          condición que alguien tenga que mantener: es dónde vive el código. Y
          sin admin no se renderiza nada, con lo cual los dos chunks diferidos
          nunca se piden. */}
      {esAdmin && (
      <EnLaBarra>
        <BotonBarra
          label="AJUSTES" icono="✎"
          onClick={() => setAjustesAbierto(true)}
          activo={ajustesAbierto}
          title="Ajustes de PnL por eventos corporativos (splits, canjes) — escritura solo admin"
        />
        <BotonBarra
          label="TOTALES" icono="Σ"
          onClick={() => setValSubtab(valSubtab === "totales" ? "resumen" : "totales")}
          activo={valSubtab === "totales"}
          title="Consolidado de TODAS las cuentas — no mira el selector de cuenta. Volvé a tocarlo para salir."
        />
      </EnLaBarra>
      )}

      <div className="flex-1 min-h-0">
        {valSubtab === "totales" ? (
          // TOTALES no depende de una cuenta específica — agrega TODAS.
          <PnLTotalesView />
        ) : !valCuenta ? (
          <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
            Cargando cuentas…
          </div>
        ) : _esInforme(valSubtab) ? (
          // Las tres tabs del informe comparten este componente A PROPÓSITO:
          // así comparten también el fetch y cambiar de tab no cuesta una
          // consulta ni una corrida del motor de PnL.
          <CarterasInformeView
            idCuenta={valCuenta}
            nombreCuenta={cuentas.find((c) => c.id_cuenta === valCuenta)?.cuenta}
            tab={valSubtab}
          />
        ) : valSubtab === "evolucion" ? (
          <CarterasEvolucionView
            idCuenta={valCuenta}
            nombreCuenta={cuentas.find((c) => c.id_cuenta === valCuenta)?.cuenta}
          />
        ) : (
          <PnLTitulosView key={ajustesVersion} idCuenta={valCuenta} />
        )}
      </div>

      {ajustesAbierto && (
        <PnlAjustesModal
          onCerrar={() => setAjustesAbierto(false)}
          onCambio={() => setAjustesVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
