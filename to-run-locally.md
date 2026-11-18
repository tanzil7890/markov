Running it locally (cloud first, then desktop)
Terminal 1, the cloud servers:

cd cloud
pnpm install
cp .env.example .env.local # optional: Clerk keys + Neon URLs
pnpm stack

This starts four servers: accounts on 8790, relay on 8791, sharing on 8792 and connector on 8793. It also prints the environment variables the desktop app needs.

Without Clerk keys you get a test sign-in page that signs anyone in.
Without database URLs, data goes into SQLite under cloud/.local/.
If you use Neon, use the direct connection string, not the -pooler one.
Terminal 2, the desktop app (repo root, Node 24):

MARKOV_CLOUD_API_URL=http://127.0.0.1:8790 MARKOV_CLOUD_CLIENT_ID=markov-desktop \
MARKOV_RELAY_URL=http://127.0.0.1:8791 \
MARKOV_ARTIFACTS_API_URL=http://127.0.0.1:8792 \
MARKOV_SKILL_PACKAGE_DOWNLOAD_ORIGINS=http://127.0.0.1:8792 \
MARKOV_CONNECTOR_URL=http://127.0.0.1:8793 pnpm dev

In development, pnpm build:cli also adds a markov-dev command to /usr/local/bin.
