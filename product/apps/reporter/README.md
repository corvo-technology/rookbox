# Rookbox usage reporter

A small Node service that runs next to the sandbox server and tells the Rookbox API what the
machines are doing, so usage can be measured. It does not touch the sandbox server beyond
reading its machine list, and it works whether a machine was made through the Rookbox API or
with the E2B SDK directly.

```
sandbox server  --GET /v2/sandboxes-->  reporter  --POST /ingest/usage-events-->  Rookbox API
 (every 30 s)                  SQLite: last state + outbox        (signed, batched, retried)
```

There is no pricing here. The reporter records what happened to each machine and when.

## What it does

1. **Collects.** Every `POLL_INTERVAL_S` seconds (default 30) it lists every machine the service
   key can see, across pages, through the E2B-compatible `GET /v2/sandboxes`. For each machine
   it keeps the id, the `rookbox.owner` tag when present, the template, vCPUs (`cpuCount`),
   memory (`memoryMB`), disk (`diskSizeMB`), the state (`running`, or `paused`, which means
   suspended) and the creation time (`startedAt`). A failed or unreadable listing changes
   nothing: the next poll compares against the same stored state.
2. **Detects changes.** It compares with the last known state in a local SQLite file and writes
   an event for each transition: `seen` (first sight, or creation), `suspended`, `resumed`,
   `resized` (vCPU, memory or template changed, or the disk reading moved by at least
   `DISK_RESIZE_MIN_MIB`) and `gone` (deleted). Every event carries the machine's full size after
   it. Each has a stable idempotency key (`<machine>:<type>:<time in ms>`), a sequence number
   that only grows, and the observed time.
3. **Delivers.** Events go to an outbox table first. A sender posts them to the API in order, up
   to `BATCH_SIZE` (default 200) per request, signed, and marks them sent only when the API
   acknowledges them. If the API is down they wait on disk and go out later, in order, with
   retries that back off from 1 second to 5 minutes. The API stores by idempotency key, so a
   batch whose answer was lost and is sent again is not counted twice.
4. **Reconciles.** Every `SNAPSHOT_INTERVAL_S` (default 300) it queues a compact snapshot of all
   machines it knows. The API uses it to repair gaps (for example, a machine it believes is open
   that is no longer listed).
5. **Reports its own health** on `http://127.0.0.1:$HEALTH_PORT/healthz` (loopback only).

## Precision, and its limits

- Time is measured to the poll interval. A change is stamped with the poll that noticed it, so
  a suspend or resume can be off by up to `POLL_INTERVAL_S` either way.
- A machine that disappears is closed at **the last poll that saw it**, and only after it has
  been missing from `MISSED_POLLS_FOR_GONE` polls in a row (default 2), so one incomplete
  listing is not taken for a deletion. The listing does not say when a machine was deleted, so
  this is the best available stamp; the error is up to one interval.
- A machine created and deleted between two polls is never seen and is not measured.
- The listing has no "last lifecycle change" field, only the creation time (`startedAt`), so a
  transition's time is the poll's time, never the real one.
- `diskSizeMB` in the listing may be the disk's use rather than its provisioned size. Small
  movements are ignored (`DISK_RESIZE_MIN_MIB`, default 1024) so a growing disk does not
  produce an event a minute; check the number against a machine you know before relying on it.
- If the reporter is stopped, nothing is measured meanwhile. On restart it compares with its
  stored state: changes during the gap are stamped at the restart, and the API's own view
  stops counting open machines after 15 minutes without contact.

## Environment

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `SPACE_ECW_API_URL` | yes | | Base URL of the sandbox server's E2B-compatible API. |
| `SPACE_ECW_API_KEY` | yes | | The service key. Read-only use: it only lists. Never logged. |
| `ROOKBOX_API_URL` | yes | | Base URL of the Rookbox API; events go to `<it>/ingest/usage-events`. |
| `INGEST_SECRET` | yes | | Shared secret (32+ characters) for signing. Must equal the API's `INGEST_SECRET`. |
| `REPORTER_ID` | no | hostname | Stable name for this reporter (letters, digits, `.`, `_`, `-`). |
| `POLL_INTERVAL_S` | no | 30 | Seconds between polls (1 to 3600). |
| `SNAPSHOT_INTERVAL_S` | no | 300 | Seconds between snapshots. |
| `REPORTER_DB_PATH` | no | `./reporter.sqlite` | The SQLite file (state and outbox). Keep it on persistent disk. |
| `HEALTH_PORT` | no | 9464 | Port for `/healthz` on 127.0.0.1. |
| `BATCH_SIZE` | no | 200 | Most events per request (1 to 500). |
| `OUTBOX_WARN` | no | 80% of the cap | Waiting events at which a warning is logged. |
| `OUTBOX_MAX` | no | 100000 | Waiting events at which collecting pauses (an error is logged). State is kept, so nothing is lost; changes are noticed, stamped later, when delivery recovers. |
| `DISK_RESIZE_MIN_MIB` | no | 1024 | A disk reading must move this much to count as a resize. |
| `MISSED_POLLS_FOR_GONE` | no | 2 | Consecutive polls a machine must be missing before it is `gone`. |
| `ECW_TIMEOUT_MS`, `SEND_TIMEOUT_MS` | no | 15000 | Request timeouts. |
| `LOG_LEVEL` | no | info | `debug`, `info`, `warn` or `error`. |

Logs are one JSON object per line on stdout. Secrets, keys and signatures are never logged.

## The request

`POST <ROOKBOX_API_URL>/ingest/usage-events`, `content-type: application/json`, with:

- `X-Rookbox-Timestamp`: Unix seconds when the request was signed.
- `X-Rookbox-Signature`: `sha256=` and the hex HMAC-SHA256, keyed with `INGEST_SECRET`, of
  `<timestamp>.<exact request body>`.
- `X-Rookbox-Reporter-Id`: the reporter id, which must match `reporterId` in the body.

The API refuses a timestamp more than five minutes from its own clock, so the server's clock
must be right (use NTP). The body is either `{ "kind": "events", "reporterId", "pollIntervalS",
"events": [...] }` or `{ "kind": "snapshot", "reporterId", "pollIntervalS", "seq", "key",
"takenAt", "machines": [...] }`; the schema is `IngestMessageSchema` in
`packages/contracts/src/usage.ts`. A `200` answer is `{ "ok": true, "ackedSeq": n, ... }`.

## Run it

Needs Node 22.13 or later (it uses the built-in `node:sqlite`, so there is nothing to install or
compile). Build from `product/`:

```bash
pnpm install --frozen-lockfile
pnpm --filter @rookbox/reporter build      # writes apps/reporter/dist/main.js
```

### With systemd

On the server next to the sandbox server:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin rookbox-reporter
sudo install -d /opt/rookbox-reporter
sudo install -m 0644 apps/reporter/dist/main.js /opt/rookbox-reporter/main.js
sudo install -m 0644 apps/reporter/deploy/rookbox-reporter.service /etc/systemd/system/
sudo install -m 0600 -o root -g root /dev/null /etc/rookbox-reporter.env
sudoedit /etc/rookbox-reporter.env     # KEY=value lines, see the table above
sudo systemctl daemon-reload
sudo systemctl enable --now rookbox-reporter
journalctl -u rookbox-reporter -f
curl -s http://127.0.0.1:9464/healthz
```

The unit gives the service its own state directory (`/var/lib/rookbox-reporter`) for the SQLite
file, and restarts it if it exits.

### With Docker

```bash
docker build -f apps/reporter/Dockerfile -t rookbox-reporter .
docker run -d --name rookbox-reporter --restart unless-stopped \
  --env-file /etc/rookbox-reporter.env \
  -v rookbox-reporter-data:/data \
  --network host rookbox-reporter
```

Mount a volume on `/data`: the outbox is there. `--network host` lets it reach a sandbox server
on the same machine through its public or local address; any network that reaches both servers
works.

### `/healthz`

Answers `200` while polling works and `503` when no poll has succeeded for three intervals. It
also reports `lastPollOkAt`, `lastDeliveryOkAt`, how many events are waiting (`pending`) and how
old the oldest is, and `delivery: "behind"` when events are waiting and nothing has been
delivered recently. A backlog is not a failure of the reporter, so it does not turn the check red.

## Test

```bash
pnpm --filter @rookbox/reporter test
pnpm --filter @rookbox/reporter check
```

The tests mock the sandbox server's client, use a real SQLite outbox and a fake API on a local
socket (retries, ordering, signature, duplicates, a lost acknowledgement), and run the reporter
into the real ingest route and usage service to check the two agree on the wire format.
