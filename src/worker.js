import {
  askBestieRescueReply,
  checkMessageWithGemini,
} from './geminiService.js';

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '*';
  const configured = env.FRONTEND_ORIGIN || '*';
  const allowOrigin = configured === '*' ? '*' : origin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse(
        {
          ok: true,
          aiConfigured: Boolean((env.GEMINI_API_KEY || '').trim()),
          runtime: 'cloudflare-workers',
        },
        200,
        request,
        env
      );
    }

    if (request.method === 'POST' && url.pathname === '/api/check') {
      try {
        const body = await request.json();
        const { content, mode } = body || {};
        if (typeof content !== 'string' || !content.trim()) {
          return jsonResponse(
            { error: 'Drop a message or link first, bestie.' },
            400,
            request,
            env
          );
        }
        const result = await checkMessageWithGemini(content, mode || 'paste', env);
        return jsonResponse(result, 200, request, env);
      } catch {
        return jsonResponse({ error: 'Invalid JSON request.' }, 400, request, env);
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/rescue-reply') {
      try {
        const body = await request.json();
        const { situation, question } = body || {};
        if (typeof question !== 'string' || !question.trim()) {
          return jsonResponse(
            { error: 'Ask me what you want to say first.' },
            400,
            request,
            env
          );
        }
        const reply = await askBestieRescueReply(situation || null, question, env);
        return jsonResponse({ reply }, 200, request, env);
      } catch {
        return jsonResponse({ error: 'Invalid JSON request.' }, 400, request, env);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, request, env);
  },
};
