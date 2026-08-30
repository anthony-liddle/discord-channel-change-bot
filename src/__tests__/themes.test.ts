import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
}));

import fsp from 'fs/promises';
import {
  deleteTheme,
  updateTheme,
  reorderTheme,
  reloadThemes,
} from '../themes';

const baseThemes = [
  { name: 'Monochrome', message: 'Black and white only!' },
  { name: 'Macro', message: 'Get close!' },
  { name: 'Street', message: 'Urban life.' },
];

// The live failure shape: two entries sharing a name. Resolving by name picks
// the first one, which is why both operations take an index instead.
const duplicateThemes = [
  { name: 'Monochrome', message: 'first' },
  { name: 'Weekly Theme Thicc', message: 'second' },
  { name: 'Weekly Theme Thicc', message: 'third' },
];

function setupThemes(themes = baseThemes) {
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ themes }) as unknown as Buffer,
  );
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.rename).mockResolvedValue(undefined);
}

beforeEach(async () => {
  await reloadThemes();
  setupThemes();
});

// ─── deleteTheme ──────────────────────────────────────────────────────────────

describe('deleteTheme', () => {
  it('removes the theme at the given index', async () => {
    await deleteTheme(1);

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(2);
    expect(written.themes.map((t: { name: string }) => t.name)).not.toContain(
      'Macro',
    );
  });

  it('writes to a .tmp path then renames', async () => {
    await deleteTheme(1);

    const tmpPath = vi.mocked(fsp.writeFile).mock.calls[0][0] as string;
    const [from, to] = vi.mocked(fsp.rename).mock.calls[0] as [string, string];
    expect(tmpPath).toContain('.tmp');
    expect(from).toBe(tmpPath);
    expect(to).not.toContain('.tmp');
  });

  it('deletes the second of two entries sharing a name, not the first', async () => {
    setupThemes(duplicateThemes);
    await reloadThemes();

    await deleteTheme(2);

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(2);
    expect(written.themes[1].message).toBe('second');
  });

  it('throws when the index is past the end of the list', async () => {
    await expect(deleteTheme(9)).rejects.toThrow('No theme at position 9');
  });

  it('throws when the index is negative', async () => {
    await expect(deleteTheme(-1)).rejects.toThrow('No theme at position -1');
  });
});

// ─── updateTheme ──────────────────────────────────────────────────────────────

describe('updateTheme', () => {
  it('updates the name and message of the theme at the given index', async () => {
    await updateTheme(1, 'Macro Photography', 'Get really close!');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    const updated = written.themes.find(
      (t: { name: string }) => t.name === 'Macro Photography',
    );
    expect(updated).toBeDefined();
    expect(updated.message).toBe('Get really close!');
  });

  it('does not change other themes', async () => {
    await updateTheme(1, 'Macro Photography', 'Get really close!');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(3);
    expect(written.themes[0].name).toBe('Monochrome');
    expect(written.themes[2].name).toBe('Street');
  });

  it('writes to a .tmp path then renames', async () => {
    await updateTheme(1, 'Macro Photography', 'Updated!');

    const tmpPath = vi.mocked(fsp.writeFile).mock.calls[0][0] as string;
    const [from, to] = vi.mocked(fsp.rename).mock.calls[0] as [string, string];
    expect(tmpPath).toContain('.tmp');
    expect(from).toBe(tmpPath);
    expect(to).not.toContain('.tmp');
  });

  it('edits the second of two entries sharing a name, not the first', async () => {
    setupThemes(duplicateThemes);
    await reloadThemes();

    await updateTheme(2, 'Weekly Theme Thicc Two', 'renamed');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes[1]).toEqual({
      name: 'Weekly Theme Thicc',
      message: 'second',
    });
    expect(written.themes[2]).toEqual({
      name: 'Weekly Theme Thicc Two',
      message: 'renamed',
    });
  });

  it('can rename an entry whose current name is a duplicate', async () => {
    setupThemes(duplicateThemes);
    await reloadThemes();

    await expect(
      updateTheme(1, 'Weekly Theme Thicc One', 'kept'),
    ).resolves.toBeUndefined();
  });

  it('throws when the index is past the end of the list', async () => {
    await expect(updateTheme(9, 'New Name', 'New message')).rejects.toThrow(
      'No theme at position 9',
    );
  });
});

// ─── reorderTheme ─────────────────────────────────────────────────────────────

describe('reorderTheme', () => {
  it('moves a theme from one position to another', async () => {
    await reorderTheme(0, 2);

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes.map((t: { name: string }) => t.name)).toEqual([
      'Macro',
      'Street',
      'Monochrome',
    ]);
  });

  it('does not change the number of themes', async () => {
    await reorderTheme(1, 0);

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(3);
  });

  it('writes to a .tmp path then renames', async () => {
    await reorderTheme(0, 1);

    const tmpPath = vi.mocked(fsp.writeFile).mock.calls[0][0] as string;
    const [from, to] = vi.mocked(fsp.rename).mock.calls[0] as [string, string];
    expect(tmpPath).toContain('.tmp');
    expect(from).toBe(tmpPath);
    expect(to).not.toContain('.tmp');
  });

  it('throws when fromIndex is out of bounds', async () => {
    await expect(reorderTheme(5, 0)).rejects.toThrow('Index out of bounds');
  });

  it('throws when toIndex is out of bounds', async () => {
    await expect(reorderTheme(0, 5)).rejects.toThrow('Index out of bounds');
  });
});
