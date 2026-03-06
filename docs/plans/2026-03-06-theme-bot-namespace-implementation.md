# `/theme-bot` Namespace + Config Channel Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all existing slash commands under `/theme-bot` as subcommands and add `/theme-bot config channel` to let admins pick the rotation channel via a Discord channel select menu.

**Architecture:** A single `/theme-bot` `SlashCommandBuilder` replaces four individual commands. The router in `src/commands/index.ts` is updated to resolve handlers by subcommand key (`themes`, `config/channel`, etc.). A new `saveConfig()` function enables persisting config changes atomically. The new channel handler replies with a `ChannelSelectMenuBuilder`, awaits selection, saves, and validates permissions.

**Tech Stack:** discord.js v14 (`ChannelSelectMenuBuilder`, `ActionRowBuilder`, `ComponentType`), TypeScript, Vitest, node `fs/promises` for atomic writes.

---

### Task 1: Add `saveConfig()` to `src/config.ts`

**Files:**

- Modify: `src/config.ts`
- Test: `src/__tests__/config.test.ts` (create)

**Step 1: Write the failing test**

Create `src/__tests__/config.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

import fsPromises from 'fs/promises';
import { saveConfig } from '../config';

describe('saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes config to a .tmp file then renames it atomically', async () => {
    const config = { channelId: '123456789' };
    await saveConfig(config);

    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      JSON.stringify(config, null, 2),
    );
    expect(fsPromises.rename).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      expect.stringContaining('config.json'),
    );
  });

  it('calls rename after writeFile (atomic ordering)', async () => {
    const writeOrder: string[] = [];
    vi.mocked(fsPromises.writeFile).mockImplementation(async () => {
      writeOrder.push('write');
    });
    vi.mocked(fsPromises.rename).mockImplementation(async () => {
      writeOrder.push('rename');
    });

    await saveConfig({ channelId: '123' });
    expect(writeOrder).toEqual(['write', 'rename']);
  });
});
```

**Step 2: Run the test and verify it fails**

```bash
pnpm test
```

Expected: FAIL — `saveConfig is not a function` (or similar — it doesn't exist yet).

**Step 3: Add `saveConfig()` to `src/config.ts`**

Add `import fsPromises from 'fs/promises';` at the top of `src/config.ts`, then add this function at the bottom:

```ts
import fsPromises from 'fs/promises';
```

```ts
export async function saveConfig(config: Config): Promise<void> {
  const tempPath = CONFIG_PATH + '.tmp';
  await fsPromises.writeFile(tempPath, JSON.stringify(config, null, 2));
  await fsPromises.rename(tempPath, CONFIG_PATH);
  cachedConfig = config;
}
```

**Step 4: Run the tests and verify they pass**

```bash
pnpm test
```

Expected: All tests pass including the 2 new ones.

**Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat(config): add saveConfig with atomic write"
```

---

### Task 2: Extract `resolveCommandKey` and update the router

**Files:**

- Modify: `src/commands/index.ts`
- Test: `src/__tests__/commands.test.ts` (create)

**Step 1: Write the failing tests**

Create `src/__tests__/commands.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveCommandKey, getCommandHandler } from '../commands/index';
import type { ChatInputCommandInteraction } from 'discord.js';

function makeInteraction(
  subcommand: string,
  subcommandGroup?: string,
): ChatInputCommandInteraction {
  return {
    options: {
      getSubcommandGroup: vi.fn(() => subcommandGroup ?? null),
      getSubcommand: vi.fn(() => subcommand),
    },
  } as unknown as ChatInputCommandInteraction;
}

describe('resolveCommandKey', () => {
  it('returns the subcommand name for flat subcommands', () => {
    expect(resolveCommandKey(makeInteraction('themes'))).toBe('themes');
    expect(resolveCommandKey(makeInteraction('rotate-now'))).toBe('rotate-now');
    expect(resolveCommandKey(makeInteraction('add-theme'))).toBe('add-theme');
    expect(resolveCommandKey(makeInteraction('reload-config'))).toBe(
      'reload-config',
    );
  });

  it('returns group/subcommand for grouped subcommands', () => {
    expect(resolveCommandKey(makeInteraction('channel', 'config'))).toBe(
      'config/channel',
    );
  });
});

describe('getCommandHandler', () => {
  it('returns a handler for known subcommand keys', () => {
    expect(getCommandHandler('themes')).toBeDefined();
    expect(getCommandHandler('rotate-now')).toBeDefined();
    expect(getCommandHandler('add-theme')).toBeDefined();
    expect(getCommandHandler('reload-config')).toBeDefined();
    expect(getCommandHandler('config/channel')).toBeDefined();
  });

  it('returns undefined for unknown keys', () => {
    expect(getCommandHandler('unknown')).toBeUndefined();
    expect(getCommandHandler('config/unknown')).toBeUndefined();
  });
});
```

**Step 2: Run the test and verify it fails**

```bash
pnpm test
```

Expected: FAIL — `resolveCommandKey is not a function` and `config/channel` handler is undefined.

**Step 3: Update `src/commands/index.ts`**

```ts
import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import type { CommandHandler } from '../types';
import { themes } from './themes';
import { rotateNow } from './rotate-now';
import { reloadConfigCmd } from './reload-config';
import { addThemeCmd } from './add-theme';
import { setChannelCmd } from './config/channel';

export function requireAdmin(
  interaction: ChatInputCommandInteraction,
): boolean {
  if (
    !interaction.inGuild() ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  ) {
    interaction.reply({
      content: 'You need Administrator permission to use this command.',
      ephemeral: true,
    });
    return false;
  }
  return true;
}

const commands: Record<string, CommandHandler> = {
  themes,
  'rotate-now': rotateNow,
  'reload-config': reloadConfigCmd,
  'add-theme': addThemeCmd,
  'config/channel': setChannelCmd,
};

export function resolveCommandKey(
  interaction: ChatInputCommandInteraction,
): string {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand(false);
  return subcommandGroup
    ? `${subcommandGroup}/${subcommand}`
    : (subcommand ?? '');
}

export function getCommandHandler(name: string): CommandHandler | undefined {
  return commands[name];
}
```

> Note: `setChannelCmd` doesn't exist yet — the TypeScript build will fail until Task 3 is complete. That's fine; run `pnpm test` only (not `pnpm build`) for this step.

**Step 4: Run the tests and verify they pass**

```bash
pnpm test
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/commands/index.ts src/__tests__/commands.test.ts
git commit -m "feat(commands): add resolveCommandKey and config/channel route"
```

---

### Task 3: Create `src/commands/config/channel.ts`

**Files:**

- Create: `src/commands/config/channel.ts`

> This handler is Discord-dependent and not unit tested. Correctness is verified manually after deployment.

**Step 1: Create the directory and file**

```bash
mkdir -p src/commands/config
```

Create `src/commands/config/channel.ts`:

```ts
import type { CommandHandler } from '../../types';
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
} from 'discord.js';
import { requireAdmin } from '../index';
import { getConfig, saveConfig } from '../../config';
import { validatePermissions } from '../../rotation';

export const setChannelCmd: CommandHandler = async (interaction, context) => {
  if (!requireAdmin(interaction)) return;

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('channelSelect')
      .setPlaceholder('Select a channel')
      .addChannelTypes(ChannelType.GuildText),
  );

  const reply = await interaction.reply({
    content: 'Select the channel for theme rotation:',
    components: [row],
    ephemeral: true,
  });

  let selectInteraction;
  try {
    selectInteraction = await reply.awaitMessageComponent({
      componentType: ComponentType.ChannelSelect,
      time: 5 * 60 * 1000,
    });
  } catch {
    const disabledRow =
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('channelSelect')
          .setPlaceholder('Select a channel')
          .addChannelTypes(ChannelType.GuildText)
          .setDisabled(true),
      );
    await interaction.editReply({
      content: 'Timed out. Run `/theme-bot config channel` to try again.',
      components: [disabledRow],
    });
    return;
  }

  const channelId = selectInteraction.values[0];
  const updatedConfig = { ...getConfig(), channelId };

  try {
    await saveConfig(updatedConfig);
  } catch (err) {
    console.error(err);
    await selectInteraction.update({
      content:
        'Failed to save the channel. Check the bot logs. The channel has not been changed.',
      components: [],
    });
    return;
  }

  const hasPermissions = await validatePermissions(
    context.client,
    updatedConfig,
  );
  const channelMention = `<#${channelId}>`;

  if (hasPermissions) {
    await selectInteraction.update({
      content: `Channel set to ${channelMention}.`,
      components: [],
    });
  } else {
    await selectInteraction.update({
      content: `Channel set to ${channelMention}, but the bot may be missing permissions there. Check that it has \`Manage Channels\` and \`Send Messages\`.`,
      components: [],
    });
  }
};
```

**Step 2: Verify the build passes**

```bash
pnpm build
```

Expected: No errors. The `setChannelCmd` import in `index.ts` now resolves.

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/commands/config/channel.ts
git commit -m "feat(commands): add config/channel handler with channel select menu"
```

---

### Task 4: Migrate command registration to `/theme-bot`

**Files:**

- Modify: `register-commands.ts`

**Step 1: Replace the command list**

Replace the entire `commands` array in `register-commands.ts` with:

```ts
const commands = [
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
        .setName('add-theme')
        .setDescription('Add a new theme to the rotation (Admin only)'),
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
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Bot configuration (Admin only)')
        .addSubcommand((sub) =>
          sub
            .setName('channel')
            .setDescription('Set the channel to rename for theme rotation'),
        ),
    ),
].map((command) => command.toJSON());
```

**Step 2: Verify build passes**

```bash
pnpm build
```

Expected: No errors.

**Step 3: Commit**

```bash
git add register-commands.ts
git commit -m "feat(commands): migrate all commands under /theme-bot namespace"
```

---

### Task 5: Update `src/index.ts` interaction handler

**Files:**

- Modify: `src/index.ts`

**Step 1: Update the `interactionCreate` handler**

Replace the `interactionCreate` block:

```ts
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'theme-bot') return;

  const key = resolveCommandKey(interaction);
  const handler = getCommandHandler(key);
  if (!handler) return;

  await handler(interaction, { client, config: getConfig() });
});
```

Add `resolveCommandKey` to the import from `'./commands'`:

```ts
import { getCommandHandler, resolveCommandKey } from './commands';
```

**Step 2: Verify build and tests pass**

```bash
pnpm build && pnpm test
```

Expected: Clean build, all tests pass.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): route /theme-bot subcommands via resolveCommandKey"
```

---

### Task 6: Update `ADMIN_GUIDE.md`

**Files:**

- Modify: `ADMIN_GUIDE.md`

**Step 1: Update the guide**

- Replace all command references: `/themes` → `/theme-bot themes`, `/add-theme` → `/theme-bot add-theme`, `/rotate-now` → `/theme-bot rotate-now`, `/reload-config` → `/theme-bot reload-config`
- Update the commands table to include `/theme-bot config channel`
- Add a section for `/theme-bot config channel` explaining the channel picker
- Remove the "Changing the designated channel" section (it's now handled by the command)

**Step 2: Commit**

```bash
git add ADMIN_GUIDE.md
git commit -m "docs(admin-guide): update commands for /theme-bot namespace and config channel"
```

---

### Task 7: Open PR

```bash
git push -u origin feat/theme-bot-namespace
```

Create PR with title: `feat(commands): migrate to /theme-bot namespace and add config channel picker`
