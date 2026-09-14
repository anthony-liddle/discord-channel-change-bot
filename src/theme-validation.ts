import { canBecomeChannelName, normalizeChannelName } from './channel-name';

/**
 * Validation for everything that can be written into themes.json.
 *
 * Before this existed the write path checked for duplicate names and nothing
 * else, which is the root cause of most of what the 2026-09-14 ceiling report
 * found. The modals are deliberately not the only place these run: themes.json
 * gets hand edited on the Fly volume, and that bypasses every modal.
 */

/**
 * The widest position prefix a display can put in front of a name. Both a
 * select option label and an autocomplete choice name are built as
 * `${position}. ${name}`.
 *
 * ASSUMPTION: at most 999 themes. That is the one place a theme count is still
 * baked in, and it is here rather than anywhere else on purpose.
 *
 * At 1000 themes the prefix becomes "1000. " and a maximum length name plus
 * prefix is 101 characters, one over the cap that both a select option label
 * and an autocomplete choice name enforce. Nothing would throw: themeOptionLabel
 * slices to 100, so the last character of the name would be dropped from the
 * display, and two themes whose names differ only in that last character would
 * become indistinguishable in the pickers.
 *
 * If a list ever approaches 1000, widen this to '9999. ' and lower
 * MAX_THEME_NAME to match. Names already stored stay valid either way, because
 * lowering the cap only affects new writes.
 */
export const MAX_ASSUMED_THEMES = 999;
export const POSITION_PREFIX_WIDTH = `${MAX_ASSUMED_THEMES}. `.length;

/**
 * A select option label and an autocomplete choice name both cap at 100
 * characters, and both carry the position prefix so that two themes sharing a
 * name stay apart. That prefix is what made the August duplicate repairable, so
 * the cap is set here at the write rather than truncating at the display: a
 * name that fits is always shown whole, at any position up to 999.
 *
 * Normalization never lengthens a string, so this also keeps every channel name
 * inside Discord's own 1 to 100 limit. The longest live theme name is 30
 * characters.
 */
export const MAX_THEME_NAME = 100 - POSITION_PREFIX_WIDTH;

/**
 * Discord rejects message content over 2000 characters. rotateTheme catches and
 * logs a failed announcement and carries on, so an oversized message renames
 * the channel and then silently posts nothing.
 */
export const MAX_THEME_MESSAGE = 2000;

export function validateThemeName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new Error(
      `Theme name must be text, but it is ${describeType(name)}.`,
    );
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new Error('Theme name cannot be empty.');
  }

  if (trimmed.length > MAX_THEME_NAME) {
    throw new Error(
      `Theme name is ${trimmed.length} characters. It can be at most ` +
        `${MAX_THEME_NAME} characters, which leaves room for the position ` +
        'number the menus put in front of it.',
    );
  }

  // The rotation wedge, stopped at the write. A name that cannot normalize
  // throws every time rotateTheme reaches it, and because the index only
  // advances after a successful rename, it would retry the same entry every
  // week forever.
  if (!canBecomeChannelName(trimmed)) {
    throw new Error(
      `"${trimmed}" cannot become a channel name. Channel names use only ` +
        'letters, numbers, hyphens and underscores, and this name has none of ' +
        'those left once the rest is removed. Add at least one letter or number.',
    );
  }

  return trimmed;
}

export function validateThemeMessage(message: unknown): string {
  if (typeof message !== 'string') {
    throw new Error(
      `Theme message must be text, but it is ${describeType(message)}.`,
    );
  }

  if (message.length > MAX_THEME_MESSAGE) {
    throw new Error(
      `Theme message is ${message.length} characters. Discord will not post ` +
        `more than ${MAX_THEME_MESSAGE} characters, so the announcement would ` +
        'silently never appear.',
    );
  }

  return message;
}

/**
 * What the channel will actually be called. Safe to call on a name that has
 * already been through validateThemeName, which guarantees it normalizes.
 */
export function channelNameFor(name: string): string {
  return normalizeChannelName(name);
}

/**
 * The one rule for deciding whether two themes are the same theme.
 *
 * Two entries are duplicates when they rename the channel to the same thing,
 * which is what themes.ts always claimed the rule was without implementing it.
 * Comparing trimmed and lowercased missed three real collisions: repeated inner
 * whitespace, tabs, and, since accent folding landed, "Cafe Night" beside
 * "Café Night".
 *
 * Returns null for a name that cannot produce a channel name at all. Such an
 * entry has its own problem reported, and must not collide with every other
 * broken entry and hide a genuine duplicate behind a pile of false ones.
 */
export function duplicateKey(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  try {
    return normalizeChannelName(trimmed);
  } catch {
    return null;
  }
}

export interface ThemeProblem {
  /** 1 based, so it matches how the pickers and the file read to a human. */
  position: number;
  name: string;
  problem: string;
  /**
   * What sort of problem, so callers and tests can branch on it without
   * matching on prose that is meant to be rewritten for clarity.
   */
  kind: 'duplicate' | 'invalid';
}

/**
 * Checks a whole loaded list without throwing, so reload-config can report
 * everything wrong with themes.json at once.
 *
 * This is the only validation that sees a hand edit. addTheme and updateTheme
 * guard the modal paths, but themes.json is edited directly on the volume and
 * that reaches neither of them. Catching a bad entry here means catching it
 * when it is pasted in rather than on the Monday the rotation reaches it.
 */
export function auditThemes(themes: readonly unknown[]): ThemeProblem[] {
  const problems: ThemeProblem[] = [];
  const seenAt = new Map<string, number>();

  themes.forEach((entry, i) => {
    const position = i + 1;
    const rawName = readName(entry);
    const name = displayName(rawName);

    try {
      const clean = validateThemeName(rawName);
      const key = duplicateKey(clean);
      const firstAt = key === null ? undefined : seenAt.get(key);
      if (key === null) {
        // Unreachable while validateThemeName guarantees normalization, and
        // harmless if that ever changes: the entry simply is not compared.
      } else if (firstAt === undefined) {
        seenAt.set(key, position);
      } else {
        problems.push({
          position,
          name,
          kind: 'duplicate',
          problem:
            `Renames the channel to the same thing as theme ${firstAt} ` +
            `(\`#${key}\`). The rotation would use it twice and the pickers ` +
            'cannot tell the two apart.',
        });
      }
    } catch (err) {
      problems.push({
        position,
        name,
        kind: 'invalid',
        problem: (err as Error).message,
      });
    }

    const rawMessage = readMessage(entry);
    if (rawMessage !== undefined) {
      try {
        validateThemeMessage(rawMessage);
      } catch (err) {
        problems.push({
          position,
          name,
          kind: 'invalid',
          problem: (err as Error).message,
        });
      }
    }
  });

  return problems;
}

/**
 * How many problems fit in a reply that also carries the reload summary and
 * the file attachments. Five is enough to act on, and the whole file is
 * attached to the same reply anyway.
 */
const MAX_REPORTED_PROBLEMS = 5;

/** Budget for the problem list inside the 2000 character message cap. */
const PROBLEM_REPORT_BUDGET = 1200;

export function formatThemeProblems(problems: readonly ThemeProblem[]): string {
  if (problems.length === 0) return '';

  const shown = problems.slice(0, MAX_REPORTED_PROBLEMS);
  const lines = shown.map(
    (p) => `- **${p.position}. ${trimForReply(p.name)}**: ${p.problem}`,
  );

  const remaining = problems.length - shown.length;
  if (remaining > 0) {
    lines.push(`- ...and ${remaining} more. The attached file has them all.`);
  }

  const report =
    `Found ${problems.length} problem${problems.length === 1 ? '' : 's'} ` +
    'in the theme list:\n' +
    lines.join('\n');

  // A guarantee rather than an estimate. Problem text comes from validation
  // messages that can grow, and this reply cannot be the thing that breaks the
  // reply.
  return report.length <= PROBLEM_REPORT_BUDGET
    ? report
    : `${report.slice(0, PROBLEM_REPORT_BUDGET - 1)}…`;
}

function readName(entry: unknown): unknown {
  if (entry === null || entry === undefined) return undefined;
  if (typeof entry === 'object') return (entry as { name?: unknown }).name;
  return entry;
}

function readMessage(entry: unknown): unknown {
  if (entry === null || entry === undefined) return undefined;
  if (typeof entry !== 'object') return undefined;
  return (entry as { message?: unknown }).message;
}

function displayName(rawName: unknown): string {
  if (rawName === null || rawName === undefined) return '(no name)';
  const text = String(rawName).trim();
  return text.length === 0 ? '(no name)' : text;
}

function trimForReply(text: string): string {
  return text.length <= 40 ? text : `${text.slice(0, 39)}…`;
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return `a ${typeof value}`;
}
