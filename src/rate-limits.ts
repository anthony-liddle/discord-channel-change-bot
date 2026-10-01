import type { RateLimitData } from 'discord.js';

/**
 * Seeing Discord rate limits.
 *
 * A rate-limited request does not fail. @discordjs/rest waits until Discord's
 * window clears and retries, which is right for the scheduled rotation: a
 * rename that failed would leave the position where it was and try again only
 * the following week. But the wait is silent. A third rename of one channel
 * inside ten minutes holds for up to ten minutes with nothing in the logs and
 * "thinking..." in Discord, which looks exactly like a hang.
 *
 * The library only emits its rateLimited event when it limits a request
 * pre-emptively. For the 429 Discord actually sends a held rename (checked on
 * 2026-10-01: retry-after 600, scope shared, bucket not exhausted), the one
 * callback that runs is the rejectOnRateLimit option, so this is passed as that
 * option and used as an observer.
 */

type RateLimitListener = (data: RateLimitData) => unknown;

const listeners = new Set<RateLimitListener>();

/** Returns the unsubscribe function. */
export function onRateLimited(listener: RateLimitListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Always false, which tells the library to wait rather than throw. Nothing in
 * here may throw either: an error escaping this function rejects the request,
 * which turns a ten minute wait into a failed rotation.
 */
export function observeRateLimit(data: RateLimitData): false {
  try {
    console.warn(describeRateLimit(data));
  } catch {
    // Logging is best effort; the wait must happen regardless.
  }

  for (const listener of [...listeners]) {
    try {
      const result = listener(data);
      if (result instanceof Promise) {
        result.catch((err) =>
          console.error(
            `Rate limit listener failed: ${(err as Error).message}`,
          ),
        );
      }
    } catch (err) {
      console.error(`Rate limit listener failed: ${(err as Error).message}`);
    }
  }

  return false;
}

/**
 * Never includes the url, and includes the major parameter only for channel and
 * guild routes. Interaction replies go out through
 * /webhooks/<app id>/<interaction token>, and for those both fields carry the
 * token.
 */
function describeRateLimit(data: RateLimitData): string {
  const id = /^\/(channels|guilds)\//.test(data.route)
    ? `${data.majorParameter}, `
    : '';
  const scope = data.global ? 'global' : `${data.scope} scope`;
  const seconds = Math.round(data.retryAfter / 1000);
  return (
    `Rate limited by Discord on ${data.method.toUpperCase()} ${data.route} ` +
    `(${id}${scope}). Waiting ${seconds}s, then retrying.`
  );
}
