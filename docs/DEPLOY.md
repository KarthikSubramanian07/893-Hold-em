# Deploying 893 Hold'em

Two Cloudflare projects, both built and deployed by Cloudflare itself on every
push to `main`, through the Cloudflare GitHub app (OAuth). There is no API
token in this repo, in GitHub secrets, or in CI.

| Project | Kind | What it serves | Built by |
| --- | --- | --- | --- |
| `holdem893` | Pages | The site at `holdem893.pages.dev`, plus the `/room/<code>` function | Pages Git integration |
| `holdem893-rooms` | Worker | One Durable Object per table, running the Rust engine as wasm | Workers Builds |

Both run [`scripts/cf-build.sh`](../scripts/cf-build.sh). Cloudflare's
builders don't ship Rust or Bun, so the script installs what's missing, builds
the engine to WebAssembly, and (for the site) builds the client into `dist/`.

## The site: Pages Git integration

Configured once (via the Pages API with a `wrangler login` session):

| Setting | Value |
| --- | --- |
| Repository | `KarthikSubramanian07/893-Hold-em` |
| Production branch | `main` |
| Build command | `bash scripts/cf-build.sh web` |
| Output directory | `dist` |
| Root directory | *(repo root)* |
| Bindings | read from [`wrangler.jsonc`](../wrangler.jsonc) (the private `ROOMS` service binding) |

Pull requests get preview deployments at `<hash>.holdem893.pages.dev`.

## The rooms Worker: Workers Builds

Connecting a Worker to Git happens in the dashboard (the Builds API doesn't
accept a `wrangler login` session). One form, once:

1. Cloudflare dashboard → **Workers & Pages** → `holdem893-rooms` → **Settings** → **Builds** → **Connect**.
2. Pick **GitHub** → `KarthikSubramanian07/893-Hold-em` (the GitHub app is already authorized on this account).
3. Fill in:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory (Path) | `worker` |
| Build command | `bash ../scripts/cf-build.sh rooms` |
| Deploy command | `npx wrangler deploy` |
| Builds for non-production branches | off (the rooms Worker has no previews; it has a Durable Object) |
| Build watch paths (include) | `worker/*`, `crates/*`, `Cargo.lock`, `scripts/cf-build.sh` |
| API token | the default, which Cloudflare creates and manages for the build |

The root directory is `worker` so that `npx wrangler deploy` picks up
[`worker/wrangler.jsonc`](../worker/wrangler.jsonc), whose `name` matches the
Worker (`holdem893-rooms`), which Workers Builds requires.

## By hand

`wrangler login` (OAuth in the browser) once, then:

```sh
bun run deploy:rooms    # the rooms Worker
```

The site deploys from Git; push to `main` (or retry the build from the GitHub
check run) to redeploy it.
