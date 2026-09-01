/**
 * Deploy marker.
 *
 * Bump this in any PR whose deployment you need to confirm.
 *
 * It is shown in the footer of /theme-bot themes, which is the only way to see
 * what is actually running. The bot is hosted by a third party, there is no log
 * access, and the deploy pipeline does not live in this repo, so a value you
 * can read off a phone in Discord is the whole feedback channel.
 *
 * Format is `YYYY-MM-DD.N`. N starts at 1 and increments for a second bump on
 * the same day. Dates sort lexicographically, so the newest marker is always
 * the largest string.
 *
 * Hand maintained on purpose. No build step, no codegen, no git SHA injection,
 * because the deploy might not ship `.git` or run anything beyond a build.
 */
export const DEPLOY_MARKER = '2026-09-01.1';
