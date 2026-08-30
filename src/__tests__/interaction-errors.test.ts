import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  MAX_MESSAGE_LENGTH,
  formatHandlerError,
  reportHandlerError,
} from '../interaction-errors';

// There is no log access on the host, so the error text has to reach the admin
// through Discord or it reaches nobody.

function fakeInteraction(
  state: { replied?: boolean; deferred?: boolean } = {},
) {
  return {
    replied: state.replied ?? false,
    deferred: state.deferred ?? false,
    commandName: 'theme-bot',
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction & {
    reply: ReturnType<typeof vi.fn>;
    followUp: ReturnType<typeof vi.fn>;
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('formatHandlerError', () => {
  it('names the error class so the admin can report it back', () => {
    expect(formatHandlerError(new TypeError('bad name'))).toContain(
      'TypeError',
    );
  });

  it('includes the error message', () => {
    expect(formatHandlerError(new TypeError('bad name'))).toContain('bad name');
  });

  it('handles a thrown value that is not an Error', () => {
    expect(formatHandlerError('plain string throw')).toContain(
      'plain string throw',
    );
  });

  it('handles a thrown undefined without crashing', () => {
    expect(() => formatHandlerError(undefined)).not.toThrow();
    expect(formatHandlerError(undefined)).not.toBe('');
  });

  it('stays within the Discord message limit', () => {
    const huge = new Error('z'.repeat(5000));
    expect(formatHandlerError(huge).length).toBeLessThanOrEqual(
      MAX_MESSAGE_LENGTH,
    );
  });
});

describe('reportHandlerError', () => {
  it('replies with the error class when the interaction is untouched', async () => {
    const interaction = fakeInteraction();

    await reportHandlerError(interaction, new RangeError('out of bounds'));

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const [payload] = interaction.reply.mock.calls[0];
    expect(payload.content).toContain('RangeError');
    expect(payload.content).toContain('out of bounds');
  });

  it('follows up instead of replying once the interaction is deferred', async () => {
    const interaction = fakeInteraction({ deferred: true });

    await reportHandlerError(interaction, new Error('after defer'));

    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('follows up instead of replying once the interaction is replied', async () => {
    const interaction = fakeInteraction({ replied: true });

    await reportHandlerError(interaction, new Error('after reply'));

    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('does not throw when the interaction token has already expired', async () => {
    const interaction = fakeInteraction();
    interaction.reply.mockRejectedValue(
      Object.assign(new Error('Unknown interaction'), { code: 10062 }),
    );

    await expect(
      reportHandlerError(interaction, new Error('original')),
    ).resolves.toBeUndefined();
  });

  it('logs the original error when it cannot be delivered to Discord', async () => {
    const interaction = fakeInteraction();
    interaction.reply.mockRejectedValue(
      Object.assign(new Error('Unknown interaction'), { code: 10062 }),
    );

    await reportHandlerError(interaction, new Error('original'));

    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not throw when followUp also fails', async () => {
    const interaction = fakeInteraction({ deferred: true });
    interaction.followUp.mockRejectedValue(new Error('gone'));

    await expect(
      reportHandlerError(interaction, new Error('original')),
    ).resolves.toBeUndefined();
  });

  it('sends the report ephemerally', async () => {
    const interaction = fakeInteraction();

    await reportHandlerError(interaction, new Error('boom'));

    const [payload] = interaction.reply.mock.calls[0];
    expect(payload.flags).toBeDefined();
  });
});
