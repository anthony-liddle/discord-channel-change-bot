import { ThemeEntry, Themes } from './types';
import fs from 'fs/promises';
import { dataPath } from './paths';
import {
  duplicateKey,
  validateThemeMessage,
  validateThemeName,
} from './theme-validation';

export const THEMES_PATH = dataPath('themes.json');

let cachedThemes: ThemeEntry[] | null = null;

/**
 * Two themes are duplicates when they rename the channel to the same thing.
 * That was always the stated rule here, but the implementation compared trimmed
 * and lowercased, which is weaker: it missed repeated inner whitespace, tabs,
 * and, once accent folding landed, "Cafe Night" beside "Café Night". All three
 * produce one channel name from two entries.
 *
 * duplicateKey is now the single definition, shared with the reload audit, so
 * a name the modal accepts cannot become a problem reported at the next reload.
 */
function assertNameIsFree(
  themes: ThemeEntry[],
  name: string,
  ignoreIndex = -1,
): void {
  const candidate = duplicateKey(name);
  // An unusable name is not a duplicate of anything; validateThemeName has
  // already rejected it on every path that reaches here.
  if (candidate === null) return;

  const clash = themes.findIndex((theme, i) => {
    if (i === ignoreIndex) return false;
    const existing = duplicateKey(
      typeof theme === 'string' ? theme : theme?.name,
    );
    return existing !== null && existing === candidate;
  });

  if (clash !== -1) {
    throw new Error(
      `A theme named "${name.trim()}" already exists at position ${clash + 1}, ` +
        `because both rename the channel to "#${candidate}". ` +
        'Pick a different name, or edit that entry instead.',
    );
  }
}

export async function addTheme(name: string, message: string): Promise<void> {
  // Validation runs here rather than only in the modal handler, because a
  // hand edit of themes.json on the volume reaches this function and never
  // sees a modal.
  const cleanName = validateThemeName(name);
  const cleanMessage = validateThemeMessage(message);

  const themes = await getThemes();
  assertNameIsFree(themes, cleanName);

  const tempPath = `${THEMES_PATH}.tmp`;

  themes.push({ name: cleanName, message: cleanMessage });
  cachedThemes = themes;

  await fs.writeFile(tempPath, JSON.stringify({ themes: cachedThemes }));
  await fs.rename(tempPath, THEMES_PATH);
}

export async function loadThemes(): Promise<ThemeEntry[]> {
  try {
    let raw = JSON.parse(await fs.readFile(THEMES_PATH, 'utf8')) as Themes;

    if (!Array.isArray(raw.themes) || raw.themes.length === 0) {
      raw = { themes: [] };
    }

    cachedThemes = raw.themes;
    return raw.themes;
  } catch (err) {
    console.error(`Could not retrieve themes: ${err}`);
    return [];
  }
}

export async function getThemes(): Promise<ThemeEntry[]> {
  if (!cachedThemes) {
    return await loadThemes();
  }
  return cachedThemes;
}

export async function reloadThemes(): Promise<ThemeEntry[]> {
  cachedThemes = null;
  return await loadThemes();
}

export async function saveThemes(themes: ThemeEntry[]): Promise<void> {
  cachedThemes = themes;
  const tempPath = `${THEMES_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ themes }));
  await fs.rename(tempPath, THEMES_PATH);
}

/**
 * Both mutating operations address a theme by its position in the array, never
 * by name. Two themes are allowed to share a name in existing data, and
 * resolving by name silently picks the first match.
 */
function assertIndexInRange(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(
      `No theme at position ${index}. The list has ${length} themes.`,
    );
  }
}

export async function deleteTheme(index: number): Promise<void> {
  const themes = await getThemes();
  assertIndexInRange(index, themes.length);

  const updated = [...themes.slice(0, index), ...themes.slice(index + 1)];
  cachedThemes = updated;

  const tempPath = `${THEMES_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ themes: updated }));
  await fs.rename(tempPath, THEMES_PATH);
}

export async function reorderTheme(
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const themes = await getThemes();
  if (
    fromIndex < 0 ||
    fromIndex >= themes.length ||
    toIndex < 0 ||
    toIndex >= themes.length
  ) {
    throw new Error(
      `Index out of bounds (fromIndex=${fromIndex}, toIndex=${toIndex}, length=${themes.length})`,
    );
  }

  const updated = [...themes];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  cachedThemes = updated;

  const tempPath = `${THEMES_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ themes: updated }));
  await fs.rename(tempPath, THEMES_PATH);
}

export async function updateTheme(
  index: number,
  newName: string,
  newMessage: string,
): Promise<void> {
  const themes = await getThemes();
  assertIndexInRange(index, themes.length);

  const cleanName = validateThemeName(newName);
  const cleanMessage = validateThemeMessage(newMessage);

  // The entry being edited is exempt, so keeping its own name is allowed even
  // when a duplicate of it exists elsewhere in the list.
  assertNameIsFree(themes, cleanName, index);

  const updated = themes.map((t, i) =>
    i === index ? { name: cleanName, message: cleanMessage } : t,
  );
  cachedThemes = updated;

  const tempPath = `${THEMES_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ themes: updated }));
  await fs.rename(tempPath, THEMES_PATH);
}
