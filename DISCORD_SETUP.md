# Discord Setup Guide

Connect your Agent Fleet agents to Discord so you can chat with them from your phone, desktop, or anywhere Discord runs — in servers, channels, threads, or DMs.

---

## Prerequisites

Before you start, make sure you have:

- **Agent Fleet plugin** installed and running in Obsidian
- **At least one agent** configured in your fleet (the default Fleet Orchestrator works)
- **A Discord server** where you have permission to add bots (your own server or admin access)

---

## Part 1: Create the Discord Application

### Step 1 — Create a new application

1. Go to **https://discord.com/developers/applications**
2. Click **New Application**
3. **Name:** `Agent Fleet` (or any name you prefer)
4. Accept the terms and click **Create**

### Step 2 — Create the bot and copy its token

1. In the left sidebar, click **Bot**
2. Click **Reset Token** (or **Add Bot** on older UIs) and confirm
3. **Copy the token** — this is your **Bot Token**. Save it somewhere safe; you won't see it again without resetting.

### Step 3 — Enable the Message Content intent (required)

The bot can't read message text without this privileged intent.

1. Still on the **Bot** page, scroll to **Privileged Gateway Intents**
2. Toggle **Message Content Intent** → ON
3. Save changes

> If you skip this, the bot connects but every message arrives with empty text, and the Gateway may close with error code `4014`. The plugin logs a clear hint in the console when this happens.

### Step 4 — Invite the bot to your server

1. In the left sidebar, open **OAuth2 → URL Generator**
2. Under **Scopes**, check:
   - `bot`
   - `applications.commands` (for the `/agents` slash command)
3. Under **Bot Permissions**, check:
   - **Send Messages**
   - **Send Messages in Threads**
   - **Read Message History**
   - **Use Slash Commands**
4. Copy the generated URL at the bottom, open it in your browser, pick your server, and click **Authorize**.

---

## Part 2: Configure Agent Fleet

### Step 5 — Add the credential

1. In Obsidian, open **Settings → Agent Fleet → Channel Credentials**
2. Under **Add a channel credential**:
   - **Reference name:** `discord-creds` (any name; referenced by `credential_ref` in the channel file)
   - **Type:** `Discord`
   - **Bot token:** paste the token from Step 2
3. Click **Add credential**

### Step 6 — Create the channel

1. Open the Agent Fleet dashboard → **Channels** → **New Channel**
2. Fill in:
   - **Name:** e.g. `my-discord`
   - **Type:** `discord`
   - **Credential:** `discord-creds`
   - **Default agent:** the agent to use when no `@agent-name` prefix is given
   - **Allowed agents:** (optional) the agents reachable via `@agent-name` or `/agents`
   - **Allowed users:** your numeric Discord user ID(s), one per line. Only listed users can reach the bot. (Enable Developer Mode in Discord → right-click your name → **Copy User ID**.)
3. Save. The channel should show **connected** in the dashboard within a few seconds.

---

## Using it

- **Mention or DM the bot.** In a server channel, `@Agent Fleet do the thing` (or just message it in a DM).
- **Pick an agent per conversation.** Prefix a message with `@agent-name ...`, or run the **`/agents`** slash command and click a button. The choice sticks for that channel/thread until you change it.
  - Global slash commands can take up to ~1 hour to appear the first time after the bot joins.
- **Threads and channels are isolated.** Each channel or thread keeps its own conversation and agent binding.
- **Images.** Attach an image and the agent receives it (saved into your vault).
- **Long replies** are automatically split to fit Discord's 2000-character limit.
- **Heartbeats.** If an agent's `heartbeatChannel` points at this Discord channel, the heartbeat result is delivered as a DM to the first allowed user.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Channel stuck on **needs-auth** | Check the bot token; ensure the **Message Content intent** is enabled (Step 3). |
| Bot replies but ignores your text / empty messages | Message Content intent is off — enable it and reconnect. |
| `/agents` command missing | Global commands can take up to ~1h to propagate; ensure the bot was invited with the `applications.commands` scope. |
| Bot doesn't respond at all | Confirm your numeric user ID is in **Allowed users**, and the bot has Send Messages / Read Message History in that channel. |
