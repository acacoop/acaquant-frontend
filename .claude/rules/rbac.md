---
paths:
  - "src/proxy.ts"
  - "src/lib/cf-access.ts"
  - "src/lib/me.ts"
  - "src/lib/use-is-guest.ts"
  - "src/components/header.tsx"
  - "src/app/api/**"
---
# Identidad, RBAC y portal invitado — dónde vive cada mitad

## Identidad y RBAC — dónde vive cada mitad

Esta es la parte que más fácil se rompe, porque el gate está en cuatro lugares y
**tres de ellos son UX; el único real es el backend**.

1. **`src/lib/cf-access.ts` — la identidad de confianza.** El header de texto plano
   `cf-access-authenticated-user-email` es **falsificable** si alguien llega al
   origin salteando Cloudflare (la URL `*.vercel.app`). El email bueno sale de
   validar el **sello firmado** (`Cf-Access-Jwt-Assertion`) con `jose`. Se activa
   solo si están `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` → el código deployado
   queda **inerte** hasta setear las env vars, y borrarlas revierte al instante sin
   tocar código.
2. **`src/proxy.ts`** (Next 16 renombró `middleware` a `proxy`). Hace dos cosas
   distintas y las dos importan:
   - **Sanitiza**: borra cualquier email que venga en el request entrante y setea
     SOLO el verificado. Todo route handler aguas abajo lee la identidad de ahí.
   - **Pre-gatea** por módulo (`PATH_MODULES`) para que el HTML de una página
     restringida no se vea ni por un instante. Cachea `/api/me` 30s por email;
     **fail-closed** en prod (redirect a `/`), fail-open solo en dev sin `API_URL`.
3. **`src/components/header.tsx`** — el nav filtra por `me.modules`. `modules === null`
   (backend caído / dev) muestra todo.
4. **El backend** — `require_module()` / `require_*` devuelven 403. **Este es el
   único enforcement.** Esconder una solapa no es un permiso.

> **Contrato con el backend que hay que replicar a mano:** `PATH_MODULES` de
> `proxy.ts` espeja `ENDPOINT_MODULE_PREFIXES` de `api/auth.py`, y el campo `module`
> de `NAV` en `header.tsx` espeja `core/roles.py::MODULES`. Un módulo nuevo se toca
> en los dos repos o el nav y el gate dejan de estar de acuerdo — y no falla nada,
> simplemente muestran cosas distintas.
>
> Hay capacidades que **NO son módulos** y se publican dentro de `me.modules` solo
> para que el nav las filtre igual (`mesa-dinero`, `aca`, `manager-aca`): el acceso
> real es una allowlist per-usuario server-side. **No agregarlas a `core.roles.MODULES`**
> — sería un checkbox en ROLES Y PERMISOS que no controla nada.

## Portal invitado (www.acaquant.com) — default-deny

El invitado se identifica por el **`aud` del sello firmado** (`CF_ACCESS_AUD_GUEST`),
no por un header: no es spoofeable. Cuando aplica, el frontend manda
`x-acaquant-portal: guest` y el backend fuerza el rol `invitado`.

**Regla bloqueante:** el invitado ve **mercado + research** y nada más. Cualquier cosa
del negocio de la mesa (portfolios, operaciones, manager, back-office, clientes, AuM,
P&L, ACA) **jamás** puede quedarle accesible. Ante la duda, no exponer. `useIsGuest()`
sirve para esconder pedazos de UI — es UX, el gate real es del backend.

