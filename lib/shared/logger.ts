import pino from "pino";

/**
 * Shared server-side logger. Debug+ in development, warn+ JSON in
 * production so docker-compose logs stay greppable without debug noise.
 */
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "warn" : "debug",
});
