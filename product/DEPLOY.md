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
| `api.box.rookbox.run` | The SPACE server |
| `*.box.rookbox.run` (wildcard) | The SPACE server |

Sandbox ports are served at `<port>-<id>.box.rookbox.run`, so the wildcard needs a wildcard TLS
certificate on the SPACE side (a DNS-01 challenge). The dashboard and API do not need it.

`app.` and `api.` are the same site (`rookbox.run`), which is why the session cookie, scoped to
`.rookbox.run`, is shared and `SameSite=Lax` is enough.

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
| `COOKIE_DOMAIN` | `.rookbox.run` |
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
| `INGEST_SECRET` | 32+ random characters: `openssl rand -hex 32`. The usage reporter signs its requests with it; the same value goes in the reporter's environment. Unset, `POST /ingest/usage-events` answers 503 and no usage is recorded. See "Usage metering" below. |
| `ADMIN_EMAILS` | Optional, comma-separated. Who may see everyone's usage (the admin view and `usage:report`). Unset, only the first `ROOKBOX_ALLOWED_EMAILS` entry may. |
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

## Usage metering

Usage is measured, not priced: machine-hours, vCPU-hours, GiB-hours of memory and disk. The
sandbox server records none of this itself, and people may use the E2B SDK against it directly, so
the meter does not sit in the request path. A small **reporter** (`apps/reporter`) runs on the
dedicated server next to the sandbox server, lists the machines through the E2B-compatible API
every 30 seconds, and posts what changed to the API's `POST /ingest/usage-events`, signed with
`INGEST_SECRET`. Its README has the variables, the systemd unit and the Dockerfile. The API stores
the events, derives per-machine intervals and shows them on the dashboard's Usage page.

To turn it on:

1. Set `INGEST_SECRET` (and, if the owner is not the only admin, `ADMIN_EMAILS`) on the API and
   deploy. The new migration `20261114000000_usage_metering` runs at start. The log warns
   `INGEST_SECRET is not set` until it is set.
2. On the sandbox server, install and start the reporter (`apps/reporter/README.md`). It needs the
   same `SPACE_ECW_API_KEY` (it only lists machines), `SPACE_ECW_API_URL`, `ROOKBOX_API_URL`
   (`https://api.rookbox.run`) and the same `INGEST_SECRET`. Keep the server's clock right: a
   request more than five minutes off is refused.
3. Check it: `curl http://127.0.0.1:9464/healthz` on that server returns `"ok":true` and
   `"delivery":"ok"`. A minute later the Usage page shows the machines. In the API's shell,
   `node dist/cli/usage.js --period 7d` (`pnpm usage:report`) prints usage per user, the
   unassigned bucket and how long ago the reporter last got through.

How machines get an owner: the `rookbox.owner` tag when it names an account, else the API's own
record of the machine (a fork loses the tag), else "unassigned", which only an admin sees. The tag
is set by whoever creates the machine, so before giving customers their own keys to the sandbox
server, move ownership to the key's organization instead of trusting the tag.

Precision: time is measured to the reporter's poll interval (30 seconds). A machine created and
deleted between two polls is not measured. If the reporter stops, machines still open stop
accruing 15 minutes after its last contact. The sandbox server's list may report the disk's
use rather than its provisioned size; verify against a machine you know.

## How machine access works

- **Machines** are SPACE sandboxes created through its E2B-compatible API (ECW). ECW `pause` is
  SPACE `suspend`, and ECW `resume` is SPACE `restore`. Every create sends the idle timeout with
  auto-pause on, so an idle machine suspends itself.
- **Desktop.** A sandbox's public ports require the header `e2b-traffic-access-token`. A browser
  link or WebSocket cannot send it, and ECW rejects `allowPublicTraffic`. So "Open desktop" opens
  `https://api.rookbox.run/desktop/<id>/vnc.html`: the API checks the session cookie and the
  machine's owner, then forwards HTTP and the noVNC WebSocket to
  `https://6080-<id>.box.rookbox.run` with the token added. The token comes from SPACE's connect
  call and is cached for a minute. It never reaches the browser.
  The desktop page is served from the API's origin. That is fine for one user running their own
  machines; before opening Rookbox to others, move it to its own origin.
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
- **Usage is measured, billing is not.** Once the reporter runs, the Usage page shows machine
  hours and sizes. There are no prices, credits or invoices yet.
- **Snapshots, secrets, webhooks, CI and members** are still "Soon" in the dashboard.
- The SPACE side (`api.box.rookbox.run`) was not reachable while this was written, so the SPACE
  client was built from the ECW source and docs and tested against mocks. Run one real create,
  suspend, restore, exec and desktop pass after the first deploy.
