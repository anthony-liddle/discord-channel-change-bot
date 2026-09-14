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
  addTheme,
  deleteTheme,
  updateTheme,
  reorderTheme,
  reloadThemes,
} from '../themes';
import { MAX_THEME_MESSAGE, MAX_THEME_NAME } from '../theme-validation';

const baseThemes = [
  { name: 'Monochrome', message: 'Black and white only!' },
  { name: 'Macro', message: 'Get close!' },
  { name: 'Street', message: 'Urban life.' },
];

// The live failure shape: two entries sharing a name. Resolving by name picks
// the first one, which is why both operations take an index instead.
const duplicateThemes = [
  { name: 'Monochrome', message: 'first' },
  { name: 'Weekly Theme Noir', message: 'second' },
  { name: 'Weekly Theme Noir', message: 'third' },
];

function setupThemes(themes = baseThemes) {
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ themes }) as unknown as Buffer,
  );
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.rename).mockResolvedValue(undefined);
}

// clearMocks resets recorded calls but keeps implementations, so the mock has
// to be re-pointed at the base themes before the reload or the previous test's
// theme list stays in the cache.
beforeEach(async () => {
  setupThemes();
  await reloadThemes();
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

    await updateTheme(2, 'Weekly Theme Noir Two', 'renamed');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes[1]).toEqual({
      name: 'Weekly Theme Noir',
      message: 'second',
    });
    expect(written.themes[2]).toEqual({
      name: 'Weekly Theme Noir Two',
      message: 'renamed',
    });
  });

  it('can rename an entry whose current name is a duplicate', async () => {
    setupThemes(duplicateThemes);
    await reloadThemes();

    await expect(
      updateTheme(1, 'Weekly Theme Noir One', 'kept'),
    ).resolves.toBeUndefined();
  });

  it('throws when the index is past the end of the list', async () => {
    await expect(updateTheme(9, 'New Name', 'New message')).rejects.toThrow(
      'No theme at position 9',
    );
  });
});

// ─── duplicate names ──────────────────────────────────────────────────────────

// A double modal submit is the most plausible way two identical names got into
// the live file. Names are compared trimmed and case insensitively because
// normalizeChannelName lowercases, so "Noir" and "noir" become the same
// channel name and are duplicates for every purpose that matters.

describe('addTheme duplicate guard', () => {
  it('rejects a name that already exists', async () => {
    await expect(addTheme('Macro', 'Get close!')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('names the position it collides with', async () => {
    await expect(addTheme('Macro', 'Get close!')).rejects.toThrow(
      /position 2/i,
    );
  });

  it('rejects a name differing only by case', async () => {
    await expect(addTheme('macro', 'Get close!')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('rejects a name differing only by surrounding whitespace', async () => {
    await expect(addTheme('  Macro  ', 'Get close!')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('does not write to disk when it rejects', async () => {
    await expect(addTheme('Macro', 'Get close!')).rejects.toThrow();
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
  });

  it('still adds a genuinely new theme', async () => {
    await addTheme('Golden Hour', 'Shoot at sunset.');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes).toHaveLength(4);
    expect(written.themes[3].name).toBe('Golden Hour');
  });
});

describe('updateTheme duplicate guard', () => {
  it('rejects renaming an entry onto another entry name', async () => {
    await expect(updateTheme(1, 'Street', 'Urban life.')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('allows an entry to keep its own name', async () => {
    await expect(
      updateTheme(1, 'Macro', 'A new message.'),
    ).resolves.toBeUndefined();
  });

  it('allows an entry to keep its own name in different case', async () => {
    await expect(
      updateTheme(1, 'MACRO', 'A new message.'),
    ).resolves.toBeUndefined();
  });

  it('lets one of two duplicates be renamed to something unique', async () => {
    setupThemes(duplicateThemes);
    await reloadThemes();

    await expect(
      updateTheme(2, 'Weekly Theme Noir Two', 'renamed'),
    ).resolves.toBeUndefined();
  });

  // Deliberate: editing one of two duplicates and keeping the shared name is
  // rejected, because the other copy still holds it. Forcing a rename is the
  // point, since leaving both is what broke the picker. The repair sequence
  // says so.
  it('rejects keeping a name that a second entry also holds', async () => {
    setupThemes(duplicateThemes);
    await reloadThemes();

    await expect(
      updateTheme(1, 'Weekly Theme Noir', 'message only edit'),
    ).rejects.toThrow(/already exists at position 3/);
  });
});

// ─── validation at the write path ─────────────────────────────────────────────

// The modals are not the only way in. themes.json gets hand edited on the Fly
// volume, and that bypasses every modal, so the store has to refuse a bad value
// on its own rather than trusting its caller.

describe('addTheme validates before writing', () => {
  it('rejects a name that normalizes to nothing', async () => {
    await expect(addTheme('🔥🔥🔥', 'msg')).rejects.toThrow(/channel name/i);
  });

  it('does not write to disk when the name normalizes to nothing', async () => {
    await expect(addTheme('🔥🔥🔥', 'msg')).rejects.toThrow();
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
  });

  it(`rejects a name over ${MAX_THEME_NAME} characters`, async () => {
    await expect(
      addTheme('a'.repeat(MAX_THEME_NAME + 1), 'msg'),
    ).rejects.toThrow(new RegExp(`${MAX_THEME_NAME} characters`));
  });

  it(`rejects a message over ${MAX_THEME_MESSAGE} characters`, async () => {
    await expect(
      addTheme('Golden Hour', 'a'.repeat(MAX_THEME_MESSAGE + 1)),
    ).rejects.toThrow(new RegExp(`${MAX_THEME_MESSAGE} characters`));
  });

  it('stores the name with surrounding whitespace removed', async () => {
    await addTheme('  Golden Hour  ', 'Shoot at sunset.');

    const written = JSON.parse(
      vi.mocked(fsp.writeFile).mock.calls[0][1] as string,
    );
    expect(written.themes[3].name).toBe('Golden Hour');
  });

  it('accepts an accented name', async () => {
    await expect(
      addTheme('Café Night', 'Bring a flask.'),
    ).resolves.toBeUndefined();
  });
});

describe('updateTheme validates before writing', () => {
  it('rejects a name that normalizes to nothing', async () => {
    await expect(updateTheme(1, '!!!', 'msg')).rejects.toThrow(/channel name/i);
  });

  it('does not write to disk when the name normalizes to nothing', async () => {
    await expect(updateTheme(1, '!!!', 'msg')).rejects.toThrow();
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
  });

  it(`rejects a name over ${MAX_THEME_NAME} characters`, async () => {
    await expect(
      updateTheme(1, 'a'.repeat(MAX_THEME_NAME + 1), 'msg'),
    ).rejects.toThrow(new RegExp(`${MAX_THEME_NAME} characters`));
  });

  it(`rejects a message over ${MAX_THEME_MESSAGE} characters`, async () => {
    await expect(
      updateTheme(1, 'Golden Hour', 'a'.repeat(MAX_THEME_MESSAGE + 1)),
    ).rejects.toThrow(new RegExp(`${MAX_THEME_MESSAGE} characters`));
  });

  // Validation has to run before the range check is not the point; the point is
  // that an out of range index still reports the index, not a name complaint.
  it('still reports an out of range index rather than a name complaint', async () => {
    await expect(updateTheme(9, 'Golden Hour', 'msg')).rejects.toThrow(
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
