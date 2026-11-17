# Architecture

FaceTrack Pro is a two-package JavaScript monorepo. React/Vite is the role-specific client; Express owns every authorization and attendance decision; MongoDB stores bounded, organization-scoped records. Socket.IO joins authenticated users only to organization-and-role rooms.

The attendance state machine is `created → location_verified → face_verified → consumed`. Challenges expire, bind one employee and office, and are atomically consumed before attendance creation. A partial unique index prevents more than one working session per employee.

Face processing is behind a fail-closed adapter boundary. Production must supply a maintained ONNX embedding model, MediaPipe pose and quality checks, encrypted template storage, liveness policy, and a calibrated threshold before face verification is enabled.
