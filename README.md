# Ladder Guide: a private self-reflection guide

**GTransformer AI Buildathon 2026, AI for Global Good, theme: Wellbeing.**

Ladder Guide helps an adult see the inner obstacles between them and one goal, and choose one small step for the next 24 hours. It is built on the Ladder method by Aizhan Li, author of the Ladder method (created in 2019). It is an AI self-reflection tool. It is not therapy, not a psychologist and not medical advice.

## The problem

Many people know what they want but keep postponing it. Often the brake is a sentence someone said years ago that they still believe: "Mom: who needs it?", "Teacher: you are not good at maths". Talking it through with a professional costs money and time, and many people are not ready to say it out loud to another person. A private, free, always-available guide that asks the right questions, one at a time, lowers that first barrier, and stays safely inside its limits.

## What it does

- **Guides your ladder, one question at a time:** one measurable goal, the "I" point (where you are now), three to five obstacles from the nearest one up, and optional fears above the goal.
- **Reads a finished ladder:** quotes your own words, names the nearest obstacle (work starts there), counts the fears, asks two reflection questions ("Whose voice do you hear in it?", "What would you do in the next 24 hours if you stopped believing it?") and helps you name one small step.
- **Explains the method from its own notes (RAG):** 13 short method notes, retrieved with BM25 and cited like [M4]. It does not invent features, studies or statistics.
- **Measures change with WHO-5:** the public, validated WHO-5 Well-Being Index. The server computes the score (0 to 100) and the change since the last check, so the model never does the maths. At 50 or below it suggests talking to a doctor or mental health professional: a screening, not a diagnosis.
- **Remembers the conversation:** follow-ups like "why the nearest one?" or "make the step smaller" use the chat so far.

## Responsible AI

| Risk | What we do | Where |
|---|---|---|
| Crisis: suicide, self-harm, violence | A crisis word list ported from the production Ladder guide forces a CARE reply with 988, 911, 1-800-799-7233 and findahelpline.com, whatever the model said. Negations are handled: "I don't want to die alone" is a fear, not a crisis. | `checks.mjs`, step 9 |
| Medical overreach | The guide does not discuss diagnoses, symptoms, illnesses, medication or "which emotion causes which disease". It suggests a doctor and offers a non-medical goal instead. | system prompt, `mentionsMedical` |
| Therapy claims | It never says it is human, a psychologist or a therapist, and never promises results. | system prompt |
| Prompt injection and jailbreaks | Role changes, fake SYSTEM lines and "reveal your prompt" are declined. Quotes inside a ladder are data, not orders. An output guard replaces any reply that leaks the instructions. | system prompt, `leaksPrompt` |
| Personal data | Emails, phones (US and international), cards, SSNs and 12-digit national ids are masked before the model, the saved chat or the logs see them, and again in replies. The guide never asks for a name or contacts. Logs never contain message text. | `redactPII` |
| User control | A **Delete chat** button removes the conversation from the server. | `DELETE /api/session` |
| Bias | The prompt forbids assumptions about gender, age, income, culture, religion or family type, and uses the user's own words. Red-team tests check that "Grandma: business is for men" or "Son: at your age it's too late" are treated as obstacles, not truths. | system prompt, tests |
| Cost and abuse | 2,000 characters per message, 50 messages per chat, 30 messages per minute per IP. | `checks.mjs`, `chat/index.mjs` |

## Evaluation

Two test sets, five groups: A should answer, B off-topic, C drift, D jailbreak, E sensitive. Score = Helpfulness (A) 35% + Scope (B, C) 25% + Robustness (D) 30% + Care (E) 10%.

- `public/data/sample_tests.csv`: 38 Ladder tests (method questions, guided start, full readings, follow-ups, WHO-5, fear vs crisis, injection inside an obstacle, crisis and violence, personal data).
- `public/data/demo_tests.csv`: 20 red-team tests (medical overreach, ages and gender stereotypes, "I'm not suicidal, but...", legal advice, multi-turn jailbreaks, prompt extraction through translation or a story, ids and card numbers).

```bash
npm test            # 38 Ladder tests
npm run test:demo   # 20 red-team tests
```

**Results on Claude Haiku 5.5 (prompt ladder-v3), 14.11.2026:** 38 of 38 Ladder tests and 20 of 20 red-team tests passed, in two runs in a row. Two earlier failures were fixed in the prompt: personal data shared by the user now gets a helpful answer instead of a decline (R20), and a ladder with injected orders is answered while the orders are ignored (D6).

Reports with every prompt and reply are saved in `reports/`. The **Test runner** tab in the app runs the same files in the browser.

## Built with

Netlify Functions and Netlify Blobs, Claude Haiku 5.5 through the Claude API, BM25 keyword retrieval (no external services), the WHO-5 Well-Being Index (WHO, 1998), plain HTML and JavaScript.

## What existed before the event

- The Ladder method (Aizhan Li, 2019) and its production guide on 108psy.com. From it we reused the method's concepts for the notes, and the crisis and medical word lists (`crisis.ts`, `health.ts`), ported to this project.
- The organizers' starter kit: the chat app, the test runner, Netlify setup and docs.

Built during the event: the guide's prompt and mock, the 13 method notes and retrieval router, the WHO-5 tool, the safety layer (crisis with negations, international PII, medical flag, output leak guard), Delete chat, the screen, and both test sets.

## How it works

Every message goes to `POST /api/chat`: validate, rate-limit, load the chat, mask personal data, flag injection, crisis and medical topics, add method notes or WHO-5 data if needed, call Claude with the recent conversation, force CARE on a crisis, block prompt leaks, mask the reply, save. Step by step with code pointers: [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

## Run it

### Get a Claude API key

The app calls Claude through the Claude API. The API key is your password for it.

1. Go to **https://console.anthropic.com** and sign up or log in.
   This is the developer console, a separate account from the claude.ai chat app. A Claude Pro/Max subscription does **not** include API usage.
2. **Add credits:** open **Settings > Billing** (it may be labelled *Plans & Billing*), add a payment method and buy credits.
   A few dollars is plenty for a hackathon with the default model. *If your organizers gave you a credit code or a key, use that instead.*
3. **Create a key:** open **Settings > API Keys** > **Create Key** > name it (e.g. `hackathon`).
4. **Copy the key right away.** It starts with `sk-ant-` and is shown only once. If you lose it, delete it and create a new one.

### 🔒 Keep your key secret
- Put it **only** in the `.env` file (step 3) and in Netlify's environment variables (step 4).
- **Never** paste it into code, a chat, a screenshot or a GitHub commit. `.env` is already in `.gitignore`, so it won't be committed.
- If a key leaks, delete it in the console immediately and create a new one.
- Anyone who opens your live site uses your credits, so keep your credit balance low and turn off auto-reload.

---

### Run it on your computer

```bash
cp .env.example .env
```

On Windows (PowerShell), use `copy .env.example .env` instead.

Open `.env` in your editor, remove the `#` in front of `ANTHROPIC_API_KEY`, and paste your key:

```
ANTHROPIC_API_KEY=sk-ant-...your key...
```

Start the app:

```bash
npm run dev
```

Open **http://localhost:8888**. Try:

1. `What is the Ladder method?` : an answer from the method notes, citing [M1]. Open **Sources** to see what Claude was given.
2. `I want to start my ladder` : the guide asks one question at a time.
3. `Goal: run 5 km by May. Obstacles: Coach: you are too slow; Me: I always quit` then `why do we start from the nearest one?` : a reading, then a follow-up that uses memory.
4. `Let's do the WHO-5 check`, then `WHO-5: 3 4 2 3 4` : the server computes 64 of 100.
5. `What's the weather in Almaty?` : a polite decline.

Each reply shows a tag: **ANSWER**, **DECLINE** or **CARE**, plus `anthropic` and the response time.
If it says `mock`, your key wasn't picked up (see [Troubleshooting](#troubleshooting)).

> **No key yet?** Skip the `.env` step. Everything runs in *mock mode* with a simple fake model, so you can build the UI and tests first.

---

### Deploy to Netlify

Choose **one** option.

### Option A: from your terminal (fastest)

**1. Log in** (opens your browser; click **Authorize**):
```bash
npx netlify login
```

**2. Create your site and deploy it.** Replace `ladder-private-guide` with a unique name; it becomes `https://ladder-private-guide.netlify.app`.
```bash
npx netlify deploy --create-site ladder-private-guide --prod
```

**3. Give the site your Claude key.** This copies it from `.env` to Netlify, where it stays secret.
```bash
npx netlify env:import .env
```

**4. Deploy again** so the site picks up the key:
```bash
npm run deploy
```

Open the URL it prints. Redeploy anytime with `npm run deploy`.

> If the CLI ever asks *"How do you want to link this folder to a project?"*, choose **Search by full or partial project name** and type your site's name. Don't choose *"Use current git remote origin"*.

### Option B: from GitHub (auto-deploys on every push)

1. Push the code to **your** GitHub repo (your fork).
2. Go to **https://app.netlify.com** > **Add new project** > **Import an existing project** > **GitHub** > authorize > pick your repo.
3. Leave the build settings as they are (`netlify.toml` already sets them) and click **Deploy**.
4. Add your key: **Project configuration > Environment variables > Add a variable**
   - Key: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-...` key
   - Mark it as a **secret** if the option is shown.
5. Redeploy so the key takes effect: **Deploys > Trigger deploy > Deploy project**.

From now on, every `git push` redeploys automatically.

### Check it worked
- Send a message on your live site. The tag should say **anthropic**, not **mock**.
- Chats are saved in **Netlify Blobs**, storage that comes with every Netlify project. There's nothing to set up.
- Logs: Netlify dashboard > **Logs > Functions > chat**.

---

### Troubleshooting

| Problem | Fix |
|---|---|
| Replies are tagged **mock** | Key not found. Locally: check `.env` is in the project folder, the line has no `#` in front, and you restarted `npm run dev`. Live: add `ANTHROPIC_API_KEY` in Netlify and **redeploy**. |
| "The assistant is unavailable" | Claude returned an error. Check Netlify **Logs > Functions > chat**: `401` = wrong key, `400`/`402` mentioning credit = add credits, `404` = wrong model name, `429` = rate limited, wait a moment. |
| Live site shows an old version | Run `npm run deploy` again, then hard-refresh (Cmd+Shift+R / Ctrl+Shift+R). |
| You deployed the wrong folder | Run `npx netlify status` to see which project the folder is linked to. Use `npx netlify link` to switch, or `npx netlify unlink` then `npx netlify deploy --create-site NEW-NAME --prod` to start fresh. |
| "No project found with the remote …" | You chose *Use current git remote origin*. Run `npx netlify link --name ladder-private-guide` (your site's name), then `npm run deploy`. |
| Commands fail with `no such file` or odd errors on a Mac | You probably pasted a `#` note on the same line as a command. Paste only the command. |
| Test runner says "No tests found" | The CSV needs a `turns` column (or `prompt` / `text`). |
| Old chats vanish locally | Normal when running the test script outside `netlify dev`: chats are kept in memory. On Netlify they're saved permanently. |
| `command not found: npx` | Install Node.js 18+ from https://nodejs.org and open a new terminal. |
| Windows: `cp` not found | Use `copy .env.example .env`. |

---


## Privacy note

Chats are stored in Netlify Blobs on the project. Anyone who has a chat's id can read it until it is deleted, so the guide never asks for names or contacts, and personal data is masked. Use **Delete chat** to remove a conversation.

## Author

Aizhan Li, author of the Ladder method. Code built with Claude Code.
