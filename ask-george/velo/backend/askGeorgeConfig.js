// Ask George — configuration (George Nabill site)
// Plan ids come from Wix Pricing Plans on the George Nabill site.

export const MONTHLY_PLANS = {
  '3a80985a-2919-4827-ba96-9277062e871c': { name: 'Basic', credits: 100 },
  '8f123565-cdb9-4c75-83fe-2dbcb7dcf9a5': { name: 'Pro', credits: 300 },
};

export const TOPUP_PLAN_ID = 'a72f3785-04c7-494b-b6b6-74800103fbac';
export const TOPUP_CREDITS = 40;

// interview = charged once when the interview starts; all its turns + the roadmap are included.
export const COST = { quick: 1, plan: 5, interview: 5 };
export const MAX_INTERVIEW_TURNS = 14;

// Velo backend calls time out after a few seconds' budget; keep answers focused.
// If you see timeouts, change MODEL to 'claude-sonnet-5-5' (faster).
export const MODEL = 'claude-opus-5-5';
export const MAX_TOKENS = { quick: 2000, plan: 4000, interview: 4000 };

export const COLLECTIONS = {
  knowledge: 'AskKnowledge',
  links: 'AskLinks',
  questions: 'AskQuestions',
  profiles: 'AskProfiles',
};
