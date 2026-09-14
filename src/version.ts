/**
 * Deploy marker.
 *
 * Shown in the footer of /theme-bot themes, which is the only way to see which
 * commit is actually running.
 *
 * Derived from the git SHA at build time, not hand maintained. It was a
 * constant that someone had to remember to bump, and it misled us three times:
 * a working deploy read as dead, a dead one read as fine, and on 2026-09-14 a
 * stale value nearly cost a manual deploy, a held registration and a delayed
 * batch. A marker only a human keeps current is a marker that reports the last
 * time someone remembered, not the last time the bot shipped.
 *
 * The SHA arrives as an environment variable baked into the image, because
 * .dockerignore excludes .git and the container therefore cannot read the SHA
 * for itself. Dockerfile takes it as a build arg, the Fly workflow passes
 * github.sha, and `pnpm deploy` passes `git rev-parse HEAD` so a manual deploy
 * needs nothing remembered either.
 *
 * The commit date rides along the same way, because the SHA says exactly what
 * is running while the date says how fresh at a glance. It is baked in rather
 * than computed at runtime: `new Date()` inside the container would show today
 * for an image built weeks ago, which is the marker lying again in a new way.
 *
 * When any of that fails it reports `unknown`, never a stale or plausible
 * value. That is the whole lesson: a marker that can lie is worse than no
 * marker, because a wrong answer gets acted on and a missing one gets
 * investigated.
 */

/** What the footer shows when the SHA did not make it into the image. */
export const UNKNOWN_MARKER = 'unknown';

/** Enough of a SHA to identify a commit, and short enough to read on a phone. */
const SHORT_SHA_LENGTH = 7;

/**
 * A git SHA and nothing else. Anything that is not hex of a plausible length
 * is rejected rather than displayed, which is what stops a leftover date, a
 * branch name or the Dockerfile's own default from being mistaken for a build.
 */
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Reads the marker without ever throwing.
 *
 * This runs at module load, so a throw here would stop the bot booting. A
 * diagnostic must never be the reason there is nothing left to diagnose.
 */
export function readDeployMarker(
  raw: unknown = process.env.DEPLOY_SHA,
): string {
  try {
    if (typeof raw !== 'string') return UNKNOWN_MARKER;

    const trimmed = raw.trim();
    if (!SHA_PATTERN.test(trimmed)) return UNKNOWN_MARKER;

    return trimmed.slice(0, SHORT_SHA_LENGTH).toLowerCase();
  } catch {
    return UNKNOWN_MARKER;
  }
}

/** `YYYY-MM-DD`, the shape `git show -s --format=%cs` produces. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rejects a date that matches the shape but is not a real day, so 2026-02-30
 * reads as unknown rather than as a plausible build date.
 */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Reads the commit date without ever throwing, for the same reason. */
export function readDeployDate(raw: unknown = process.env.DEPLOY_DATE): string {
  try {
    if (typeof raw !== 'string') return UNKNOWN_MARKER;

    const trimmed = raw.trim();
    if (!DATE_PATTERN.test(trimmed)) return UNKNOWN_MARKER;
    if (!isRealCalendarDate(trimmed)) return UNKNOWN_MARKER;

    return trimmed;
  } catch {
    return UNKNOWN_MARKER;
  }
}

/**
 * What the footer prints.
 *
 * The SHA is the identity and the date is the gloss, so a date without a SHA
 * still reads as unknown. A bare date there is exactly the shape that misled
 * three times: it looks like a complete answer while identifying nothing.
 */
export function buildDeployLabel(marker: string, date: string): string {
  if (marker === UNKNOWN_MARKER) return UNKNOWN_MARKER;
  return date === UNKNOWN_MARKER ? marker : `${date} ${marker}`;
}

export const DEPLOY_MARKER = readDeployMarker();
export const DEPLOY_DATE = readDeployDate();

/** Use this in anything user facing. The other two are its inputs. */
export const DEPLOY_LABEL = buildDeployLabel(DEPLOY_MARKER, DEPLOY_DATE);
