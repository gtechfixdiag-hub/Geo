# Ask George — membership AI assistant (Wix Headless)

AI assistant trained on George's experience: life in the US for newcomers, free learning
through public libraries (LinkedIn Learning, Udemy via Gale), business and self-development.
**No immigration topics.** Monthly subscription with credits that renew each month.

## Wix site (created)
- Site name: Ask George
- metaSiteId: `e2af5be4-c077-46ab-89d3-6975ad8c3a8e`
- Headless OAuth appId (public client id): `4a9e3633-888e-4f2a-ae15-472222a0a98c`
- Dashboard: https://manage.wix.com/dashboard/e2af5be4-c077-46ab-89d3-6975ad8c3a8e/pricing-plans

## Plans (live in Wix Pricing Plans, USD)
| Plan | Price | Credits | id |
|---|---|---|---|
| Basic — الأساسي | $10/month | 100 / month | `6c1abc16-5127-49c4-9fba-656312ce940c` |
| Pro — المحترف | $25/month | 300 / month | `faff3970-a938-404d-872a-aad9ab5c7d4d` |
| Top-up — كريديت إضافي | $5 once | +40 | `a5d82b02-e457-4a74-bf2e-ac5cf4d88d2c` |

Credit cost: normal question = 1, full plan = 5. Monthly credits reset on each renewal.

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
