import { ThemeEntry, Themes } from './types';
import fs from 'fs/promises';
import path from 'path';

const THEMES_PATH = path.join(__dirname, '..', '..', 'themes.json');

let cachedThemes: ThemeEntry[] | null = null;

export async function addTheme(name: string, message: string): Promise<void> {
  const themes = await getThemes();
  const tempPath = `${THEMES_PATH}.tmp`;

  themes.push({ name, message });
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

function themeMatchesName(t: ThemeEntry, name: string): boolean {
  return (typeof t === 'string' ? t : t.name) === name;
}

export async function deleteTheme(name: string): Promise<void> {
  const themes = await getThemes();
  const index = themes.findIndex((t) => themeMatchesName(t, name));
  if (index === -1) throw new Error(`Theme "${name}" not found`);

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
  name: string,
  newName: string,
  newMessage: string,
): Promise<void> {
  const themes = await getThemes();
  const index = themes.findIndex((t) => themeMatchesName(t, name));
  if (index === -1) throw new Error(`Theme "${name}" not found`);

  const updated = themes.map((t, i) =>
    i === index ? { name: newName, message: newMessage } : t,
  );
  cachedThemes = updated;

  const tempPath = `${THEMES_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ themes: updated }));
  await fs.rename(tempPath, THEMES_PATH);
}
