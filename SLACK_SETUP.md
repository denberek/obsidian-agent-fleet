# Slack Setup Guide

Connect your Agent Fleet agents to Slack so you can chat with them from your phone, desktop, or anywhere Slack runs.

---

## Prerequisites

Before you start, make sure you have:

- **Agent Fleet plugin** installed and running in Obsidian
- **At least one agent** configured in your fleet (the default Fleet Orchestrator works)
- **A Slack workspace** where you have permission to install apps (your own workspace or admin access)

---

## Part 1: Create the Slack App

### Step 1 — Create a new app

1. Go to **https://api.slack.com/apps**
2. Click **Create New App** → **From scratch**
3. **App Name:** `Agent Fleet` (or any name you prefer)
4. **Pick a workspace:** select the Slack workspace you want to use
5. Click **Create App**

### Step 2 — Enable Socket Mode

Socket Mode lets the bot connect to Slack via an outbound WebSocket — no public URL, no port forwarding, works behind any firewall or NAT.

1. In the left sidebar, click **Socket Mode**
2. Toggle **Enable Socket Mode** → ON
3. You'll be prompted to create an App-Level Token:
   - **Token Name:** `socket-token`
   - **Scope:** select `connections:write`
   - Click **Generate**
4. **Copy the `xapp-...` token** — this is your **App Token**. Save it somewhere safe, you won't see it again without regenerating.

### Step 3 — Enable Agents & AI Apps

This gives you the native "is thinking..." indicator and threaded assistant conversations.

1. In the left sidebar, click **Agents & AI Apps**
2. Click **Opt In** (or toggle ON)
3. Save

### Step 4 — Add Bot Token Scopes

1. In the left sidebar, click **OAuth & Permissions**
2. Scroll down to **Bot Token Scopes**
3. Click **Add an OAuth Scope** and add ALL of the following (one at a time):

| Scope | Purpose |
|-------|---------|
| `assistant:write` | Native "is thinking..." indicator and thread titles |
| `chat:write` | Send messages and replies |
| `commands` | Handle the `/agents` slash command |
| `im:history` | Read DM conversation history |
| `im:read` | Access DM metadata |
| `im:write` | Open DM conversations |
| `app_mentions:read` | Respond when @mentioned in channels |
| `reactions:write` | Add/remove emoji reactions (legacy, harmless to keep) |

### Step 5 — Subscribe to Bot Events

1. In the left sidebar, click **Event Subscriptions**
2. Toggle **Enable Events** → ON
3. Expand **Subscribe to bot events**
4. Click **Add Bot User Event** and add all four:

| Event | Purpose |
|-------|---------|
| `assistant_thread_started` | Detect new assistant conversations |
| `assistant_thread_context_changed` | Context switching (reserved for future use) |
| `message.im` | Receive DM messages |
| `app_mention` | Respond to @mentions in channels |

5. Click **Save Changes** at the bottom of the page

### Step 6 — Enable the Messages Tab

1. In the left sidebar, click **App Home**
2. Scroll to **Show Tabs**
3. Under **Messages Tab**, check: **Allow users to send Slash commands and messages from the messages tab**

### Step 7 — Register the /agents Slash Command

1. In the left sidebar, click **Slash Commands**
2. Click **Create New Command**
3. Fill in:
   - **Command:** `/agents`
   - **Short Description:** `List available agents`
   - **Usage Hint:** _(leave blank)_
4. Click **Save**

### Step 8 — Install the App to Your Workspace

1. In the left sidebar, click **Install App**
2. Click **Install to Workspace**
3. Review and approve the permission screen
4. **Copy the Bot User OAuth Token** (`xoxb-...`) — this is your **Bot Token**

You now have two tokens:
- **App Token** (`xapp-...`) from Step 2
- **Bot Token** (`xoxb-...`) from Step 8

---

## Part 2: Configure Agent Fleet

### Step 1 — Add Slack Credentials

1. Open Obsidian
2. Go to **Settings → Agent Fleet**
3. Scroll down to **Channel Credentials**
4. Under **Add a Slack credential:**
   - **Reference name:** `slack` (or any name — this is what your channel file will reference)
   - **Bot token:** paste your `xoxb-...` token
   - **App-level token:** paste your `xapp-...` token
5. Click **Add credential**

You should see the credential appear in the list above the form.

### Step 2 — Create a Channel

**Option A — Via the dashboard (recommended):**

1. Open the Agent Fleet dashboard
2. Click the **Channels** tab (last tab)
3. Click **+ New Channel**
4. Fill in:
   - **Name:** `my-slack`
   - **Type:** Slack (only option for now)
   - **Credential:** select the credential you just added
   - **Enabled:** ON
   - **Default agent:** pick which agent handles messages by default
   - **Allowed agents:** check the agents you want reachable via `@agent-name` prefix (leave unchecked for all)
   - **Per-user sessions:** ON (each Slack user gets their own Claude session)
   - **Allowed users:** enter your Slack user ID (see below how to find it)
   - **Channel context:** optionally add instructions like "Keep replies concise, use Slack formatting"
5. Click **Create Channel**

**Option B — Via markdown file:**

Create `_fleet/channels/my-slack.md` in your vault:

```yaml
---
name: my-slack
type: slack
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
enabled: true
credential_ref: slack
allowed_users:
  - U0AQW6P37N1
per_user_sessions: true
channel_context: |
  You are being contacted via Slack. Keep replies concise.
---
```

### Step 3 — Find Your Slack User ID

The `allowed_users` field requires Slack user IDs (not usernames). To find yours:

1. Open Slack
2. Click your **avatar** or **profile picture** (top-right on desktop, or tap your name on mobile)
3. Click **Profile**
4. Click the **⋯** (three dots / more) button
5. Click **Copy member ID**
6. You'll get something like `U0AQW6P37N1`

Paste this into the **Allowed users** field.

### Step 4 — Verify the Connection

1. Go to the **Channels** tab in the Agent Fleet dashboard
2. Your channel card should show a **green status dot** within a few seconds
3. Status should say **connected**

**If the status is red**, open the Obsidian developer console (`Cmd+Opt+I` on Mac, `Ctrl+Shift+I` on Windows) and check for error messages:

| Error | Fix |
|-------|-----|
| `invalid_auth` | Wrong token — double-check both tokens in Settings |
| `not_enabled_for_socket_mode` | Go back to api.slack.com → Socket Mode → make sure it's ON |
| `missing_scope` | A required scope is missing — check Step 4 of Part 1 |
| `no_permission` | App wasn't reinstalled after adding scopes — reinstall in api.slack.com |

---

## Part 3: Start Chatting

### Send Your First Message

1. Open **Slack**
2. Find your bot in the **Apps** section of the left sidebar (not Direct Messages — Agents & AI Apps moves the bot to Apps)
3. Click on the bot → click **New chat** to start an assistant thread
4. Type a message: `Hey, what can you do?`
5. You should see:
   - **"is thinking..."** indicator below the message composer
   - A reply from the agent within 5-30 seconds

### Switch Between Agents

If you configured multiple agents in `allowed_agents`, you can switch mid-conversation:

```
@site-monitor: check if example.com is up
```

The thread title updates to show the active agent. Each agent gets its own isolated Claude session — switching back and forth resumes where each left off.

### List Available Agents

Type `/agents` in Slack. An ephemeral message (only visible to you) lists all agents configured for this channel.

### Use the Bot in Channels

You can also invite the bot to Slack channels:

1. Go to a channel (e.g., `#monitoring`)
2. Type `/invite @Agent Fleet`
3. Now anyone in the channel can mention the bot: `@Agent Fleet check the deployment status`

---

## Troubleshooting

### Bot Doesn't Appear in Slack

- Make sure you completed Step 6 (Enable Messages Tab)
- The bot appears under **Apps** in the sidebar, not under **Direct Messages** (this is how Slack's Agents & AI Apps works)

### Messages Are Silently Dropped

- Check that your Slack user ID is in the `allowed_users` list
- Empty `allowed_users` means NO ONE can reach the bot — add at least one user ID

### "is thinking..." Indicator Doesn't Show

- Verify the `assistant:write` scope is added (Step 4 of Part 1)
- Make sure you **reinstalled the app** after adding scopes (Step 8)

### Bot Stops Working When Obsidian Closes

This is expected. The Slack bot runs inside Obsidian via Socket Mode — when Obsidian is closed, the bot goes offline. Slack buffers messages briefly (~1 minute) during disconnects.

### Token Rotation After Reinstall

Every time you reinstall the Slack app (required after scope changes), the **Bot Token (`xoxb-...`) rotates**. You must:
1. Copy the new bot token from api.slack.com → Install App
2. Update it in Obsidian → Settings → Agent Fleet → Channel Credentials (remove old, add new)

The **App Token (`xapp-...`) does NOT rotate** on reinstall — it stays the same.

### Multiple Obsidian Instances

If you run the plugin on two machines pointed at the same Slack app, one will get kicked off the Socket Mode connection. Only one instance can be active per app token.

---

## Heartbeat → Slack Delivery

You can configure agents to post their heartbeat results to Slack automatically:

1. Open the agent's edit page in the dashboard
2. Scroll to the **Heartbeat** section
3. Enable heartbeat and set a schedule
4. Set **Post to channel** to your Slack channel name (e.g., `my-slack`)
5. Write the heartbeat instruction
6. Save

Every time the heartbeat runs, the result is posted to the Slack channel as a DM to the first user in the allowed list, prefixed with the agent's name.

---

## Security Notes

- **Credentials** are stored in the plugin's `data.json` inside your vault's `.obsidian` folder. If you sync `.obsidian` across devices, credentials sync too. Do not commit this file to a public git repository.
- **Allowed users** is checked against Slack's cryptographically signed sender field (Socket Mode envelopes). It cannot be spoofed.
- **Agents with `approval_required`** cannot be bound to channels — they would deadlock because Slack has no approval UI.
- **Rate limiting** (default 20 messages per 5 minutes per conversation) protects against accidental or hostile budget burn.
