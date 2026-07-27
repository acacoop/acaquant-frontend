@AGENTS.md

> **📌 REMOTES POR PROYECTO (actualizado 2026-07-27).** DOS remotes por repo, ambos
> de la MISMA cuenta corporativa **NMolloAV** (por eso nunca piden login aparte):
> - **`origin` → NMolloAV (PRINCIPAL, default)**
>   - Frontend (este repo): `github.com/NMolloAV/acaquant-frontend.git`
>   - Backend: `github.com/NMolloAV/acaquant-backend.git`
> - **`org` → organización ACA (acacoop) — misma cuenta NMolloAV**
>   - Frontend: `github.com/acacoop/acaquant-frontend.git`
>   - Backend: `github.com/acacoop/acaquant-backend.git`
>
> El remote `personal` (cuenta NicolasEzequielMollo) fue ELIMINADO: usaba OTRA
> cuenta y pedía login en cada push. Tampoco existe ya un remote `corp` (ese URL
> ES `origin`). Cada remote tiene UN solo fetch/push URL a su propio repo.
>
> **AUTH automática (Git Credential Manager, Windows local).** Los dos remotes usan
> la cuenta **NMolloAV**, pinneada en `~/.gitconfig` global:
> `credential.https://github.com/NMolloAV.username = NMolloAV`,
> `credential.https://github.com/acacoop.username = NMolloAV`
> (+ `credential.usehttppath = true`). NO hay que hacer `gh auth switch` ni loguearse.
>
> **REGLA — sincronizar los 2 remotes:** alias global **`git pushall`** (= `git push
> origin HEAD && git push org HEAD`). Un `git push` normal va solo a `origin`.
>
> Vercel deploya de `origin` (`NMolloAV/acaquant-frontend`) desde 2026-07-27 —
> un `git push origin` (o `git pushall`) dispara el deploy de producción.
