import type { ThemeEntry } from '../types';
import type { IndexedTheme } from './reorder-themes';
import { themeNameText } from './theme-picker';
import { MAX_THEME_NAME } from '../theme-validation';

/**
 * The reorder list, paged.
 *
 * Autocomplete fixed edit and delete because those only ever needed one theme
 * at a time. Reorder needs the whole list visible to be usable, so it cannot be
 * a menu. What it can be is text, and text has its own ceiling: a Discord
 * message caps at 2000 characters.
 *
 * The ceiling report estimated this list at about 950 characters for 25 themes,
 * but measured with 30 character names. At the 95 character cap each line is
 * roughly 100 characters, so the list crosses 2000 at about 20 themes, below
 * the select menu cap it was meant to be fixing. Measured: 20 is where it
 * crosses. So the list is paged by measured width rather than by a line count,
 * and every page is hard capped rather than estimated.
 */

/** Hard ceiling for any single page. Discord rejects a longer message. */
export const REORDER_TEXT_BUDGET = 2000;

/**
 * Room left for the lines themselves, after the header, the page counter and
 * the instruction footer. A page is built up to this and then hard sliced, so a
 * stored name longer than the current cap cannot push a page over.
 */
const LINE_BUDGET = 1700;

export type MoveRequest =
  { ok: true; from: number; to: number } | { ok: false; reason: string };

function lineFor(item: IndexedTheme, displayIndex: number): string {
  const name =
    themeNameText(item.theme).slice(0, MAX_THEME_NAME) || '(unnamed)';
  const current = displayIndex === 0 ? ' (current)' : '';
  return `${displayIndex + 1}. \`${name}\`${current}`;
}

/**
 * Splits the list into pages that each fit the budget.
 *
 * Measured rather than a fixed page size, so short names get more per page and
 * long ones get fewer, and the page count adapts instead of the text
 * overflowing. Always at least one line per page, so a single absurdly long
 * stored name still renders rather than looping forever.
 */
function paginate(items: IndexedTheme[]): IndexedTheme[][] {
  const pages: IndexedTheme[][] = [];
  let page: IndexedTheme[] = [];
  let used = 0;

  items.forEach((item, displayIndex) => {
    const cost = lineFor(item, displayIndex).length + 1;
    if (page.length > 0 && used + cost > LINE_BUDGET) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(item);
    used += cost;
  });

  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

/** Which page a one based display position appears on. */
export function pageContaining(
  items: IndexedTheme[],
  position: number,
): number {
  const pages = paginate(items);
  let seen = 0;
  for (let p = 0; p < pages.length; p++) {
    seen += pages[p].length;
    if (position <= seen) return p;
  }
  return 0;
}

export function buildReorderPages(items: IndexedTheme[]): string[] {
  const pages = paginate(items);
  let displayIndex = 0;

  return pages.map((page, pageNumber) => {
    const heading =
      pages.length === 1
        ? '**Theme order**'
        : `**Theme order** (page ${pageNumber + 1} of ${pages.length})`;

    const lines = page.map((item) => lineFor(item, displayIndex++));

    const text = `${heading}\n${lines.join('\n')}`;
    // A guarantee rather than an estimate, for the same reason
    // formatThemeProblems has one: a stored name can be longer than the cap
    // that applies to new writes.
    return text.length <= REORDER_TEXT_BUDGET
      ? text
      : `${text.slice(0, REORDER_TEXT_BUDGET - 1)}…`;
  });
}

/**
 * Turns what the admin typed into two display positions.
 *
 * Positions are one based because that is what the list shows. Typing a
 * position is what makes a move cost the same whether the theme travels one
 * place or ninety.
 */
export function parseMove(
  fromText: string,
  toText: string,
  total: number,
): MoveRequest {
  const from = parsePosition(fromText, total);
  if (typeof from === 'string') return { ok: false, reason: from };

  const to = parsePosition(toText, total);
  if (typeof to === 'string') return { ok: false, reason: to };

  if (from === to) {
    return {
      ok: false,
      reason: `Theme ${from} is already at position ${to}. Nothing to do.`,
    };
  }

  return { ok: true, from: from - 1, to: to - 1 };
}

function parsePosition(text: string, total: number): number | string {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return `"${trimmed}" is not a position. Use a number from 1 to ${total}.`;
  }

  const value = Number.parseInt(trimmed, 10);
  if (value < 1 || value > total) {
    return `There is no position ${value}. Use a number from 1 to ${total}.`;
  }

  return value;
}

/**
 * Moves a theme and returns the new file order.
 *
 * The list is displayed in rotation order starting at currentIndex, so a
 * display position is not a file position. The move happens in display order
 * and is then written back around the same starting point, which is the
 * mapping the previous implementation used on save and the one that keeps the
 * rotation from jumping.
 */
export function applyMove(
  themes: ThemeEntry[],
  currentIndex: number,
  fromDisplay: number,
  toDisplay: number,
): ThemeEntry[] {
  const total = themes.length;
  const view = Array.from(
    { length: total },
    (_, i) => themes[(currentIndex + i) % total],
  );

  const [moved] = view.splice(fromDisplay, 1);
  view.splice(toDisplay, 0, moved);

  const reordered = new Array<ThemeEntry>(total);
  for (let i = 0; i < total; i++) {
    reordered[(currentIndex + i) % total] = view[i];
  }
  return reordered;
}
