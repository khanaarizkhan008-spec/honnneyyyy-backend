# Honnnneyyyy — Backend API

> *Short, sweet, and totally fake? Let's check the receipts.*

The backend API for **Honnnneyyyy** — an anti-honey-trap, catfishing, and romance/sextortion companion. Runs seamlessly on **Cloudflare Workers** (`src/worker.js`) and **Node.js / Express** (`server.js`), powered by Google Gemini with a built-in deterministic heuristic fallback.

**Live Worker:** `https://honnnneyyyy-backend.khanaarizkhan008.workers.dev`

---

## Features

- **Dual Runtime:** Same business logic (`src/geminiService.js` + `src/heuristicFallback.js`) runs on Cloudflare Workers (`wrangler`) and local Node/Express (`server.js`).
- **Automatic Gemini Model Fallback:** Tries `gemini-3-flash-preview` → `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite` → `gemini-3.1-pro-preview` → `gemini-flash-latest` → `gemini-flash-lite-latest` with `BLOCK_ONLY_HIGH` safety settings so real extortion/blackmail DMs can be decoded without API refusals.
- **Zero-Downtime Heuristic Fallback:** If `GEMINI_API_KEY` is missing or upstream models are rate-limited, falls back cleanly to `src/heuristicFallback.js`.
- **Zero-Persistence Privacy:** No user DMs, screenshots, or chat transcripts are stored.

---

## Project Structure

```text
backend/
├── src/
│   ├── worker.js             # Cloudflare Workers fetch entrypoint
│   ├── geminiService.js      # Gemini API client + model fallback chain
│   └── heuristicFallback.js  # Local pattern & sweetener-score engine
├── server.js                 # Local Node/Express server
├── wrangler.jsonc            # Cloudflare Workers configuration
├── .env.example              # Environment variable template
└── package.json
```

---

## API Endpoints

### `GET /api/health`
Health check and AI configuration status.

```json
{
  "ok": true,
  "aiConfigured": true,
  "runtime": "cloudflare-workers"
}
```

### `POST /api/check`
Evaluates a pasted DM, locally-OCR'd screenshot text, or suspicious link.

**Request:**
```json
{
  "content": "Hey babe, move to Telegram right now and keep us secret.",
  "mode": "paste"
}
```

**Response:**
```json
{
  "sweetener_score": 92,
  "verdict_headline": "Pure artificial sweetener, bestie.",
  "costar_roast": "He doesn't want your heart, bestie—he wants your Telegram and your UPI.",
  "bestie_note": "...",
  "flagged_phrases": [{ "quote": "...", "tactic": "...", "margin_note": "..." }],
  "sugared_vs_raw": [{ "sweet_line": "...", "hidden_meaning": "..." }],
  "risk_level": "high",
  "source": "gemini"
}
```

### `POST /api/rescue-reply`
Generates calm, zero-shame stalling or exit replies for the Golden-Hour Rescue Companion.

**Request:**
```json
{
  "situation": "talking",
  "question": "They're asking why I stopped replying—what do I say?"
}
```

**Response:**
```json
{
  "reply": "..."
}
```

---

## Local Development

### Option A: Cloudflare Workers (`wrangler dev`)
```bash
npm install
cp .env.example .dev.vars
# Add your GEMINI_API_KEY in .dev.vars
npm run cf:dev
```

### Option B: Node.js + Express
```bash
npm install
cp .env.example .env
# Add your GEMINI_API_KEY in .env
npm run dev
```

---

## Deploy to Cloudflare Workers

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run cf:deploy
```
