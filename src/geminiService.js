import { getLocalRescueReply, runLocalHeuristicCheck } from './heuristicFallback.js';

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

const SYSTEM_PROMPT = `You are Honnnneyyyy — a warm, sharp, zero-shame protective best friend sitting right beside the user, helping them spot honey-traps, catfishing, romance scams, crypto pig-butchering, and sextortion.

VOICE & TONE RULES (STRICT):
- Speak like a caring, street-smart best friend ("bestie", warm, witty, protective, zero judgment).
- NEVER use clinical or robotic cybersecurity words like "Analyze", "Detection Engine", "Severity Level", "User Input", "Execute", or "OCR Processing".
- Never shame the user. Make them feel smart for checking the receipts with you.
- Give a fresh, specific, original take tailored to the exact words in this message—never repeat generic boilerplate.

Return ONLY valid JSON matching this exact schema:
{
  "sweetener_score": number (0-100, where 0 is genuine and 100 is pure artificial sweetener / scam script),
  "verdict_headline": string (short punchy editorial headline, max 10 words),
  "costar_roast": string (cheeky 1-line Co-Star style takeaway for a shareable receipt card),
  "bestie_note": string (2-3 warm, grounded sentences talking directly to your friend),
  "flagged_phrases": [
    {
      "quote": string (exact or near-exact phrase from their message/link),
      "tactic": string (e.g. "Love-Bombing Rush", "Platform Isolation", "Guilt-Trip Pressure", "Fake Wealth Hook", "Sextortion Leverage"),
      "margin_note": string (short handwritten-style margin note explaining what's actually going on)
    }
  ],
  "sugared_vs_raw": [
    {
      "sweet_line": string (the flattering or urgent line they wrote),
      "hidden_meaning": string (the raw unfiltered scammer translation)
    }
  ],
  "risk_level": "low" | "medium" | "high"
}

Include 2 to 4 items in flagged_phrases and 2 to 3 items in sugared_vs_raw (even for low-risk messages, give honest perspective).`;

function getModelCandidates(runtimeEnv) {
  const customModel =
    runtimeEnv?.GEMINI_MODEL ??
    (typeof process !== 'undefined' ? process.env?.GEMINI_MODEL : undefined);
  return [
    customModel,
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemma-4-26b-a4b-it',
    'gemma-4-31b-it',
  ].filter(Boolean);
}

function resolveKey(runtimeEnv) {
  const raw =
    runtimeEnv?.GEMINI_API_KEY ??
    (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
  return (raw || '').trim();
}

function extractJson(rawText) {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonSlice =
    firstBrace !== -1 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;
  return JSON.parse(jsonSlice);
}

async function callModels(apiKey, { systemText, userText, expectJson, temperature, runtimeEnv }) {
  const errors = [];
  for (const model of getModelCandidates(runtimeEnv)) {
    const isGemma = model.startsWith('gemma-');
    const body = isGemma
      ? {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemText}\n\n---\n\n${userText}` }],
            },
          ],
          generationConfig: {
            temperature,
            topP: 0.95,
          },
        }
      : {
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          safetySettings: SAFETY_SETTINGS,
          generationConfig: {
            ...(expectJson ? { responseMimeType: 'application/json' } : {}),
            temperature,
            topP: 0.95,
          },
        };

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        console.warn(`[Gemini ${model} HTTP ${response.status}]:`, errBody.slice(0, 220));
        errors.push({ model, status: response.status, msg: errBody.slice(0, 120) });
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return { rawText, model };
      }
      errors.push({ model, status: 'empty_candidate' });
    } catch (err) {
      console.warn(`[Gemini ${model} exception]:`, err?.message || err);
      errors.push({ model, status: 'exception', msg: String(err?.message || err).slice(0, 120) });
    }
  }
  return { rawText: null, errors };
}

export async function checkMessageWithGemini(content, mode = 'paste', runtimeEnv = null) {
  const apiKey = resolveKey(runtimeEnv);
  const trimmed = (content || '').trim();

  if (!apiKey) {
    return runLocalHeuristicCheck(trimmed, mode);
  }

  try {
    const modeLabel =
      mode === 'link'
        ? 'suspicious link or profile URL'
        : mode === 'screenshot'
          ? 'text read from a private chat screenshot'
          : 'pasted DM or text message';

    const result = await callModels(apiKey, {
      systemText: SYSTEM_PROMPT,
      userText: `Bestie, look at this ${modeLabel} someone sent me (check #${Date.now() % 997}):\n\n"""\n${trimmed}\n"""`,
      expectJson: true,
      temperature: 0.85,
      runtimeEnv,
    });

    if (!result || !result.rawText) {
      return runLocalHeuristicCheck(trimmed, mode);
    }

    const parsed = extractJson(result.rawText);
    if (
      typeof parsed.sweetener_score !== 'number' ||
      !parsed.verdict_headline ||
      !Array.isArray(parsed.sugared_vs_raw)
    ) {
      console.error('[Gemini check error]: unexpected JSON shape', result.rawText.slice(0, 200));
      return runLocalHeuristicCheck(trimmed, mode);
    }

    return {
      ...parsed,
      sweetener_score: Math.max(0, Math.min(100, Math.round(parsed.sweetener_score))),
      source: 'gemini',
      model: result.model,
    };
  } catch (err) {
    console.error('[Gemini check exception]:', err);
    return runLocalHeuristicCheck(trimmed, mode);
  }
}

export async function askBestieRescueReply(situation, question, runtimeEnv = null) {
  const apiKey = resolveKey(runtimeEnv);
  const cleanQ = (question || '').trim();
  if (!cleanQ) return '';

  if (!apiKey) {
    return getLocalRescueReply(situation, cleanQ);
  }

  try {
    const situationContext =
      situation === 'photos'
        ? 'The user already sent private photos and is being threatened/pressured.'
        : situation === 'money'
          ? 'The user already sent money and needs calm Golden-Hour recovery guidance.'
          : 'The user is still just talking and wants a breezy, safe stalling or exit reply.';

    const result = await callModels(apiKey, {
      systemText: `You are Honnnneyyyy, a warm, protective best friend helping someone safely navigate a sketchy DM or sextortion/scam situation. ${situationContext} Give a short, calm, practical answer (max 3 sentences) with a fresh copy-pasteable reply if they asked what to say. Never shame them, never tell them to pay or confront aggressively.`,
      userText: cleanQ,
      expectJson: false,
      temperature: 0.8,
      runtimeEnv,
    });

    return result?.rawText?.trim() || getLocalRescueReply(situation, cleanQ);
  } catch {
    return getLocalRescueReply(situation, cleanQ);
  }
}
