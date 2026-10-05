import { tracker } from '@affine/track';
import { useEffect } from 'react';

/**
 * Dafater sends no telemetry: keep the tracker opted out (no auto-track, no
 * Sentry). Kept as a component so the app entry points stay unchanged.
 */
export function Telemetry() {
  useEffect(() => {
    tracker.opt_out_tracking();
  }, []);

  return null;
}
