VAKOCHAT IMPLEMENTATION REPORT

Project Title: Development of a Distributed Real-Time Chat Application
Application Name: Vakochat
Submission Date: 3 November 2026

1. INTRODUCTION AND OVERVIEW

Vakochat is a browser-based distributed messaging application developed to enable multiple users to communicate through real-time direct and group conversations. The application demonstrates important distributed computing concepts, including client-server communication, message broadcasting, inter-server communication, connection management, fault tolerance and server monitoring.

The application provides user authentication, direct messaging, group conversations, persistent message history, delivery and read receipts, online presence, typing indicators, profile management and administrative controls.

Unlike a conventional chat application operating through a single backend server, Vakochat uses two independent Python server nodes connected through a shared Redis instance. This architecture enables users connected to different backend nodes to exchange messages in real time.

The technology stack consists of React, TypeScript, Vite and Tailwind CSS on the frontend, FastAPI and Uvicorn on the backend, SQLite for persistent storage, and Redis Pub/Sub for communication between server nodes.

The reference deployment uses two backend instances running on the same host. It demonstrates distributed communication but should not be described as a fully distributed multi-host high-availability system.

2. SYSTEM ARCHITECTURE AND IMPLEMENTATION
2.1 Frontend Architecture

The frontend is developed using React, TypeScript, Vite and Tailwind CSS. It provides the graphical interface through which users interact with the messaging system.

The main application interface is organized into several functional sections:

Messages and direct conversations.
Group conversations and group management.
Contacts and online users.
User profiles and application settings.
Administrative dashboard and network monitoring.

The main application shell is implemented in:

frontend/src/App.tsx

This file provides the primary application structure and navigation between the different functional areas.

Shared interface components and the application wordmark are maintained in:

frontend/src/components/ui.tsx

The API communication service is located at:

frontend/src/services/api.ts

It handles HTTP requests, including JSON operations and file uploads, between the frontend and backend.

The WebSocket communication service is implemented in:

frontend/src/services/socket.ts

This component is particularly important because it manages persistent connections between clients and backend nodes. Its responsibilities include authentication, heartbeat communication, connection-state monitoring, reconnection backoff and switching to another configured backend node after repeated connection failures.

The browser stores authentication tokens in sessionStorage, meaning they are cleared when the browser tab's session ends. Appearance preferences are persisted in browser storage.

For production deployment, the frontend is built into static assets and served through Nginx, which also proxies API and WebSocket traffic to the backend services.

2.2 Backend Architecture

The backend is developed using Python 3.11 or newer, FastAPI and Uvicorn.

The application uses two independent server instances running the same backend codebase. Each instance has its own server identifier and port configuration.

Server Node 1

Server ID: node-1
Port: 8001

Server Node 2

Server ID: node-2
Port: 8002

Both nodes connect to the same Redis instance and use the application's shared database configuration.

The backend handles authentication, conversation management, message processing, WebSocket connections, user presence, receipts and administrative operations.

The main backend application is organized under:

backend/app/

The database and persistence operations are implemented in:

backend/app/db.py

This module handles database interactions using parameterized SQL queries. SQLite is used to store user accounts, conversations, group memberships, messages, delivery receipts, profile pictures, group pictures and administrative activity. SQLite Write-Ahead Logging (WAL) mode is enabled to improve database read/write behaviour.

Passwords are stored as bcrypt hashes rather than plain-text credentials.

2.3 Distributed Communication Using Redis Pub/Sub

One of the most important architectural features of Vakochat is communication between independent backend nodes.

Each backend server maintains its own local registry of connected WebSocket clients. Without an inter-server communication mechanism, a message received by Node 1 would not automatically reach a user connected to Node 2.

This problem is addressed using Redis 7 and its Publish/Subscribe mechanism.

The Redis integration and WebSocket connection management are implemented in:

backend/app/hub.py

The communication process works as follows:

A user sends a message through the frontend WebSocket connection.
The connected backend node authenticates the user and validates conversation membership.
The backend persists the message in SQLite.
The originating node delivers the message to recipients connected locally.
The originating node publishes the message event to the Redis channel vakochat:events.
The other backend node receives the published event.
The receiving node forwards the event to its locally connected recipients.
The frontend updates the conversation interface without requiring a page refresh.

Each event contains a unique message identifier and originating node information. These values support duplicate detection and prevent unnecessary event relaying back to the originating server.

Redis also stores expiring node heartbeat and user-presence information. This helps identify unavailable nodes and prevents disconnected users from remaining online indefinitely.

It is important to distinguish message persistence from message delivery guarantees. Redis Pub/Sub is an at-most-once messaging mechanism. It does not retain events for disconnected subscribers or automatically replay messages after an outage.

Vakochat uses SQLite message history to allow clients to retrieve previously persisted messages after reconnecting. However, the current architecture does not implement a durable event queue or guarantee exactly-once message delivery.

2.4 Database and Persistence

SQLite provides the application's initial persistent storage layer.

The database repository is implemented in:

backend/app/db.py

It maintains information required by the messaging application, including:

User accounts and authentication information.
Direct and group conversations.
Group membership.
Stored messages and timestamps.
Recipient-specific delivery and read receipts.
Profile and group images.
Administrative activity.

The reference single-host Docker Compose configuration mounts the same SQLite database volume into both backend containers.

This is suitable for the controlled project demonstration, but shared SQLite storage introduces database-locking and filesystem limitations. A client-server database such as PostgreSQL would be more appropriate for future multi-host deployment.

2.5 Network Monitoring and Administration

Vakochat includes an administrative dashboard for monitoring the distributed infrastructure.

The dashboard provides information about:

Server Node 1 and Server Node 2.
Server availability and connection counts.
Node uptime and heartbeat information.
Redis connectivity.
Message traffic counters.
Registered users and administrator accounts.
Account suspension and restoration.

The dashboard uses information obtained from backend monitoring operations rather than relying on manually invented live statistics.

Administrative functions are protected separately from ordinary user operations.

3. DEVELOPMENT AND EXECUTION COMMANDS

The following commands describe the expected local development workflow on a Windows machine. They assume that the repository contains the corresponding dependency files and that the backend entry point is app.main:app. The actual entry-point module, environment variable names and available scripts should be confirmed against the submitted source code.

3.1 Frontend Setup

Open PowerShell in the project root and navigate to the frontend directory:

powershell
cd frontend


Install the frontend dependencies:

powershell
npm install


Start the Vite development server:

powershell
npm run dev


Create a production build:

powershell
npm run build


The production build performs the configured TypeScript and frontend compilation checks.

3.2 Backend Setup

Open another PowerShell terminal and navigate to the backend directory:

powershell
cd backend


Create a Python virtual environment:

powershell
python -m venv .venv


Activate the environment:

powershell
.\.venv\Scripts\Activate.ps1


Install backend dependencies:

powershell
python -m pip install -r requirements.txt


Configure the backend environment variables using the project's .env.example as a reference.

If the backend exports its FastAPI application as app from app/main.py, Node 1 can be started using:

powershell
uvicorn app.main:app --host 0.0.0.0 --port 8001


Node 2 can be started in another terminal using the same application code:

powershell
uvicorn app.main:app --host 0.0.0.0 --port 8002


The two instances must have distinct server identifiers and appropriate node-specific configuration while sharing the same Redis configuration.

3.3 Starting Redis

Redis is required for inter-node message broadcasting.

Where Docker is available, a local Redis instance can be started using:

powershell
docker run -d --name vakochat-redis -p 6379:6379 redis:7


Check whether the container is running:

powershell
docker ps


Check Redis connectivity:

powershell
docker exec vakochat-redis redis-cli ping


A successful Redis health check returns:

text
PONG


If the project provides a Docker Compose configuration, its Redis service can instead be started using the appropriate Compose file:

powershell
docker compose -f infrastructure/docker-compose.yml up -d redis


The actual Compose service name and file location must match the submitted repository.

3.4 Running Tests

Run the backend test suite from the backend directory:

powershell
python -m pytest


If the repository defines frontend testing scripts, execute the corresponding configured command, for example:

powershell
npm test


The available test scripts should be confirmed in frontend/package.json.

These commands describe how verification should be performed; they do not imply that additional tests or performance benchmarks have already been completed.

4. IMPLEMENTATION CHALLENGES AND SOLUTIONS
4.1 Communication Between Independent Nodes

A major challenge was enabling clients connected to different backend processes to communicate in real time.

Each server maintains its own WebSocket connection registry, so a message received by one server cannot automatically reach clients connected to another.

Solution: Redis Pub/Sub was implemented as the inter-server communication mechanism. The originating node publishes message events to a shared Redis channel, allowing the other node to receive and forward those events to its locally connected clients.

Unique message identifiers and origin-node information help prevent duplicate processing and unnecessary event relaying.

4.2 Server Failure and Automatic Reconnection

When a backend node becomes unavailable, active WebSocket connections may be interrupted.

Solution: The frontend WebSocket service implements connection-state monitoring, reconnection attempts with backoff and switching between configured backend nodes after repeated failures.

Node heartbeats and expiring Redis keys also help identify inactive infrastructure.

Once a client reconnects, previously persisted messages can be retrieved from SQLite. However, automatic reconnection does not itself guarantee that transient events published during an outage will be recovered.

4.3 Message Persistence and Receipts

Maintaining consistent message history, unread counts and delivery information across multiple users presents another challenge.

Solution: Messages and recipient-specific delivery and read timestamps are stored in SQLite. The frontend uses backend-provided information to display receipt states rather than relying entirely on temporary client-side indicators.

This improves consistency after page refreshes, although it increases database writes and query operations.

4.4 Image Uploads and Administration

Supporting profile and group images while maintaining reasonable upload limits required additional processing.

Solution: The backend enforces a 2 MB image upload limit, while the frontend resizes and compresses supported larger images before uploading them.

Administrative endpoints and dashboard components were also implemented to separate operator activities from normal user operations. Password hashing and production configuration checks provide additional security measures.

5. PERFORMANCE EVALUATION AND POTENTIAL IMPROVEMENTS

Vakochat uses asynchronous communication through FastAPI and WebSockets, reducing the need for continuous HTTP polling. Redis Pub/Sub provides a lightweight mechanism for distributing real-time events between backend nodes.

SQLite WAL mode, conversation-oriented message indexing and browser-side image compression provide reasonable baseline optimizations for the local demonstration environment.

The existing verification described for the implementation includes backend tests covering core authentication, messaging, receipts and administration. The frontend production build also performs TypeScript checking before bundling.

However, no formal throughput, latency, memory-consumption or maximum-concurrent-user benchmark results have been supplied. Therefore, the existing verification should be regarded as functional testing rather than a formal performance evaluation.

Several limitations may affect performance as usage increases.

First, sharing SQLite storage between backend containers introduces database-locking and filesystem constraints. Second, Redis Pub/Sub does not retain events for disconnected subscribers. Third, an in-memory rate limiter operates independently in each process and does not provide globally consistent limits. Fourth, message and administrative activity records can grow indefinitely without a retention policy. Finally, individual receipt writes and presence lookups may become more expensive as the number of users increases.

Future performance evaluation should involve multiple simultaneous users communicating through both backend nodes. The evaluation should measure message delivery latency, successful WebSocket connections, messages processed per second, CPU and memory consumption, database query performance and behaviour during server or Redis restarts.

Several improvements are recommended:

Replace shared SQLite storage with PostgreSQL before expanding to multi-host deployment.
Introduce a transactional outbox or durable event-stream mechanism for recoverable message delivery.
Implement shared rate limiting using Redis.
Improve token revocation and authentication security.
Introduce database migration, backup and recovery procedures.
Add automated load, security, failover and extended reliability tests.
Implement message-retention and administrative audit-log policies.
Introduce centralized logging, metrics and alerting.

These improvements would strengthen the application's scalability, reliability, maintainability and operational visibility.

6. CONCLUSION

Vakochat demonstrates the practical implementation of a distributed real-time messaging application using modern web technologies and Python-based backend services.

The integration of React, FastAPI, WebSockets, SQLite and Redis Pub/Sub provides a functional architecture supporting direct messaging, group communication, persistent message history, delivery receipts, user presence and administrative monitoring.

Its two-node configuration demonstrates how independent backend processes can exchange message events and deliver them to users connected to different servers. Automatic client reconnection and network monitoring further demonstrate basic fault-tolerance mechanisms.

Although the application provides a practical demonstration of distributed communication, shared SQLite storage and the transient nature of Redis Pub/Sub remain important architectural limitations. Further benchmarking, durable event processing and multi-host database deployment would be necessary before claiming production-scale reliability.

Overall, Vakochat achieves its central objective of demonstrating distributed client-server communication, real-time message broadcasting, persistent messaging and basic server recovery while providing a foundation for future improvements in scalability, reliability and performance.
