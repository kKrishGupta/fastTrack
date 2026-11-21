# Local deployment and future production work

Docker has been removed for the current development phase. Run MongoDB as a local service or use MongoDB Atlas, then run the API and Vite client through the root npm scripts documented in the README.

For a future production release:

1. Run the built React assets behind a TLS reverse proxy.
2. Run the Express API under a process supervisor with `NODE_ENV=production`.
3. Set `CLIENT_ORIGIN` to the exact HTTPS frontend origin and `TRUST_PROXY=true` only when a trusted reverse proxy is present.
4. Use a managed MongoDB deployment with authentication, network restrictions, backups, and monitoring.
5. Store secrets in a secret manager, not `.env` files checked into source control.
6. Keep `ALLOW_TEST_FACE_ADAPTER=false`.
7. Configure AWS Rekognition, encrypted evidence storage, a calibrated similarity threshold, and appropriate liveness/PAD controls before high-assurance biometric attendance.
8. Select a supported production map/tile provider and follow its attribution and usage policy.

Complete privacy, employment-law, biometric-processing, retention, accessibility, and human-review assessments before organizational deployment.

## Render

Deploy the API as a Render **Web Service** with these settings:

- Root Directory: `server`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Configure these environment variables in the Render dashboard rather than uploading a local `.env` file:

- `NODE_ENV=production`
- `CLIENT_ORIGIN=https://your-frontend.example`
- `ALLOWED_ORIGINS=https://your-frontend.example`
- `MONGODB_URI` with a dedicated database name
- a newly generated `JWT_SECRET` containing at least 32 characters
- `TRUST_PROXY=true`
- `ALLOW_TEST_FACE_ADAPTER=false`
- `ALLOW_DEMO_FACE_ADAPTER=false` for real deployments. Set it to `true` only for an explicitly labelled demonstration without identity recognition.
- `FACE_PROVIDER=aws-rekognition`
- `AWS_REGION=ap-south-1` (or the Rekognition region selected for your organization)
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for a dedicated least-privilege IAM identity
- `BIOMETRIC_KEY`, generated with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`
- `FACE_SIMILARITY_THRESHOLD=90`
- `FACE_EVIDENCE_RETENTION_DAYS=30`
- `RESEND_API_KEY` from the Resend API Keys page when invitation email is enabled
- `RESEND_FROM_EMAIL=attendance@your-domain.example`, using a sender on a domain verified in Resend

Render supplies `PORT`; do not hardcode a production port. Every production origin must use HTTPS and must be listed exactly, without a path. If more than one frontend origin is needed, separate them with commas in `ALLOWED_ORIGINS`.

Invitation email uses Resend's HTTPS API rather than SMTP. Remove the retired `GMAIL_USER` and `GMAIL_APP_PASSWORD` variables from Render. Resend's testing sender is suitable only for initial account testing; verify a domain and use an address on that domain before sending invitations to employees.

ActivityWatch replaces TeamLogger monitoring. Account activation does not provision a monitoring account or enroll a device. Employees pair their computer from **Activity monitoring** after giving consent; HR can open employee reports from **Employees > Manage > ActivityWatch monitoring**. Deploy both the updated frontend and API, then follow [ActivityWatch setup](activitywatch.md). No provider API key is required. Retired `TEAMLOGGER_*` settings are ignored and can be removed from hosting configuration. Existing legacy database fields are no longer returned by the API; no historical database records are rewritten by this change.

The AWS IAM identity needs only these Rekognition actions for this implementation:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["rekognition:DetectFaces", "rekognition:CompareFaces"],
    "Resource": "*"
  }]
}
```

After enabling AWS mode, existing demo enrollments must be completed once again so the server can create an encrypted reference image. Keep `ALLOW_TEST_FACE_ADAPTER=false` and `ALLOW_DEMO_FACE_ADAPTER=false` in the real production configuration. MongoDB TTL cleanup removes check-in evidence after the configured retention period; TTL cleanup is asynchronous and may occur shortly after the expiry timestamp.

Deploy the Vite client separately as a Render **Static Site**:

- Root Directory: `client`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- `VITE_API_BASE_URL=https://your-api.example/api`

After changing either public URL, update both services' environment variables and redeploy them.

## Vercel frontend with Render API

The repository includes equivalent `vercel.json` files at the repository root and in `client/`. Vercel uses the file that belongs to the configured project root. They proxy browser requests from `/api/*` to the Render API and provide the SPA fallback for React Router. Keep `VITE_API_BASE_URL=/api` (or leave it unset) so authentication cookies remain first-party on the Vercel origin.

Configure the Vercel project with:

- Root Directory: `client`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

On the Render API service, set both `CLIENT_ORIGIN` and `ALLOWED_ORIGINS` to the exact Vercel production URL, including `https://` and excluding paths, quotes, and assignment syntax. For example, the value field should contain `https://your-project.vercel.app`, not `CLIENT_ORIGIN=https://your-project.vercel.app`.
