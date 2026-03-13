import type { CommandHandler, ThemeEntry } from '../types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, reorderTheme } from '../themes';
import { getThemeName } from '../rotation';
import { getState, saveState } from '../state';

function buildListText(themes: ThemeEntry[], highlightIndex?: number): string {
  return (
    '**Current theme order:**\n' +
    themes
      .map((t, i) => {
        const marker = i === highlightIndex ? ' →' : '';
        return `${i + 1}. \`${getThemeName(t)}\`${marker}`;
      })
      .join('\n')
  );
}

function buildStep1Components(themes: ThemeEntry[], userId: string) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`reorderThemeSelect-${userId}`)
    .setPlaceholder('Select a theme to move')
    .addOptions(
      themes.map((t, i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${i + 1}. ${getThemeName(t)}`)
          .setValue(String(i)),
      ),
    );

  const doneButton = new ButtonBuilder()
    .setCustomId(`reorderThemeDone-${userId}`)
    .setLabel('✓ Done')
    .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(doneButton),
  ];
}

function buildStep2Components(
  selectedIndex: number,
  total: number,
  userId: string,
) {
  const upButton = new ButtonBuilder()
    .setCustomId(`reorderThemeUp-${userId}`)
    .setLabel('↑ Move Up')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(selectedIndex === 0);

  const downButton = new ButtonBuilder()
    .setCustomId(`reorderThemeDown-${userId}`)
    .setLabel('↓ Move Down')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(selectedIndex === total - 1);

  const saveButton = new ButtonBuilder()
    .setCustomId(`reorderThemeSave-${userId}`)
    .setLabel('✓ Save')
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`reorderThemeCancel-${userId}`)
    .setLabel('✕ Cancel')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      upButton,
      downButton,
      saveButton,
      cancelButton,
    ),
  ];
}

export const reorderThemesCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;

  const userId = interaction.user.id;
  let themes = await getThemes();

  if (themes.length === 0) {
    await interaction.reply({
      content: 'No themes to reorder.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (themes.length === 1) {
    await interaction.reply({
      content: 'Nothing to reorder, only one theme exists.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (themes.length > 25) {
    await interaction.reply({
      content:
        "You have more themes than Discord's menu can handle (max 25). Sounds like a feature request for whoever built this thing. 👀",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const response = await interaction.reply({
    content: buildListText(themes),
    components: buildStep1Components(themes, userId),
    flags: MessageFlags.Ephemeral,
  });

  while (true) {
    let step1Interaction;
    try {
      step1Interaction = await response.awaitMessageComponent({
        filter: (i) =>
          i.user.id === userId &&
          (i.customId === `reorderThemeSelect-${userId}` ||
            i.customId === `reorderThemeDone-${userId}`),
        time: 5 * 60 * 1000,
      });
    } catch {
      await interaction.editReply({ content: 'Timed out.', components: [] });
      return;
    }

    if (step1Interaction.customId === `reorderThemeDone-${userId}`) {
      await step1Interaction.update({ content: 'Done!', components: [] });
      return;
    }

    const originalIndex = parseInt(
      (step1Interaction as StringSelectMenuInteraction).values[0],
    );
    let selectedIndex = originalIndex;
    let workingThemes = [...themes];

    await step1Interaction.update({
      content: buildListText(workingThemes, selectedIndex),
      components: buildStep2Components(
        selectedIndex,
        workingThemes.length,
        userId,
      ),
    });

    let exitLoop = false;

    await new Promise<void>((resolve) => {
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) =>
          i.user.id === userId &&
          [
            `reorderThemeUp-${userId}`,
            `reorderThemeDown-${userId}`,
            `reorderThemeSave-${userId}`,
            `reorderThemeCancel-${userId}`,
          ].includes(i.customId),
        time: 5 * 60 * 1000,
      });

      collector.on('collect', async (btn) => {
        if (
          btn.customId === `reorderThemeUp-${userId}` ||
          btn.customId === `reorderThemeDown-${userId}`
        ) {
          const newIndex =
            btn.customId === `reorderThemeUp-${userId}`
              ? selectedIndex - 1
              : selectedIndex + 1;
          const updated = [...workingThemes];
          const [moved] = updated.splice(selectedIndex, 1);
          updated.splice(newIndex, 0, moved);
          workingThemes = updated;
          selectedIndex = newIndex;

          await btn.update({
            content: buildListText(workingThemes, selectedIndex),
            components: buildStep2Components(
              selectedIndex,
              workingThemes.length,
              userId,
            ),
          });
        } else if (btn.customId === `reorderThemeSave-${userId}`) {
          collector.stop('save');
          try {
            const state = getState();
            const trackedName = getThemeName(themes[state.currentIndex]);
            await reorderTheme(originalIndex, selectedIndex);
            themes = await getThemes();
            const newCurrentIndex = themes.findIndex(
              (t) => getThemeName(t) === trackedName,
            );
            await saveState({
              currentIndex:
                newCurrentIndex >= 0 ? newCurrentIndex : state.currentIndex,
            });
            await btn.update({
              content: buildListText(themes),
              components: buildStep1Components(themes, userId),
            });
          } catch (err) {
            await btn.update({
              content: `Failed to save theme order.\n> ${(err as Error).message}`,
              components: [],
            });
            exitLoop = true;
          }
          resolve();
        } else if (btn.customId === `reorderThemeCancel-${userId}`) {
          collector.stop('cancel');
          await btn.update({
            content: buildListText(themes),
            components: buildStep1Components(themes, userId),
          });
          resolve();
        }
      });

      collector.on('end', (_, reason) => {
        if (reason !== 'save' && reason !== 'cancel') {
          interaction
            .editReply({ content: 'Timed out.', components: [] })
            .catch(console.error);
          exitLoop = true;
          resolve();
        }
      });
    });

    if (exitLoop) return;
  }
};
