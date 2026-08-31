import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { ThemeEntry } from '../types';

/**
 * Discord allows at most 25 options in a string select menu, and each label and
 * value must be a string of 1 to 100 characters. discord.js validates all of
 * this synchronously in the builder, so a bad theme name throws before the
 * interaction is ever acknowledged.
 */
export const MAX_SELECT_OPTIONS = 25;
export const MAX_OPTION_LABEL = 100;
export const MAX_TEXT_INPUT = 4000;
export const UNNAMED_LABEL = '(unnamed)';

export interface ThemeOption {
  label: string;
  value: string;
}

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
export function buildThemeOptions(themes: ThemeEntry[]): ThemeOption[] {
  return themes.slice(0, MAX_SELECT_OPTIONS).map((theme, index) => ({
    label: themeOptionLabel(theme, index),
    value: String(index),
  }));
}

export function buildThemeSelectRow(
  customId: string,
  placeholder: string,
  themes: ThemeEntry[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(
      buildThemeOptions(themes).map((option) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setValue(option.value),
      ),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

/**
 * Turns a select menu value back into an array position. Returns -1 when the
 * value does not name a real entry, so callers can report it instead of
 * silently editing the wrong theme.
 */
export function resolveThemeIndex(value: string, themes: ThemeEntry[]): number {
  if (!/^-?\d+$/.test(value.trim())) return -1;
  const index = Number.parseInt(value, 10);
  if (!Number.isInteger(index)) return -1;
  if (index < 0 || index >= themes.length) return -1;
  return index;
}

/**
 * buildThemeOptions truncates past 25 because Discord will not accept more.
 * Truncating silently would hide themes from the picker, so handlers check this
 * first and say so. reorder-themes has done this since it was written.
 */
export function isOverSelectLimit(themes: ThemeEntry[]): boolean {
  return themes.length > MAX_SELECT_OPTIONS;
}

export const OVER_LIMIT_MESSAGE =
  "You have more themes than Discord's menu can handle (max 25), so this " +
  'command cannot show them all. Use /theme-bot reorder-themes to see the ' +
  'full list, and trim it below 26 before editing or deleting.';
