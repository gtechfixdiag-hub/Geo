// Ask George — backend web module (Velo). File: backend/askGeorge.web.js
// Requires: npm package @anthropic-ai/sdk (Velo Package Manager)
//           secret ANTHROPIC_API_KEY (Wix Secrets Manager)

import { Permissions, webMethod } from 'wix-web-module';
import { orders } from 'wix-pricing-plans-backend';
import { currentMember } from 'wix-members-backend';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import Anthropic from '@anthropic-ai/sdk';

import { MONTHLY_PLANS, TOPUP_PLAN_ID, TOPUP_CREDITS, COST, MODEL, MAX_TOKENS, COLLECTIONS } from 'backend/askGeorgeConfig';
import { PERSONA } from 'backend/askGeorgePersona';

const DATA_OPTS = { suppressAuth: true };

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

// ---------- knowledge ----------

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

async function recentHistory(memberId) {
  const res = await wixData
    .query(COLLECTIONS.questions)
    .eq('memberId', memberId)
    .descending('_createdDate')
    .limit(3)
    .find(DATA_OPTS);
  const turns = [];
  for (const item of res.items.reverse()) {
    if (item.title && item.answer) {
      turns.push({ role: 'user', content: item.title });
      turns.push({ role: 'assistant', content: item.answer });
    }
  }
  return turns;
}

// ---------- Claude ----------

async function askClaude({ question, mode, knowledge, links, history }) {
  const client = new Anthropic({ apiKey: await getSecret('ANTHROPIC_API_KEY') });

  const modeNote =
    mode === 'plan'
      ? 'The member asked for a FULL PLAN (5 credits): give a complete step-by-step plan with timeline.'
      : 'Normal question (1 credit): answer concisely.';

  const userContent = [
    knowledge ? `KNOWLEDGE (George's notes):\n${knowledge}` : 'KNOWLEDGE: (no matching notes)',
    modeNote,
    `QUESTION:\n${question}`,
  ].join('\n\n');

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS[mode],
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: mode === 'plan' ? 'medium' : 'low' },
    system: [
      { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: links },
    ],
    messages: [...history, { role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') {
    return { ok: false, error: 'مقدرش أجاوب على السؤال ده. جرّب تصيغه بشكل تاني.' };
  }
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) return { ok: false, error: 'حصلت مشكلة في الرد، جرّب تاني.' };
  return { ok: true, text };
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
    .descending('_createdDate')
    .limit(50)
    .find(DATA_OPTS);
  return res.items.map((i) => ({ question: i.title, answer: i.answer, cost: i.cost, date: i._createdDate }));
});

export const askGeorge = webMethod(Permissions.SiteMember, async (question, mode = 'quick') => {
  question = (question || '').toString().trim().slice(0, 2000);
  if (!question) return { ok: false, error: 'اكتب سؤالك الأول.' };
  if (!COST[mode]) mode = 'quick';
  const cost = COST[mode];

  const member = await currentMember.getMember();
  const memberId = member._id;

  const credits = await computeCredits(memberId);
  if (credits.total < cost) {
    return { ok: false, needCredits: true, credits, error: 'الكريديت خلص. اشترك أو اشحن كريديت إضافي.' };
  }

  const [knowledge, links, history] = await Promise.all([
    findKnowledge(question),
    approvedLinks(),
    recentHistory(memberId),
  ]);

  let result;
  try {
    result = await askClaude({ question, mode, knowledge, links, history });
  } catch (err) {
    console.error('Ask George — Claude error', err);
    return { ok: false, error: 'السيرفر مشغول دلوقتي، جرّب كمان شوية. مفيش كريديت اتخصم.' };
  }
  if (!result.ok) return result;

  // Charge only after a successful answer: monthly credits first, then top-up.
  const fromMonthly = Math.min(cost, credits.monthlyLeft);
  const fromTopup = cost - fromMonthly;
  const rows = [];
  if (fromMonthly > 0) rows.push({ source: 'monthly', cost: fromMonthly });
  if (fromTopup > 0) rows.push({ source: 'topup', cost: fromTopup });
  // The first row carries the Q&A; a split charge adds a second, cost-only row.
  rows[0] = { ...rows[0], title: question, answer: result.text };
  for (const row of rows) {
    await wixData.insert(COLLECTIONS.questions, { memberId, ...row }, DATA_OPTS);
  }

  return {
    ok: true,
    answer: result.text,
    credits: { ...credits, total: credits.total - cost },
  };
});
