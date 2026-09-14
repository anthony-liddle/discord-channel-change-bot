import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

vi.mock('../themes', () => ({ getThemes: vi.fn() }));

import { getThemes } from '../themes';
import { themes as themesCmd } from '../commands/themes';
import { DEPLOY_LABEL } from '../version';

// /theme-bot themes is the only way to see what is actually deployed. The bot
// runs on hosting with no log access and an unverified deploy pipeline, so this
// reply is the entire feedback channel.

function anyoneInteraction() {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & {
    reply: ReturnType<typeof vi.fn>;
  };
}

function replyContent(interaction: { reply: ReturnType<typeof vi.fn> }) {
  return interaction.reply.mock.calls[0][0].content as string;
}

beforeEach(() => {
  vi.mocked(getThemes).mockResolvedValue([
    { name: 'Monochrome', message: 'Black and white only!' },
    { name: 'Macro', message: 'Get close!' },
  ]);
});

describe('themes command deploy marker', () => {
  it('includes the deploy marker in the reply', async () => {
    const interaction = anyoneInteraction();

    await themesCmd(interaction, {} as never);

    expect(replyContent(interaction)).toContain(DEPLOY_LABEL);
  });

  it('keeps the marker on the same footer line as the theme count', async () => {
    const interaction = anyoneInteraction();

    await themesCmd(interaction, {} as never);

    const footer = replyContent(interaction)
      .split('\n')
      .find((line) => line.includes(DEPLOY_LABEL));
    expect(footer).toContain('2');
  });

  it('still reports the theme count', async () => {
    const interaction = anyoneInteraction();

    await themesCmd(interaction, {} as never);

    expect(replyContent(interaction)).toContain('Total themes in rotation: 2');
  });

  it('still lists the upcoming themes', async () => {
    const interaction = anyoneInteraction();

    await themesCmd(interaction, {} as never);

    expect(replyContent(interaction)).toContain('Monochrome');
  });

  it('stays ephemeral so the marker is not channel noise', async () => {
    const interaction = anyoneInteraction();

    await themesCmd(interaction, {} as never);

    expect(interaction.reply.mock.calls[0][0].flags).toBeDefined();
  });

  it('shows the marker even when there are no themes', async () => {
    vi.mocked(getThemes).mockResolvedValue([]);
    const interaction = anyoneInteraction();

    await themesCmd(interaction, {} as never);

    expect(replyContent(interaction)).toContain(DEPLOY_LABEL);
  });
});
