import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // ── El import-linter del AV AGENT ─────────────────────────────────────────
  // En el modal del agente, la red se toca SOLO desde la capa de datos
  // (src/components/av-agent/datos.tsx): leer / llamar / escribir(relee).
  // Un fetch suelto adentro de una tab es cómo nacieron «voté y los botones
  // volvieron» y «el informe desapareció al cambiar de tab» — estado del
  // servidor cacheado ad-hoc, sin dueño ni relectura. La regla lo hace
  // estructural: el próximo fetch fuera de la capa no pasa el lint.
  // (Espejo front de los contratos de capas del backend — .importlinter.)
  {
    files: ["src/components/av-agent-modal.tsx", "src/components/av-agent/**"],
    ignores: ["src/components/av-agent/datos.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/fetch-json",
          message: "En el AV Agent la red se toca solo desde la capa de datos "
            + "(av-agent/datos.tsx): usá leer/llamar/escribir de useDatos().",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
