"use client";

// Stub legacy — el feature de "armar cartera" desde el chat se eliminó
// (el user pidió borrar todo lo de SIMULAR CARTERA). Mantenemos los
// exports vacíos para no romper el typecheck de chat-view.tsx mientras
// se limpia ese componente. Cuando chat-view deje de importar
// CarteraForm/CarteraRequest, este archivo se puede borrar.

export interface CarteraRequest {
  perfil: string;
  exposicion: string;
  plazo: string;
  monto_estimado_ars?: number;
  restricciones?: string[];
  benchmark: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CarteraForm(_props: any) {
  return null;
}
