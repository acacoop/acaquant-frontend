import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // ── El import-linter del AV AGENT ─────────────────────────────────────────
  // En el modal del agente, la red se toca SOLO desde la capa de datos
  // (src/components/agente/datos.tsx): leer / llamar / escribir(relee).
  // Un fetch suelto adentro de una tab es cómo nacieron «voté y los botones
  // volvieron» y «el informe desapareció al cambiar de tab» — estado del
  // servidor cacheado ad-hoc, sin dueño ni relectura. La regla lo hace
  // estructural: el próximo fetch fuera de la capa no pasa el lint.
  // (Espejo front de los contratos de capas del backend — .importlinter.)
  {
    files: ["src/components/agente/**"],
    ignores: ["src/components/agente/datos.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/fetch-json",
          message: "En el AV Agent la red se toca SOLO desde la capa de datos "
            + "(agente/datos.tsx): usá leer/calcular/escribir de useAgente(). "
            + "Un fetch suelto adentro de una tab es cómo nacieron «apliqué y "
            + "los botones volvieron» y «el informe desapareció al cambiar de tab».",
        }],
      }],
    },
  },
  // ── El trinquete del proxy ────────────────────────────────────────────────
  // Un route handler (src/app/api/**/route.ts) habla con el backend SOLO por
  // lib/proxy-backend.ts. Antes 26 handlers armaban a mano el bearer, el
  // service token y la identidad, y 51 usaban apiFetch con otro contrato de
  // errores; ninguno tenía techo. Cuando uno se escribía distinto no fallaba
  // nada: la pantalla cargaba y el backend auditaba al usuario como anónimo.
  // La regla lo hace estructural: leer process.env, llamar fetch o importar
  // apiFetch en un handler no pasa el lint. (Espejo de test_capas.py del backend.)
  {
    files: ["src/app/api/**/route.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
        message: "Un route handler no lee env vars: las credenciales hacia el backend "
          + "viven en lib/proxy-backend.ts (proxyBackend / proxyCatchAll).",
      }, {
        selector: "CallExpression[callee.name='fetch']",
        message: "Un route handler no llama fetch: usá proxyBackend / proxyCatchAll de "
          + "lib/proxy-backend.ts, que reenvía status y cuerpo tal cual y pone techo.",
      }],
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/api",
          message: "apiFetch es para SSR (page.tsx). En un route handler usá "
            + "proxyBackend / proxyCatchAll de lib/proxy-backend.ts.",
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
