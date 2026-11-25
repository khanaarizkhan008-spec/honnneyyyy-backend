import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  askBestieRescueReply,
  checkMessageWithGemini,
} from './src/geminiService.js';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
  });
});

app.post('/api/check', async (req, res) => {
  const { content, mode } = req.body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Drop a message or link first, bestie.' });
  }
  const result = await checkMessageWithGemini(content, mode || 'paste');
  return res.json(result);
});

app.post('/api/rescue-reply', async (req, res) => {
  const { situation, question } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Ask me what you want to say first.' });
  }
  const reply = await askBestieRescueReply(situation || null, question);
  return res.json({ reply });
});

app.listen(PORT, () => {
  console.log(`Honnnneyyyy backend listening on http://localhost:${PORT}`);
});
