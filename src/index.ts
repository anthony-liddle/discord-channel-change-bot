import { Client } from 'discord.js';
import 'dotenv/config';
import { CLIENT_OPTIONS } from './client-options';
import { getConfig, loadConfig } from './config';
import { loadState } from './state';
import { scheduleCronJob, stopScheduledTask } from './scheduler';
import { validatePermissions, getThemeName } from './rotation';
import { makeScheduledRotation } from './scheduled-rotation';
import { handleInteraction } from './dispatch';
import { loadThemes } from './themes';
import { formatHandlerError } from './interaction-errors';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('ERROR: DISCORD_TOKEN not set in environment variables');
  process.exit(1);
}

const client = new Client(CLIENT_OPTIONS);

client.once('clientReady', async () => {
  loadConfig();
  const themes = await loadThemes();
  console.log(`Logged in as ${client.user!.tag}`);

  const config = getConfig();
  await loadState();

  const hasPermissions = await validatePermissions(client, config);
  if (!hasPermissions) {
    console.warn(
      'WARNING: Bot may not be able to rename the channel. Check permissions.',
    );
  }

  const schedule = config.schedule ?? '0 9 * * 1';
  const timezone = config.timezone ?? 'America/New_York';

  try {
    scheduleCronJob(
      schedule,
      timezone,
      makeScheduledRotation(client, getConfig),
    );
  } catch {
    console.error(`ERROR: Invalid cron schedule: ${schedule}`);
    process.exit(1);
  }

  const { getState } = await import('./state');
  const state = getState();
  console.log(`Current theme index: ${state.currentIndex}`);
  console.log(
    `Next theme: ${getThemeName(themes[state.currentIndex % themes.length])}`,
  );
  console.log('Bot is ready!');
});

client.on('interactionCreate', (interaction) =>
  handleInteraction(interaction, client),
);

// The dispatch try/catch cannot see a promise nobody awaited. Without this a
// single floating rejection takes the process down and the cron schedule with
// it, which is a far worse outcome than a broken command.
process.on('unhandledRejection', (reason) => {
  console.error(`Unhandled rejection: ${formatHandlerError(reason)}`, reason);
});

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  stopScheduledTask();
  await client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(token);
