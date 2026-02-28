import type { CommandHandler } from '../types';
import { getUpcomingThemes } from '../rotation';

export const themes: CommandHandler = async (interaction, context) => {
  const upcoming = getUpcomingThemes(context.config, 5);

  let response = '**Upcoming Themes:**\n';
  for (const item of upcoming) {
    const marker = item.isCurrent ? ' (current)' : '';
    response += `Week ${item.week}: \`${item.name}\`${marker}\n`;
  }
  response += `\n*Total themes in rotation: ${context.config.themes.length}*`;

  await interaction.reply({ content: response, ephemeral: true });
};
