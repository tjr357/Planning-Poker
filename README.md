# DISCLAIMER
This is a prototype to fill in the gap that Planning Poker has left. 
Copilot was used for 100% of this prototype.

# Design Philosophy
One of the biggest benefits for using Planning Poker was the anonymity of the estimates which generated conversations. Otherwise I observed others would defer to the leads or to whomever spoke first.
This prototype is to give the same experience:
- All necessary information displayed from Jira
- Anonymous voting

Additionally I wanted this to be as simple as possible for my developers without having to learn a new system.

# Features

### Tested locally and passes
- Anonymous voting 
- Import Jira cards from a Jira filter
- Import Jira cards from CSV (formatting is important)
- Add Jira cards on the fly
- See previous vote when re-voting
- Extenisble to T-Shirt sizing and other estimating values
- Running tally of cards estimated in session

### WIP
- Teams bot (still need access to create one)
- Fix UI width
- Edit participants
- End session

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
# JIRA_ACCEPTANCE_CRITERIA_FIELD=customfield_10039
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
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Supabase setup (free tier):

1. Create a new project at Supabase.
2. In Project Settings -> API, copy:
  - Project URL -> `VITE_SUPABASE_URL`
  - `anon` public key -> `VITE_SUPABASE_ANON_KEY`
3. In Project Settings -> API -> Realtime, ensure Realtime is enabled.
4. Restart `npm run dev` after adding `.env` values.

Build for production:

```bash
npm run build
npm run preview
```

## 3) Host UI For Free On GitHub Pages (No Teams Bot Required)

This is the fastest path to let coworkers start testing immediately.

1. Enable GitHub Pages in your repository settings:
  - Settings -> Pages
  - Source: GitHub Actions
2. Push this branch (`host_in_github_spike`) to GitHub.
3. Wait for the workflow `Deploy Planning Poker UI to GitHub Pages` to finish.
4. Open the published app at:
  - `https://<org-or-user>.github.io/Planning-Poker/`

Manual deployment option (from `planning-poker-ui/`):

```bash
npm run deploy
```

Notes:
- The current hosted UI is great for immediate UX testing.
- Real-time shared voting is available in the hosted UI when Supabase env vars are configured.
- To use realtime on GitHub Pages, add repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so the build can inject them.
- To load Jira details from the hosted UI, add `VITE_API_BASE_URL` (for example `https://your-api-host.onrender.com`) so the frontend can call `/api/jira/...` on a reachable backend.
- If the hosted app uses `https://`, `VITE_API_BASE_URL` must also be `https://`.
- Teams bot integration can be added later when bot registration access is available.

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
- There is a certificate that you will need in order to hit the corporate version of Jira. If you see "failed fetch" and a 404 in the console when getting tickets via filters, this cert needs to be made
  - If you can't make the cert, you can run the following command `$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"` in the root directory of the project and it will ignore the lack of certs. This is very insecure, so should ONLY be used for local development, never deployment

## License

Internal project. 
