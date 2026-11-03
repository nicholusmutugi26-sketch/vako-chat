# Vakochat

Vakochat is a browser-based messaging application with direct and group chats,
presence and typing indicators, delivery/read receipts, profile and group
pictures, contact matching, and an administrator dashboard.

## Features

- Direct and group conversations, conversation search, recent-chat ordering,
  group descriptions, and group pictures.
- Live typing indicators, online presence, emoji picker, reply/copy/forward,
  sender message editing for five minutes, and delete controls.
- Persisted delivery/read receipts, unread counts, and message delivery-node
  information.
- User profiles with optional email and Kenyan phone number, editable profile
  details, and profile pictures.
- Browser contact matching where the Contacts Picker API is supported.
- Theme, font family, font size, reduced-motion, and conversation display
  preferences.
- Orbitron wordmark with a chat icon in place of the “a” in Vakochat.
- Admin overview, user search, admin-role management, account suspension and
  restoration, recent activity, message traffic, Redis health, node health, and
  app-level node enable/disable controls.

## User guide

### Sign in or create an account

Open the application URL. Enter your username, email address, or phone number
and password to sign in. To register, choose **Register** and enter a username,
display name, and password; email and phone are optional. Phone numbers use the
Kenyan `+254` format. Administrator accounts must be provisioned by an
operator, not created through public registration.

### Find and start conversations

- **Messages** shows direct conversations and recent activity. Use the
  conversation search box to find chats; the newest activity is shown first.
- **Contacts** lets you search for Vakochat users and, on supported browsers,
  optionally match contacts you explicitly select using the browser Contacts
  Picker. Contact data is not uploaded until you choose the contacts feature.
- Start a direct conversation by selecting a contact. Use the new-conversation
  action to create a group, choose members, and optionally set its name,
  description, and picture.
- **Groups** filters the conversation list to group chats. Open a group to view
  its messages and available group details/editing controls.

### Send and manage messages

Choose a conversation, type in the composer, and send. The composer includes an
emoji picker. Typing indicators and presence are shown when available. Message
options include reply, copy, forward, information, and delete; your own message
can be edited for five minutes after sending. Delivery ticks indicate message
delivery, and the colored double tick indicates a read receipt. Group receipts
reflect delivery/read state for the conversation and can include node details.

Unread counts persist across page refreshes because read state is saved by the
backend. Offline messages are not queued for later delivery; reconnect and
check the conversation history if connectivity is interrupted.

### Profile and appearance

Open **Profile** to edit your display name, bio, email, phone number, and
profile picture. Open **Settings** to choose a font, font size, color theme,
conversation density, unread-count visibility, and reduced-motion preference.
Save settings when prompted to apply the selected options.

### Admin dashboard

Sign in as an administrator and select **Admin** from the desktop sidebar or
mobile navigation. The dashboard includes platform counts, node and Redis
health, message traffic, searchable user management, account suspension, role
controls, and a recent activity list. Node toggles drain application traffic;
they do not start or stop server processes. See [Create an administrator](#create-an-administrator)
for provisioning details.

## Requirements

- Node.js 22 LTS and npm (Node 22 is used in the production frontend image).
- Python 3.12 and pip.
- Docker Engine with the Docker Compose plugin.
- Redis 7 for local development and production deployments.

## Run locally

Start Redis:

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Create the backend virtual environment and install dependencies:

```bash
cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

The backend example configures the local admin allowlist as
`adminvakochat`. Keep `ENVIRONMENT=development` for this local setup.

Run the first backend node in a terminal:

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Run the second backend node in another terminal from the repository root:

```bash
cd backend
SERVER_ID=node-2 PORT=8002 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8002
```

Both local nodes use the same `backend/vakochat.db` SQLite file by default.
Run the frontend in another terminal:

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open <http://localhost:5173>. The default app environment is for local
development; do not expose these HTTP endpoints to the public internet.

Stop local services with `Ctrl+C` in each terminal, then stop Redis:

```bash
docker compose -f infrastructure/docker-compose.yml down
```

## Create an administrator

Administrator accounts must be provisioned by an operator and cannot be
created through public registration. For local development, set
`ADMIN_USERNAMES=adminvakochat` in the backend environment before starting the
nodes, then run:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m app.provision_admin
```

The provisioning command defaults to username `adminvakochat` and display name
`Admin Vakochat`. It prompts for the password without echoing it and saves only
a password hash. Enter the password at that prompt; do not put it in this
README, source control, or a frontend environment file. If the account already
exists, sign in with an existing administrator and grant it access from User
management instead.

## Open the admin dashboard

1. Sign in with an administrator account.
2. Select **Admin** in the desktop sidebar or mobile navigation.
3. Use **Platform overview** for account/group/message counts, **Cluster
   health** for Redis and node status, and **Message traffic** for sent and
   delivered frame rates.
4. Use **User management** to search accounts, grant/remove administrator
   access, or suspend/restore accounts.
5. Use **Admin and account activity** to review recent account and admin
   actions.

Node switches are application-level drain controls. Turning a node off closes
its WebSocket connections and rejects normal application traffic; it does not
stop the process or the machine. Health checks and admin controls remain
available to turn it back on. Configured `ADMIN_USERNAMES` accounts are
managed by server configuration and cannot have their administrator role
removed in the dashboard.

## Test and build

Run backend tests:

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest -q
```

Type-check and build the frontend:

```bash
cd frontend
npm ci
npm run build
```

The frontend output is written to `frontend/dist/`.

## Production-oriented single-host deployment

The included Compose stack is intended as a **single-host deployment baseline**
behind an HTTPS reverse proxy or load balancer. The proxy must terminate TLS,
serve the public domain, and forward HTTP and WebSocket traffic to
`127.0.0.1:8080`. Configure WebSocket upgrade support and a suitably long idle
timeout for `/ws`. Do not expose the backend or Redis ports publicly.

1. Copy the production environment template and edit it for your domain:

   ```bash
   cp infrastructure/.env.production.example infrastructure/.env.production
   ```

2. Generate a unique application secret:

   ```bash
   openssl rand -hex 32
   ```

   Put the generated value in `APP_SECRET_KEY` in the untracked
   `infrastructure/.env.production` file. Set `FRONTEND_ORIGINS` to the exact
   public HTTPS origin (no path), `VITE_WS_NODE_URLS` to its `wss://.../ws`
   endpoint, and `ADMIN_USERNAMES` to the initial admin username. Keep that
   environment file and backups out of source control and restrict access to
   them.

3. Build and start the services:

   ```bash
   docker compose -f infrastructure/compose.production.yml \
     --env-file infrastructure/.env.production up -d --build
   ```

4. Create the initial admin account. The command prompts for the password
   privately; use the username listed in `ADMIN_USERNAMES`.

   ```bash
   docker compose -f infrastructure/compose.production.yml \
     --env-file infrastructure/.env.production \
     run --rm --no-deps backend-1 python -m app.provision_admin
   ```

5. Check service status and logs:

   ```bash
   docker compose -f infrastructure/compose.production.yml \
     --env-file infrastructure/.env.production ps
   docker compose -f infrastructure/compose.production.yml \
     --env-file infrastructure/.env.production logs --tail=100
   ```

The production backend rejects missing/weak application secrets, non-HTTPS
browser origins, and a missing bootstrap-admin allowlist. OpenAPI and interactive
API docs are disabled in production mode. Redis is not published to the host;
the frontend container is bound to loopback; backend containers run as a
non-root user; SQLite and Redis data use persistent Docker volumes.

### Production readiness and limits

- This stack shares a SQLite database file between two backend containers on
  one Docker host. It is not a multi-host database or high-availability design.
  The application currently implements SQLite only. Multiple hosts,
  substantial traffic, or strict availability targets require implementing and
  validating a client/server database backend and designing/testing its
  backup, restore, migration, and failover processes before launch.
- Redis Pub/Sub is at-most-once; there is no durable message outbox. The current
  in-memory rate limiter is per backend process. Do not promise durable
  delivery or distributed abuse protection based only on this stack.
- Put the host behind a maintained TLS ingress; restrict access to the Docker
  host, production environment file, database volume, and Redis volume. Configure
  certificate renewal, firewall rules, security updates, and centralized
  monitoring/alerting.
- Establish and test encrypted off-host backups and a restore procedure for
  both application data and Redis state. Do not treat Docker volumes as backups.
- Build and test images in CI, scan dependencies and container images, pin
  deployment images to reviewed versions/digests, and perform a staging rollout
  before production upgrades.
- The Google Fonts Orbitron typeface requires network access to Google Fonts;
  the wordmark falls back to a system sans-serif if it is unavailable.

The Compose files provide deployment scaffolding, not a certification of
production readiness. Validate the full deployment, load characteristics,
recovery objectives, and compliance requirements for the actual operating
environment before onboarding real users.

## Architecture

- React, TypeScript, Vite, and Tailwind frontend.
- FastAPI backend with two local nodes and a shared SQLite WAL database in the
  development/single-host reference setup.
- Redis Pub/Sub relays messages, typing state, receipts, and node status between
  backend nodes.
- Browser REST and WebSocket traffic can use configured backend endpoints;
  tokens are held in `sessionStorage`.
- Both backend nodes must use the same `APP_SECRET_KEY`, `DATABASE_PATH`, Redis
  service, and `NODE_IDS` configuration.
- See [REPORT.md](REPORT.md) for the architecture overview, implementation
  challenges and solutions, performance evaluation, and improvement plan.

### Code map and documentation

- `frontend/src/App.tsx`: authenticated application shell and navigation.
- `frontend/src/pages/`: login, messages, contacts, profile, settings, and admin
  screens.
- `frontend/src/context/AppContext.tsx`: shared client state and chat actions.
- `frontend/src/services/api.ts`: typed REST requests and backend failover.
- `frontend/src/services/socket.ts`: WebSocket authentication, reconnects,
  heartbeats, and node failover.
- `backend/app/main.py`: HTTP and WebSocket routes, authorization, and request
  handling.
- `backend/app/hub.py`: local socket registry, Redis relay, presence, node
  health, and traffic counters.
- `backend/app/db.py`: SQLite schema, migrations, and parameterized repository
  operations.
- `backend/app/auth.py` and `backend/app/config.py`: token/password handling
  and validated environment configuration.
- `backend/app/provision_admin.py`: interactive, password-hiding admin
  provisioning command.

Core modules use module/function docstrings for important boundaries and
protocols; comments are reserved for implementation details that are not
obvious from names and types. When changing a WebSocket frame, database schema,
or environment variable, update its related types, tests, and this guide.
