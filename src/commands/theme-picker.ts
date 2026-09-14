import type { ThemeEntry } from '../types';

/**
 * Reading a theme out of storage without trusting its shape.
 *
 * This used to build the select menu as well. Since edit-theme and delete-theme
 * moved to an autocompleted option and reorder-themes moved to paged text,
 * nothing builds a select menu from themes any more, and the 25 option ceiling
 * that shaped all three commands is gone with it.
 *
 * What remains is the part that still matters everywhere: a stored name can be
 * a number, null, missing, or longer than any display allows, and discord.js
 * validates synchronously in the builder, so an uncoerced value throws before
 * the interaction is ever acknowledged.
 */
export const MAX_OPTION_LABEL = 100;
export const MAX_TEXT_INPUT = 4000;
export const UNNAMED_LABEL = '(unnamed)';

/**
 * Reads a theme name without trusting its shape. getThemeName in rotation.ts
 * assumes every non-string entry is a well formed object, which throws on a
 * null entry.
 */
function readThemeName(theme: unknown): unknown {
  if (theme === null || theme === undefined) return undefined;
  if (typeof theme === 'object') return (theme as { name?: unknown }).name;
  return theme;
}

/**
 * Coerces any theme name into something Discord will accept as a label.
 * Numbered so that two themes sharing a name stay distinguishable to the admin
 * picking between them.
 */
function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, MAX_TEXT_INPUT);
}

/**
 * Theme name as a string a modal text input will accept. setValue rejects a
 * non-string exactly like setLabel does, so the coercion has to happen on both
 * paths or edit-theme trades a broken picker for a broken modal.
 */
export function themeNameText(theme: ThemeEntry): string {
  return asText(readThemeName(theme));
}

export function themeMessageText(theme: ThemeEntry): string {
  if (theme === null || theme === undefined) return '';
  if (typeof theme !== 'object') return '';
  return asText((theme as { message?: unknown }).message);
}

export function themeOptionLabel(theme: ThemeEntry, index: number): string {
  const display = themeNameText(theme).trim() || UNNAMED_LABEL;
  return `${index + 1}. ${display}`.slice(0, MAX_OPTION_LABEL);
}

/**
 * Builds option data for a theme picker. The value is the array index, which is
 * always a valid, unique, short string no matter what the theme is named.
 */
