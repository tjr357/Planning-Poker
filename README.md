# DISCLAIMER
This is a prototype to fill in the gap that Planning Poker has left. 
Copilot was used for 100% of this prototype.

# Planning Poker for Microsoft Teams

Planning Poker app with:

- A Teams bot for chat-driven estimation rounds
- A Teams tab/web UI for interactive voting
- Local simulation and smoke-test scripts for rapid validation

## Project Structure

- `bot.js` - Core bot logic and command handling
- `index.js` - Bot server entry point (`/api/messages`, `/health`)
- `chat.js` - Interactive local terminal chat with the bot
- `multi-user-sim.js` - Multi-user local simulation
- `smoke-test.js` - Basic end-to-end bot smoke test
- `manifest.json` - Microsoft Teams app manifest
- `planning-poker-ui/` - React + Vite frontend

## Prerequisites

- Node.js 18+ (recommended)
- npm
- Azure Bot registration (for Teams integration)
- Optional: Jira cloud credentials for `/poker jira` and filter imports

## 1) Run The Bot Locally

Install dependencies from the repository root:

```bash
npm install botbuilder express body-parser dotenv
```

Create a `.env` file in the root:

```env
MicrosoftAppId=your_bot_app_id
MicrosoftAppPassword=your_bot_app_password
PORT=3978

# Optional Jira integration
JIRA_BASE_URL=https://yourorg.atlassian.net
JIRA_BEARER_TOKEN=your_token
# OR
# JIRA_EMAIL=you@company.com
# JIRA_API_TOKEN=your_api_token
```

Start the bot server:

```bash
node index.js
```

Health check:

```bash
curl http://localhost:3978/health
```

## 2) Run The Frontend (React + Vite)

```bash
cd planning-poker-ui
npm install
npm run dev
```

Optional frontend env (`planning-poker-ui/.env`):

```env
VITE_API_BASE_URL=http://localhost:3978
```

Build for production:

```bash
npm run build
npm run preview
```

## Local Bot Testing (No Teams Required)

Interactive single-user REPL:

```bash
node chat.js
```

Multi-user simulation:

```bash
node multi-user-sim.js
node multi-user-sim.js --story "PROJ-123" --users 6 --reveal
```

Smoke test:

```bash
node smoke-test.js
```

## Bot Commands

- `/poker help`
- `/poker start [story title]`
- `/poker vote <value>`
- `/poker reveal`
- `/poker next [story title]`
- `/poker load`
- `/poker status`
- `/poker deck`
- `/poker add <value>`
- `/poker jira <ISSUE-123>`
- `/poker end`

## Teams App Setup Notes

- Update placeholder values in `manifest.json`:
  - `YOUR-DOMAIN`
  - `YOUR-BOT-APP-ID-HERE`
  - developer URLs and metadata
- Host tab content and bot endpoint on HTTPS for Teams usage.
- Ensure `contentUrl`/`websiteUrl` in the manifest point to your deployed tab route.

## Known Limitations

- Session state is currently in-memory (`Map` in `bot.js`), so state resets on restart.
- For production, replace in-memory storage with a persistent store (Redis/Cosmos DB/etc.).

## License

Internal project. 
