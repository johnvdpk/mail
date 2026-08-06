const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; resetAt: number };

const attempts = new Map<string, Bucket>();

function prune(now: number): void {
  for (const [key, bucket] of attempts) {
    if (bucket.resetAt <= now) attempts.delete(key);
  }
}

/** True when the given key (e.g. IP) has exceeded the login attempt limit. */
export function isLoginRateLimited(key: string): boolean {
  const bucket = attempts.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= Date.now()) return false;
  return bucket.count >= MAX_ATTEMPTS;
}

/** Record a failed login attempt for the given key. */
export function registerFailedLogin(key: string): void {
  const now = Date.now();
  prune(now);

  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

/** Clear attempts for the given key after a successful login. */
export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
