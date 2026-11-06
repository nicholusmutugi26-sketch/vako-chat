Vakochat

A Distributed Real-Time Messaging Application

Vakochat is a browser-based messaging application designed to provide real-time communication through direct and group conversations. It combines modern web technologies with a distributed Python backend architecture to demonstrate real-time message broadcasting, inter-server communication, persistent messaging, connection management and basic fault tolerance.

The application supports user authentication, online presence, typing indicators, message delivery and read receipts, profile and group pictures, contact matching, and an administrative dashboard for monitoring and managing the messaging infrastructure.

Vakochat uses two independent FastAPI server nodes connected through Redis Pub/Sub, allowing users connected to different backend nodes to communicate in real time.

Table of Contents
Features
Technology Stack
System Architecture
Project Structure
Requirements
Installation and Local Setup
Administrator Account Provisioning
Using the Admin Dashboard
User Guide
Testing and Production Build
Production Deployment
Security Considerations
Production Readiness and Limitations
Development Guidelines
Technical Documentation
Features
1. Real-Time Messaging
Direct messaging between registered users.
Group conversations with multiple participants.
Real-time message broadcasting through WebSockets.
Conversation search and recent-chat ordering.
Group descriptions and group pictures.
Group invitations, administrator roles, member removal, and leaving groups.
Member following, follower lists, and member profile views.
Message replies, copying and forwarding.
Message editing within five minutes of sending.
Message deletion controls.
Emoji picker integrated into the message composer.
Live typing indicators.
Online and offline presence indicators.
2. Message Delivery and Persistence
Persistent message history.
Delivery and read receipts.
Recipient-specific message status.
Persistent unread message counts.
Message delivery-node information.
Unique message identifiers for duplicate detection.
Message-history retrieval after reconnecting.

Note: Redis Pub/Sub provides transient, at-most-once event delivery. Persisted message history allows clients to retrieve stored messages after reconnecting, but the system does not implement guaranteed or exactly-once delivery.

3. User Profiles and Contacts
Customizable display names and biographies.
Optional email addresses.
Optional Kenyan phone numbers using the +254 format.
Profile picture uploads.
Contact search and matching.
Browser contact matching through the Contacts Picker API where supported.
Follow and unfollow other users, with follower and following lists on your profile.
Text and image stories with audience choices for everyone, followers, direct-message contacts, or both.
Green rings mark unviewed stories; grey rings mark stories already viewed.
A dedicated Stories page is available in desktop and mobile navigation.
Users can apply for verification; administrators approve or deny applications before a verified badge is displayed.

Contact information is not uploaded through the browser contact-matching feature until the user explicitly selects contacts through the feature.

4. Personalization and Appearance
Multiple application themes.
Configurable font families.
Adjustable font sizes.
Reduced-motion preference.
Conversation display and density preferences.
Unread-count visibility controls.
Custom Vakochat wordmark using the Orbitron typeface.
5. Distributed Network Monitoring

The administrator dashboard provides operational visibility into the distributed messaging infrastructure.

Features include:

Server Node 1 and Server Node 2 health information.
Active server connection counts.
Node uptime and heartbeat information.
Redis connectivity status.
Message traffic monitoring.
Registered user and group statistics.
Administrator account management.
User search and account management.
Account suspension and restoration.
Verification application review and verified account approval.
Recent administrative activity.
Application-level node enable and disable controls.

The dashboard uses backend monitoring information rather than fabricated live statistics.

Technology Stack
Frontend
React – Component-based user interface.
TypeScript – Static typing and improved code maintainability.
Vite – Frontend development server and build tooling.
Tailwind CSS – Utility-first styling.
Lucide Icons – Interface icons.
WebSockets – Real-time client-server communication.
Backend
Python 3.12 – Backend programming language.
FastAPI – Asynchronous API framework.
Uvicorn – ASGI application server.
WebSockets – Persistent bidirectional communication.
Redis Python Client – Redis integration.
Pydantic – Data validation and configuration.
Distributed Infrastructure
Redis 7 – Inter-server communication and presence infrastructure.
Redis Pub/Sub – Real-time event broadcasting between backend nodes.
Docker – Containerization.
Docker Compose – Local and production-oriented service orchestration.
SQLite – Application data persistence.
Nginx – Production frontend serving and reverse proxy support.
System Architecture

Vakochat follows a distributed client-server architecture consisting of a frontend application, two independent backend server nodes, a shared Redis instance and a persistent SQLite database.

Backend Node Configuration

Server Node 1

Server ID: node-1
Port: 8001

Server Node 2

Server ID: node-2
Port: 8002

Both backend nodes execute the same application codebase but operate with different server identifiers and port configurations.

Message Communication Flow
A user sends a message through the frontend WebSocket connection.
The connected backend node authenticates the user and validates conversation membership.
The message is persisted in SQLite.
The originating node delivers the event to locally connected recipients.
The originating node publishes the event to Redis.
The other backend node receives the event through Redis Pub/Sub.
The receiving node forwards the event to its locally connected recipients.
Connected clients update their interfaces in real time.
Redis Communication

The shared Redis Pub/Sub channel is:

vakochat:events

Redis is also used for expiring node heartbeat and user-presence information.

Database Persistence

SQLite stores users, conversations, group memberships, messages, receipts, profile pictures, group pictures and administrative activity.

The local and reference single-host deployment configurations use a shared SQLite database volume for both backend nodes.

This is a demonstration architecture, not a general multi-host database deployment.

For more detailed architectural information, see REPORT.md.

Project Structure

The application is organized into separate frontend, backend and infrastructure components.

text
Vakochat/
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   └── ui.tsx
│   │   ├── pages/
│   │   ├── context/
│   │   │   └── AppContext.tsx
│   │   └── services/
│   │       ├── api.ts
│   │       └── socket.ts
│   │
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── hub.py
│   │   ├── db.py
│   │   ├── auth.py
│   │   ├── config.py
│   │   └── provision_admin.py
│   │
│   ├── requirements.txt
│   └── .env.example
│
├── infrastructure/
│   ├── docker-compose.yml
│   ├── compose.production.yml
│   └── .env.production.example
│
├── docs/
│
├── README.md
└── REPORT.md


This is an overview of the principal application files, not an exhaustive listing of every repository file.

Important Frontend Files
frontend/src/App.tsx – Main application shell and navigation.
frontend/src/components/ui.tsx – Shared user interface components.
frontend/src/context/AppContext.tsx – Shared application state and chat actions.
frontend/src/services/api.ts – REST API communication and backend requests.
frontend/src/services/socket.ts – WebSocket authentication, heartbeat, reconnection and node failover.
frontend/src/pages/ – Application screens, including messaging, contacts, profile, settings and administration.
Important Backend Files
backend/app/main.py – HTTP API, WebSocket routes, authorization and request handling.
backend/app/hub.py – WebSocket connection registry, Redis event relay, presence, node health and traffic counters.
backend/app/db.py – SQLite schema, migrations and parameterized database operations.
backend/app/auth.py – Authentication and password/token handling.
backend/app/config.py – Application configuration and environment validation.
backend/app/provision_admin.py – Secure administrator account provisioning.
Requirements

Before running Vakochat locally, ensure that the following software is installed.

Node.js 22 LTS.
npm.
Python 3.12 and pip.
Docker Engine.
Docker Compose plugin.
Git (recommended).

Redis 7 is required for inter-node communication.

Verify the installations:

bash
node --version
npm --version
python --version
docker --version
docker compose version

Installation and Local Setup

The following instructions use Bash-compatible commands. Windows users can execute them through WSL or Git Bash. PowerShell alternatives are provided where environment activation differs.

Step 1: Obtain the Project

Clone the repository:

bash
git clone <repository-url>


Navigate into the project:

bash
cd Vakochat


Replace <repository-url> with the actual repository URL.

Step 2: Start Redis

From the project root, run:

bash
docker compose -f infrastructure/docker-compose.yml up -d


Check the running containers:

bash
docker ps


Verify Redis connectivity:

bash
docker exec vakochat-redis redis-cli ping


A successful response should be:

text
PONG

Step 3: Configure the Backend

Navigate to the backend directory:

bash
cd backend


Create a virtual environment:

bash
python3.12 -m venv .venv


Activate it:

bash
source .venv/bin/activate


On Windows PowerShell:

powershell
.\.venv\Scripts\Activate.ps1


Install the dependencies:

bash
pip install -r requirements.txt


Create the local environment configuration:

bash
cp .env.example .env


On PowerShell:

powershell
Copy-Item .env.example .env


Review the environment configuration before starting the backend.

The supplied local configuration uses adminvakochat as the initial administrator allowlist entry. Keep:

env
ENVIRONMENT=development


for the local development environment.

Do not commit environment files containing secrets or credentials.

Step 4: Start Server Node 1

From the backend directory, run:

bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001


On Windows PowerShell, use:

powershell
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8001


Node 1 will listen on port 8001.

Keep this terminal running.

Step 5: Start Server Node 2

Open another terminal and navigate to the backend directory.

On Bash:

bash
cd backend


Start the second node:

bash
SERVER_ID=node-2 PORT=8002 .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8002


On Windows PowerShell:

powershell
cd backend
$env:SERVER_ID = "node-2"
$env:PORT = "8002"
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8002


Both nodes must use the same Redis service, application secret, database path and shared node configuration.

Both local nodes use the same backend/vakochat.db SQLite file by default.

Keep the second terminal running.

Step 6: Configure and Start the Frontend

Open another terminal and navigate to the frontend directory:

bash
cd frontend


Create the local frontend environment file:

bash
cp .env.example .env.local


On PowerShell:

powershell
Copy-Item .env.example .env.local


Install frontend dependencies:

bash
npm ci


Start the development server:

bash
npm run dev


Open the application in your browser:

http://localhost:5173

The frontend should now be able to communicate with the configured backend nodes.

Step 7: Verify the Distributed Setup

To verify the local environment:

Open Vakochat in two different browser sessions.
Register or sign in using separate user accounts.
Connect one client through Node 1 and another through Node 2, using the configured frontend node selection or routing.
Start a direct or group conversation.
Send messages between the two clients.
Confirm that messages appear in real time.
Open the administrative dashboard and inspect node and Redis health.
Disable an application node and observe client reconnection and routing behaviour.
Restore the node and verify that it becomes available again.

Actual results should be observed during testing; the presence of two running processes alone does not establish successful cross-node communication.

Stopping the Local Environment

Stop each running development process using:

text
Ctrl + C


Stop the Redis and other Compose services:

bash
docker compose -f infrastructure/docker-compose.yml down


This stops the containers but does not automatically remove their persistent volumes.

Administrator Account Provisioning

Administrator accounts cannot be created through public registration. They must be provisioned by an authorized operator.

For local development, ensure the backend environment contains:

env
ADMIN_USERNAMES=adminvakochat


From the backend directory, run:

bash
PYTHONPATH=. .venv/bin/python -m app.provision_admin


On Windows PowerShell:

powershell
$env:PYTHONPATH = "."
.\.venv\Scripts\python.exe -m app.provision_admin


The provisioning command defaults to:

Username: adminvakochat
Display name: Admin Vakochat

The command prompts for a password without displaying the entered characters and stores a password hash rather than the original password.

Security recommendations:

Never include administrator passwords in this README.
Never hardcode administrator credentials into frontend files.
Never commit real passwords or application secrets to Git.
Restrict administrator provisioning to authorized operators.

If the administrator account already exists, sign in with an existing administrator and use User Management to grant the appropriate permissions.

Using the Admin Dashboard

The administrative dashboard provides an overview of application usage and distributed infrastructure health.

Accessing the Dashboard
Sign in using an administrator account.
Select Admin from the desktop sidebar or mobile navigation.
Open the platform overview to inspect account, group and message statistics.
Open Cluster Health to inspect the backend nodes and Redis connectivity.
Review Message Traffic to inspect available sent and delivered frame counters.
Use User Management to search accounts and manage administrative roles.
Open Admin and Account Activity to review recent administrative and account operations.
Node Management

The dashboard provides application-level node enable and disable controls.

These controls are not operating-system or Docker controls.

Turning a node off:

Closes its active WebSocket connections.
Rejects normal application traffic through that node.
Allows the remaining configured node to continue handling available traffic.

Turning a node back on restores its application-level availability.

The underlying server process and machine are not stopped.

Configured ADMIN_USERNAMES accounts are managed through server configuration and cannot have their administrator role removed through the dashboard.

User Guide
1. Registration and Sign In

Open the Vakochat application in your browser.

To create an account:

Select Register.
Enter a username.
Enter a display name.
Create a password.
Optionally provide an email address or Kenyan phone number.
Complete registration.

Phone numbers use the Kenyan +254 format.

To sign in, enter your username, email address or phone number together with your password.

Administrator accounts must be provisioned separately.

2. Starting Conversations

The Messages section displays direct conversations and recent activity.

Use the conversation search field to locate existing chats.

To start a direct conversation:

Open Contacts.
Search for another registered Vakochat user.
Use Follow to add them to your following list, or Message to open a conversation.
Your profile shows follower and following totals; select either total to browse the list.

To create a group:

Select the new-conversation action.
Choose the intended members.
Provide a group name.
Optionally add a description and group picture.
Create the conversation.

The group creator is an administrator. Open group information to invite users, promote or demote group administrators, remove members, follow members, view their followers, open member profiles, or leave the group. Group invitations must be accepted before membership is added.

The Groups section provides a filtered view of group conversations.

3. Stories and Verification

Open Stories to post a text or image story. Stories expire after 24 hours. Choose an audience for each post: everyone, followers, direct-message contacts with whom you have exchanged messages, or both followers and direct-message contacts. The default audience is everyone.

Use the horizontal story circles at the top of the page to browse active stories. A green ring indicates an unviewed story; a gray ring indicates that the stories have been viewed. The same row is used on the Messages page.

From Profile, a user can apply for an account verification badge by providing a short reason. Applications remain pending until an administrator approves or denies them in the Admin dashboard's Verification Applications section. Only administrator approval grants the verified badge.

4. Sending and Managing Messages

Open a conversation and type your message in the composer.

Available message actions include:

Sending messages.
Selecting emojis.
Replying to messages.
Copying messages.
Forwarding messages.
Viewing message information.
Editing your own messages within five minutes.
Deleting messages.

Typing indicators and presence information are displayed when available.

Delivery ticks indicate delivery status, while colored double ticks indicate read status.

Group receipts represent recipient-specific delivery and read information.

5. Message Information

The message information interface provides additional details about a message, including its origin node, delivery information and available receipt status.

This is particularly useful when demonstrating how messages move through the distributed infrastructure.

6. Profile Management

Open Profile to update:

Display name.
Biography.
Email address.
Phone number.
Profile picture.

Save the changes to update your profile.
Your profile also shows your follower and following counts and provides access
to the corresponding user lists. Select a person in either list to open their profile and follow or unfollow them.

The Account Verification section shows the current application status and lets you submit or resubmit a request for administrator review.

7. Appearance Settings

Open Settings to customize:

Application theme.
Font family.
Font size.
Conversation density.
Unread-count visibility.
Reduced-motion preference.

These options allow users to personalize the interface.

8. Connectivity and Offline Behaviour

Vakochat monitors its WebSocket connection and attempts to reconnect automatically when connectivity is interrupted.

If the current backend node becomes unavailable, the frontend can switch to another configured node after repeated connection failures.

Previously persisted messages can be retrieved after reconnection.

However, messages are not held in a durable client-side offline sending queue. Redis Pub/Sub also does not guarantee recovery of events missed during an outage.

Testing and Production Build
Backend Tests

Navigate to the backend directory:

bash
cd backend


Activate the virtual environment if it is not already active.

Run the test suite:

bash
PYTHONPATH=. .venv/bin/pytest -q


The test suite should cover the implemented authentication, messaging, receipt and administrative functionality.

On Windows PowerShell:

powershell
$env:PYTHONPATH = "."
.\.venv\Scripts\python.exe -m pytest -q

Frontend Build

Navigate to the frontend directory:

bash
cd frontend


Install dependencies:

bash
npm ci


Build the production frontend:

bash
npm run build


The compiled frontend output is written to:

text
frontend/dist/


The production build performs the configured TypeScript checks and frontend bundling.

Recommended Integration Tests

In addition to unit and build checks, the following integration scenarios should be tested:

Direct messaging between two clients connected to the same node.
Direct messaging between clients connected to different nodes.
Group message broadcasting.
Redis connectivity failure and recovery.
Backend node failure and client reconnection.
Switching to another available backend node.
Message-history retrieval after reconnecting.
Delivery and read receipt persistence.
Administrative node controls.
Multiple simultaneous WebSocket connections.

Formal performance benchmarks should be conducted separately from functional tests.

Production Deployment
Production Deployment Overview

The included Compose stack provides a single-host production-oriented deployment baseline.

It is intended to operate behind an HTTPS reverse proxy or load balancer.

The reverse proxy must:

Terminate TLS.
Serve the public application domain.
Forward HTTP requests to the frontend service.
Forward WebSocket traffic correctly.
Support WebSocket upgrade headers.
Provide a suitably long idle timeout for the /ws endpoint.

Backend and Redis ports must not be exposed publicly.

Step 1: Create the Production Environment File

From the project root:

bash
cp infrastructure/.env.production.example infrastructure/.env.production


Edit the production configuration:

text
infrastructure/.env.production


Configure the following important values:

Application secret.
Public HTTPS frontend origin.
WebSocket node URLs.
Initial administrator username.
Redis and database configuration.
Step 2: Generate an Application Secret

Generate a cryptographically random secret:

bash
openssl rand -hex 32


Copy the generated value into:

env
APP_SECRET_KEY=your_generated_secret


Use the actual generated value rather than the example placeholder.

Set FRONTEND_ORIGINS to the exact public HTTPS origin without a URL path.

Set VITE_WS_NODE_URLS to the appropriate public secure WebSocket endpoint or endpoints using wss://.

Set ADMIN_USERNAMES to the intended initial administrator username.

Keep the production environment file and its backups outside source control.

Step 3: Build and Start the Production Services

Run:

bash
docker compose -f infrastructure/compose.production.yml --env-file infrastructure/.env.production up -d --build


This builds and starts the configured production services.

Step 4: Provision the Initial Administrator

Run the administrator provisioning command through the backend container:

bash
docker compose -f infrastructure/compose.production.yml --env-file infrastructure/.env.production run --rm --no-deps backend-1 python -m app.provision_admin


Enter the administrator password when prompted.

The username must match the configured initial administrator allowlist.

Step 5: Inspect Service Status

Check the running services:

bash
docker compose -f infrastructure/compose.production.yml --env-file infrastructure/.env.production ps


Inspect recent service logs:

bash
docker compose -f infrastructure/compose.production.yml --env-file infrastructure/.env.production logs --tail=100


Verify that the frontend, backend nodes and Redis are operating correctly.

Security Considerations

Vakochat includes several security-related implementation measures:

Passwords are stored as bcrypt hashes.
Protected operations require authenticated user identity.
Conversation membership is checked for protected chat operations.
Environment configuration validates important production settings.
Production deployment requires a configured application secret.
Production browser origins must use HTTPS.
Administrator accounts are provisioned separately from public registration.
Redis and backend ports are kept private in the production-oriented Compose configuration.
Backend containers run as a non-root user.
Authentication tokens are held in browser session storage.

Additional security measures should be considered before public deployment.

These include token revocation, account recovery, centralized rate limiting, stronger session management, dependency scanning, container image scanning and regular security testing.

Production Readiness and Limitations

The included deployment configuration provides a practical single-host demonstration environment. It should not be interpreted as a guarantee of production-scale reliability or high availability.

1. SQLite Database Limitations

Both backend containers share a SQLite database file on one Docker host.

SQLite is appropriate for the initial project deployment, but shared storage and database locking introduce limitations as concurrent activity increases.

Multi-host deployment or substantial traffic would require implementing and validating a client-server database such as PostgreSQL.

2. Redis Pub/Sub Delivery Limitations

Redis Pub/Sub provides at-most-once event delivery.

It does not provide durable event storage, replay for disconnected subscribers or guaranteed delivery during outages.

A transactional outbox or durable event-stream mechanism would be required for stronger delivery guarantees.

3. Rate Limiting

The current in-memory rate limiter operates independently in each backend process.

It does not provide globally consistent rate limiting across the distributed application.

Shared rate limiting through Redis would be a suitable improvement.

4. Data Retention

Messages, receipts and administrative activity can accumulate over time.

A retention and archival strategy should be introduced to manage database growth.

5. Backup and Recovery

Docker volumes provide persistent storage but are not backups.

Production deployment should include encrypted off-host backups and a tested restoration procedure for application data and Redis state.

6. Monitoring and Maintenance

A production environment should use centralized logs, operational metrics, alerting and documented recovery procedures.

Application images and dependencies should be scanned and reviewed before deployment.

7. Font Delivery

The Orbitron typeface is loaded through Google Fonts.

It therefore requires network access to Google Fonts. The application wordmark falls back to a system sans-serif font if the external font is unavailable.

Important: The Compose configurations provide deployment scaffolding. They do not independently establish production readiness. Load characteristics, recovery objectives, security requirements and operational procedures must be validated in the actual deployment environment.

Development Guidelines

When modifying Vakochat, follow these principles:

Keep frontend and backend responsibilities clearly separated.
Maintain a shared backend codebase for both server nodes.
Keep node-specific configuration in environment variables.
Preserve unique message identifiers and origin-node information.
Validate authenticated users and conversation membership before protected operations.
Update frontend types when changing API responses or WebSocket frames.
Update database operations and tests when modifying the schema.
Avoid hardcoding credentials, secrets or deployment-specific URLs.
Test cross-node communication after modifying Redis integration.
Update this README whenever installation, configuration or deployment procedures change.

Important modules should retain clear documentation for their responsibilities and communication boundaries.

When modifying a WebSocket frame, database schema or environment variable, update the related types, implementation, tests and documentation.

Technical Documentation

The following project documents provide additional information:

REPORT.md – Technical implementation report covering the application architecture, implementation challenges, solutions, performance evaluation and future improvements.
Infrastructure Configuration – Docker Compose deployment configurations and environment templates.
Frontend Source Code – React and TypeScript application.
Backend Source Code – FastAPI application and distributed messaging implementation.

For issues involving installation, configuration or deployment, inspect the relevant environment files and service logs before modifying the application.

Project Summary

Vakochat demonstrates how a distributed real-time messaging application can be implemented using modern frontend technologies, Python backend services, WebSockets, SQLite and Redis Pub/Sub.

Its two-node architecture allows independent backend processes to exchange messaging events, while the monitoring dashboard provides visibility into server health, Redis connectivity and application activity.

The project provides a practical foundation for understanding distributed communication, real-time messaging, persistence, connection management and basic fault tolerance.

Vakochat – 
