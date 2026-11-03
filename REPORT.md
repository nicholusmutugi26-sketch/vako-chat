# Vakochat Implementation Report

## 1. Overview

Vakochat is a browser-based messaging application designed to support direct
and group conversations, persistent message history and receipts, online
presence, typing indicators, and operator controls. The reference deployment
uses a React/TypeScript single-page application, a FastAPI backend, SQLite
storage, and Redis Pub/Sub. A two-node configuration demonstrates horizontal
request and WebSocket routing on one host. It is not a multi-host high
availability system.

## 2. Architecture

### Client

The frontend is built with React, TypeScript, Vite, and Tailwind CSS. Its
primary application shell in `frontend/src/App.tsx` provides navigation for
messages, groups, contacts, profile, settings, and the admin dashboard. Page
components divide the user experience into independently maintained
functional areas. Shared controls and the brand wordmark are in
`frontend/src/components/ui.tsx`.

The API client in `frontend/src/services/api.ts` performs JSON and upload
requests against configured backend bases. The WebSocket client in
`frontend/src/services/socket.ts` handles authentication, ping/pong, connection
state, reconnect backoff, and switching backend nodes after repeated
connection failures. The browser stores the bearer token in `sessionStorage`,
so it is cleared when the tab's session ends. Appearance settings are persisted
in browser storage. The production frontend image serves the static build with
Nginx and proxies REST and WebSocket traffic to the backend services.

### Backend and persistence

Each FastAPI backend node runs the same application code. HTTP routes and
WebSocket frames use token-authenticated user identity; conversation membership
is checked on protected chat operations. Passwords are stored as bcrypt
hashes. The backend persists users, conversations, members, messages, receipts,
profile pictures, group pictures, and admin activity in SQLite. The repository
layer in `backend/app/db.py` uses parameterized SQL and enables SQLite WAL mode.

The local and single-host Compose examples mount the same SQLite database
volume into both backend containers. This is a deliberate demonstration
topology, not a general clustered-database design. SQLite locking and shared
filesystem characteristics limit safe scaling and portability across hosts.

### Realtime relay and operations

The connection registry and Redis integration are implemented in
`backend/app/hub.py`. A node sends a message to its own connected recipients
and publishes an event to Redis channel `vakochat:events`. Other nodes relay the
event to their local sockets and ignore events originating from themselves.
Presence and node heartbeat information use expiring Redis keys. Traffic
counters support the admin dashboard's message-activity chart.

Redis Pub/Sub is at-most-once: it does not persist messages for offline
subscribers or replay missed events. The application stores message history in
SQLite, so clients can reload history after reconnecting, but sends made while
disconnected are not held in a durable outbox. The production Compose template
keeps Redis and backend ports private, persists service data in volumes, runs
the backend as a non-root user, and expects a TLS-terminating reverse proxy in
front of the frontend.

## 3. Implementation challenges and solutions

### Multi-node realtime delivery

Local WebSocket registries alone cannot deliver an event to a user connected to
another backend process. Redis Pub/Sub was introduced as a lightweight relay:
the origin node delivers locally and publishes for other nodes. Events include
an origin node and message identifier; subscribers avoid looping events back
to their origin, while clients can deduplicate message identifiers. Heartbeats
and presence use expiring keys so a crashed node or disconnected user does not
remain marked online indefinitely.

This solves live relay for connected nodes but not durable delivery. Pub/Sub can
lose events during outages, which is why persisted history and client refetch
are important. A durable queue/outbox would be required for stronger delivery
guarantees.

### Persisting receipts and unread state

Transient client-only ticks and notification counts reset on refresh and do
not reliably reflect other participants. The implementation records delivery
and read timestamps per message and recipient in SQLite. The UI derives
delivery state and unread counts from persisted backend data. This supports
consistent refresh behavior and exposes the node associated with receipt
processing. It adds database writes and query work, so indexes and measurement
will matter as data grows.

### Image uploads and browser constraints

The backend limits profile and group pictures to 2 MB. To allow ordinary phone
photos without increasing the service's upload/storage limit, the frontend
prepares supported larger images in the browser: it scales them and compresses
them before upload. This keeps the server-side limit intact, though the
approach relies on browser image decoding and canvas support and should be
tested on the actual mobile devices and browsers supported by a deployment.

### Operational administration

Operators needed to inspect node health and control traffic without exposing
monitoring controls to regular users. Admin-only endpoints and UI were added
for node health, Redis status, traffic, user search, role controls, suspension,
and activity history. Production configuration checks reject insecure default
secrets, non-HTTPS browser origins, or a missing initial-admin allowlist.
Administrator passwords are entered through a hidden provisioning prompt and
stored as hashes, rather than being embedded in source or public registration.

## 4. Performance evaluation

No formal throughput, latency, memory, or concurrent-user benchmark has been
run. The available local verification is functional rather than a performance
claim: the backend test suite exercises core auth, chat, receipt, and
administration behavior, and the frontend production build performs a
TypeScript check before bundling. These checks do not establish production
capacity or latency targets.

The design contains some favorable baseline choices: WebSockets avoid polling
for chat events; Redis relays transient inter-node events; SQLite has a message
conversation index and WAL mode; and browser-side image resizing limits upload
size. However, the current in-memory rate limiter is process-local, presence
lookup scans Redis keys, the audit and message tables grow without a retention
policy, and each receipt is persisted separately. Shared SQLite across backend
containers also creates contention and host-level storage coupling. These
constraints make extrapolating capacity from a local run inappropriate.

A meaningful evaluation should define an expected user and message workload,
then exercise it in a staging environment with the intended reverse proxy,
storage, and resource limits. Measure REST and WebSocket connection success,
message send-to-recipient latency (including p50, p95, and p99), throughput,
CPU/memory, database lock waits and query latency, Redis health, and behavior
during node and Redis restarts. Include long-lived connections, reconnect
bursts, group fan-out, picture uploads, and receipt writes. Record the test
environment and repeat runs; do not treat synthetic local results as a
production service-level objective.

## 5. Potential improvements

1. Replace SQLite with a managed client/server relational database before
   multi-host deployment, and add explicit schema migrations and tested
   backup/restore procedures.
2. Add a transactional outbox or durable event stream for recoverable delivery,
   plus idempotent consumers and retry/dead-letter handling.
3. Move rate limiting to shared infrastructure such as Redis and review
   authentication hardening, token revocation, secure cookie options, and
   account recovery before public launch.
4. Add load, soak, failover, and security testing; establish measurable latency
   and availability targets from observed results.
5. Add retention and archival policies for messages, receipts, and audit
   events; review indexes and query plans against representative data volumes.
6. Add centralized structured logs, metrics, tracing, alerting, dependency and
   image scanning, and a documented incident and recovery process.
7. Test responsive behavior and image processing across supported browsers and
   devices; consider self-hosting the Orbitron font if external font delivery
   is undesirable.

## 6. Conclusion

Vakochat demonstrates a complete realtime chat workflow with persistent
history, receipts, administration, and a deployable two-node single-host
reference stack. The principal architectural limitations are the shared
SQLite data layer and at-most-once event relay. The current build and
functional tests are useful correctness checks, but capacity and production
reliability remain to be established through staging, load, failover, and
recovery testing.
