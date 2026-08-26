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
  const pct = n0(c.pct_arancel ?? 80);
  const seg = n0(c.meses_seguido ?? 8);
  const mult = n0(c.multiplo ?? 3);
  const minD = n0(c.min_dias_op ?? 6);
  const caida = n0(c.caida_pct ?? 75);
  const atras = n0(c.meses_atras ?? 3);
  const piso = `$${n0(c.piso_aum ?? 10_000_000)}`;

  if (clave === "importan") return {
    titulo: "Quiénes importan",
    entra: `Las cuentas que, ordenadas de mayor a menor arancel, juntan entre todas el ${pct}% ` +
      `del arancel del mes elegido. Las demás no salen en la tabla, pero sí se cuentan en los ` +
      `cuatro grupos de arriba.`,
    columnas: [
      { c: "Cuenta · Cliente", v: "Número de comitente y denominación." },
      { c: "Operador · Nivel 3", v: "Quién la atiende y la clasificación, tal como están en la ficha del comitente." },
      { c: "Apareció", v: "En cuántos de los últimos 12 meses —contando el elegido— la cuenta tuvo al menos una operación." },
      { c: "Deja por mes", v: "El arancel que dejó la cuenta en el mes elegido. Es ese mes, no un promedio." },
      { c: "% del arancel", v: "Qué parte del arancel total del mes es esa cuenta." },
    ],
    etiquetas: [
      { c: "Núcleo", v: `entra en el ${pct}% del arancel y operó en ${seg} meses o más de los últimos 12.` },
      { c: "Grande irregular", v: `entra en el ${pct}% del arancel y operó en menos de ${seg} meses.` },
      { c: "Habitual", v: `no entra en el ${pct}% y operó en ${seg} meses o más.` },
      { c: "Ocasional", v: `no entra en el ${pct}% y operó en menos de ${seg} meses.` },
    ],
    notas: [
      `En la tabla solo pueden aparecer NÚCLEO y GRANDE IRREGULAR: son los dos grupos que entran ` +
        `en el ${pct}%. Los cuatro números de arriba cuentan a todas las cuentas que dejaron ` +
        `arancel en el mes.`,
      "Una cuenta que no dejó arancel en el mes elegido no está en ningún grupo ni en ningún contador.",
      "Los cuatro grupos son un filtro: al clickearlos, la tabla se acota a ese grupo.",
    ],
  };

  if (clave === "apagan") return {
    titulo: "Se están apagando",
    entra: `Cuentas que llevan más de ${mult} veces su propio ritmo sin operar. Para que haya ritmo ` +
      `que medir, la cuenta necesita al menos ${minD} días distintos con operaciones en los ` +
      `últimos 12 meses; con menos, no entra en la lista.`,
    columnas: [
      { c: "Suele operar cada", v: "Los días que pasan habitualmente entre una aparición y la " +
          "siguiente, en los últimos 12 meses. Es el valor del medio, no el promedio. Se cuentan " +
          "DÍAS, no boletos: cinco boletos el mismo día son una sola aparición." },
      { c: "Lleva sin operar", v: "Días desde la última operación. Si el mes elegido ya terminó se " +
          "cuentan hasta el último día de ese mes; si es el mes en curso, hasta hoy." },
      { c: "Veces su ritmo", v: "«Lleva sin operar» dividido «suele operar cada». 5× significa que " +
          "lleva cinco veces lo que esa cuenta suele tardar." },
      { c: "Retiró", v: `Plata que salió de la cuenta, neta, en los últimos ${atras} meses. «—» es ` +
          `que no salió plata (o entró más de lo que salió).` },
      { c: "Deja por mes", v: "El arancel de los últimos 12 meses dividido 12." },
      { c: "Última op", v: "Fecha del último boleto no anulado de la cuenta." },
    ],
    notas: [
      "La lista está ordenada por «deja por mes», de mayor a menor. NO está ordenada por cuánto se " +
        "apartó cada uno de su ritmo.",
      "El ritmo es propio de cada cuenta: no hay un plazo igual para todas. Veinte días sin operar " +
        "pueden ser muchos para una cuenta y normales para otra.",
      "Las filas pintadas son las que además retiraron plata.",
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
