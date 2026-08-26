"use client";

// "¿Cómo se interpretan los datos?" — una por solapa de ANÁLISIS CUANTITATIVO.
//
// Escrito para que lo lea alguien de gerencia que abre la pantalla por primera
// vez: sin palabras técnicas, sin fórmulas, sin nombres de campos. Cuatro
// preguntas siempre en el mismo orden, así se aprende a leerlas una sola vez:
//
//     ¿Qué estoy viendo?  ·  ¿Cómo leo una fila?  ·  ¿Qué hago?  ·  Ojo con...
//
// El último bloque no es relleno: es lo que evita que alguien saque una
// conclusión equivocada de un número correcto, que es la forma más cara de
// equivocarse con un tablero.

export type Bloque = { t: string; p: string[]; lista?: { k: string; v: string }[] };

export const AYUDA: Record<string, { titulo: string; bloques: Bloque[] }> = {
  importan: {
    titulo: "Quiénes importan",
    bloques: [
      {
        t: "¿Qué estoy viendo?",
        p: ["Los clientes que juntan la mayor parte de lo que factura la mesa. Con el corte " +
            "en 80%, son los que hacen 8 de cada 10 pesos de arancel del mes elegido."],
      },
      {
        t: "¿Cómo leo una fila?",
        p: ["«Apareció 11 de 12» quiere decir que operó en 11 de los últimos 12 meses. " +
            "«Deja por mes» es el arancel que dejó ese mes."],
        lista: [
          { k: "Núcleo", v: "deja mucho y viene todos los meses. Es el negocio." },
          { k: "Grande irregular", v: "deja mucho pero aparece cada tanto. Es el más " +
              "peligroso de los cuatro: cuando deja de venir nadie lo nota, porque su " +
              "silencio parece normal." },
          { k: "Habitual", v: "viene siempre pero deja poco. Son los candidatos a hacer crecer." },
          { k: "Ocasional", v: "la cola: pocos pesos y salteado." },
        ],
      },
      {
        t: "¿Qué hago con esto?",
        p: ["Mirá arriba cuántos clientes hacen el 80%. Si son pocos, el negocio depende de " +
            "pocas manos y cualquiera que se vaya se siente en el mes.",
            "Después entrá por los GRANDE IRREGULAR: son los que más plata mueven y menos " +
            "seguimiento tienen."],
      },
      {
        t: "Ojo con esto",
        p: ["La lista es del mes que elegiste. Un cliente grande que este mes no operó no " +
            "aparece — no quiere decir que se haya ido.",
            "Los cuatro grupos solo clasifican a los que operaron. El que no operó nada no " +
            "está en ningún grupo."],
      },
    ],
  },

  apagan: {
    titulo: "Se están apagando",
    bloques: [
      {
        t: "¿Qué estoy viendo?",
        p: ["Clientes que dejaron de operar al ritmo que traían. No es «hace mucho que no " +
            "opera»: es «hace mucho para él»."],
      },
      {
        t: "¿Cómo leo una fila?",
        p: ["«Suele operar cada 4 días. Lleva 19 sin operar.» Ese cliente normalmente " +
            "aparece cada 4 días y hace 19 que no lo hace: casi cinco veces su ritmo.",
            "Si la fila además dice «Retiró», es más grave todavía: la plata se va antes " +
            "que el cliente."],
      },
      {
        t: "¿Por qué no un plazo igual para todos?",
        p: ["Porque no todos operan igual. Al que opera todos los días, veinte días sin " +
            "aparecer es gravísimo. Al que opera cada dos meses, cuarenta días es normal.",
            "Un plazo único llega tarde con el primero y molesta al segundo con avisos que " +
            "no son. Y tres avisos que no son alcanzan para que nadie abra más la lista."],
      },
      {
        t: "¿Qué hago con esto?",
        p: ["Llamar de arriba para abajo. La lista NO está ordenada por qué tan mal está " +
            "cada uno, sino por cuánta plata deja por mes: primero el que más hay en juego."],
      },
      {
        t: "Ojo con esto",
        p: ["No entran los clientes que operan muy poco, porque no tienen un ritmo del que " +
            "salirse. Con cuatro operaciones en un año no se puede decir qué es normal " +
            "para esa cuenta.",
            "Que un cliente esté acá no significa que se vaya a ir. Significa que se salió " +
            "de su patrón y conviene preguntar por qué."],
      },
    ],
  },

  perdieron: {
    titulo: "Perdieron AuM",
    bloques: [
      {
        t: "¿Qué estoy viendo?",
        p: ["Clientes que hoy tienen mucho menos plata en la cuenta que hace unos meses."],
      },
      {
        t: "¿Cómo leo una fila?",
        p: ["«Tenía $200.000.000, tiene $20.000.000, cayó 90%». La columna que decide es " +
            "QUÉ PASÓ:"],
        lista: [
          { k: "Se está yendo", v: "retiró plata de la cuenta. Es una llamada para hoy." },
          { k: "Fue mercado", v: "no retiró nada; le bajó el valor de lo que tiene. " +
              "No es una fuga." },
          { k: "Se llevó los títulos", v: "quedó en cero y no sacó un peso. Se pasó a otro " +
              "agente con sus papeles. Es el peor caso, y es el único que no se ve en " +
              "ninguna otra pantalla, justamente porque no movió plata." },
        ],
      },
      {
        t: "¿Qué hago con esto?",
        p: ["Antes de llamar, mirá cuánto bajó el libro entero en el mismo período (está " +
            "escrito arriba de la lista). Si el libro bajó 30% y un cliente bajó 35%, es " +
            "el mercado. Si el libro bajó 3% y un cliente bajó 90%, es el cliente."],
      },
      {
        t: "Ojo con esto",
        p: ["El piso importa más de lo que parece. Solo entran cuentas que TENÍAN más de " +
            "ese monto: sin piso, la lista se llena de cuentas chicas donde una caída del " +
            "80% no significa nada, y termina sin que nadie la abra.",
            "Las dos fechas de las columnas son las fotos reales que se compararon. Si no " +
            "caen justo a fin de mes, es porque ese día no hubo foto."],
      },
    ],
  },
};

export function PanelAyuda({ clave, onCerrar }: { clave: string; onCerrar: () => void }) {
  const a = AYUDA[clave];
  if (!a) return null;
  return (
    <div className="border-b border-[var(--t-border)] bg-[var(--t-surface)] shrink-0">
      <div className="px-4 py-3 flex items-start gap-6 flex-wrap">
        <div className="flex-1 min-w-[280px] max-w-[80ch] flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h3 className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] font-semibold">
              Cómo se interpretan los datos · {a.titulo}
            </h3>
            <button onClick={onCerrar}
              className="ml-auto text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">
              cerrar ✕
            </button>
          </div>
          {a.bloques.map((b) => (
            <div key={b.t} className="flex flex-col gap-1">
              <div className="text-[12px] font-semibold text-[var(--t-text)]">{b.t}</div>
              {b.p.map((x) => (
                <p key={x} className="m-0 text-[12.5px] leading-snug text-[var(--t-text-dim)]">{x}</p>
              ))}
              {b.lista && (
                <ul className="m-0 mt-0.5 pl-4 flex flex-col gap-0.5">
                  {b.lista.map((l) => (
                    <li key={l.k} className="text-[12.5px] leading-snug text-[var(--t-text-dim)]">
                      <span className="font-semibold text-[var(--t-text)]">{l.k}</span>: {l.v}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
