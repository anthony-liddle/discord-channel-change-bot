import {
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

/**
 * The slash commands as registered with Discord.
 *
 * They live here rather than in register-commands.ts because that script
 * calls process.exit and talks to Discord the moment it is imported, so no
 * test could ever read them. A subcommand that is registered but has no
 * handler fails in Discord as "the application did not respond", because
 * dispatch ignores a key it does not know; a test now checks every registered
 * subcommand against the router.
 *
 * Changing anything here means running pnpm register again. Deploying new
 * handler code does not.
 */
export const COMMAND_DEFINITIONS: RESTPostAPIChatInputApplicationCommandsJSONBody[] =
  [
    new SlashCommandBuilder()
      .setName('theme-bot')
      .setDescription('Theme rotation bot commands')
      .addSubcommand((sub) =>
        sub
          .setName('themes')
          .setDescription('Preview the upcoming theme rotation'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('rotate-now')
          .setDescription('Immediately rotate to the next theme (Admin only)'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('reload-config')
          .setDescription(
            'Reload the config file without restarting (Admin only)',
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('add-theme')
          .setDescription(
            'Add a theme using "Channel Name", and "Theme Message"',
          ),
      )
      // The theme option is answered by autocomplete, which filters bot side
      // before responding, so the 25 option ceiling of a select menu stops
      // applying to the theme list.
      .addSubcommand((sub) =>
        sub
          .setName('delete-theme')
          .setDescription('Delete a theme (Admin only)')
          .addStringOption((option) =>
            option
              .setName('theme')
              .setDescription(
                'Start typing a theme name or its position number',
              )
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('edit-theme')
          .setDescription('Edit a theme (Admin only)')
          .addStringOption((option) =>
            option
              .setName('theme')
              .setDescription(
                'Start typing a theme name or its position number',
              )
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('reorder-themes')
          .setDescription('Reorder the theme rotation list (Admin only)'),
      )
      .addSubcommandGroup((group) =>
        group
          .setName('config')
          .setDescription('Configure bot settings')
          .addSubcommand((sub) =>
            sub
              .setName('channel')
              .setDescription(
                'Set the channel to rename each rotation (Admin only)',
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName('schedule')
              .setDescription(
                'Set the day and time for weekly rotations (Admin only)',
              ),
          ),
      )
      .toJSON(),
  ];
