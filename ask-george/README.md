# Ask George — membership AI assistant (Wix Headless)

AI assistant trained on George's experience: life in the US for newcomers, free learning
through public libraries (LinkedIn Learning, Udemy via Gale), business and self-development.
**No immigration topics.** Monthly subscription with credits that renew each month.

## Where it lives
Ask George runs inside the existing **George Nabill** Wix site (Velo backend).
See `velo/SETUP.md` for plan ids, CMS collections and setup steps.
The earlier standalone "Ask George" headless site was moved to the Wix trash.

## Architecture
1. **Wix** — members login, pricing plans + hosted checkout, CMS collections:
   `KnowledgeBase`, `AffiliateLinks`, `CreditLedger`, `Conversations`.
2. **AI endpoint (server-side, required)** — receives the member's question, verifies the
   member and active plan, checks/deducts credits, pulls matching knowledge articles and
   approved links, calls the Claude API with `persona/system-prompt.md`, saves the answer.
   The Anthropic API key lives only on the server (Wix Secrets Manager), never in the browser.
3. **Pages** — landing, pricing, chat, my credits/history.

## Status
- [x] Site provisioned with Pricing Plans
- [x] 3 plans created
- [x] Persona prompt draft, knowledge outline, affiliate-links template
- [ ] Members app + CMS collections
- [ ] Server-side AI endpoint (Astro SSR on Wix hosting) — needs permission to install the
      Wix headless kit from GitHub (blocked in this session)
- [ ] Pages (Arabic RTL) + upload
- [ ] George: voice samples, knowledge articles, affiliate links, Anthropic API key,
      connect payments + Wix premium plan
