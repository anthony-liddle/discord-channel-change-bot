import type { Client, TextChannel } from 'discord.js';
import type { Config } from './types';
import { MAX_MESSAGE_LENGTH } from './interaction-errors';

/**
 * The admin alert channel.
 *
 * Every serious bug in this project has been invisible rather than loud: a dead
 * deploy nobody noticed for five months, a marker reporting a stale build, a
 * modal collector writing to the wrong theme, and a rotation wedge whose only
 * symptom is a channel name that quietly stops changing. The scheduled rotation
 * is the one path with no human watching it, so it is the one that needs to
 * speak up.
 *
 * The rule that cannot bend: reporting a failure must never be able to cause
 * one. Every path below swallows its own error and logs instead.
 */
type PostOutcome =
  | { ok: true }
  | { ok: false; kind: 'not-configured' }
  | { ok: false; kind: 'unreachable'; detail: string }
  | { ok: false; kind: 'cannot-post'; detail: string };

/**
 * The one place anything is posted to the admin channel. Never throws, and
 * distinguishes the failure modes so a caller can say which one happened
 * instead of reporting a generic problem.
 */
async function postToAdminChannel(
  client: Client,
  config: Config,
  content: string,
): Promise<PostOutcome> {
  const channelId = readChannelId(config);
  if (!channelId) return { ok: false, kind: 'not-configured' };

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    return { ok: false, kind: 'unreachable', detail: (err as Error).message };
  }

  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    return {
      ok: false,
      kind: 'unreachable',
      detail: `${channelId} is not a channel the bot can post to`,
    };
  }

  try {
    await (channel as TextChannel).send(content);
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: 'cannot-post', detail: (err as Error).message };
  }
}

function logPostFailure(what: string, config: Config, outcome: PostOutcome) {
  if (outcome.ok || outcome.kind === 'not-configured') return;
  console.error(
    `Could not post the ${what} to ${readChannelId(config)}: ${outcome.detail}`,
  );
}

export async function reportRotationFailure(
  client: Client,
  config: Config,
  detail: string,
): Promise<void> {
  const outcome = await postToAdminChannel(client, config, buildReport(detail));
  logPostFailure('rotation failure', config, outcome);
}

/**
 * Whether the weekly success line is on. Defaults to on when an admin channel
 * is set, and is switchable independently of failure reporting so that turning
 * the weekly noise off never turns the alerts off with it.
 */
export function successNoticesEnabled(config: Config): boolean {
  const raw = (config as { adminSuccessNotices?: unknown }).adminSuccessNotices;
  return typeof raw === 'boolean' ? raw : true;
}

export interface AppliedRotation {
  themeName: string;
  channelName: string;
}

/**
 * A line on every successful rotation.
 *
 * fly logs is a live tail with a short buffer, so a Monday failure can be gone
 * before anyone notices a stale channel name on Wednesday. A weekly success
 * line turns silence into evidence rather than ambiguity, and re-proves the
 * alert path every week instead of at the moment it was last tested.
 */
export async function reportRotationSuccess(
  client: Client,
  config: Config,
  applied: AppliedRotation,
): Promise<void> {
  if (!successNoticesEnabled(config)) return;

  const outcome = await postToAdminChannel(
    client,
    config,
    cap(
      `Weekly rotation ran. The channel is now \`#${applied.channelName}\` ` +
        `for **${applied.themeName}**.`,
    ),
  );
  logPostFailure('rotation notice', config, outcome);
}

export type AlertProbe =
  | { status: 'not-configured' }
  | { status: 'posted'; channelId: string }
  | { status: 'unreachable'; channelId: string; detail: string }
  | { status: 'cannot-post'; channelId: string; detail: string };

/**
 * Checks the alert path by using it.
 *
 * Deliberately a post rather than a permission read. A permission check can
 * look right while the post still fails, and an alert channel that cannot be
 * posted to is worse than none at all, because it is relied on.
 */
export async function probeAlertChannel(
  client: Client,
  config: Config,
): Promise<AlertProbe> {
  const channelId = readChannelId(config);
  if (!channelId) return { status: 'not-configured' };

  const outcome = await postToAdminChannel(
    client,
    config,
    'Alert path checked by `/theme-bot reload-config`. Rotation problems will appear here.',
  );

  if (outcome.ok) return { status: 'posted', channelId };
  if (outcome.kind === 'not-configured') return { status: 'not-configured' };
  return { status: outcome.kind, channelId, detail: outcome.detail };
}

/** One line for the reload-config reply. */
export function describeAlertProbe(
  probe: AlertProbe,
  successNotices: boolean,
): string {
  switch (probe.status) {
    case 'not-configured':
      return (
        'Alerts: off. `adminChannelId` is not set in config.json, so a failed ' +
        'rotation will appear only in the host logs.'
      );
    case 'posted':
      return (
        `Alerts: working. A test line was just posted to <#${probe.channelId}>. ` +
        (successNotices
          ? 'Weekly success notices are on, so silence there means something is wrong.'
          : 'Weekly success notices are off, so only failures will appear.')
      );
    case 'unreachable':
      return (
        `Alerts: BROKEN. The bot cannot reach the admin channel ` +
        `(${probe.detail}), so a failed rotation will not be reported.`
      );
    case 'cannot-post':
      return (
        `Alerts: BROKEN. The bot cannot post in <#${probe.channelId}> ` +
        `(${probe.detail}), so a failed rotation will not be reported. ` +
        'Check its Send Messages permission there.'
      );
  }
}

function cap(text: string): string {
  return text.length <= MAX_MESSAGE_LENGTH
    ? text
    : `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}\u2026`;
}

/**
 * A hand edited config.json can put anything here, and this function is the one
 * place that must not throw, so the id is not trusted to be a string.
 */
function readChannelId(config: Config): string | null {
  const raw = (config as { adminChannelId?: unknown }).adminChannelId;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Names the consequence, not just the error. The rotation position not
 * advancing is what turns a permanent failure into the same failure every week,
 * and it is the part an admin has to know to act on.
 */
function buildReport(detail: string): string {
  const message =
    '**The weekly theme rotation failed.**\n' +
    `> ${detail}\n\n` +
    'The channel was not renamed and the rotation position did not advance, ' +
    'so the next run will try the same theme again. If the cause is the theme ' +
    'itself, fix it with `/theme-bot edit-theme` and then run ' +
    '`/theme-bot rotate-now`.';

  return cap(message);
}
