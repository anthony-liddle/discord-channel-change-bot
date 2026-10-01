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
 */
export function composeAnnouncement(name: string, message: string): string {
  return `${HEADING_MARKER}${name}${HEADING_SEPARATOR}${message}`;
}
