import { vi, describe, it, expect } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
}));

import fsp from 'fs/promises';
import { readRuntimeFiles } from '../runtime-files';

// themes.json and state.json live only on hosting the admin team cannot reach,
// so pulling them out through Discord is both the diagnostic and the migration
// prerequisite.

describe('readRuntimeFiles', () => {
  it('returns an entry for every runtime file', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue('{}' as unknown as Buffer);

    const files = await readRuntimeFiles();

    expect(files.map((f) => f.name)).toEqual(['themes.json', 'state.json']);
  });

  it('returns the raw contents of each file unparsed', async () => {
    vi.mocked(fsp.readFile).mockResolvedValue(
      '{"themes":[{"name":"Thicc"}]}' as unknown as Buffer,
    );

    const [themes] = await readRuntimeFiles();

    expect(themes.content).toBe('{"themes":[{"name":"Thicc"}]}');
    expect(themes.error).toBeNull();
  });

  it('records an error instead of throwing when a file is missing', async () => {
    vi.mocked(fsp.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
    );

    const files = await readRuntimeFiles();

    expect(files[0].content).toBeNull();
    expect(files[0].error).toContain('ENOENT');
  });

  it('does not reject when every file is unreadable', async () => {
    vi.mocked(fsp.readFile).mockRejectedValue(new Error('EACCES'));

    await expect(readRuntimeFiles()).resolves.toHaveLength(2);
  });

  it('reads one file failing and another succeeding independently', async () => {
    vi.mocked(fsp.readFile)
      .mockResolvedValueOnce('{"themes":[]}' as unknown as Buffer)
      .mockRejectedValueOnce(new Error('ENOENT'));

    const [themes, state] = await readRuntimeFiles();

    expect(themes.content).toBe('{"themes":[]}');
    expect(state.content).toBeNull();
    expect(state.error).toContain('ENOENT');
  });
});
