# Local deployment and future production work

Docker has been removed for the current development phase. Run MongoDB as a local service or use MongoDB Atlas, then run the API and Vite client through the root npm scripts documented in the README.

For a future production release:

1. Run the built React assets behind a TLS reverse proxy.
2. Run the Express API under a process supervisor with `NODE_ENV=production`.
3. Set `CLIENT_ORIGIN` to the exact HTTPS frontend origin and `TRUST_PROXY=true` only when a trusted reverse proxy is present.
4. Use a managed MongoDB deployment with authentication, network restrictions, backups, and monitoring.
5. Store secrets in a secret manager, not `.env` files checked into source control.
6. Keep `ALLOW_TEST_FACE_ADAPTER=false`.
7. Configure a licensed ONNX face model, encrypted template storage, tested liveness controls, and a calibrated similarity threshold before enabling biometric attendance.
8. Select a supported production map/tile provider and follow its attribution and usage policy.

Complete privacy, employment-law, biometric-processing, retention, accessibility, and human-review assessments before organizational deployment.
