# FaceTrack Pro

FaceTrack Pro is a local MERN attendance application with organization-scoped RBAC, office assignments, backend geofence decisions, single-use attendance challenges, attendance sessions, audit events, and real-time updates.

Docker is intentionally not included at this stage. Run MongoDB, the Express API, and the Vite client directly on your machine.

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

# Seed or refresh development users
npm.cmd run seed

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
- Camera and precise location require HTTPS outside `localhost`.
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

Geofence decisions are made server-side using `distance + reportedAccuracy <= radius`. Browser location is risk evidence, not cryptographic proof. Production facial verification remains fail-closed until a licensed ONNX embedding/PAD model, encrypted template key, liveness implementation, and calibrated threshold are configured.

See [architecture](docs/architecture.md), [API](docs/api.md), [security](docs/security.md), and [local deployment](docs/deployment.md).
