# FaceTrack Pro

FaceTrack Pro is a local MERN attendance application with organization-scoped RBAC, office assignments, backend geofence decisions, single-use attendance challenges, attendance sessions, audit events, and real-time updates.

Docker is intentionally not included at this stage. Run MongoDB, the Express API, and the Vite client directly on your machine.

ActivityWatch monitoring setup, visible sync-agent commands and data handling are documented in [docs/activitywatch.md](docs/activitywatch.md).

## Prerequisites

- Node.js 20.19 or newer (Node 22 LTS is recommended)
- npm 10 or newer
- MongoDB Community Server 7+ running locally, or a MongoDB Atlas connection string
- A modern browser with camera and geolocation support

## First-time setup — Windows PowerShell

Run these commands from the repository root (`D:\desktop\Task3`):

```powershell
Set-Location 'D:\desktop\Task3'
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
notepad .env
npm.cmd install
```

Paste the generated random value into `JWT_SECRET` in `.env`.

If MongoDB was installed as a Windows service:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

If MongoDB is not installed as a service, create a local data directory once and start it in a separate terminal:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\mongodb-data' | Out-Null
mongod --dbpath 'D:\mongodb-data'
```

Return to the project terminal, seed development accounts, and start both applications:

```powershell
npm.cmd run seed
npm.cmd run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

Use the values configured in `.env`:

- HR: `SEED_HR_EMAIL` / `SEED_HR_PASSWORD`
- Employee: `SEED_EMPLOYEE_EMAIL` / `SEED_EMPLOYEE_PASSWORD`

PowerShell may block `npm.ps1` depending on your execution policy. Using `npm.cmd` as shown above avoids changing the machine-wide execution policy.

## First-time setup — Command Prompt

```bat
cd /d D:\desktop\Task3
copy .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
notepad .env
npm install
npm run seed
npm run dev
```

Start MongoDB separately with the Windows service or `mongod --dbpath D:\mongodb-data` before running the seed.

## First-time setup — macOS or Linux

```bash
cd /path/to/Task3
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
nano .env
npm install
npm run seed
npm run dev
```

Start the locally installed MongoDB service first, or put your MongoDB Atlas URI in `MONGODB_URI`.

## Daily development commands

```powershell
# Start API and client together
npm.cmd run dev

# Start only Express/MongoDB API
npm.cmd run dev:server

# Start only Vite/React client
npm.cmd run dev:client

# Create test users through the existing registration/invitation flow.
# This repository has no root seed script.

# Run backend tests
npm.cmd test

# Create the production client bundle
npm.cmd run build

# Run tests and the production build
npm.cmd run check

# Start the API without watch mode
npm.cmd start
```

On macOS/Linux, use `npm` instead of `npm.cmd`.

## Environment notes

- `MONGODB_URI` defaults to the local database shown in `.env.example`; update it for Atlas.
- `CLIENT_ORIGIN` must match the Vite origin exactly.
- `ALLOW_TEST_FACE_ADAPTER=true` enables only the clearly marked development adapter. It is rejected automatically in production.
- Set `ALLOW_TEST_FACE_ADAPTER=false` when testing the fail-closed production behavior.
- `ALLOW_DEMO_FACE_ADAPTER=true` explicitly enables deployed demo capture evidence. It validates guided poses and stores encrypted evidence, but it is not biometric identity recognition.
- `FACE_PROVIDER=aws-rekognition` enables real 1:1 comparison between the encrypted enrollment reference and a fresh check-in image. Configure AWS credentials, `BIOMETRIC_KEY`, similarity threshold, and evidence retention as described in the deployment guide.
- Invitation activation records biometric consent and sends the employee directly to required enrollment. New employees cannot access attendance or WFH routes until enrollment completes.
- Check-in evidence is AES-256-GCM encrypted, restricted to organization HR, audit-logged when viewed, and automatically deleted after `FACE_EVIDENCE_RETENTION_DAYS`.
- Camera and precise location require HTTPS outside `localhost`.
- Invitation email uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; the sender must belong to a domain verified in Resend for production delivery.
- Never commit `.env` or production credentials.

## Backend organization

```text
server/src/
├── config/       # environment and database lifecycle
├── controllers/  # HTTP request/response handling
├── middleware/   # auth, validation, CSRF, and errors
├── routes/       # endpoint registration only
├── services/     # attendance and organization business rules
├── sockets/      # authenticated Socket.IO setup
├── utils/        # shared errors, serializers, cookies, and time helpers
├── validators/   # Zod request contracts
├── app.js        # Express composition without side effects
├── models.js     # Mongoose schemas and indexes
└── server.js     # startup and graceful shutdown
```

## Security boundary

Geofence decisions and face-match authorization are made server-side. AWS Rekognition provides probabilistic 1:1 comparison; a fresh guided camera frame is quality checked but is not certified presentation-attack detection. Keep a human review path, calibrate the threshold for your workforce, obtain required consent, and complete applicable biometric/privacy/employment-law assessments before production use.

See [architecture](docs/architecture.md), [API](docs/api.md), [security](docs/security.md), and [local deployment](docs/deployment.md).

## Official ActivityWatch integration

Use Node 24 LTS for workspace checks and bridge development. The unified Windows package bundles the official ActivityWatch v0.14.3 distribution, Node v24.22.3 and a self-contained FaceTrack status application; employees install no runtime and use no terminal. Installation, privacy controls, build commands and release blockers are in the [ActivityWatch product guide](docs/activitywatch-product-integration.md). An unsigned internal-test installer is compiled and isolated-install tested; production signing, clean-VM acceptance and a live consenting employee pilot remain required.
