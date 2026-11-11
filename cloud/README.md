# Markov Relay

The relay that connects the Markov mobile app to a desktop host. Phones and
desktops never talk to each other directly: each opens an outbound WebSocket
to a relay cell, the relay pairs the two sessions, and it splices frames
between them. A director assigns hosts to cells and coordinates migrations;
cells carry the user connections.

This directory is an independent pnpm workspace inside the Markov monorepo. Run
its commands from `cloud/`, not the repository root. The source is covered by
the repository's root [MIT license](../LICENSE).

The [2026-10-21 security review](docs/relay-security-2026-10-21.md) records
dependency/container scans, remaining upstream advisories, CI coverage, and
the validation required before rolling out the updated images and host pins.

## Packages

- `packages/relay-contract`: the wire contract shared by the relay, the
  desktop app, and the mobile app (frame shapes, close codes, admission budgets,
  splice state machine).
- `apps/relay`: the relay server. The same image runs as a director or a cell
  depending on `MARKOV_RELAY_ROLE`.
- `apps/relay-fence-broker`: a private, IAM-only service that owns the durable
  mutation lease, the Terraform checkout, and the narrow Compute mutation used
  when a registered target is superseded. The workflow that calls it holds read
  and invoke rights only, never those mutation permissions.
- `apps/push` and `packages/push-contract`: the mobile push gateway that holds
  the APNs key and sends to phones through APNs and FCM, and its wire contract.
  Deployment and operations are owned by the private `tanzil7890/markov-cloud` repository.
- `packages/connector-contract`: the connector wire contract (experimental).
- `apps/accounts`: the self-hosted accounts server behind desktop sign-in. It
  serves the desktop's `/v1/desktop/auth/*` endpoints, uses Clerk (or a
  loopback-only test provider) to identify the user, and signs the relay and
  connector tokens the other servers verify through `/.well-known/jwks.json`.
- `apps/sharing`: shared artifacts and skill sharing (`/v1/artifacts`,
  `/v1/skill-packages`, `/v1/skill-shares`), with files stored in the database.
- `apps/connector`: the chat connector that lets Slack threads start and steer
  agents on a signed-in desktop (`/v1/connector/*`).

## Self-hosted accounts and relay

`apps/accounts` replaces the hosted sign-in service. The desktop never talks to
Clerk directly: the accounts server owns the sign-in protocol and the session
tokens, so the identity provider can change without a desktop release.

| Desktop endpoint | Purpose |
| --- | --- |
| `GET /v1/desktop/auth/authorize` | Browser sign-in page (PKCE, loopback callback only) |
| `POST /v1/desktop/auth/session` | Exchanges the one-time code for access and refresh tokens |
| `POST /v1/desktop/auth/refresh` | Rotates tokens; replaying a spent refresh token revokes the session |
| `POST /v1/desktop/auth/capabilities`, `/profile`, `/org` | Account, organization, and capability reads and changes |
| `POST /v1/desktop/auth/logout` | Revokes the session |
| `POST /v1/desktop/auth/relay-token` | Mints the short-lived relay token |
| `POST /v1/desktop/auth/connector-token` | Mints the 5-minute connector token (user, machine, email) |

### Run it locally

```sh
cd cloud
pnpm install
cp .env.example .env.local   # optional: Clerk keys and Neon URLs
pnpm stack
```

`pnpm stack` starts the accounts server on port 8790, the relay on 8791, the
sharing server on 8792 and the connector on 8793, wired to each other, and
prints the environment variables for the desktop (run it from the repository
root with Node 24):

```sh
MARKOV_CLOUD_API_URL=http://127.0.0.1:8790 MARKOV_CLOUD_CLIENT_ID=markov-desktop \
  MARKOV_RELAY_URL=http://127.0.0.1:8791 \
  MARKOV_ARTIFACTS_API_URL=http://127.0.0.1:8792 \
  MARKOV_SKILL_PACKAGE_DOWNLOAD_ORIGINS=http://127.0.0.1:8792 \
  MARKOV_CONNECTOR_URL=http://127.0.0.1:8793 pnpm dev
```

Without Clerk keys it uses the test sign-in page, which signs anyone in and
refuses to start on anything but a loopback address. Without database URLs it
stores everything in SQLite under `cloud/.local/`. With Neon, use the direct
connection string, never the `-pooler` one: the servers rely on session
advisory locks and LISTEN/NOTIFY.

### End-to-end test

From the repository root, `pnpm test:self-hosted-cloud` boots the servers and
drives them with the real desktop modules:

- sign-in: browser sign-in, organization switch, token refresh, relay
  registration, pairing a simulated phone with end-to-end encryption, sign-out;
- sharing: publishing a skill bundle, installing it from its share link without
  signing in, revoking it; publishing, viewing and deleting an artifact;
- connector: a chat thread starts an agent, prompts become buttons, replies and
  turn ends reach the thread, and thread replies steer or stop the agent.

Set `MARKOV_SELF_HOSTED_E2E_{ACCOUNTS,RELAY,SHARING,CONNECTOR}_DATABASE_URL` to
run it on PostgreSQL. The `Self-hosted Cloud E2E` workflow runs it on SQLite and
PostgreSQL for every pull request that touches these servers or the desktop
code they serve.

### Deploying

Production requires `NODE_ENV=production`, Clerk keys,
`MARKOV_ACCOUNTS_DATABASE_URL`, and `MARKOV_ACCOUNTS_SIGNING_KEY_PEM` (an EC P-256
PKCS#8 key). Point the relay's `MARKOV_RELAY_AUTH_ISSUER` at the accounts public
URL and `MARKOV_RELAY_JWKS_URL` at its `/.well-known/jwks.json`. The relay reads
the client address from `X-Forwarded-For` assuming Google's front end appends
the last two hops; behind another proxy, make sure that proxy sets the header
the same way, or per-address admission limits can be bypassed.

## Chat connector (Slack)

`apps/connector` lets someone start and steer Claude Code or Codex on their own
Markov desktop from a Slack thread. The desktop holds a long poll to the
connector with a 5-minute token from the accounts server; Slack reaches the
connector over Socket Mode, so no public URL is needed.

Set it up:

1. In Slack, create an app **from a manifest** and paste
   `apps/connector/slack-app-manifest.json`. Install it to your workspace.
2. Copy the **Bot User OAuth Token** (`xoxb-…`) and create an **app-level
   token** with the `connections:write` scope (`xapp-…`). Put them in
   `cloud/.env.local` as `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`, then restart
   `pnpm stack`. Without them the connector runs a loopback-only test chat.
3. In Markov, sign in and turn on **Settings → Experimental → Chat connectors**.
4. Invite the bot to a channel (`/invite @Markov`) or message it directly.

Use it:

- `@Markov my-repo fix the failing login test` starts Claude in the project named
  `my-repo` (its name or `owner/name` remote). Start with `codex` to use Codex.
  Without a project name, Markov asks you to pick one.
- Reply in the thread to send a follow-up; reply `stop` to cancel the turn.
- Approval and question prompts appear as buttons. Only the person who started
  the thread can steer or answer it.
- Slack users are matched to Markov accounts by email, so the Slack profile email
  must be the email used to sign in to Markov.

Deploying needs `MARKOV_CONNECTOR_PUBLIC_URL`, `MARKOV_CONNECTOR_AUTH_ISSUER` (the
accounts public URL), `MARKOV_CONNECTOR_JWKS_URL` (its `/.well-known/jwks.json`),
`MARKOV_CONNECTOR_DATABASE_URL`, `MARKOV_CONNECTOR_CHAT=slack` and the two Slack
tokens. Run one instance: held polls are woken in process.

## Mobile push gateway

`apps/push` is a separate Cloud Run service from the relay. Phones never hold an
Markov credential for it: the desktop host authenticates with the same X25519
key it uses for the relay, answering an encrypted challenge to mint a 24 hour
session, then registers each paired phone's native push token and asks the
gateway to push. The gateway queues each event as its own notification,
enforces per-host quotas and request limits, and retires a
registration as soon as Apple or Google reports the token unregistered.
Provider push is the only ordinary mobile OS-banner path. The notification
socket is retained only for live dismissal and reconnect tray reconciliation;
it never creates or recovers banners. Desktop notification categories remain
authoritative.
Each delivery is persisted as one notification event. Before deploying an
incompatible queue format, stop all older push gateway revisions and clear only
unpublished push delivery fixtures; no queue preservation or migration is required.
FCM notification messages are inherently collapsible while offline and have a
small concurrent collapse-key budget, so every pending alert is not guaranteed.

Storage follows the relay pattern: PostgreSQL in production, SQLite for tests
and local development. Configure it with `MARKOV_PUSH_PUBLIC_URL`, `MARKOV_PUSH_FCM_PROJECT_ID`,
`MARKOV_PUSH_DATABASE_URL`, the three APNs variables (`MARKOV_PUSH_APNS_KEY`,
`MARKOV_PUSH_APNS_KEY_ID`, `MARKOV_PUSH_APPLE_TEAM_ID`, all three or none), and
optionally `MARKOV_PUSH_APNS_TOPIC`. The FCM credential comes from
the runtime service account, so no key material is configured for Android. See
[push gateway operations](https://github.com/tanzil7890/markov-cloud/blob/main/cloud/docs/push-gateway.md) for deployment and recovery.

Logging is aggregate counters only. Tokens, notification titles, notification
bodies, and full host fingerprints never reach a log line.

## Deployment configuration

The relay runtime and wire contracts are public. Production and staging Terraform,
backend configuration, operator tools, runbooks, broker image assembly, and deployment
workflows live in the private `tanzil7890/markov-cloud` repository. That repository pins
an immutable public source revision and combines it with its deployment configuration.

`Cloud Verify` here builds and tests public runtime code, audits dependencies, scans
relay and push images, and checks for secrets without cloud credentials. Private CI
also validates Terraform, scans the SQL proxy and broker, and runs deployment contracts.

## Local development

```sh
cd cloud
pnpm install
pnpm build
pnpm test
```

`pnpm test` runs the SQLite-backed suites. Tests that need PostgreSQL run only
when `MARKOV_RELAY_TEST_POSTGRES_URL` points at a disposable PostgreSQL 16 or 17
database, for example:

```sh
docker run --rm -d --name markov-relay-pg -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=markov_relay_test -p 55440:5432 postgres:16-alpine
MARKOV_RELAY_TEST_POSTGRES_URL=postgres://postgres@127.0.0.1:55440/markov_relay_test \
  pnpm --filter @markov-cloud/relay test
docker rm -f markov-relay-pg
```

Configuration is read from environment variables validated in
`apps/relay/src/config.ts`. `MARKOV_RELAY_ASSIGNMENT_SIGNING_KEY` (at least 32
bytes) is the only required value; everything else has a local default.
