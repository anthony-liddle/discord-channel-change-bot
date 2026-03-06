# Discord Channel Theme Rotator Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg)](https://discord.js.org/)

A Discord bot that automatically renames a designated channel on a weekly schedule, rotating through a list of predefined themes.

## Features

- Automatic weekly channel renaming on a cron schedule
- Custom announcement message per theme (posted when rotation occurs)
- Persists state across restarts (won't reset to the first theme)
- Slash commands to preview themes and trigger manual rotation
- Hot-reload config without restarting
- Permission validation at startup
- Graceful shutdown handling

## Setup Instructions

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Go to the **Bot** section and click **Add Bot**
4. Under **Privileged Gateway Intents**, you don't need any special intents for this bot
5. Copy the **Bot Token** (click "Reset Token" if you don't see it)
6. Go to **OAuth2 > General** and copy the **Client ID**

### 2. Invite the Bot to Your Server

1. Go to **OAuth2 > URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions:
   - `Manage Channels` (required for renaming)
   - `Send Messages` (required for announcement messages)
   - `View Channels` (required to see the channel)
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### 3. Configure the Bot

1. Copy the example files:

   ```bash
   cp .env.example .env
   cp config.example.json config.json
   ```

2. Edit `.env` with your credentials:

   ```
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   ```

3. Edit `config.json`:

   ```json
   {
     "channelId": "123456789012345678",
     "schedule": "0 9 * * 1",
     "timezone": "America/New_York"
   }
   ```

4. Edit `themes.json` (created on first startup):

   ```json
   {
     "themes": [
       {
         "name": "weekly-movies",
         "message": "This week's theme is **Movies**! Share your favorites!"
       },
       {
         "name": "weekly-music",
         "message": "This week's theme is **Music**! What are you listening to?"
       },
       {
         "name": "weekly-games",
         "message": "This week's theme is **Games**! What are you playing?"
       }
     ]
   }
   ```

   Each theme has:
   - `name`: The channel name (Discord channel naming rules apply - lowercase, no spaces)
   - `message`: The announcement posted when this theme becomes active (supports Discord markdown)

#### Getting the Channel ID

1. Enable Developer Mode in Discord (User Settings > App Settings > Advanced > Developer Mode)
2. Right-click the channel you want to rename
3. Click "Copy Channel ID"

#### Cron Schedule Format

The schedule uses standard cron syntax: `minute hour day month weekday`

Examples:

- `0 9 * * 1` - Every Monday at 9:00 AM
- `0 0 * * 0` - Every Sunday at midnight
- `0 12 * * 5` - Every Friday at noon
- `30 18 * * 3` - Every Wednesday at 6:30 PM

### 4. Install Dependencies and Run

Requires Node.js >= 16.11.0.

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Register slash commands (only needed once, or when commands change)
pnpm register

# Start the bot
pnpm start
```

## Slash Commands

| Command          | Description                              | Permission    |
| ---------------- | ---------------------------------------- | ------------- |
| `/themes`        | Preview the next 5 upcoming themes       | Everyone      |
| `/add-theme`     | Add theme to list of rotations via modal | Administrator |
| `/rotate-now`    | Immediately rotate to the next theme     | Administrator |
| `/reload-config` | Reload config.json without restarting    | Administrator |

## File Structure

```
discord-channel-change-bot/
├── src/
│   ├── index.ts              # Entry point: client setup, event handlers, shutdown
│   ├── config.ts             # Config loading, caching, and validation
│   ├── state.ts              # State persistence (async I/O, atomic writes)
│   ├── scheduler.ts          # Cron job management
│   ├── rotation.ts           # Theme rotation logic
│   ├── types.ts              # Shared interfaces
│   └── commands/
│       ├── index.ts          # Command router
│       ├── themes.ts         # /themes handler
│       ├── rotate-now.ts     # /rotate-now handler
│       └── reload-config.ts  # /reload-config handler
├── register-commands.ts      # Slash command registration script
├── config.json               # Your configuration (create from example)
├── config.example.json       # Example configuration
├── themes.json               # Auto-generated on startup, tracks themes array
├── state.json                # Auto-generated, tracks current theme index
├── .env                      # Your secrets (create from example)
├── .env.example              # Example environment variables
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## Extending the Bot

### Multiple Channels

To support multiple channels, modify `config.json`:

```json
{
  "channels": [
    {
      "channelId": "123456789",
      "themes": [
        { "name": "theme-a", "message": "Welcome to Theme A!" },
        { "name": "theme-b", "message": "Welcome to Theme B!" }
      ],
      "schedule": "0 9 * * 1"
    },
    {
      "channelId": "987654321",
      "themes": [
        { "name": "other-a", "message": "Other channel, Theme A!" },
        { "name": "other-b", "message": "Other channel, Theme B!" }
      ],
      "schedule": "0 12 * * 3"
    }
  ]
}
```

Then modify `src/index.ts` to iterate over channels and create separate cron jobs.

### Multiple Servers

The bot already works across multiple servers. Just:

1. Invite it to each server
2. Add multiple channel configs (as shown above)
3. Ensure the bot has `Manage Channels` and `Send Messages` permissions in each server

### Database Storage

For production deployments, consider replacing the JSON file storage with:

- SQLite (via `better-sqlite3`)
- Redis (via `ioredis`)
- PostgreSQL (via `pg`)

### Running with PM2

For production, use PM2 to keep the bot running:

```bash
npm install -g pm2
pm2 start dist/src/index.js --name "theme-bot"
pm2 save
pm2 startup
```

## Troubleshooting

### Bot can't rename channel

- Ensure the bot has `Manage Channels` permission
- Check that the bot's role is positioned above the channel in the role hierarchy
- Verify the channel ID is correct

### Announcement message not posting

- Ensure the bot has `Send Messages` permission in the channel
- Check the console logs for error messages

### Commands not appearing

- Global commands can take up to 1 hour to propagate
- Try restarting Discord
- Ensure you ran `pnpm register`

### Schedule not triggering

- Check your timezone setting matches your expectations
- Verify the cron expression is valid at [crontab.guru](https://crontab.guru/)

## Rate Limits

Discord limits channel renames to 2 per 10 minutes. The weekly schedule respects this limit, but be careful with manual rotations using `/rotate-now`.

## License

MIT
