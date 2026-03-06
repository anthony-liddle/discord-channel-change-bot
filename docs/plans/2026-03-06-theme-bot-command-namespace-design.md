# Design: `/theme-bot` Command Namespace + Config Channel Picker

**Date:** 2026-03-06
**Status:** Approved

## Summary

Migrate all existing slash commands under a single `/theme-bot` namespace and add a `/theme-bot config channel` subcommand that lets admins pick the channel to rename via a Discord channel select menu. The `config` subcommand group is designed to be extended with future settings (e.g. `schedule`, `timezone`).

## Command Structure

```
/theme-bot themes              — Preview upcoming theme rotation (everyone)
/theme-bot add-theme           — Add a new theme via modal (admin)
/theme-bot rotate-now          — Immediately rotate to next theme (admin)
/theme-bot reload-config       — Reload config without restarting (admin)
/theme-bot config channel      — Set the channel to rename (admin) ← new
```

## Architecture

### `register-commands.ts`

Replace four individual `SlashCommandBuilder` entries with a single `/theme-bot` command using `.addSubcommand()` for flat commands and `.addSubcommandGroup()` for `config/*`.

### `src/commands/index.ts`

Update the router to resolve handlers by subcommand key:

- Flat subcommands: key = subcommand name (e.g. `themes`, `rotate-now`)
- Grouped subcommands: key = `group/subcommand` (e.g. `config/channel`)

Routing resolution:

```
subcommandGroup = interaction.options.getSubcommandGroup(false)
subcommand      = interaction.options.getSubcommand()
key             = subcommandGroup ? `${subcommandGroup}/${subcommand}` : subcommand
```

### `src/config.ts`

Add `saveConfig(config: Config): Promise<void>` using the atomic write pattern (write to `.tmp`, rename to final path) consistent with `state.ts` and `themes.ts`.

### `src/commands/config/channel.ts` (new)

1. Check admin permission via `requireAdmin()`
2. Reply ephemeral with a `ChannelSelectMenuBuilder` filtered to `GuildText` channels
3. Await component interaction with 5-minute timeout
4. Save new `channelId` via `saveConfig()`
5. Run `validatePermissions()` on the new channel and warn if permissions are missing
6. Edit reply to confirm: `"Channel set to #channel-name"`
7. On timeout: disable the select menu, prompt to run the command again
8. On save failure: reply with error, original `channelId` remains unchanged

### `src/index.ts`

Update `interactionCreate` handler to resolve the subcommand key from the `/theme-bot` interaction instead of using `interaction.commandName` directly.

## Data Flow

```
Admin: /theme-bot config channel
  → requireAdmin() check
  → reply ephemeral: channel select menu (text channels only)
Admin: selects a channel
  → saveConfig() — atomic write to config.json
  → validatePermissions() on new channel
  → edit reply: "Channel set to #channel-name" [+ permission warning if needed]

Timeout (5 min, no selection):
  → disable select menu component
  → edit reply: "Timed out. Run /theme-bot config channel to try again."

Save failure:
  → edit reply: "Failed to save. Check bot logs. Channel unchanged."
```

## Error Handling

| Scenario                             | Behaviour                                                  |
| ------------------------------------ | ---------------------------------------------------------- |
| Not an admin                         | Ephemeral: "You need Administrator permission"             |
| No channel selected within 5 min     | Disable menu, prompt to retry                              |
| `saveConfig()` throws                | Ephemeral error, original config unchanged                 |
| Bot lacks permissions in new channel | Save succeeds, ephemeral warning about missing permissions |

## Testing

- **Router** — Unit tests for subcommand key resolution; verify `config/channel` maps to the correct handler and unknown keys return `undefined`
- **`saveConfig()`** — Unit test with mocked `fs/promises` verifying atomic write (`.tmp` then rename)
- **`/theme-bot config channel` handler** — Discord-dependent; verified manually

## Future Extensions

The `config` subcommand group can be extended without restructuring:

- `/theme-bot config schedule` — update cron schedule
- `/theme-bot config timezone` — update timezone
- Multi-channel support would extend the data model (array of channel configs) and add a channel management subcommand group
