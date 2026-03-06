import type { CommandHandler } from '../../types';
import { requireAdmin } from '../index';
import { getConfig, saveConfig } from '../../config';
import { scheduleCronJob } from '../../scheduler';
import { rotateTheme } from '../../rotation';
import {
  ActionRowBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

const DAYS = [
  { label: 'Sunday', value: '0' },
  { label: 'Monday', value: '1' },
  { label: 'Tuesday', value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' },
  { label: 'Friday', value: '5' },
  { label: 'Saturday', value: '6' },
] as const;

const HOURS: { label: string; value: string }[] = Array.from(
  { length: 24 },
  (_, h) => {
    const period = h < 12 ? 'AM' : 'PM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const suffix = h === 0 ? ' (midnight)' : h === 12 ? ' (noon)' : '';
    return { label: `${display}:00 ${period}${suffix}`, value: String(h) };
  },
);

/**
 * Parses a simple weekly cron expression (minute hour * * dayOfWeek).
 * Returns null for anything more complex that we don't control.
 */
export function parseCron(cron: string): { day: string; hour: string } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dayOfWeek] = parts;
  if (minute !== '0' || dom !== '*' || month !== '*') return null;
  if (!/^\d+$/.test(dayOfWeek) || !/^\d+$/.test(hour)) return null;
  const dayNum = Number(dayOfWeek);
  const hourNum = Number(hour);
  if (dayNum < 0 || dayNum > 6 || hourNum < 0 || hourNum > 23) return null;
  return { day: dayOfWeek, hour };
}

/**
 * Converts a cron expression to a human-readable description.
 * Falls back to showing the raw cron string for unsupported formats.
 */
export function formatSchedule(cron: string, timezone: string): string {
  const parsed = parseCron(cron);
  if (!parsed) return `Custom schedule (\`${cron}\`) — ${timezone}`;
  const day =
    DAYS.find((d) => d.value === parsed.day)?.label ?? `day ${parsed.day}`;
  const hour =
    HOURS.find((h) => h.value === parsed.hour)?.label ?? `hour ${parsed.hour}`;
  return `every **${day}** at **${hour}** (${timezone})`;
}

export const configSchedule: CommandHandler = async (interaction, context) => {
  if (!requireAdmin(interaction)) return;

  const config = context.config;
  const currentCron = config.schedule ?? '0 9 * * 1';
  const timezone = config.timezone ?? 'America/New_York';
  const currentParsed = parseCron(currentCron);

  const dayMenu = new StringSelectMenuBuilder()
    .setCustomId(`config-schedule-day:${interaction.user.id}`)
    .setPlaceholder('Select a day')
    .addOptions(
      DAYS.map((d) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(d.label)
          .setValue(d.value)
          .setDefault(currentParsed?.day === d.value),
      ),
    );

  const response = await interaction.reply({
    content: [
      '**Configure Rotation Schedule**',
      `Current schedule: ${formatSchedule(currentCron, timezone)}`,
      '',
      '**Step 1 of 2:** Select the day of week:',
    ].join('\n'),
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(dayMenu),
    ],
    ephemeral: true,
    fetchReply: true,
  });

  let selectedDay: string;

  try {
    const dayInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.customId === `config-schedule-day:${interaction.user.id}`,
      time: 5 * 60 * 1000,
    });

    selectedDay = dayInteraction.values[0];
    const dayLabel = DAYS.find((d) => d.value === selectedDay)!.label;

    const hourMenu = new StringSelectMenuBuilder()
      .setCustomId(`config-schedule-hour:${interaction.user.id}`)
      .setPlaceholder('Select a time')
      .addOptions(
        HOURS.map((h) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(h.label)
            .setValue(h.value)
            .setDefault(currentParsed?.hour === h.value),
        ),
      );

    await dayInteraction.update({
      content: [
        '**Configure Rotation Schedule**',
        `Day: **${dayLabel}** ✓`,
        '',
        '**Step 2 of 2:** Select the time:',
      ].join('\n'),
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(hourMenu),
      ],
    });
  } catch {
    await interaction.editReply({
      content: 'Schedule configuration timed out.',
      components: [],
    });
    return;
  }

  try {
    const hourInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.customId === `config-schedule-hour:${interaction.user.id}`,
      time: 5 * 60 * 1000,
    });

    const selectedHour = hourInteraction.values[0];
    const newCron = `0 ${selectedHour} * * ${selectedDay}`;

    await saveConfig({ ...config, schedule: newCron });
    scheduleCronJob(newCron, timezone, () => {
      rotateTheme(context.client, getConfig());
    });

    await hourInteraction.update({
      content: `✅ Schedule updated to: ${formatSchedule(newCron, timezone)}`,
      components: [],
    });
  } catch {
    await interaction.editReply({
      content: 'Schedule configuration timed out.',
      components: [],
    });
  }
};
