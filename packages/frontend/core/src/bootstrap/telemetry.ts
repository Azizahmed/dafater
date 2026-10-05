import { tracker } from '@affine/track';

// Dafater sends no telemetry and no crash reports anywhere: Sentry is never
// initialised and the event tracker stays opted out (events are dropped
// before they are queued). See also `TelemetryService` (no endpoint) and the
// `Telemetry` component.
tracker.init();
tracker.opt_out_tracking();
