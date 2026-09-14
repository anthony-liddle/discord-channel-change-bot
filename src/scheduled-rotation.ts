import type { Client } from 'discord.js';
import type { Config } from './types';
import { rotateTheme } from './rotation';
import { reportRotationFailure, reportRotationSuccess } from './admin-alerts';

/**
 * The weekly rotation, wrapped so a failure says so somewhere a person will
 * see it.
 *
 * This exists as one function because the cron callback was written out twice,
 * in index.ts and in reload-config.ts, and reporting added to only one of them
 * would report only until the first /theme-bot reload-config.
 *
 * The config is read per run rather than captured at schedule time, so
 * /theme-bot config channel and reload-config take effect without a restart.
 */
export function makeScheduledRotation(
  client: Client,
  readConfig: () => Config,
): () => Promise<void> {
  return async () => {
    const config = readConfig();
    const result = await rotateTheme(client, config);

    if (result.success) {
      // Contained for the same reason the failure path is: posting about a
      // rotation must never be able to break one.
      try {
        await reportRotationSuccess(client, config, {
          themeName: result.themeName ?? 'unknown theme',
          channelName: result.channelName ?? 'unknown channel',
        });
      } catch (err) {
        console.error(
          `Could not post the rotation notice: ${(err as Error).message}`,
        );
      }
      return;
    }

    const detail = result.error ?? 'unknown error';
    console.error(`Scheduled rotation failed: ${detail}`);

    // The rotation has already happened and its result is already decided.
    // Nothing this reporter does may change that, so its failure is contained
    // here as well as inside reportRotationFailure itself.
    try {
      await reportRotationFailure(client, config, detail);
    } catch (err) {
      console.error(
        `Could not report the rotation failure: ${(err as Error).message}`,
      );
    }
  };
}
