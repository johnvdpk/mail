import { logger } from "@/lib/shared/logger";

// Matches the recommended tick in runAutomailTick (lib/outreach/automail.ts):
// sends at most one lead per campaign per tick, so the daily quota naturally
// spreads across the configured time window instead of bursting.
const TICK_MS = 15 * 60 * 1000;

/**
 * Runs once when the Next.js server process boots (docker-compose has a
 * single, always-on `app` container, so this never double-schedules across
 * instances). Dynamic import keeps pg/nodemailer out of the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runAutomail } = await import("@/lib/outreach/automail");
  setInterval(() => {
    runAutomail().catch((err) => {
      logger.error({ route: "instrumentation/automail", err }, "Automail-tick mislukt");
    });
  }, TICK_MS);
}
