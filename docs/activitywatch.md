# ActivityWatch integration

FaceTrack uses the official ActivityWatch product and the existing Node synchronization bridge. The previous TeamLogger integration is retired; no TeamLogger credentials are required.

See the current [installation, configuration, API, privacy and deployment guide](activitywatch-product-integration.md). It covers the pinned official Windows distribution, unified installer build source, compatibility ZIP, durable synchronization, dashboard controls, tests and release blockers. Separate guides cover the [employee installation flow](employee-monitoring-installation.md) and [HR administration](hr-monitoring-guide.md).

Browser domains are supported through the separately authorized official v0.6.0 work-profile extension. URL/title detail requires separate consent and policy. A separate screenshot adapter is implemented but remains disabled unless private storage, employee consent and HR policy are all present. See [screenshot component evaluation](screenshot-components.md).

This implementation has not been deployed or paired to a real employee account. Refer to [implementation progress](../IMPLEMENTATION_PROGRESS.md) for exact tested and unverified status.
