import {
  GatewayIntentBits,
  type ClientOptions,
  type MessageMentionOptions,
} from 'discord.js';

/**
 * Mentions in anything the bot posts render but notify nobody.
 *
 * A theme name used to become only a channel slug, where @everyone is inert.
 * Since the announcement heading, it lands in a post where it is not. The
 * message field already carried the same risk. If a theme should ever ping a
 * role, that has to be a decision made here in code, never a consequence of
 * what someone typed into a modal.
 */
export const NO_MENTIONS: MessageMentionOptions = { parse: [] };

/**
 * Set on the client so it covers every send: channel posts, interaction
 * replies and webhook follow-ups all fall back to the client's default when a
 * call does not set its own, including call sites added later.
 */
export const CLIENT_OPTIONS: ClientOptions = {
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: NO_MENTIONS,
};
