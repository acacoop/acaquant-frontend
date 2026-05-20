"use client";

import { DerivadosView } from "./derivados-view";
import type { OpcionDoc } from "@/lib/estrategias";

interface OpcionesMeta {
  tasa: number;
  vr_local: number;
  vr_adr: number;
  updated_at?: string;
}

// Derivados ahora muestra SOLO Opciones. Agro y Sintéticos se mudaron a
// módulos top-level (`/agro` y `/sinteticos`). El shell sigue existiendo
// por compatibilidad con la page actual y por si en el futuro se suman
// más sub-vistas a Derivados.
export function DerivadosShell({
  opcionesDocs,
  opcionesMeta,
  isAdmin,
}: {
  opcionesDocs: OpcionDoc[];
  opcionesMeta: OpcionesMeta;
  isAdmin: boolean;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <DerivadosView
        docs={opcionesDocs}
        metaInicial={opcionesMeta}
        isAdmin={isAdmin}
      />
    </div>
  );
}
