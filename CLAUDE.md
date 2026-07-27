@AGENTS.md

> **📌 REMOTES POR PROYECTO (actualizado 2026-07-27).** Cada proyecto tiene
> TRES remotes con la MISMA convención en backend y frontend:
> - **`origin` → usuario corporativo (PRINCIPAL)** — es el remote por defecto.
>   - Frontend (este repo): `github.com/NMolloAV/acaquant-frontend.git`
>   - Backend: `github.com/NMolloAV/acaquant-backend.git`
> - **`org` → organización (ACA)**
>   - Frontend: `github.com/acacoop/acaquant-frontend.git`
>   - Backend: `github.com/acacoop/acaquant-backend.git`
> - **`personal` → usuario personal**
>   - Frontend: `github.com/NicolasEzequielMollo/acaquant-web.git`
>   - Backend: `github.com/NicolasEzequielMollo/TradingAV.git`
>
> Ya NO existe un remote llamado `corp` (ese URL ahora ES `origin`), ni push-URLs
> múltiples cruzados. Cada remote tiene UN solo fetch/push URL a su propio repo.
>
> **AUTH automática (Git Credential Manager, Windows local).** GCM elige la cuenta
> de GitHub sola según el dueño del repo — NO hay que hacer `gh auth switch` ni
> loguearse manualmente. Está pinneado en `~/.gitconfig` global:
> `credential.https://github.com/NMolloAV.username = NMolloAV`,
> `credential.https://github.com/acacoop.username = NMolloAV`,
> `credential.https://github.com/NicolasEzequielMollo.username = NicolasEzequielMollo`
> (+ `credential.usehttppath = true`). O sea: `NMolloAV/*` y `acacoop/*` → cuenta
> **NMolloAV** (corp); `NicolasEzequielMollo/*` → cuenta **NicolasEzequielMollo**.
>
> **REGLA — sincronizar los 3 remotes:** para pushear a los tres a la vez usar el
> alias global **`git pushall`** (= `git push origin HEAD && git push org HEAD &&
> git push personal HEAD`). Un `git push` normal va solo a `origin` (corp). Si
> querés mantener los tres sincronizados, usá SIEMPRE `git pushall`.
>
> Vercel deploya de `origin` (corp `NMolloAV/acaquant-frontend`) desde 2026-07-27 —
> un `git push origin` (o `git pushall`) dispara el deploy de producción.
