// Ask George — backend web module (Velo). File: backend/askGeorge.web.js
// Requires: npm package @anthropic-ai/sdk (Velo Package Manager)
//           secret ANTHROPIC_API_KEY (Wix Secrets Manager)

import { Permissions, webMethod } from 'wix-web-module';
import { orders } from 'wix-pricing-plans-backend';
import { currentMember } from 'wix-members-backend';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import Anthropic from '@anthropic-ai/sdk';

import {
  MONTHLY_PLANS,
  TOPUP_PLAN_ID,
  TOPUP_CREDITS,
  COST,
  MAX_INTERVIEW_TURNS,
  MODEL,
  MAX_TOKENS,
  COLLECTIONS,
} from 'backend/askGeorgeConfig';
import { PERSONA, INTERVIEW_GUIDE } from 'backend/askGeorgePersona';

const DATA_OPTS = { suppressAuth: true };
const PROFILE_MARKER = '<<<PROFILE>>>';

// ---------- language ----------

function isArabic(text) {
  const s = text || '';
  const arabic = (s.match(/[؀-ۿ]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  return arabic >= latin;
}

const MESSAGES = {
  empty: { ar: 'اكتب سؤالك الأول.', en: 'Please type your question first.' },
  noCredits: {
    ar: 'الكريديت خلص. اشترك أو اشحن كريديت إضافي.',
    en: 'You are out of credits. Subscribe or buy a top-up.',
  },
  busy: {
    ar: 'السيرفر مشغول دلوقتي، جرّب كمان شوية. مفيش كريديت اتخصم.',
    en: 'The server is busy right now, please try again shortly. No credits were used.',
  },
  refusal: {
    ar: 'مقدرش أجاوب على السؤال ده. جرّب تصيغه بشكل تاني.',
    en: "I can't answer that one. Try rephrasing it.",
  },
  failed: { ar: 'حصلت مشكلة في الرد، جرّب تاني.', en: 'Something went wrong with the answer, please try again.' },
  interviewOver: {
    ar: 'الانترفيو ده خلص. ابدأ انترفيو جديد لو حابب تراجع خطتك.',
    en: 'This interview is finished. Start a new one if you want to revisit your plan.',
  },
};

function msg(key, text) {
  return MESSAGES[key][isArabic(text) ? 'ar' : 'en'];
}

// ---------- credits ----------

function cycleStartFor(order) {
  if (order.currentCycle && order.currentCycle.startedDate) {
    return new Date(order.currentCycle.startedDate);
  }
  // Fallback: walk monthly from the order start date.
  const start = new Date(order.startDate || order._createdDate);
  const now = new Date();
  let cursor = new Date(start);
  while (true) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    if (next > now) return cursor;
    cursor = next;
  }
}

async function sumCost(query) {
  const res = await query.limit(1000).find(DATA_OPTS);
  return res.items.reduce((total, item) => total + (item.cost || 0), 0);
}

async function computeCredits(memberId) {
  const memberOrders = (await orders.listCurrentMemberOrders()) || [];

  // Monthly allowance from the best active subscription.
  let monthly = null;
  for (const order of memberOrders) {
    const plan = MONTHLY_PLANS[order.planId];
    if (plan && order.status === 'ACTIVE' && (!monthly || plan.credits > monthly.credits)) {
      monthly = { ...plan, cycleStart: cycleStartFor(order) };
    }
  }

  // Top-ups: every paid top-up order adds credits that never expire.
  const topupOrders = memberOrders.filter(
    (o) => o.planId === TOPUP_PLAN_ID && (o.status === 'ACTIVE' || o.status === 'ENDED')
  );
  const topupTotal = topupOrders.length * TOPUP_CREDITS;

  const base = () => wixData.query(COLLECTIONS.questions).eq('memberId', memberId);
  const monthlyUsed = monthly
    ? await sumCost(base().eq('source', 'monthly').ge('_createdDate', monthly.cycleStart))
    : 0;
  const topupUsed = await sumCost(base().eq('source', 'topup'));

  const monthlyLeft = monthly ? Math.max(0, monthly.credits - monthlyUsed) : 0;
  const topupLeft = Math.max(0, topupTotal - topupUsed);

  return {
    planName: monthly ? monthly.name : null,
    monthlyAllowance: monthly ? monthly.credits : 0,
    monthlyLeft,
    topupLeft,
    total: monthlyLeft + topupLeft,
    renewsFrom: monthly ? monthly.cycleStart : null,
  };
}

// ---------- knowledge, links, profile, history ----------

function words(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
}

async function findKnowledge(question) {
  const res = await wixData.query(COLLECTIONS.knowledge).limit(1000).find(DATA_OPTS);
  const q = new Set(words(question));
  return res.items
    .map((item) => {
      const hay = words(`${item.title} ${item.keywords} ${item.category}`);
      const score = hay.filter((w) => q.has(w)).length;
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ item }) => `### ${item.title}\n${item.content || ''}`)
    .join('\n\n');
}

async function approvedLinks() {
  const res = await wixData.query(COLLECTIONS.links).ascending('title').limit(200).find(DATA_OPTS);
  if (!res.items.length) return 'APPROVED LINKS: (none yet — do not share any URL)';
  const lines = res.items.map(
    (l) => `- ${l.title} | topic: ${l.topic || ''} | ${l.url || ''} | affiliate: ${l.affiliate ? 'yes' : 'no'}`
  );
  return `APPROVED LINKS:\n${lines.join('\n')}`;
}

async function getProfile(memberId) {
  const res = await wixData.query(COLLECTIONS.profiles).eq('title', memberId).limit(1).find(DATA_OPTS);
  return res.items[0] || null;
}

async function saveProfile(memberId, profileText, language) {
  const existing = await getProfile(memberId);
  if (existing) {
    await wixData.update(COLLECTIONS.profiles, { ...existing, profile: profileText, language }, DATA_OPTS);
  } else {
    await wixData.insert(COLLECTIONS.profiles, { title: memberId, profile: profileText, language }, DATA_OPTS);
  }
}

function toTurns(items) {
  const turns = [];
  for (const item of items) {
    if (item.title && item.answer) {
      turns.push({ role: 'user', content: item.title });
      turns.push({ role: 'assistant', content: item.answer });
    }
  }
  return turns;
}

async function recentHistory(memberId) {
  const res = await wixData
    .query(COLLECTIONS.questions)
    .eq('memberId', memberId)
    .ne('mode', 'interview')
    .descending('_createdDate')
    .limit(3)
    .find(DATA_OPTS);
  return toTurns(res.items.reverse());
}

async function interviewHistory(memberId, sessionId) {
  const res = await wixData
    .query(COLLECTIONS.questions)
    .eq('memberId', memberId)
    .eq('sessionId', sessionId)
    .ascending('_createdDate')
    .limit(100)
    .find(DATA_OPTS);
  return res.items;
}

// ---------- Claude ----------

async function askClaude({ question, mode, knowledge, links, profile, history, lastTurn }) {
  const client = new Anthropic({ apiKey: await getSecret('ANTHROPIC_API_KEY') });

  const notes = [];
  if (mode === 'plan') notes.push('The member asked for a FULL PLAN (5 credits): give a complete step-by-step plan with a timeline.');
  if (mode === 'quick') notes.push('Normal question (1 credit): answer concisely.');
  if (lastTurn) notes.push('This is the last turn of the interview: deliver the ROADMAP now, followed by the profile block.');

  const userContent = [
    profile ? `MEMBER PROFILE:\n${profile}` : 'MEMBER PROFILE: (none yet)',
    knowledge ? `KNOWLEDGE (George's notes):\n${knowledge}` : 'KNOWLEDGE: (no matching notes)',
    ...notes,
    `MEMBER'S MESSAGE:\n${question}`,
  ].join('\n\n');

  // Stable, cached prefix: persona (+ interview guide), then the links list.
  const system = [{ type: 'text', text: PERSONA }];
  if (mode === 'interview') system.push({ type: 'text', text: INTERVIEW_GUIDE });
  system[system.length - 1].cache_control = { type: 'ephemeral' };
  system.push({ type: 'text', text: links });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS[mode],
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: mode === 'plan' || lastTurn ? 'medium' : 'low' },
    system,
    messages: [...history, { role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') return { ok: false, error: msg('refusal', question) };
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) return { ok: false, error: msg('failed', question) };
  return { ok: true, text };
}

// ---------- charging ----------

async function recordTurn({ memberId, question, answer, mode, sessionId, cost, credits }) {
  const shared = { memberId, mode, sessionId: sessionId || null };
  if (cost === 0) {
    await wixData.insert(COLLECTIONS.questions, { ...shared, title: question, answer, cost: 0, source: 'included' }, DATA_OPTS);
    return;
  }
  // Monthly credits first, then top-up. A split charge adds a second, cost-only row.
  const fromMonthly = Math.min(cost, credits.monthlyLeft);
  const fromTopup = cost - fromMonthly;
  const rows = [];
  if (fromMonthly > 0) rows.push({ source: 'monthly', cost: fromMonthly });
  if (fromTopup > 0) rows.push({ source: 'topup', cost: fromTopup });
  rows[0] = { ...rows[0], title: question, answer };
  for (const row of rows) {
    await wixData.insert(COLLECTIONS.questions, { ...shared, ...row }, DATA_OPTS);
  }
}

// ---------- public web methods ----------

export const getMyCredits = webMethod(Permissions.SiteMember, async () => {
  const member = await currentMember.getMember();
  return computeCredits(member._id);
});

export const getMyHistory = webMethod(Permissions.SiteMember, async () => {
  const member = await currentMember.getMember();
  const res = await wixData
    .query(COLLECTIONS.questions)
    .eq('memberId', member._id)
    .isNotEmpty('title')
    .descending('_createdDate')
    .limit(50)
    .find(DATA_OPTS);
  return res.items.map((i) => ({ question: i.title, answer: i.answer, mode: i.mode, date: i._createdDate }));
});

/**
 * mode: 'quick' (1 credit) | 'plan' (5 credits) | 'interview' (5 credits once per interview)
 * sessionId: pass the value returned by the first interview turn to continue the same interview.
 */
export const askGeorge = webMethod(Permissions.SiteMember, async (question, mode = 'quick', sessionId = null) => {
  question = (question || '').toString().trim().slice(0, 2000);
  if (!question) return { ok: false, error: msg('empty', question) };
  if (!(mode in COST)) mode = 'quick';

  const member = await currentMember.getMember();
  const memberId = member._id;

  // Interview bookkeeping: a new interview costs credits once; its later turns are included.
  let cost = COST[mode];
  let pastTurns = [];
  if (mode === 'interview') {
    if (sessionId) {
      pastTurns = await interviewHistory(memberId, sessionId);
      if (pastTurns.length === 0) sessionId = null; // unknown session → start fresh
    }
    if (sessionId) {
      const finished = pastTurns.some((t) => t.answer && t.answer.includes('<!--done-->'));
      const tooLong = pastTurns.filter((t) => t.title).length >= MAX_INTERVIEW_TURNS + 2;
      if (finished || tooLong) {
        return { ok: false, interviewDone: true, error: msg('interviewOver', question) };
      }
      cost = 0;
    } else {
      sessionId = `${memberId}-${Date.now()}`;
    }
  }

  const credits = await computeCredits(memberId);
  if (credits.total < cost) {
    return { ok: false, needCredits: true, credits, error: msg('noCredits', question) };
  }

  const turnsSoFar = pastTurns.filter((t) => t.title).length;
  const lastTurn = mode === 'interview' && turnsSoFar >= MAX_INTERVIEW_TURNS - 1;

  const [knowledge, links, profileRow, history] = await Promise.all([
    findKnowledge(question),
    approvedLinks(),
    getProfile(memberId),
    mode === 'interview' ? Promise.resolve(toTurns(pastTurns)) : recentHistory(memberId),
  ]);

  let result;
  try {
    result = await askClaude({
      question,
      mode,
      knowledge,
      links,
      profile: profileRow ? profileRow.profile : null,
      history,
      lastTurn,
    });
  } catch (err) {
    console.error('Ask George — Claude error', err);
    return { ok: false, error: msg('busy', question) };
  }
  if (!result.ok) return result;

  // The roadmap ends with a hidden profile block: save it, show only the roadmap.
  let answer = result.text;
  let interviewDone = false;
  if (mode === 'interview' && answer.includes(PROFILE_MARKER)) {
    const [visible, profileText] = answer.split(PROFILE_MARKER);
    answer = visible.trim();
    interviewDone = true;
    await saveProfile(memberId, (profileText || '').trim(), isArabic(question) ? 'ar' : 'en');
  }

  // '<!--done-->' marks the stored roadmap turn so the session can't continue for free forever.
  const stored = interviewDone ? `${answer}\n<!--done-->` : answer;
  await recordTurn({ memberId, question, answer: stored, mode, sessionId: mode === 'interview' ? sessionId : null, cost, credits });

  return {
    ok: true,
    answer,
    mode,
    sessionId: mode === 'interview' ? sessionId : null,
    interviewDone,
    turnsLeft: mode === 'interview' ? Math.max(0, MAX_INTERVIEW_TURNS - (turnsSoFar + 1)) : null,
    credits: { ...credits, total: credits.total - cost },
  };
});
