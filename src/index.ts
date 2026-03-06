import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import { getConfig, loadConfig } from './config';
import { loadState } from './state';
import { scheduleCronJob, stopScheduledTask } from './scheduler';
import { rotateTheme, validatePermissions, getThemeName } from './rotation';
import { getCommandHandler } from './commands';
import { loadThemes } from './themes';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('ERROR: DISCORD_TOKEN not set in environment variables');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async () => {
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
    scheduleCronJob(schedule, timezone, () => {
      rotateTheme(client, getConfig());
    });
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const handler = getCommandHandler(interaction.commandName);
  if (!handler) return;

  await handler(interaction, { client, config: getConfig() });
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
