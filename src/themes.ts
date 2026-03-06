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
