import { shortTicker } from "./ui";
import { BreakevenChart } from "./breakeven-chart";

interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  dias: number;
  tem_lecap: number;
  paridad_cer: number;
  breakeven_mensual: number;
}

export function BreakevensBlock({ pares }: { pares: BreakevenPar[] }) {
  if (pares.length === 0) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        SIN DATOS — MERCADO CERRADO
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>LECAP</th>
              <th>CER</th>
              <th className="text-right">DIAS</th>
              <th className="text-right">BE MENSUAL</th>
            </tr>
          </thead>
          <tbody>
            {pares.map((p) => {
              const be = p.breakeven_mensual * 100;
              return (
                <tr key={p.n}>
                  <td className="text-[#ff9900]">{shortTicker(p.lecap)}</td>
                  <td className="text-[#808080]">{shortTicker(p.cer)}</td>
                  <td className="text-right">{p.dias}</td>
                  <td
                    className={`text-right font-bold ${
                      be > 3 ? "text-[#ff3333]" : "text-[#00cc66]"
                    }`}
                  >
                    {be.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[#1a1a1a] pt-3">
        <BreakevenChart pares={pares} />
      </div>
    </div>
  );
}
