import type { AutocompleteInteraction } from 'discord.js';
import type { ThemeEntry } from '../types';
import { themeNameText, themeOptionLabel } from './theme-picker';
import { getThemes } from '../themes';

/**
 * Picking a theme by typing instead of by menu.
 *
 * A select menu offers at most 25 options, which is a hard ceiling on the list.
 * Autocomplete also caps at 25, but that 25 is a window rather than a limit:
 * the filtering happens here, before responding, so 26 themes and 200 themes
 * cost exactly the same and the theme count stops being a thing the pickers
 * have an opinion about.
 *
 * Discord will not let an autocomplete response be deferred and gives it the
 * usual 3 second window. That is not a concern here because getThemes serves
 * from an in-memory cache, so answering is a filter over an array.
 */

/** Discord caps an autocomplete response at 25 choices and does not check. */
export const MAX_AUTOCOMPLETE_CHOICES = 25;

/** Name of the registered command option. */
export const THEME_OPTION = 'theme';

/** Discord caps both a choice name and a choice value at 100 characters. */
const MAX_CHOICE_VALUE = 100;

export interface ThemeChoice {
  name: string;
  value: string;
}

export type ThemeSelection =
  { ok: true; index: number } | { ok: false; reason: string };

/**
 * A short fingerprint of the name a choice was built from.
 *
 * FNV-1a, with the name length mixed in so a collision has to match on both.
 * This is a staleness check, not a security boundary: it only has to notice
 * that the entry at a position is not the one the admin was looking at.
 */
function fingerprint(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${name.length.toString(36)}-${hash.toString(36)}`;
}

/**
 * The value carried by a choice.
 *
 * Deliberately not a bare index. A client can hold suggestions open, so the
 * list can change between the autocomplete response and the submit, and a bare
 * index would silently resolve to whatever moved into that slot. That is the
 * same class of bug as the September 1 incident, where an index resolved
 * against a different list and produced a plausible wrong answer instead of a
 * visible failure.
 *
 * Position plus fingerprint means a changed entry is refused rather than
 * edited.
 */
export function encodeThemeChoice(index: number, theme: ThemeEntry): string {
  return `${index}:${fingerprint(themeNameText(theme))}`.slice(
    0,
    MAX_CHOICE_VALUE,
  );
}

/**
 * Matching is case insensitive substring, over the name and the position.
 *
 * Substring rather than prefix because every theme on the live server starts
 * with the same two words, so prefix matching would narrow nothing. Not fuzzy,
 * because a fuzzy match that quietly reorders suggestions is the wrong thing to
 * put in front of someone about to delete a theme.
 *
 * The position matches too, so typing 27 reaches theme 27 directly. That is the
 * fastest route from the numbered reorder list to the theme you want.
 */
function matches(theme: ThemeEntry, index: number, query: string): boolean {
  if (query.length === 0) return true;
  if (String(index + 1).startsWith(query)) return true;
  return themeNameText(theme).toLowerCase().includes(query);
}

/**
 * An empty query returns the first 25 in file order, which is the same order
 * and the same numbering the reorder list shows. No match returns nothing, and
 * Discord shows its own "no options match" to the admin.
 */
export function buildThemeChoices(
  themes: readonly ThemeEntry[],
  query: string,
): ThemeChoice[] {
  const needle = query.trim().toLowerCase();
  const choices: ThemeChoice[] = [];

  for (let index = 0; index < themes.length; index++) {
    if (choices.length >= MAX_AUTOCOMPLETE_CHOICES) break;
    const theme = themes[index];
    if (!matches(theme, index, needle)) continue;
    choices.push({
      name: themeOptionLabel(theme, index),
      value: encodeThemeChoice(index, theme),
    });
  }

  return choices;
}

const RETRY = 'Run the command again to pick from the current list.';

/**
 * Turns a submitted option value back into a position, or refuses.
 *
 * Refusing is the point. Editing or deleting the wrong theme because the list
 * moved underneath a held-open suggestion is exactly the failure this is here
 * to prevent, so there is no fallback to the bare position.
 */
export function resolveThemeSelection(
  value: string,
  themes: readonly ThemeEntry[],
): ThemeSelection {
  const match = /^(\d+):(.+)$/.exec(value.trim());
  if (!match) {
    return {
      ok: false,
      reason:
        'That is not a theme from the list. Pick one of the suggestions ' +
        `rather than typing a name. ${RETRY}`,
    };
  }

  const index = Number.parseInt(match[1], 10);
  if (!Number.isInteger(index) || index < 0 || index >= themes.length) {
    return {
      ok: false,
      reason:
        `There is no theme at position ${index + 1} any more. The list has ` +
        `${themes.length}. ${RETRY}`,
    };
  }

  if (fingerprint(themeNameText(themes[index])) !== match[2]) {
    return {
      ok: false,
      reason:
        `Theme ${index + 1} is not the one that was suggested, so the list ` +
        `changed after you started typing. Nothing has been altered. ${RETRY}`,
    };
  }

  return { ok: true, index };
}

/** Commands that take a theme option, keyed the same way handlers are. */
const THEME_OPTION_COMMANDS = new Set([
  'theme-bot:edit-theme',
  'theme-bot:delete-theme',
]);

/**
 * Answers an autocomplete event.
 *
 * Swallows everything. An autocomplete response cannot be deferred and has no
 * way to show an error to the admin, so the only useful failure is no
 * suggestions. Letting it throw would reach the process level unhandled
 * rejection handler, which is a much worse outcome than an empty dropdown.
 */
export async function handleThemeAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);
  const key = [interaction.commandName, group, sub]
    .filter((part): part is string => Boolean(part))
    .join(':');

  if (!THEME_OPTION_COMMANDS.has(key)) return;

  try {
    const themes = await getThemes();
    await interaction.respond(
      buildThemeChoices(themes, interaction.options.getFocused()),
    );
  } catch (err) {
    console.error(
      `Could not answer theme autocomplete: ${(err as Error).message}`,
    );
  }
}
