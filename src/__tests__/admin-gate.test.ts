import { vi, describe, it, expect } from 'vitest';
import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';

vi.mock('../themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../themes')>()),
  addTheme: vi.fn(),
  getThemes: vi.fn(async () => [
    { name: 'Weekly theme origami', message: 'm' },
  ]),
  deleteTheme: vi.fn(),
}));

import { addTheme, deleteTheme } from '../themes';
import { requireAdmin } from '../commands';
import { addThemeCmd } from '../commands/add-theme';
import { deleteThemeCmd } from '../commands/delete-theme';

/**
 * Every command that changes the rotation is admin only, and requireAdmin is
 * the whole of that gate. Commands are registered for the server, so anyone
 * in it can run them; nothing else stands between a member and the theme list.
 */

function member(opts: { inGuild?: boolean; permissions?: bigint[] | null }) {
  const { inGuild = true, permissions = [] } = opts;
  return {
    id: 'inv-1',
    user: { id: 'member-1' },
    inGuild: () => inGuild,
    memberPermissions:
      permissions === null
        ? null
        : { has: (flag: bigint) => permissions.includes(flag) },
    options: { getString: vi.fn(() => '1|0') },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

const asCommand = (i: unknown) => i as ChatInputCommandInteraction;

const REFUSAL = {
  content: 'You need Administrator permission to use this command.',
  flags: MessageFlags.Ephemeral,
};

describe('requireAdmin', () => {
  it('lets an administrator through without replying', async () => {
    const admin = member({ permissions: [PermissionFlagsBits.Administrator] });

    expect(await requireAdmin(asCommand(admin))).toBe(true);
    expect(admin.reply).not.toHaveBeenCalled();
  });

  it('refuses a member without Administrator, privately', async () => {
    const plain = member({ permissions: [PermissionFlagsBits.ManageChannels] });

    expect(await requireAdmin(asCommand(plain))).toBe(false);
    expect(plain.reply).toHaveBeenCalledWith(REFUSAL);
  });

  // Outside a server there are no member permissions to check at all.
  it('refuses outside a server', async () => {
    const dm = member({
      inGuild: false,
      permissions: [PermissionFlagsBits.Administrator],
    });

    expect(await requireAdmin(asCommand(dm))).toBe(false);
    expect(dm.reply).toHaveBeenCalledWith(REFUSAL);
  });

  it('refuses when Discord sends no member permissions', async () => {
    const unknown = member({ permissions: null });

    expect(await requireAdmin(asCommand(unknown))).toBe(false);
    expect(unknown.reply).toHaveBeenCalledWith(REFUSAL);
  });
});

describe('the gate holds in the commands that change the list', () => {
  it('add-theme opens no form for a member', async () => {
    const plain = member({});

    await addThemeCmd(asCommand(plain), {} as never);

    expect(plain.showModal).not.toHaveBeenCalled();
    expect(addTheme).not.toHaveBeenCalled();
  });

  it('delete-theme deletes nothing and asks nothing for a member', async () => {
    const plain = member({});

    await deleteThemeCmd(asCommand(plain), {} as never);

    expect(plain.deferReply).not.toHaveBeenCalled();
    expect(deleteTheme).not.toHaveBeenCalled();
  });
});
