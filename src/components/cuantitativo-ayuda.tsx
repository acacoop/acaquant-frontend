"use client";

import { useEffect } from "react";

// "¿Cómo se interpretan los datos?" — un DICCIONARIO por solapa de ANÁLISIS
// CUANTITATIVO. Sale en modal, encima de la pantalla, sin empujar la tabla.
//
// ⚠️ Esto explica QUÉ SIGNIFICA cada cosa, y nada más. No dice qué hacer, no
// interpreta las filas y no rotula clientes. Hubo una versión que sí lo hacía
// ("es una llamada para hoy", "entrá por los grande irregular", "es el
// cliente, no el mercado") y estaba mal por dos motivos: le ponía a los datos
// un significado que el sistema no puede saber, y quedaba desactualizada sola
// —seguía explicando una columna QUÉ PASÓ que ya se había borrado de la tabla—.
// Una definición envejece cuando cambia la columna; un consejo envejece solo.
//
// Cada solapa declara tres cosas y siempre en el mismo orden:
//
//     QUÉ ENTRA  ·  QUÉ SIGNIFICA CADA COLUMNA  ·  PRECISIONES
//
// Los cortes que el usuario mueve arriba entran acá como números: si cambió el
// 80% por 60%, el texto dice 60%. Un texto con el número fijo miente apenas
// alguien toca el corte.

type Def = { c: string; v: string };
type Ayuda = { titulo: string; entra: string; columnas: Def[]; etiquetas?: Def[]; notas: string[] };

const n0 = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 0 });

export function ayudaDe(clave: string, c: Record<string, number>): Ayuda | null {
  const caida = n0(c.caida_pct ?? 75);
  const atras = n0(c.meses_atras ?? 3);
  // DOS pisos distintos: el de PERDIERON decide quién entra a la lista; el de
  // CONOCÉ decide desde cuándo el ROA significa algo. Un solo `piso` acá hacía
  // que la ayuda dijera $10.000.000 donde el corte real es $1.000.000.
  const piso = `$${n0(c.piso_aum ?? 10_000_000)}`;
  const pisoRoa = `$${n0(c.piso_roa ?? 1_000_000)}`;

  if (clave === "conoce") return {
    titulo: "Conocé a tu cliente",
    entra: "Todos los clientes del segmento elegido. Sin segmento la tabla no se " +
      "dibuja: el ROA de un institucional y el de un cliente de retail no son " +
      "comparables, y mezclados los institucionales caen todos juntos al fondo de " +
      "la lista como si estuvieran desaprovechados.",
    columnas: [
      { c: "Arancel 12m", v: "Lo que la cuenta dejó de arancel en los últimos 12 meses." },
      { c: "Tiene (prom. 12m)", v: "El promedio de lo que la cuenta tuvo en los últimos " +
          "12 meses: se toma una foto de la tenencia a fin de cada mes y se promedian " +
          "las 12. NO es la foto de hoy. Un mes en el que la cuenta no aparece cuenta " +
          "como cero." },
      { c: "ROA", v: "El arancel de los últimos 12 meses dividido el promedio de lo que " +
          "la cuenta tuvo en esos mismos 12 meses, en bps (100 bps = 1%). Los dos " +
          "números están en las columnas de al lado, así que se verifica con una " +
          `calculadora. Debajo de ${pisoRoa} de promedio no se calcula y dice "—".` },
      { c: "Cupo", v: "El cupo transaccional que el custodio le reconoce a la cuenta. " +
          "Se carga a mano por Excel y no queda registrada la fecha de carga." },
      { c: "SOW", v: "El promedio de lo que la cuenta tuvo en 12 meses dividido su cupo " +
          "transaccional. Qué parte de la plata que el custodio le reconoce está acá. " +
          "También se verifica con las dos columnas de al lado." },
      { c: "Operación favorita", v: "El tipo de operación en el que la cuenta dejó MÁS " +
          "ARANCEL en los 12 meses (no el de más volumen). En el tooltip, cuánto dejó " +
          "y cuántos tipos distintos usa." },
    ],
    notas: [
      `ROA promedio, arriba de la tabla, es el promedio del segmento elegido. Se mueve ` +
        `cuando movés el piso: subirlo saca cuentas del cálculo.`,
      "El ROA en rojo está por debajo del ROA del cliente que queda justo en el medio " +
        "del segmento.",
      "Las filas pintadas son cuentas que TIENEN plata y no dejaron un solo peso de " +
        "arancel en 12 meses.",
      "Se puede ordenar por cualquier columna con números: click en el título. Por " +
        "defecto ordena por lo que tiene.",
      "El «—» del ROA no es cero: o no hay foto de tenencia, o la cuenta no tiene " +
        "nada, o tiene tan poco que el cociente no significaría nada. El motivo " +
        "exacto está en el tooltip de la celda.",
      "Los montos siguen la moneda de la barra y los filtros de arriba. El segmento " +
        "NO es uno de esos filtros: es el eje de la vista.",
    ],
  };

  if (clave === "perdieron") return {
    titulo: "Perdieron AuM",
    entra: `Cuentas que hace ${atras} meses tenían más de ${piso} y hoy tienen al menos ${caida}% ` +
      `menos que en esa fecha.`,
    columnas: [
      { c: "Tenía (fecha)", v: "Cuánto valía la cuenta en la foto de tenencia de esa fecha." },
      { c: "Tiene (fecha)", v: "Cuánto vale en la foto más reciente." },
      { c: "Caída", v: "Cuánto bajó entre esas dos fotos, en porcentaje." },
      { c: "Retiró", v: "Plata que salió de la cuenta, neta, en el mismo período. «nada» es que no " +
          "salió plata (o entró más de lo que salió)." },
    ],
    notas: [
      "Las dos fechas de los títulos son las fotos reales que se compararon. Si no caen justo a fin " +
        "de mes, es porque ese día no hubo foto.",
      "La línea de arriba de la tabla dice cuánto cambió el AuM de TODO el libro entre esas mismas " +
        "dos fechas, con los mismos filtros.",
      `El piso de ${piso} deja afuera a las cuentas chicas: sin él, una caída del ${caida}% sobre ` +
        `$50.000 entra en la lista igual que una sobre $500.000.000.`,
      "Una caída sin retiro puede ser el valor de lo que la cuenta tiene, o títulos transferidos a " +
        "otro agente. Con estos datos no se distingue una cosa de la otra.",
      "La lista está ordenada por cuántos PESOS bajó, no por porcentaje.",
    ],
  };

  return null;
}

export function ModalAyuda(
  { clave, cortes, onCerrar }:
  { clave: string; cortes: Record<string, number>; onCerrar: () => void },
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const a = ayudaDe(clave, cortes);
  if (!a) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={`Cómo se interpretan los datos · ${a.titulo}`}
        className="w-full max-w-[760px] max-h-[88vh] flex flex-col bg-[var(--t-panel)]
                   border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold truncate">
            Cómo se interpretan los datos · {a.titulo}
          </span>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70"
            aria-label="Cerrar">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <Bloque titulo="Qué entra en esta lista">
            <p className="m-0 text-[12.5px] leading-snug text-[var(--t-text-dim)]">{a.entra}</p>
          </Bloque>

          <Bloque titulo="Qué significa cada columna">
            <Defs items={a.columnas} />
          </Bloque>

          {a.etiquetas && (
            <Bloque titulo="La palabra al lado del nombre">
              <Defs items={a.etiquetas} />
            </Bloque>
          )}

          <Bloque titulo="Precisiones">
            <ul className="m-0 pl-4 flex flex-col gap-1">
              {a.notas.map((x) => (
                <li key={x} className="text-[12.5px] leading-snug text-[var(--t-text-dim)]">{x}</li>
              ))}
            </ul>
          </Bloque>

          <div className="px-4 py-2 bg-[var(--t-surface)] text-[9px] text-[var(--t-text-muted)]">
            Los números de este texto son los cortes que están puestos ahora en la barra de arriba:
            si los movés, esto cambia con ellos.
          </div>
        </div>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3 border-b border-[var(--t-border)]">
      <h3 className="text-[9.5px] uppercase tracking-widest text-[var(--t-accent)] font-semibold mb-2">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Defs({ items }: { items: Def[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((x) => (
        <div key={x.c} className="grid gap-3 items-baseline"
          style={{ gridTemplateColumns: "150px 1fr" }}>
          <span className="text-[12px] font-semibold text-[var(--t-text)] text-right">{x.c}</span>
          <span className="text-[12.5px] leading-snug text-[var(--t-text-dim)]">{x.v}</span>
        </div>
      ))}
    </div>
  );
}
