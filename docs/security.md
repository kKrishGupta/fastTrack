# Security and privacy

- Passwords use Argon2id. Authentication uses short-lived HttpOnly, SameSite cookies; production cookies require HTTPS.
- Express enforces role and organization scope. Browser route hiding is not authorization.
- State-changing browser requests reject foreign origins. Add a per-session CSRF token if cross-site flows are introduced.
- Browser GPS is risk evidence, not cryptographic proof. The server checks assignment, freshness, accuracy and distance.
- The production face adapter fails closed. No raw face data belongs in logs or ordinary API responses.

Residual risks include GPS spoofing, presentation attacks, compromised devices, model bias and false matches or rejections. Use device risk signals, tested liveness, calibrated thresholds, monitoring and human fallback. AI decisions must not silently create payroll or disciplinary penalties.
