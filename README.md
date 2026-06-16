# 🧠 Second Brain v4

A personal knowledge base that's better than Obsidian — because it lives in the cloud, works on every device, has built-in AI that knows your notes, and costs $0/month.

## What's in v4
- 🎨 **Clean light theme** — warm off-white, Inter font, large readable text
- 📁 **Folders** — create, rename, delete, move notes between folders
- 🏷️ **Tags** — write `#tag` anywhere, click to filter notes
- 🕸️ **Knowledge graph** — D3 force graph, nodes glow, click to navigate
- 🎙️ **Voice input** — speak and text appears in your note (Chrome/Android)
- 📋 **Templates** — Meeting, Goals, Ideas, Project, Journal, Weekly Review
- ✅ **Checklists** — `- [ ] task` renders as interactive checkboxes
- 🔗 **Backlinks** — Preview mode shows all notes that link to this one
- 📤 **Export** — download any note or all notes as markdown
- 📱 **Mobile** — slide-in sidebar, bottom navigation bar
- 🤖 **AI Chat** — OpenRouter key gives access to ALL these models:
  - **Free:** Llama 3.1, Hermes 3, DeepSeek R1, Gemma, Mistral
  - **Via OpenRouter (paid):** Claude 3.5 Sonnet, GPT-4o, GPT-4 Turbo
- ☁️ **GitHub sync** — all notes in your private `second-brain-notes` repo
- 🔧 **Browser fix** — reset.html clears stuck sessions

## Deploy

```bash
npm install
node generate-icons.js
git add .
git commit -m "v4"
git push
```

Vercel auto-redeploys. Env vars stay the same.

## AI Models (all via one OpenRouter key)

Get a free key at **openrouter.ai/keys** — no credit card needed.

| Model | Type | Best for |
|---|---|---|
| Llama 3.1 8B | Free | Fast answers |
| Hermes 3 405B | Free | Smart reasoning |
| DeepSeek R1 | Free | Deep analysis |
| Gemma 3 12B | Free | Balanced |
| Claude 3.5 Sonnet | Paid via OR | Best quality |
| GPT-4o | Paid via OR | OpenAI's best |

## Reset URL
```
https://your-app.vercel.app/reset.html
```

## Tech Stack
- React 18 + Vite + D3.js + Inter font
- GitHub OAuth + GitHub API (private repo)
- OpenRouter (all AI models via one key)
- Web Speech API (voice input)
- Vercel (hosting + 2 serverless functions)
- **$0/month total cost**
