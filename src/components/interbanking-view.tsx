"use client";

import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → INTERBANKING. Los extractos de los bancos de ACA, para CONCILIAR.
 *
 * Se elige UNA cuenta y UN rango de fechas, y se ve lo que dice el banco:
 * el extracto día por día (apertura, créditos, débitos, cierre) y el detalle de
 * movimientos.
 *
 * De dónde sale el dato: `jobs/interbanking_sync` trae los extractos a `bancos.*`
 * cada 2 horas (9 a 19 ART) y esta vista lee de ahí. **La pantalla nunca le pega
 * a Interbanking**: el límite de 100 llamadas/minuto es del ABONADO y no del
 * proceso, así que unos pocos usuarios refrescando podrían agotar la cuota y
 * romper el job. Por eso la barra muestra SIEMPRE cuándo fue la última
 * sincronización: una tabla vacía con el job caído no es "no hubo movimientos".
 *
 * Lo que NO se muestra, por diseño (el backend directamente no lo manda):
 * el CBU y el CUIT de nuestras cuentas, el número de cuenta completo — va solo
 * la terminación — y el CUIT de la contraparte, que viene enmascarado.
 *
 * Las dos alertas de conciliación las calcula el BACKEND, no esta pantalla:
 *   · NO CIERRA   → apertura + créditos − débitos ≠ cierre, según el banco.
 *   · INCOMPLETO  → guardamos menos (o más) movimientos de los que el propio
 *                   extracto dice que tiene ese día.
 */

type Cuenta = {
  id: number;
  banco: string;
  banco_nombre: string;
  tipo: string;
  moneda: string;
  etiqueta: string;
  referencia: string;
  activa: boolean;
};

type Dia = {
  fecha: string;
  saldo_apertura: number | null;
  saldo_cierre: number | null;
  creditos: number | null;
  debitos: number | null;
  movimientos_banco: number | null;
  movimientos_base: number | null;
  cierra: boolean | null;
  diferencia: number | null;
};

type Movimiento = {
  fecha: string | null;
  hora: string | null;
  importe: number | null;
  tipo: string | null;
  descripcion: string;
  concepto: string;
  codigo: string | null;
  extracto: string | null;
  correlativo: number | null;
  comprobante: number | null;
  contraparte: string | null;
  contraparte_cuit: string | null;
};

type Resp = {
  cuentas: Cuenta[];
  cuenta_id: number | null;
  desde: string;
  hasta: string;
  dias: Dia[];
  movimientos: Movimiento[];
  resumen: {
    dias: number;
    movimientos: number;
    creditos: number;
    debitos: number;
    neto: number;
    dias_que_no_cierran: string[];
    dias_incompletos: string[];
    saldo_final: number | null;
  };
  sync: { corrida_at: string; cuentas: number; con_error: number } | null;
};

const VACIO: Resp = {
  cuentas: [],
  cuenta_id: null,
  desde: "",
  hasta: "",
  dias: [],
  movimientos: [],
  resumen: {
    dias: 0, movimientos: 0, creditos: 0, debitos: 0, neto: 0,
    dias_que_no_cierran: [], dias_incompletos: [], saldo_final: null,
  },
  sync: null,
};

// El dato cambia cada 2 horas, así que pollear seguido no aporta. 60s alcanza
// para que la barra de sincronización no quede vieja.
const POLL_MS = 60_000;

function plata(v: number | null | undefined, moneda = "") {
  if (v === null || v === undefined) return "—";
  const s = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
  return moneda ? `${moneda} ${s}` : s;
}

function haceCuanto(iso: string | null | undefined, ahora: number) {
  if (!iso || !ahora) return "—";
  const min = Math.round((ahora - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

export function InterbankingView() {
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  // Arrancan vacías A PROPÓSITO: sin fechas el backend usa ayer+hoy, así que el
  // rango por default lo decide el servidor y no el reloj del navegador. Se
  // sincronizan con lo que devuelve la primera respuesta.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [panel, setPanel] = useState<"extracto" | "movimientos">("extracto");

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (cuentaId !== null) p.set("cuenta_id", String(cuentaId));
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    const qs = p.toString();
    return `/api/back-office/interbanking/vista${qs ? `?${qs}` : ""}`;
  }, [cuentaId, desde, hasta]);

  const { data, lastAt, error } = usePoll<Resp>(url, VACIO, POLL_MS, {
    fetchOnMount: true,
  });

  useEffect(() => {
    if (!desde && data.desde) setDesde(data.desde);
    if (!hasta && data.hasta) setHasta(data.hasta);
    if (cuentaId === null && data.cuenta_id !== null) setCuentaId(data.cuenta_id);
  }, [data.desde, data.hasta, data.cuenta_id, desde, hasta, cuentaId]);

  const cuenta = data.cuentas.find((c) => c.id === data.cuenta_id) || null;
  const mon = cuenta?.moneda || "";
  const r = data.resumen;
  const noCierran = new Set(r.dias_que_no_cierran);
  const incompletos = new Set(r.dias_incompletos);

  return (
    <div className="h-full min-h-0 flex flex-col text-[12px]">
      {/* ── Barra de filtros ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            Cuenta
          </span>
          <select
            value={cuentaId ?? ""}
            onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)}
            className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[12px] min-w-[280px]"
          >
            {data.cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco_nombre.trim()} · {c.tipo} {c.moneda} · {c.referencia}
                {c.etiqueta ? ` · ${c.etiqueta}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            Desde
          </span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[12px]"
          />
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            Hasta
          </span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[12px]"
          />
        </label>

        <div className="ml-auto text-[10px] text-[var(--t-text-dim)] text-right leading-tight">
          <div>
            Sincronizado con el banco {haceCuanto(data.sync?.corrida_at, lastAt)}
            {data.sync?.con_error ? (
              <span className="text-[var(--t-neg)]">
                {" "}· {data.sync.con_error} cuentas fallaron
              </span>
            ) : null}
          </div>
          <div>El job corre cada 2 hs, de 9 a 19</div>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 px-3 py-1.5 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)] border-b border-[var(--t-border)]">
          No se pudo leer: {error}
        </div>
      ) : null}

      {/* ── Resumen del rango ────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--t-border)] px-3 py-2 flex flex-wrap gap-6">
        <Dato label="Saldo al cierre" valor={plata(r.saldo_final, mon)} fuerte />
        <Dato label="Créditos" valor={plata(r.creditos, mon)} />
        <Dato label="Débitos" valor={plata(r.debitos, mon)} />
        <Dato label="Neto" valor={plata(r.neto, mon)} />
        <Dato label="Días" valor={String(r.dias)} />
        <Dato label="Movimientos" valor={String(r.movimientos)} />
      </div>

      {(r.dias_que_no_cierran.length > 0 || r.dias_incompletos.length > 0) && (
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] flex flex-col gap-1 text-[11px]">
          {r.dias_que_no_cierran.length > 0 && (
            <div className="text-[var(--t-neg)]">
              NO CIERRA en {r.dias_que_no_cierran.length} día(s):{" "}
              {r.dias_que_no_cierran.join(", ")} — apertura + créditos − débitos no da
              el cierre que informa el banco.
            </div>
          )}
          {r.dias_incompletos.length > 0 && (
            <div className="text-[var(--t-accent)]">
              INCOMPLETO en {r.dias_incompletos.length} día(s):{" "}
              {r.dias_incompletos.join(", ")} — tenemos guardados menos (o más)
              movimientos de los que el propio extracto declara.
            </div>
          )}
        </div>
      )}

      {/* ── Selector de panel ────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--t-border)] px-3 flex gap-1">
        <Pill activo={panel === "extracto"} onClick={() => setPanel("extracto")}>
          Extracto ({data.dias.length})
        </Pill>
        <Pill activo={panel === "movimientos"} onClick={() => setPanel("movimientos")}>
          Movimientos ({data.movimientos.length})
        </Pill>
      </div>

      {/* ── Tablas ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {panel === "extracto" ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Fecha</Th>
                <Th right>Apertura</Th>
                <Th right>Créditos</Th>
                <Th right>Débitos</Th>
                <Th right>Cierre</Th>
                <Th right>Movs.</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {data.dias.map((d) => {
                const mal = noCierran.has(d.fecha);
                const inc = incompletos.has(d.fecha);
                return (
                  <tr
                    key={d.fecha}
                    className={`border-b border-[var(--t-border)] ${
                      mal ? "bg-[var(--t-tint-red)]" : inc ? "bg-[var(--t-tint-amber)]" : ""
                    }`}
                  >
                    <Td>{d.fecha}</Td>
                    <Td right>{plata(d.saldo_apertura)}</Td>
                    <Td right>{plata(d.creditos)}</Td>
                    <Td right>{plata(d.debitos)}</Td>
                    <Td right strong>{plata(d.saldo_cierre)}</Td>
                    <Td right>
                      {d.movimientos_base}
                      {d.movimientos_banco !== d.movimientos_base
                        ? ` / ${d.movimientos_banco}`
                        : ""}
                    </Td>
                    <Td>
                      {mal ? (
                        <span className="text-[var(--t-neg)]">
                          NO CIERRA ({plata(d.diferencia)})
                        </span>
                      ) : inc ? (
                        <span className="text-[var(--t-accent)]">INCOMPLETO</span>
                      ) : (
                        <span className="text-[var(--t-text-dim)]">ok</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {data.dias.length === 0 && <Vacia cols={7} hubo={lastAt > 0} />}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Fecha</Th>
                <Th>Hora</Th>
                <Th>Descripción</Th>
                <Th>Concepto</Th>
                <Th>Contraparte</Th>
                <Th>Comprob.</Th>
                <Th right>Importe</Th>
              </tr>
            </thead>
            <tbody>
              {data.movimientos.map((m, i) => (
                <tr
                  key={`${m.fecha}-${m.extracto}-${m.correlativo}-${i}`}
                  className="border-b border-[var(--t-border)]"
                >
                  <Td>{m.fecha}</Td>
                  <Td>{m.hora || "—"}</Td>
                  <Td>{m.descripcion}</Td>
                  <Td>{m.concepto}</Td>
                  <Td>
                    {m.contraparte || "—"}
                    {m.contraparte_cuit ? (
                      <span className="text-[var(--t-text-dim)]"> · {m.contraparte_cuit}</span>
                    ) : null}
                  </Td>
                  <Td>{m.comprobante || "—"}</Td>
                  <Td
                    right
                    strong
                    className={
                      m.tipo === "C"
                        ? "text-[var(--t-pos)]"
                        : "text-[var(--t-neg)]"
                    }
                  >
                    {m.tipo === "D" ? "−" : "+"}
                    {plata(m.importe)}
                  </Td>
                </tr>
              ))}
              {data.movimientos.length === 0 && <Vacia cols={7} hubo={lastAt > 0} />}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
        {label}
      </div>
      <div className={fuerte ? "text-[14px] font-semibold" : "text-[13px]"}>{valor}</div>
    </div>
  );
}

function Pill({
  activo, onClick, children,
}: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] uppercase tracking-wide px-3 py-1.5 border-b-2 ${
        activo
          ? "text-[var(--t-accent)] border-[var(--t-accent)]"
          : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-2 py-1.5 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children, right, strong, className = "",
}: {
  children: React.ReactNode; right?: boolean; strong?: boolean; className?: string;
}) {
  return (
    <td
      className={`px-2 py-1 ${right ? "text-right tabular-nums" : ""} ${
        strong ? "font-semibold" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** Una tabla vacía ANTES del primer fetch no significa lo mismo que después. */
function Vacia({ cols, hubo }: { cols: number; hubo: boolean }) {
  return (
    <tr>
      <td colSpan={cols} className="px-2 py-6 text-center text-[var(--t-text-dim)]">
        {hubo ? "Sin datos para esta cuenta y este rango." : "Cargando…"}
      </td>
    </tr>
  );
}
