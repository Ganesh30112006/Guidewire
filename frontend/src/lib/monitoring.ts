/**
 * Application monitoring — Sentry integration scaffold.
 *
 * Set VITE_SENTRY_DSN in your .env to enable Sentry.
 * Without the DSN this module is a no-op, so the app works perfectly
 * without Sentry configured (e.g. during local development).
 *
 * Setup:
 *   npm install @sentry/react
 *   Then uncomment the Sentry imports below and add VITE_SENTRY_DSN to .env
 */

// ---------------------------------------------------------------------------
// Uncomment after running: npm install @sentry/react
// ---------------------------------------------------------------------------
// import * as Sentry from "@sentry/react";
//
// const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
//
// if (DSN) {
//   Sentry.init({
//     dsn: DSN,
//     environment: import.meta.env.MODE,
//     integrations: [
//       Sentry.browserTracingIntegration(),
//       Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
//     ],
//     tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
//     replaysSessionSampleRate: 0.1,
//     replaysOnErrorSampleRate: 1.0,
//   });
// }
// ---------------------------------------------------------------------------

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const sentryEnabled = typeof DSN === "string" && DSN.length > 0;

export function captureException(error: unknown, extras?: Record<string, unknown>): void {
  if (sentryEnabled) {
    // Sentry.captureException(error, { extra: extras });
    console.error("[Sentry]", error, extras);
  } else {
    console.error("[monitoring]", error, extras);
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (sentryEnabled) {
    // Sentry.captureMessage(message, level);
    // Fall through to console so messages are never silently dropped.
  }
  if (import.meta.env.DEV || sentryEnabled) {
    console[level === "error" ? "error" : level === "warning" ? "warn" : "log"](
      `[monitoring] ${message}`,
    );
  }
}

export function setUserContext(id: string, email?: string): void {
  if (sentryEnabled) {
    // Sentry.setUser({ id, email });
  }
}

export function clearUserContext(): void {
  if (sentryEnabled) {
    // Sentry.setUser(null);
  }
}
