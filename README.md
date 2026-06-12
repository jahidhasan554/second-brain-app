# 🧠 Second Brain

Your personal knowledge base — notes, daily journal, knowledge graph, voice input, and AI chat. All data lives in your private GitHub repo.

---

## Features

| Feature | Details |
|---|---|
| 📝 Notes + Daily Journal | Markdown editor, auto daily note every day |
| 🕸️ Knowledge Graph | D3 force graph — link notes with `[[Note Title]]` |
| 🎙️ Voice Input | Speak → text (Web Speech API, Chrome/Android) |
| 🔍 Search | Full-text + date range filter |
| 🤖 AI Chat | Ask questions about your notes (OpenRouter free models) |
| ☁️ GitHub Sync | All notes saved to your private repo (`second-brain-notes`) |
| 📱 PWA | Install on Android / iOS / Desktop |

---

## Deploy in 4 Steps

### Step 1 — Create a GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** Second Brain
   - **Homepage URL:** `https://your-app.vercel.app` *(update after deploy)*
   - **Authorization callback URL:** `https://your-app.vercel.app/api/auth/callback`
4. Click **Register application**
5. Copy **Client ID** and generate a **Client Secret** — save both

---

### Step 2 — Deploy to Vercel

```bash
# 1. Clone / download this project
cd second-brain

# 2. Install dependencies
npm install

# 3. Push to GitHub (create a new repo first)
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/second-brain-app.git
git push -u origin main

# 4. Go to vercel.com → New Project → Import your repo → Deploy
```

---

### Step 3 — Add Environment Variables in Vercel

In your Vercel project dashboard → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `GITHUB_CLIENT_ID` | Your OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Your OAuth App Client Secret |
| `APP_URL` | `https://your-app.vercel.app` |

After adding variables, **redeploy** the project.

---

### Step 4 — Update the GitHub OAuth App

Go back to your GitHub OAuth App settings and update:
- **Homepage URL** → your actual Vercel URL
- **Callback URL** → `https://your-app.vercel.app/api/auth/callback`

---

## First Launch

1. Open your Vercel URL
2. Click **Sign in with GitHub**
3. Authorize the app
4. A private repo called `second-brain-notes` is created automatically
5. Today's daily note is created — start writing!

---

## How Notes Are Stored

All notes live in your GitHub repo `second-brain-notes` as a single file:

```
second-brain-notes/
└── notes.json    ← all your notes (synced every 2.5 seconds)
```

You own your data completely. You can read it directly on GitHub, clone it, or migrate it anytime.

---

## AI Chat Setup

1. Click the **🤖 AI** tab
2. Click **Add API Key**
3. Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys)
4. Paste your key → Save

Free models available:
- **Llama 3.1 8B** — Fast, good for quick questions
- **DeepSeek R1** — Best reasoning, great for analysis
- **Gemma 3 12B** — Balanced
- **Mistral 7B** — Lightweight

---

## PWA Installation

**Android (Chrome):** Menu → "Add to Home Screen"  
**iPhone (Safari):** Share → "Add to Home Screen"  
**Desktop (Chrome/Edge):** Address bar → Install icon

---

## Local Development

```bash
npm install
npm run dev
```

For OAuth to work locally, update your GitHub OAuth App callback URL to:
`http://localhost:5173/api/auth/callback`

And set in a `.env` file:
```
GITHUB_CLIENT_ID=your_id
GITHUB_CLIENT_SECRET=your_secret
APP_URL=http://localhost:5173
```

---

## Tech Stack

- **Frontend:** React 18 + Vite + D3.js
- **Storage:** GitHub API (private repo)
- **Auth:** GitHub OAuth 2.0
- **AI:** OpenRouter (free models)
- **Voice:** Web Speech API (browser built-in)
- **Hosting:** Vercel (free)
- **PWA:** vite-plugin-pwa

**Total monthly cost: $0** (all free tiers)
