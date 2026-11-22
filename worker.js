// THE AI CLASSROOM — Cloudflare Worker gateway (Phase 1)
// Holds the OpenRouter key server-side, validates requests, builds prompts,
// validates the model's structured lesson before returning it to the browser.

const SUBJECTS = {"eng": {"n": "English (Home Language)", "p": "FISH"}, "afr": {"n": "Afrikaans (First Additional Language)", "p": "FISH"}, "maths": {"n": "Mathematics", "p": "FISH"}, "mlit": {"n": "Mathematical Literacy", "p": "H"}, "ls": {"n": "Life Skills", "p": "FI"}, "lo": {"n": "Life Orientation", "p": "SH"}, "nst": {"n": "Natural Sciences & Technology", "p": "I"}, "ns": {"n": "Natural Sciences", "p": "S"}, "ps": {"n": "Physical Sciences", "p": "H"}, "lsc": {"n": "Life Sciences", "p": "H"}, "tech": {"n": "Technology", "p": "S"}, "ss": {"n": "Social Sciences (Geography & History)", "p": "I"}, "geo": {"n": "Geography", "p": "SH"}, "hist": {"n": "History", "p": "SH"}, "ems": {"n": "Economic & Management Sciences", "p": "S"}, "arts": {"n": "Creative Arts", "p": "S"}, "acc": {"n": "Accounting", "p": "H"}, "bus": {"n": "Business Studies", "p": "H"}, "eco": {"n": "Economics", "p": "H"}, "cat": {"n": "Computer Applications Technology", "p": "H"}, "it": {"n": "Information Technology", "p": "H"}, "tour": {"n": "Tourism", "p": "H"}, "agri": {"n": "Agricultural Sciences", "p": "H"}};
const phaseOf = g => (g <= 3 ? 'F' : g <= 6 ? 'I' : g <= 9 ? 'S' : 'H');
const PERSONA = {
  playful: 'PLAYFUL TEACHER (Grades 1-3): very simple words, short sentences, counting and picture-style examples, little stories and playful challenges, frequent encouragement, one tiny activity at a time. Never talk down to the child.',
  clever: 'CLEVER TEACHER (Grades 4-7): clear explanations, practical everyday examples, small experiments and illustrations, quick quiz questions, gradually harder, encourage the learner to think for themselves.',
  professor: 'PROFESSOR MODE (Grades 8-12): subject-specific academic language and proper terminology, detailed reasoning, worked examples, exam-style thinking, critical thinking and independent problem solving.',
};
const personaOf = g => (g <= 3 ? PERSONA.playful : g <= 7 ? PERSONA.clever : PERSONA.professor);
const MODES = ['teach', 'practice', 'ask', 'homework', 'check'];
const PACES = ['easy', 'steady', 'challenge'];
const TYPES = ['write', 'explain', 'highlight', 'erase', 'visual'];
const ANIMS = ['idle', 'talk', 'point_to_board', 'think', 'confused', 'smile', 'laugh', 'celebrate', 'write', 'walk', 'excited', 'gesture'];
const NEXT = ['ask_learner', 'continue', 'practice', 'none'];
const MISTAKES = ['conceptual_misunderstanding', 'incorrect_formula', 'arithmetic_error', 'incorrect_method', 'missing_working', 'incomplete_answer', 'misread_question'];

// Best-effort per-isolate rate limit. For real abuse prevention bind
// Cloudflare's Rate Limiting API or a Durable Object (see README).
const hits = new Map();
function limited(ip, max = 20, windowMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

function corsHeaders(req, env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.get('Origin') || '';
  const ok = allowed === '*' || origin === allowed;
  return {
    'Access-Control-Allow-Origin': ok ? (allowed === '*' ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
const json = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

function systemPrompt({ grade, subject, topic, pace, mode }) {
  const subjectName = SUBJECTS[subject].n;
  const isLang = subject === 'eng' || subject === 'afr';
  const paceRule = {
    easy: 'EASY PACE: break the idea into very small steps, use simpler numbers, explain any vocabulary, be patient and reassuring.',
    steady: 'STEADY PACE: normal progression with a worked example, then invite the learner to try.',
    challenge: 'CHALLENGE PACE: fewer hints, harder and exam-style questions, push independent problem-solving.',
  }[pace];
  const modeRule = {
    teach: 'The learner wants a lesson from the beginning on the topic. Teach one clear worked example, then ask them to try a similar one.',
    practice: 'Generate ONE new practice question on the topic. Do NOT reveal the answer. Put the question in the "question" field (text, and latex when helpful). Spoken text should introduce it briefly. Board should show only the question setup, not the solution.',
    ask: 'Answer the learner\'s question directly and clearly, with board working.',
    homework: 'The learner pasted a homework question. Guide them step by step; prefer hints and partial working first, but give a full worked explanation if they ask for one. If the text is incomplete or unclear, ask them to retype it. Never invent missing text.',
    check: 'The learner answered a practice question. Judge their answer carefully by solving it yourself first. Set "verdict" to correct, incorrect or partial. If not fully correct, set "mistake_type" to exactly one of: ' + MISTAKES.join(', ') + '. Explain the mistake kindly, show the correct working on the board, then put a NEW similar question targeting the same skill in "question" (do not reveal its answer). If correct, celebrate briefly and optionally offer a slightly harder question in "question".',
  }[mode];
  return `You are Professor Klank, an original robot teacher at Chalk & Giggles Academy, a South African learning app whose promise is learning without the classroom pressure. Your personality: a warm, calm, fatherly teacher with a gentle sense of humour (one small dad joke at most per answer), endlessly patient, never shaming. The learner is in Grade ${grade}, subject: ${subjectName}, topic: ${topic}. Teach in line with general CAPS-aligned content for that grade. Teaching style: ${personaOf(grade)} Use South African context where natural (rand, kilometres, braai, taxi rank).
${isLang ? 'This is a language subject: keep spoken_text mostly in English with short examples in the target language, and put the target-language text on the board with math:false.' : ''}
Use math:true only for real formulas and equations; plain words use math:false.

${paceRule}
${modeRule}

HONESTY RULES: You do not have access to curriculum documents or textbooks in this version. Never cite textbook names, page numbers, CAPS section numbers or past exam papers. If unsure about a curriculum requirement, say you are not certain. Never invent facts. Check all arithmetic before answering. Stay on school learning; politely steer back if asked about other things. Refuse anything unsafe or inappropriate for a child and do not ask for personal information.

OUTPUT: reply with ONE JSON object only, no markdown fences, no extra text:
{
 "spoken_text": "1-3 short sentences you say aloud. Plain words only, no symbols or LaTeX.",
 "board_actions": [ ... up to 14 actions ... ],
 "animation": one of ${ANIMS.join('|')},
 "next_action": one of ${NEXT.join('|')},
 "verdict": "correct|incorrect|partial" (only in check mode),
 "mistake_type": "..." (only in check mode when not correct),
 "question": {"text": "plain-words question", "latex": "LaTeX of the question"} (only in practice and check modes)
}
board_actions item types:
- {"type":"write","content":"LaTeX, no $ signs, e.g. x+5=12","math":true,"say":"what you say aloud while writing this line"}  (math:false for plain words)
- {"type":"explain","content":"short plain-English note on the board","say":"optional spoken version"}
- {"type":"highlight","say":"optional"}  (highlights the last written line)
- {"type":"erase"}
- {"type":"visual","kind":"balance","left":"x+5","right":"12","tilt":"level|left|right","say":"..."}  (for equations)
- {"type":"visual","kind":"numberline","min":0,"max":12,"marks":[5,12],"point":7,"say":"..."}
RULES: everything you say must appear on the board (equations as "write", reasoning as "explain"); do not say things the board does not show. Each "say" is 1 short sentence. Write equations line by line, one step per line. Keep "content" under 200 characters.`;
}

function sanitizeLesson(o, mode) {
  if (!o || typeof o !== 'object') throw new Error('not_object');
  const spoken = String(o.spoken_text || '').trim().slice(0, 1500);
  if (!spoken) throw new Error('no_spoken_text');
  const acts = [];
  for (const a of (Array.isArray(o.board_actions) ? o.board_actions.slice(0, 30) : [])) {
    if (!a || !TYPES.includes(a.type)) continue;
    const content = String(a.content ?? '').slice(0, 400);
    if ((a.type === 'write' || a.type === 'explain') && !content.trim()) continue;
    const x = { type: a.type, content };
    if (typeof a.math === 'boolean') x.math = a.math;
    if (typeof a.say === 'string' && a.say.trim()) x.say = a.say.trim().slice(0, 500);
    if (a.type === 'visual') {
      x.kind = a.kind === 'numberline' ? 'numberline' : 'balance';
      x.left = String(a.left ?? '').slice(0, 24);
      x.right = String(a.right ?? '').slice(0, 24);
      x.tilt = ['left', 'right', 'level'].includes(a.tilt) ? a.tilt : 'level';
      let lo = Math.trunc(Number(a.min)), hi = Math.trunc(Number(a.max));
      if (!Number.isFinite(lo)) lo = 0;
      if (!Number.isFinite(hi)) hi = 10;
      if (hi <= lo || hi - lo > 60) { lo = 0; hi = 10; }
      x.min = lo; x.max = hi;
      x.marks = (Array.isArray(a.marks) ? a.marks : []).slice(0, 12).map(Number).filter(Number.isFinite);
      x.point = (a.point === null || a.point === undefined || a.point === '') ? null : (Number.isFinite(Number(a.point)) ? Number(a.point) : null);
    }
    acts.push(x);
  }
  const out = {
    spoken_text: spoken,
    board_actions: acts,
    animation: ANIMS.includes(o.animation) ? o.animation : 'talk',
    next_action: NEXT.includes(o.next_action) ? o.next_action : 'ask_learner',
  };
  if (mode === 'check') {
    if (['correct', 'incorrect', 'partial'].includes(o.verdict)) out.verdict = o.verdict;
    if (out.verdict && out.verdict !== 'correct' && MISTAKES.includes(o.mistake_type)) out.mistake_type = o.mistake_type;
  }
  if ((mode === 'practice' || mode === 'check') && o.question && typeof o.question.text === 'string' && o.question.text.trim()) {
    out.question = { text: o.question.text.slice(0, 400), latex: typeof o.question.latex === 'string' ? o.question.latex.slice(0, 300) : '' };
  }
  if (mode === 'practice' && !out.question) throw new Error('no_question');
  if (mode === 'check' && !out.verdict) throw new Error('no_verdict');
  return out;
}

function parseModelJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no_json');
  return JSON.parse(t.slice(a, b + 1));
}

function validateRequest(b) {
  if (!b || typeof b !== 'object') return 'Bad request.';
  const grade = Number(b.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) return 'Grade must be 1 to 12.';
  if (typeof b.subject !== 'string' || !SUBJECTS[b.subject]) return 'Unknown subject.';
  if (!SUBJECTS[b.subject].p.includes(phaseOf(grade))) return 'That subject is not offered in this grade.';
  if (!PACES.includes(b.pace)) return 'Unknown pace.';
  if (!MODES.includes(b.mode)) return 'Unknown mode.';
  if (typeof b.topic !== 'string' || !b.topic || b.topic.length > 80) return 'Bad topic.';
  if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 1500) return 'Message must be 1-1500 characters.';
  if (b.mode === 'check') {
    if (typeof b.question !== 'string' || b.question.length > 400) return 'Missing practice question.';
    if (typeof b.answer !== 'string' || b.answer.length > 1500) return 'Missing answer.';
  }
  if (b.history !== undefined && (!Array.isArray(b.history) || b.history.length > 8)) return 'Bad history.';
  return null;
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/api/health' && req.method === 'GET') {
      return json({ ok: true, model: env.OPENROUTER_MODEL || null, keyConfigured: !!env.OPENROUTER_API_KEY }, 200, cors);
    }
    if (url.pathname !== '/api/teach' || req.method !== 'POST') return json({ error: 'Not found.' }, 404, cors);

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (limited(ip, Number(env.RATE_LIMIT_PER_MIN) || 20)) return json({ error: 'Too many questions too fast. Wait a minute and try again.' }, 429, cors);
    if (!env.OPENROUTER_API_KEY) return json({ error: 'The server has no OpenRouter key configured yet.' }, 500, cors);
    if (!env.OPENROUTER_MODEL) return json({ error: 'The server has no model configured (OPENROUTER_MODEL).' }, 500, cors);

    const raw = await req.text();
    if (raw.length > 20000) return json({ error: 'Request too large.' }, 413, cors);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Bad JSON.' }, 400, cors); }
    const bad = validateRequest(body);
    if (bad) return json({ error: bad }, 400, cors);

    const history = (body.history || []).filter(h => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string').slice(-6).map(h => ({ role: h.role, content: h.content.slice(0, 1500) }));
    const userMsg = body.mode === 'check'
      ? `Practice question: ${body.question}\nLearner's answer: ${body.answer}`
      : body.message;
    const messages = [{ role: 'system', content: systemPrompt(body) }, ...history, { role: 'user', content: userMsg }];

    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 28000);
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.SITE_URL || 'https://pixelprotechsolutions.co.za',
          'X-Title': 'Chalk & Giggles Academy',
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          messages,
          temperature: body.mode === 'check' ? 0.2 : 0.5,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
        }),
        signal: ctl.signal,
      });
      if (!r.ok) {
        const status = r.status === 429 ? 429 : 502;
        return json({ error: r.status === 429 ? 'The AI provider is busy. Try again shortly.' : 'The AI provider returned an error (' + r.status + ').' }, status, cors);
      }
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content;
      let lesson;
      try { lesson = sanitizeLesson(parseModelJson(text), body.mode); }
      catch (e) {
        // one retry nudging for strict JSON
        const r2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': env.SITE_URL || 'https://pixelprotechsolutions.co.za', 'X-Title': 'Chalk & Giggles Academy' },
          body: JSON.stringify({ model: env.OPENROUTER_MODEL, messages: [...messages, { role: 'assistant', content: String(text || '').slice(0, 3000) }, { role: 'user', content: 'That was not valid for the required JSON schema (' + e.message + '). Reply again with ONLY the corrected JSON object.' }], temperature: 0.1, max_tokens: 1800, response_format: { type: 'json_object' } }),
          signal: ctl.signal,
        });
        if (!r2.ok) return json({ error: 'The teacher could not format that lesson. Please try again.' }, 502, cors);
        const d2 = await r2.json();
        try { lesson = sanitizeLesson(parseModelJson(d2?.choices?.[0]?.message?.content), body.mode); }
        catch { return json({ error: 'The teacher could not format that lesson. Please try again.' }, 502, cors); }
      }
      return json(lesson, 200, cors);
    } catch (e) {
      return json({ error: e.name === 'AbortError' ? 'The teacher took too long. Please try again.' : 'Could not reach the AI provider.' }, 504, cors);
    } finally {
      clearTimeout(to);
    }
  },
};
