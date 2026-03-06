import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
}));

import fsp from 'fs/promises';
import { deleteTheme, updateTheme, reloadThemes } from '../themes';

const baseThemes = [
  { name: 'Monochrome', message: 'Black and white only!' },
  { name: 'Macro', message: 'Get close!' },
  { name: 'Street', message: 'Urban life.' },
];

function setupThemes(themes = baseThemes) {
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ themes }) as unknown as Buffer,
  );
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.rename).mockResolvedValue(undefined);
}

beforeEach(() => {
  reloadThemes(); // clear cache
  setupThemes();
});

// ─── deleteTheme ──────────────────────────────────────────────────────────────

describe('deleteTheme', () => {
  it('removes the theme with the matching name', async () => {
    await deleteTheme('Macro');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(2);
    expect(written.themes.map((t: { name: string }) => t.name)).not.toContain(
      'Macro',
    );
  });

  it('writes to a .tmp path then renames', async () => {
    await deleteTheme('Macro');

    const tmpPath = vi.mocked(fsp.writeFile).mock.calls[0][0] as string;
    const [from, to] = vi.mocked(fsp.rename).mock.calls[0] as [string, string];
    expect(tmpPath).toContain('.tmp');
    expect(from).toBe(tmpPath);
    expect(to).not.toContain('.tmp');
  });

  it('throws when the theme name is not found', async () => {
    await expect(deleteTheme('NonExistent')).rejects.toThrow(
      'Theme "NonExistent" not found',
    );
  });
});

// ─── updateTheme ──────────────────────────────────────────────────────────────

describe('updateTheme', () => {
  it('updates the name and message of the matching theme', async () => {
    await updateTheme('Macro', 'Macro Photography', 'Get really close!');

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
    await updateTheme('Macro', 'Macro Photography', 'Get really close!');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(3);
    expect(written.themes[0].name).toBe('Monochrome');
    expect(written.themes[2].name).toBe('Street');
  });

  it('writes to a .tmp path then renames', async () => {
    await updateTheme('Macro', 'Macro Photography', 'Updated!');

    const tmpPath = vi.mocked(fsp.writeFile).mock.calls[0][0] as string;
    const [from, to] = vi.mocked(fsp.rename).mock.calls[0] as [string, string];
    expect(tmpPath).toContain('.tmp');
    expect(from).toBe(tmpPath);
    expect(to).not.toContain('.tmp');
  });

  it('throws when the theme name is not found', async () => {
    await expect(
      updateTheme('NonExistent', 'New Name', 'New message'),
    ).rejects.toThrow('Theme "NonExistent" not found');
  });
});
