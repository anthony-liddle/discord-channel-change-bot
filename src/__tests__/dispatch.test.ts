import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MessageFlags, type Client, type Interaction } from 'discord.js';
import type { Config } from '../types';

vi.mock('../commands/theme-autocomplete', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../commands/theme-autocomplete')>()),
  handleThemeAutocomplete: vi.fn(),
}));
vi.mock('../commands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../commands')>()),
  getCommandHandler: vi.fn(),
}));
vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config')>()),
  getConfig: vi.fn(),
}));

import { handleThemeAutocomplete } from '../commands/theme-autocomplete';
import { getCommandHandler } from '../commands';
import { getConfig } from '../config';
import { handleInteraction } from '../dispatch';

const client = { marker: 'the bot client' } as unknown as Client;
const config: Config = { channelId: '111111111111111111' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getConfig).mockReturnValue(config);
});

function slashCommand(subcommand = 'themes') {
  return {
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    commandName: 'theme-bot',
    options: {
      getSubcommandGroup: () => null,
      getSubcommand: () => subcommand,
    },
    replied: false,
    deferred: false,
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  };
}

const dispatch = (interaction: unknown) =>
  handleInteraction(interaction as Interaction, client);

describe('routing', () => {
  it('sends autocomplete to the theme suggestions', async () => {
    const autocomplete = {
      isAutocomplete: () => true,
      isChatInputCommand: () => false,
    };

    await dispatch(autocomplete);

    expect(handleThemeAutocomplete).toHaveBeenCalledWith(autocomplete);
    expect(getCommandHandler).not.toHaveBeenCalled();
  });

  // Buttons, selects and modal submits belong to the collector that is
  // waiting for them, not to the dispatcher.
  it('leaves anything that is not a slash command to its collector', async () => {
    const button = {
      isAutocomplete: () => false,
      isChatInputCommand: () => false,
      reply: vi.fn(),
    };

    await dispatch(button);

    expect(getCommandHandler).not.toHaveBeenCalled();
    expect(button.reply).not.toHaveBeenCalled();
  });

  it('ignores a command it has no handler for', async () => {
    vi.mocked(getCommandHandler).mockReturnValue(undefined);
    const interaction = slashCommand('retired-subcommand');

    await expect(dispatch(interaction)).resolves.toBeUndefined();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('runs the handler for the subcommand with the client and the current config', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getCommandHandler).mockReturnValue(handler);
    const interaction = slashCommand('rotate-now');

    await dispatch(interaction);

    expect(getCommandHandler).toHaveBeenCalledWith('theme-bot:rotate-now');
    expect(handler).toHaveBeenCalledWith(interaction, { client, config });
  });
});

// Nobody on the admin team can read the host logs, so a handler that throws
// has to say so in Discord. Without this boundary the throw would be an
// unhandled rejection and the admin would see "the application did not
// respond".
describe('the error boundary', () => {
  it('shows the admin what went wrong, privately', async () => {
    vi.mocked(getCommandHandler).mockReturnValue(
      vi.fn().mockRejectedValue(new Error('boom')),
    );
    const interaction = slashCommand();

    await dispatch(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Something went wrong running that command.\n> Error: boom',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('follows up instead when the handler had already acknowledged', async () => {
    const interaction = slashCommand();
    vi.mocked(getCommandHandler).mockReturnValue(
      vi.fn(async () => {
        interaction.deferred = true;
        throw new TypeError('late failure');
      }),
    );

    await dispatch(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content:
        'Something went wrong running that command.\n> TypeError: late failure',
      flags: MessageFlags.Ephemeral,
    });
  });

  // config.json is read for every command. A broken one must be reported
  // like any other failure, not escape the boundary.
  it('reports a config that cannot be read', async () => {
    vi.mocked(getCommandHandler).mockReturnValue(vi.fn());
    vi.mocked(getConfig).mockImplementation(() => {
      throw new Error('config.json not found');
    });
    const interaction = slashCommand();

    await dispatch(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('config.json not found'),
      }),
    );
  });

  it('does not throw when the error cannot be delivered either', async () => {
    vi.mocked(getCommandHandler).mockReturnValue(
      vi.fn().mockRejectedValue(new Error('boom')),
    );
    const interaction = slashCommand();
    interaction.reply.mockRejectedValue(new Error('Unknown interaction'));

    await expect(dispatch(interaction)).resolves.toBeUndefined();
  });
});
