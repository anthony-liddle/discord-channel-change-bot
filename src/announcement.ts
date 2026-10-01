import { MAX_MESSAGE_LENGTH } from './interaction-errors';

/**
 * What the bot posts in the theme channel when a theme becomes active.
 *
 * The theme's name goes on top as a heading because the channel is renamed
 * again a week later. Without it, anyone scrolling back finds a description
 * with nothing saying which theme it belonged to.
 *
 * The name is used exactly as stored, so the heading reads the same as
 * /theme-bot themes, the autocomplete suggestions and the reorder list. A
 * display transform here would make the heading and the pickers disagree,
 * which is the class of mismatch that hid the August duplicate. Markdown in a
 * name is left alone for the same reason it is left alone in the message:
 * admins type both and see the result.
 */

/** The largest of the three heading sizes Discord renders in a message. */
export const HEADING_MARKER = '# ';

export const HEADING_SEPARATOR = '\n';

/** Discord rejects message content over this many characters. */
export const MAX_ANNOUNCEMENT = MAX_MESSAGE_LENGTH;

/**
 * Pure and never throws. Nothing is trimmed to fit: the write path caps the
 * message so that this always fits with any legal name, and cutting community
 * writing at post time would be the silent failure the cap exists to prevent.
 *
 * A theme with no message posts its heading alone rather than nothing, so every
 * rotation that renames the channel leaves the theme's name in its history.
 * A rotation onto a channel already carrying the theme's name skips both the
 * rename and the post, as it always has; that path is in rotateTheme, not here.
 * The type check is for hand edits of themes.json, which can put anything in
 * the field.
 */
export function composeAnnouncement(
  name: string,
  message: string | null | undefined,
): string {
  const heading = `${HEADING_MARKER}${name}`;
  if (typeof message !== 'string' || message.trim() === '') return heading;
  return `${heading}${HEADING_SEPARATOR}${message}`;
}
