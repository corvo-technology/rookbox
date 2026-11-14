# Deploying Rookbox

Three pieces, three places:

| Piece | Where | Address |
| --- | --- | --- |
| API (`apps/api`) and its Postgres | Guará Cloud, built from `apps/api/Dockerfile` | `https://api.rookbox.run` |
| Dashboard (`apps/web`) | The VPS, `apps/web/Dockerfile` (Caddy) | `https://app.rookbox.run` |
| Landing (`apps/www`) | The VPS, `apps/www/Dockerfile` (Caddy) | `https://rookbox.run` |
| SPACE (the sandbox infrastructure) | A separate dedicated server | `https://api.box.rookbox.run`, sandboxes at `https://<port>-<id>.box.rookbox.run` |

Every build context is the `product/` directory.

## DNS

| Record | Points to |
| --- | --- |
| `rookbox.run` (A/AAAA) | The VPS |
| `app.rookbox.run` | The VPS |
| `api.rookbox.run` | Guará Cloud (the CNAME or A record it gives for the service) |
| `desk.rookbox.run` | The same Guará service as `api.` (a second hostname on it): the desktop's own origin |
| `api.box.rookbox.run` | The SPACE server |
| `*.box.rookbox.run` (wildcard) | The SPACE server |

Sandbox ports are served at `<port>-<id>.box.rookbox.run`, so the wildcard needs a wildcard TLS
certificate on the SPACE side (a DNS-01 challenge). The dashboard and API do not need it.

`app.` and `api.` are the same site (`rookbox.run`), so the dashboard can call the API with
`SameSite=Lax` cookies and `credentials: "include"`. The session cookie is **host-only**: it is
set by `api.rookbox.run` without a `Domain` attribute, so the browser sends it to `api.rookbox.run`
and nowhere else (not to `app.`, not to `desk.`, not to any machine host). See "Session cookie
scope" below.

## 1. API on Guará Cloud

Create a Postgres service and the API service (Dockerfile build, context `product/`, Dockerfile
path `apps/api/Dockerfile`, port `3000`). Guará injects `DATABASE_URL`; set the rest.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Injected by Guará. |
| `NODE_ENV` | `production` |
| `PORT` | `3000` (or what Guará injects). |
| `BETTER_AUTH_SECRET` | 32+ random characters: `openssl rand -base64 32`. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | `https://api.rookbox.run` |
| `APP_ORIGIN` | `https://app.rookbox.run` (the only origin CORS and CSRF checks accept) |
| `COOKIE_DOMAIN` | **Leave unset.** See "Session cookie scope". If you are upgrading from an older deploy, remove it. |
| `DESKTOP_HOST` | `desk.rookbox.run`. The host the desktop is served from (see "Desktop origin"). Unset: the API's own host serves the desktop (local development only). |
| `DESKTOP_LINK_SECRET` | 32+ random characters (`openssl rand -base64 32`), different from `BETTER_AUTH_SECRET`. Required in production when `DESKTOP_HOST` is set. Signs desktop links and sessions. |
| `DESKTOP_LINK_SECRET_PREVIOUS` | Optional. The old secret while rotating (see below). |
| `DESKTOP_LINK_TTL_S` | Optional, default `120` (30 to 900). How long a desktop link works. |
| `DESKTOP_SESSION_TTL_S` | Optional, default `14400` (4 h; 300 to 86400). How long the desktop session a link starts lasts. |
| `TRUSTED_PROXY_HOPS` | Number of reverse proxies between the internet and the API, for reading the client address from `X-Forwarded-For`. Default `0` (header ignored, socket address used). **Set it to the number of proxies Guará puts in front** (probably `1`, `2` if Cloudflare proxies `api.` too), or every user shares one address and the per-address limits. |
| `ROOKBOX_ADMIN_EMAILS` | Optional. Who may call the `admin.*` procedures. Default: the first `ROOKBOX_ALLOWED_EMAILS` entry. |
| `RATE_LIMITS_ENABLED` | Optional, default `true`. Master switch for the per-route limits. |
| `RATE_LIMIT_<CLASS>` | Optional. Per-route budgets, see "Rate limits". |
| `EXEC_MAX_OUTPUT_BYTES` | Optional, default `262144` (1024 to 1048576). Most bytes of stdout, and of stderr, `machines.exec` returns; more is cut and flagged `truncated`. |
| `MACHINE_ALLOW_INTERNET` | Optional, default `true`. Create machines with open internet (see "Abuse and network"). |
| `RECONCILE_INTERVAL_S` | Optional, default `0` (off). Seconds between runs of the reconciler inside the API. |
| `RECONCILE_ACT` | Optional, default `false`. Let the scheduled reconciler fix rows. |
| `RECONCILE_KILL_ORPHANS` | Optional, default `false`. Needs `RECONCILE_ACT`. Let it also delete machines that have no row. |
| `RECONCILE_STUCK_AFTER_S` / `RECONCILE_ORPHAN_GRACE_S` | Optional, defaults `600` / `900`. See "Reconciler". |
| `ROOKBOX_ALLOWED_EMAILS` | The owner's email (comma-separated for more). Sign-up over HTTP is always closed. |
| `ROOKBOX_SEED_OWNER_PASSWORD` | 12+ characters. Creates the owner account at the first start. Remove it afterwards. |
| `SPACE_ECW_API_URL` | `https://api.box.rookbox.run` |
| `SPACE_ECW_API_KEY` | The SPACE service key (an ECW key of one SPACE organization). Server side only. |
| `E2B_DOMAIN` | `box.rookbox.run` |
| `SPACE_TEMPLATES` | Optional, default `desktop,corvo-computer,seed`. Templates people may create machines from, in the order the dashboard offers them. |
| `SPACE_TIMEOUT_MS` | Optional, default `60000` (5000 to 300000). How long to wait on a call that waits on a VM: create, suspend, restore, fork. |
| `SIGNIN_MAX_ATTEMPTS` | Optional, default `5`. Failed sign-ins allowed per email and per address within the window. |
| `SIGNIN_WINDOW_S` | Optional, default `600`. The window for `SIGNIN_MAX_ATTEMPTS`, in seconds. |
| `MACHINE_IDLE_TIMEOUT_S` | Optional, default `900`. Idle time before a machine suspends itself. |
| `MAX_MACHINES_PER_USER` | Optional, default `10`. |
| `LOG_LEVEL` | Optional, default `info`. |
| `RUN_MIGRATIONS` | Optional, default `true`. |

Health check path: `/health` (the database). `/health/space` says whether the machine service answers and accepts the key; it reports only status classes. Pending migrations run when the container starts, before it
listens. To run them alone: `node dist/cli/migrate.js` in the container.

Local equivalent:

```bash
cd product
docker build -f apps/api/Dockerfile -t rookbox-api .
docker run --rm -p 3000:3000 --env-file apps/api/.env rookbox-api
```

### Verify after deploy

Run these in order after the first deploy and after any change to the variables above.

1. `curl https://api.rookbox.run/health` returns `{"ok":true,"db":"ok",...}` with status 200. The log shows the migrations ran and, the first time, `owner account created`.
2. `curl https://api.rookbox.run/health/space` returns `"ok":true` with `"reachable":true` and `"auth":"ok"`. A 503 with `"auth":"missing"` or `"rejected"` means the key is not set or is wrong, `"unknown"` that SPACE answered oddly; `"reachable":false` means the URL, DNS or network is wrong.
3. Open `https://app.rookbox.run`, sign in as the owner, and switch the language (English, Portuguese, Spanish) from the menu.
4. Create a machine from each template you offer. It should reach `running`.
5. Open its terminal and run a command; open the desktop on a `desktop` machine.
6. Suspend it (memory is saved), restore it, fork it, then delete the fork and the machine.
7. Wrong password more than `SIGNIN_MAX_ATTEMPTS` times: the API answers with a wait time instead of trying again.
8. Remove `ROOKBOX_SEED_OWNER_PASSWORD` once step 3 works.
9. Cookie scope: in the browser's dev tools the session cookie `__Host-rookbox.session_token` is
   listed for `api.rookbox.run` only, with no Domain. Open a machine's port URL: no Rookbox cookie
   is sent to it. `curl -i https://desk.rookbox.run/health` answers 404, and
   `curl -i https://api.rookbox.run/open/x` answers 404.
10. From a machine with internet, `curl -sI https://example.com` works; `curl -m5 http://169.254.169.254` does not.
11. `node dist/cli/reconcile.js` in the container prints a report with no orphans.

### First login

Start the API with `ROOKBOX_ALLOWED_EMAILS` and `ROOKBOX_SEED_OWNER_PASSWORD` set. The log shows
`owner account created`. Sign in on the dashboard, then remove the password variable. The seed is
idempotent: if the account exists, it does nothing. To change the password later, delete the user
row and seed again.

### SPACE service key

`SPACE_ECW_API_KEY` is an ECW API key for one SPACE organization (see `docs/ecw.md`, "Create an
API key", and `scripts/seed-api-key.sh`). The API tags every sandbox it creates with
`rookbox.owner=<user id>` and only touches sandboxes of the signed-in user. All Rookbox users
share that one SPACE organization.

## 2. Dashboard and landing on the VPS

Both images serve static files from Caddy on port 80, with TLS switched off inside the container.
Put them behind whatever terminates TLS on the VPS (an existing Caddy or nginx, or a Cloudflare
proxy), one upstream per hostname.

`VITE_*` and `PUBLIC_*` values are compiled into the files, so they are build arguments: change one
and rebuild.

```bash
cd product

docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_URL=https://api.rookbox.run \
  --build-arg VITE_E2B_DOMAIN=box.rookbox.run \
  -t rookbox-web .
docker run -d --restart unless-stopped --name rookbox-web -p 127.0.0.1:8081:80 rookbox-web

docker build -f apps/www/Dockerfile \
  --build-arg PUBLIC_SITE_URL=https://rookbox.run \
  --build-arg PUBLIC_DASHBOARD_URL=https://app.rookbox.run/ \
  --build-arg PUBLIC_SDK_DOMAIN=box.rookbox.run \
  -t rookbox-www .
docker run -d --restart unless-stopped --name rookbox-www -p 127.0.0.1:8082:80 rookbox-www
```

| Build argument | Image | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | web | API origin. Unset builds the dashboard on the in-memory fake, with no sign-in. |
| `VITE_E2B_DOMAIN` | web | Domain shown in the SDK snippets. |
| `VITE_DOCS_URL` | web | Optional link for "Docs". |
| `PUBLIC_SITE_URL` | www | The landing's own URL (sitemap, canonical links, robots.txt). |
| `PUBLIC_DASHBOARD_URL` | www | Where "Get started" and "Dashboard" go. |
| `PUBLIC_SDK_DOMAIN` | www | Domain shown in the SDK snippets. |

Example reverse proxy with Caddy on the VPS:

```caddyfile
rookbox.run     { reverse_proxy 127.0.0.1:8082 }
app.rookbox.run { reverse_proxy 127.0.0.1:8081 }
```

## How machine access works

- **Machines** are SPACE sandboxes created through its E2B-compatible API (ECW). ECW `pause` is
  SPACE `suspend`, and ECW `resume` is SPACE `restore`. Every create sends the idle timeout with
  auto-pause on, so an idle machine suspends itself.
- **Desktop.** A sandbox's public ports require the header `e2b-traffic-access-token`. A browser
  link or WebSocket cannot send it, and ECW rejects `allowPublicTraffic`. So "Open desktop" asks the API for a signed link, which lands on
  `https://desk.rookbox.run/m/<id>/vnc.html`, where the API forwards HTTP and the noVNC WebSocket
  to `https://6080-<id>.box.rookbox.run` with the token added. The token comes from SPACE's connect
  call and is cached for a minute. It never reaches the browser.
  The desktop is served from its own origin, `https://desk.rookbox.run` (see "Desktop origin").
- **Exec.** `machines.exec` runs `/bin/bash -l -c <command>` through the sandbox's process service
  (`https://49983-<id>.box.rookbox.run/process.Process/Start`, Connect protocol, the sandbox's
  envd access token) and returns stdout, stderr and the exit code. Output is capped at 256 KiB per
  stream; the timeout is 30 s by default and 120 s at most.
- **Public ports** appear as `https://<port>-<id>.box.rookbox.run`. They need the traffic token
  header, so they work from code (the E2B SDK) and not from a plain browser tab.

## Known gaps

- **Rookbox API keys are product-only.** They authenticate calls to the Rookbox API
  (`Authorization: Bearer rbx_...`); the secret is shown once and only its SHA-256 is stored. They
  are not E2B keys, so the E2B SDK cannot use them against `box.rookbox.run` yet.
  SPACE does have an admin API for this (`POST /orgs/{org_id}/api-keys` with
  `allowed_surfaces: ["ecw"]` and `user_id`, `DELETE /orgs/{org_id}/api-keys/{id}`), which needs a
  managing-organization admin credential. Wiring it in means storing that credential on Guará and
  accepting that a SPACE key sees every sandbox of the organization (SPACE scopes keys to an
  organization, not to a Rookbox user). Until then, create an E2B key for yourself with
  `scripts/seed-api-key.sh` and use that with the SDK.
- **Usage and billing are not measured.** The Usage page says so and shows only how many machines are running now.
- **Snapshots, secrets, webhooks, CI and members** are still "Soon" in the dashboard.
- The SPACE side (`api.box.rookbox.run`) was not reachable while this was written, so the SPACE
  client was built from the ECW source and docs and tested against mocks. Run one real create,
  suspend, restore, exec and desktop pass after the first deploy.

## Session cookie scope

The login cookie is **host-only**: the API sets it without a `Domain` attribute, so the browser
sends it only to `api.rookbox.run`. Over HTTPS it is named `__Host-rookbox.session_token`; the
`__Host-` prefix makes browsers refuse a copy set with a `Domain` attribute, so a page on a sibling
host cannot plant a cookie of that name for the API. `SameSite=Lax`, `Secure`, `HttpOnly`.

The dashboard (`app.rookbox.run`) calls the API cross-origin with `credentials: "include"`. That
works with a host-only cookie because both are the same site. CORS and better-auth's trusted
origins accept only `APP_ORIGIN`, and `/rpc` additionally refuses a cookie-authenticated request
whose `Origin` is anything else (CORS stops a page from reading an answer, not from sending the
request, and machine hosts are on the same site as the API).

> **Do not set `COOKIE_DOMAIN=.rookbox.run`.** It is kept only as an override. It makes the browser
> send the login cookie to every subdomain, including customers' machine hosts
> (`<port>-<id>.box.rookbox.run`), where any customer can run a web server and read the cookie of a
> Rookbox user who opens their link. The API logs a warning at start when it is set, and the cookie
> then loses the `__Host-` prefix.

Upgrading: the cookie's name changed, so everyone signs in once after the first deploy.

## Desktop origin

The desktop page is a program the machine's owner controls, so it must not run on the origin that
holds the login cookie. The same API service answers on a second host, `desk.rookbox.run`
(`DESKTOP_HOST`):

- On that host the API serves **only** `GET /open/<link>` and `GET /m/<id>/...` (plus the noVNC
  WebSocket at `/m/<id>/websockify`). RPC, auth, health and CORS answer 404 there. It never reads
  the login cookie and never sets it. On every other host the desktop routes answer 404.
- The signed-in dashboard calls `machines.desktopLink`. The API checks ownership, that the machine
  runs and has a desktop, and returns `https://desk.rookbox.run/open/<link>`. The link is an HMAC
  token (machine id, user id, expiry) valid for `DESKTOP_LINK_TTL_S` (120 s) and usable once.
- Opening it trades the link for a **session**: a second signed token set as a host-only cookie
  `rbx_desk` with `Path=/m/<id>/`, `HttpOnly`, `Secure`, `SameSite=Strict`, lasting
  `DESKTOP_SESSION_TTL_S` (4 h). A cookie rather than a token in the URL keeps the secret out of
  browser history, access logs and `Referer`, while page assets and the WebSocket (same origin,
  same path) still carry it. The WebSocket also checks `Origin` equals the desktop origin, and is
  closed when the session expires. Reloading within 4 h needs no new link.
- Every request re-checks that the machine still belongs to the user and runs (the upstream token is
  cached for 60 s).
- The host must be distinct from the API's and the dashboard's (the API refuses to start otherwise).
  The edge must pass the original `Host` header through.
- Rotating `DESKTOP_LINK_SECRET`: set the new value and move the old one to
  `DESKTOP_LINK_SECRET_PREVIOUS`; links and sessions signed with the old one keep working. Remove
  the previous value after `DESKTOP_SESSION_TTL_S`. Without `DESKTOP_LINK_SECRET` (development) a
  key is derived from `BETTER_AUTH_SECRET`.
- Used-link tracking is per process. With more than one API instance a link could be used once per
  instance within its 2 minutes.

Without `DESKTOP_HOST` (local development, the in-memory fake) the API serves the same routes on its
own host, so the desktop still works but shares the API's origin.

## Rate limits

Fixed windows, counted in memory per API process, per signed-in user and per client address. A
refused request gets HTTP 429, the coded error `RATE_LIMITED` with `data.retryAfterS`, and a
`Retry-After` header; the dashboard shows it translated (en, pt-BR, es). Reads are not limited.

Each class is one variable, `user=<max>/<seconds>,ip=<max>/<seconds>`; either scope can be `off`,
and `off` alone turns the class off. Defaults:

| Variable | Default | Applies to |
| --- | --- | --- |
| `RATE_LIMIT_MACHINE_CREATE` | `user=20/3600,ip=60/3600` | `machines.create` |
| `RATE_LIMIT_MACHINE_DELETE` | `user=40/600,ip=120/600` | `machines.delete` |
| `RATE_LIMIT_MACHINE_FORK` | `user=20/3600,ip=60/3600` | `machines.fork` |
| `RATE_LIMIT_MACHINE_LIFECYCLE` | `user=60/600,ip=180/600` | `machines.suspend`, `machines.restore` |
| `RATE_LIMIT_MACHINE_EXEC` | `user=120/60,ip=300/60` | `machines.exec` (output is also capped by `EXEC_MAX_OUTPUT_BYTES`) |
| `RATE_LIMIT_API_KEY_CREATE` | `user=10/3600,ip=30/3600` | `apiKeys.create` |
| `RATE_LIMIT_DESKTOP_LINK` | `user=30/600,ip=90/600` | `machines.desktopLink` |
| `RATE_LIMIT_AUTH` | `ip=60/600` | every POST to `/api/auth/*` (sign-in also keeps `SIGNIN_MAX_ATTEMPTS`) |

**Client address.** `X-Forwarded-For` is written by the client too, so by default
(`TRUSTED_PROXY_HOPS=0`) it is ignored and the socket's peer address is used. Behind a proxy that is
the proxy's address, so everyone would share the per-address budget: set `TRUSTED_PROXY_HOPS` to the
number of proxies in front of the API. The API then takes the entry the first of them added (the
`TRUSTED_PROXY_HOPS`-th from the right) and ignores anything to its left. A value that is too small
is safe but shares one budget; one that is too large falls back to the socket address. The API logs
a warning in production while it is 0. With more than one API instance each counts on its own.

## Abuse and network

- **Network.** The machine host's own default is **closed**: a machine created with no network option
  has no DNS and no internet. Rookbox's decision is open internet with usage limits, so every create
  sends `allowInternetAccess: true` (`MACHINE_ALLOW_INTERNET`, default `true`; set `false` to create
  closed machines). The host itself does not change.
- **Always blocked by the host**, open internet or not: the cloud metadata address
  (`169.254.169.254`), the link-local range (`169.254.0.0/16`, `fe80::/10`), the platform's internal
  ranges (`10.11.0.0/16`, `10.12.0.0/16`), loopback (`127.0.0.0/8`, `::1`) and host services.
  Sandboxes cannot reach each other.
- **Controls Rookbox applies:** the per-account machine cap (`MAX_MACHINES_PER_USER`, held under
  concurrent requests by a per-account lock), the rate limits above, the exec timeout (120 s at most)
  and output cap, the idle timeout (`MACHINE_IDLE_TIMEOUT_S`, auto-suspend), closed sign-up, sign-in
  throttling, and the reconciler below.
- **Stopping an account.** `admin.suspendUserMachines({ email })` (admins only, see
  `ROOKBOX_ADMIN_EMAILS`) suspends every running machine of that user. To lock the person out as
  well, remove their email from `ROOKBOX_ALLOWED_EMAILS` and restart: sessions and API keys of an
  account whose email is not listed are refused. Call it from an admin's signed-in session or API
  key: `POST /rpc/admin/suspendUserMachines` with `{"json":{"email":"..."}}`.

## Reconciler

Compares the machines the host lists for the service key (tagged `rookbox.owner`) with the
`machine` rows:

- **Orphan**: on the host, no row (for example a crash between the host's create and the row's
  insert, or a create whose answer timed out). Too young ones (`RECONCILE_ORPHAN_GRACE_S`, 15 min)
  are only counted: a create may still be writing its row.
- **Missing**: a row whose machine the host no longer has (confirmed by id).
- **Stuck**: a row in `suspending`, `restoring` or `deleting` for over `RECONCILE_STUCK_AFTER_S`
  (10 min).

It reports by default and changes nothing. From the API container:

```bash
node dist/cli/reconcile.js                        # report
node dist/cli/reconcile.js --act                  # also drop missing rows, clear stuck operations
node dist/cli/reconcile.js --act --kill-orphans   # also DELETE orphan machines (never the default)
```

The same is available to admins as `admin.reconcile({ act, killOrphans })`. To run it inside the API
on a schedule, set `RECONCILE_INTERVAL_S` (off at 0). The scheduled run only reports unless
`RECONCILE_ACT=true`, and never deletes machines unless `RECONCILE_KILL_ORPHANS=true` too. If the
host cannot be listed the run fails without changing anything.

## Later hardening: a separate domain for machines

Machine hosts (`<port>-<id>.box.rookbox.run`) run code and web servers that customers control, and
they are on the same registrable domain (`rookbox.run`) as the API and the dashboard. Host-only,
`__Host-` cookies and the origin checks above close the known holes, but a same-site page can still
send same-site requests to the API. The stronger fix is to serve sandboxes from a different
registrable domain (for example `rookbox-box.example`, with `E2B_DOMAIN`, the wildcard certificate and
DNS following it), so no customer-controlled page is ever same-site with the dashboard. This is a
decision for the owner; the code only needs `E2B_DOMAIN` and `VITE_E2B_DOMAIN` to change.
