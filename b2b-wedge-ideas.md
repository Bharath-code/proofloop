# B2B Wedge Ideas — Validated Research Notes

Compiled 2026-08-30. All claims sourced from live web research (sources at bottom). No assumptions — every section links data.

---

## 1. The Big Picture (what the data says)

### Saturated — do not enter (verified numbers)
- Of 2,400+ tracked micro-SaaS startups, **49.2% are "AI tools"** and the **median AI SaaS MRR is $7** (BigIdeasDB Stripe index). AI wrappers run 25–35% gross margins; ~90% projected to fail by end of 2026.
- Developer tools sold to developers: **median $68/mo, lowest of any category** — only 18.2% clear $1K MRR. Dev skill = execution advantage, not a market.
- Horizontal categories dead for new entrants: AI writing, chatbots, summarizers, generic CRMs, all-in-one productivity suites.
- 3,800+ horizontal AI startups shut down in 2025 while vertical AI hit $10.3B.

### Open — where money is flowing
- **Vertical AI: $10.3B (2025) → $74.5B by 2033, 28.3% CAGR** (Grand View Research).
- Y Combinator thesis: vertical AI agents could be **10x bigger than the SaaS they replace** — they replace labor, not software (scheduler = $15/seat; agent replacing a $60/hr adjuster = outcome pricing).
- Vertical SaaS: $157B market, still growing 18–22%/yr.
- Agentic AI: Gartner projects 40% of enterprise apps will feature task-specific agents by end of 2026 (up from <5% in 2025).
- **Key risk to design against:** enterprise agents are signing one-year deals only because "prompts are portable" (SaaStr board data). The moat must be data, integrations, workflow ownership — never the prompt.

### Pattern across every winner
Pick ONE industry → own ONE workflow → sell to ONE buyer. Four checks before code:
1. Quantified pain (hours + dollars, not "they're busy")
2. Reason vertical wins in THAT industry (regulation, proprietary data, terminology, legacy integrations)
3. Dated demand signal from 2025–2026
4. Validation step before building

---

## 2. Idea A (deep-dive): Freight Invoice Audit Agent

**What:** Agent ingests freight invoices (email/PDF/API), checks every line (base rate, fuel surcharge, liftgate, detention, limited access, hazmat) against the shipper's carrier contracts and tariffs, flags overcharges, drafts dispute claims automatically.

**Why (data):**
- US freight market $900B+; invoice error rates 3–5% → billions in overcharges; most shippers audit only a sample.
- Clear ROI: recovering 3% on a $20M freight budget = $600K/year → price on % of recovered savings (buyer pays from found money).
- Vertical moat: detention rules, accessorial schedules, carrier tariffs — defeats "prompt is portable" churn risk.
- Buyer reachable: mid-size shippers / 3PLs ($10M+ freight spend); logistics managers on LinkedIn.
- Competition gap: legacy FAP providers (Cass, nVision Global) are enterprise + slow; VC money (Motive $150M, Project44) goes to visibility, not invoice-level audit for mid-market.
- Buildable solo: document parsing + rules engine + email/API integrations + dispute workflow. Senior dev MVP: 4–8 weeks. No LLM-cost dependency at the core (rules + extraction), scales with usage.

**Validation path:**
1. Interview 5 logistics managers: what % of invoices audited, what recovered last year, what tool used today.
2. Get 2–3 sample contracts + invoice batches; audit manually (concierge) for one company for two weeks.
3. Real overcharges found → wedge proven. Pilot pricing: 20–30% of recovered savings for 3 months.

**Honest caveat:** current competitor density in mid-market freight audit specifically = exactly what validation step 1 is for (2-week job, not 3-month).

---

## 3. Idea B (deep-dive): Churn Ledger — failed-payment recovery for Stripe SaaS

### Original concept
Connect Stripe (read-only) → free 60-second scan shows MRR lost to failed payments → paid product recovers via smart retries + dunning, priced only on recovered dollars (pay-on-lift). Viral loop via shareable scan number; cold outreach = every SaaS with a public pricing page.

### Market data (why the space has money in it)
- 20–40% of total SaaS churn is involuntary; costs 4–8% of MRR annually for B2C SaaS (Stripe data via Churnkey).
- Sub-$10 AOV businesses: 35% of churn is involuntary.
- Stripe's own recovery stack moved **$6.5B in 2024** — the money is proven to exist.

### Competition map (researched 2026-08-30)

**Tier 1 — Enterprise / mid-market (sales-led):**
| Player | Pricing | Segment |
|---|---|---|
| Slicker | Pay-for-performance, custom quote via sales | Pricing slider starts at $50M annual revenue |
| Butter Payments | Enterprise, multi-processor | Enterprise |
| Churn Buster | White-glove, concierge, advisory from $1,000, ROI guarantee | Mid-market (ButcherBox, Battlbox) |
| Churnkey | Starter $250/mo billed yearly (cap <$5K/mo churn); Core/Intelligence for $10K+ churn | Growing SaaS |

**Tier 2 — Budget / self-serve:**
- Baremetrics Recover: $58–208/mo add-on (+$50+ core metrics)
- Stunning.co, FlyCode (DTC/Recharge focus), Gravy (human outreach, expensive), Redux Payments (B2C-only, pay-on-incremental-lift), SaveMyChurn / SaveMRR (commission pricing), ProfitWell Retain (Paddle-owned)

**Tier 3 — the warning sign:** indie hackers are flooding this exact niche right now (all 2026): RetryFix ("pay only 10% of what we recover"), a $49/mo flat-fee Stripe dunning tool, Dunphora, Revive, etc. Founders publicly complain about surprise revenue-share bills ("$12K/year in fees"), spawning flat-fee counter-positioning.

**Tier 0 — the free default to beat:** Stripe Smart Retries (AI-timed, 8 attempts / 2 weeks default) + recovery emails + automatic card updates. Industry benchmark question (FlyCode): *how much do you recover above Stripe's free baseline?* Gross-recovery claims = marketing fluff.

### Straight verdict
1. As originally conceived, Churn Ledger is **not a unique wedge**. Bottom segment is actively crowding; entrant ~#30; tiny ACVs; free incumbent default.
2. Real gaps if staying in this space:
   - **Incremental-lift-only pricing for B2B SaaS** (Redux does B2C only; nobody self-serve for B2B). Charge only on recovery above the customer's own trailing Stripe baseline — answers the biggest trust objection.
   - **Invoiced / ACH / SEPA B2B dunning** — Smart Retries only covers card failures on auto-billing; annual invoiced contracts and bank-debit failures are a different, messier problem with no good self-serve tool. Less crowded, higher ACV.
   - **Vertical dunning** — Slicker's vertical marketing (media, health & fitness) signals it works; a tool speaking one platform's language (newsletters, e-learning) beats horizontal at the bottom end.
   - **Free scan** = good distribution tactic, not a moat; competitors will copy it in a week.
3. Updated recommendation: keep free-scan distribution, aim at **invoiced-B2B revenue recovery** or a **vertical** — same outcome pricing, same solo stack, entering where the 2026 indie wave isn't landing.

---

## 4. Backup ideas (data-backed)

### MEP contractor quoting agent
- Commercial HVAC/electrical/plumbing quote takes 2–8 hrs; 75–85% of quotes never win (15–25% win rate).
- Rebar raised $14M (Series A) — space validated; commercial MEP contractors ($5M–$50M/yr) underserved, reachable via trade associations.
- Vertical moat: parts catalogs, local codes (IMC/UPC/NEC), union labor rates, crane/engineering constraints.

### CRE lease abstraction for small property managers
- ASC 842 accounting standard forces permanent lease-data extraction demand; 4–6 paralegal-hours per lease.
- Domain-specific clauses (percentage rent, go-dark, SNDA, exclusive use) that generic extraction misparses.
- Harvey-style players serve big law / big REITs; small landlords and managers are the gap.

### Also noted from research (weaker fit)
- Insurance submissions intake (mid-size carriers/MGAs) — clear WTP but enterprise sales cycle, regulated, hard for a first solo product.
- Construction scheduling / precision ag / clinical trial matching — big pain, but longer sales cycles and heavier domain lift.

---

## 4b. Idea C (full workup): Testimonial collection for agencies — "ProofLoop"

The only category found that satisfies ALL user criteria simultaneously: proven viral loop, proven ≥$1K MRR (floor AND ceiling), simple solo build.

### Proof the market pays (revenue, public)
- **Senja: ~$70K MRR** (marketergems, Jun 2025), 4 employees, founded 2022 — proves the ceiling.
- **Testimonial.to: $4K MRR / $48K ARR** (profitable.app, solo founder) — proves a solo dev can clear $1K+.
- ~850 micro-SaaS products sit in the $1K–$5K MRR band (BigIdeasDB) — the "first $1K" goal is statistically normal, not lucky.

### The viral loop (why this category spreads itself)
Every widget / "wall of love" embedded on a customer's site carries a "Powered by X" backlink (free plan). Each new customer's website becomes a billboard to every visitor who owns a business. K-factor loop: embeds → views by business owners → signups → more embeds. Plus build-in-public + affiliate program (Senja's exact playbook, documented publicly from $0→$250 MRR→$70K).

### Competitor comparison (researched 2026-08-30)
| Competitor | Pricing | Positioning | Gap exposed |
|---|---|---|---|
| Senja | Free / ~$19-49/mo | Creators + SMBs, fun brand, best-in-class PLG | Agency/multi-client is an afterthought |
| Testimonial.to | from $50/mo | Bootstrapped, narrow, brand monitor on higher tiers | Pricey at entry; no agency workspace |
| Shoutout | Lifetime deals | Cheap one-time pricing | Race-to-bottom, no recurring focus |
| Shoutjar | Free trial | AutoDiscovery (web monitoring), AI features | Generalist, no vertical depth |
| Famewall, Wisernotify, StoryPrompt, Endorsal, Vocal Video, ProofFlow | $20-100/mo | Generic SMB social proof | All horizontal; nobody owns a segment |

### The wedge (where the data points)
**Agency/client-proof management**: multi-client workspaces, white-label widgets (no "Powered by" for clients), per-client testimonial collection links + monthly proof reports, import from Google/G2/Trustpilot.
- Agencies manage 5–30 client accounts → 1 sale = 10–30 widget embeds (multiplies the viral loop per customer).
- Agencies are reachable by cold outreach (directories, LinkedIn) and pay $49–99/mo without flinching (client billable value).
- Senja has an "agency plan" page but generic SMB positioning dominates its roadmap and brand — segment-owned positioning beats feature parity at the bottom end.
- Secondary angle if agency outreach fails: WhatsApp-first collection for regional/service businesses (India, LATAM) — no competitor found doing this.

### Moat (honest assessment)
1. **Widget backlink network** (SEO compounding — Senja's real moat; takes 12+ months to build).
2. **Agency switching costs**: client workspaces + white-label settings + collection pipelines embedded in agency SOPs — high friction to rip out.
3. **Collection data**: import history + client approval workflows = system-of-record status.
Weakness to accept: months 1–6 the moat is thin; speed of embed acquisition is the whole game.

### Pricing model (matched to competitor gaps)
- Free: 1 project, "Powered by" branding (viral loop fuel)
- $29/mo: solo consultants, branding removed
- $79/mo: 10 client workspaces, white-label, monthly proof reports, G2/Google import
- Outcome-flavored hook for outreach: "Your clients' proof, managed and reported — bill it into your retainer."

### Build scope (solo, 3–5 weeks)
Form builder + collection links, approval queue, embeddable widgets (vanilla JS), multi-tenant workspaces, Stripe, import via Google Places API. No AI required for MVP (AI tagging/summarization = v2). One backend dev, boring stack, near-zero marginal cost.

### Distribution plan
1. Free plan + widget backlinks (the loop).
2. Cold outreach: 20 agencies/week — pitch "add proof management to every client retainer."
3. Build in public from day 1 (documented playbook exists — Senja's $0→$250 MRR post).
4. Directories (Product Hunt, SaaSHub, alternativeto "Senja alternative" pages — proven SEO intent).

### Risks (no sugarcoating)
- 15+ competitors; Senja is strong and loved. Segment positioning (agencies) is mandatory — a generic clone dies.
- Viral loop takes months to compound; cold outreach carries months 1–3.
- Lifetime-deal competitors (Shoutout) anchor prices down at the bottom.

### Validation checklist (before building)
- [ ] Interview 10 marketing/web agencies: how do they collect client testimonials today? What do they charge clients for it?
- [ ] Pre-sell 3 agencies at $49/mo with a Notion + Typeform concierge version
- [ ] Confirm 1 sale = multi-widget spread (client sites) before writing embed infrastructure

### Sources
- https://www.marketergems.com/p/senja-product-led-growth-strategy (Senja $70K MRR + PLG breakdown)
- https://senja.io/blog/from-0-to-250-mrr-how-we-broke-out-of-absolute-zero (documented $0→$250 playbook)
- https://profitable.app/companies/testimonial.to (Testimonial.to $4K MRR)
- https://senja.io/blog/testimonial-to-alternatives + https://wisernotify.com/blog/testimonial-to-alternatives (competitor pricing/gaps)
- https://shoutjar.com/guides/shoutout-alternative (feature landscape)
- https://bigideasdb.com/micro-saas-examples-2026 ($1K–$5K band: ~850 products)

---

## 4c. Option B (considered, rejected as primary): Waitlist / referral-launch tools
- Viral by design (end users invite friends), market ~$500M at 12% CAGR; Viral Loops from $49/mo (920+ companies), Prefinery since 2008, LaunchList at $19 one-time.
- Rejected: pricing race to the bottom (one-time $19 anchors), episodic usage = churn after each launch, and 3+ entrenched incumbents. Viral mechanics are better *borrowed* (widget embeds) than the whole product.

---

## 5. "Do Not Build" List (with data)

- Horizontal AI wrappers — median $7 MRR, ~90% fail by end of 2026.
- Dev tools sold to developers — median $68 MRR, worst category tracked.
- Prompt-only agents — one-year churn risk ("prompts are portable," SaaStr).
- MCP / agent-integration infrastructure — being absorbed by Zapier, n8n, iPaaS (SnapLogic, Workato, MuleSoft all shipped native MCP).
- AI code migration tools (Codemod, Grit, Google internal tooling) — crowded; devs are worst-paying buyers.
- Generic Stripe card-retry dunning (see Churn Ledger verdict above) — indie wave of near-identical launches in 2026.

---

## 6. Decision filter for choosing among these

1. Which industry do you have the most exposure/warm contacts in? (Domain knowledge is the moat, not code.)
2. Which buyer can you reach with cold outreach *this week*?
3. Which pain can you demonstrate ROI on within 30 days?
4. Does the moat survive "prompts are portable" (data / integrations / workflow)?

## 7. Universal validation checklist (before writing product code)

- [ ] 5–10 buyer interviews (quantify current spend + hours on the workflow)
- [ ] Find the dated demand signal (funding round, regulation, platform shift in 2025–2026)
- [ ] Run the workflow manually (concierge) for 1–2 real companies for 2 weeks
- [ ] Confirm real recoverable / saved money exists and the buyer agrees on the number
- [ ] Collect pre-orders / LOIs / waitlist before building the product

---

## 8. Sources

**Market saturation / vertical AI:**
- https://bigideasdb.com/saas-market-trends-2026 (median AI SaaS MRR $7; 49.2% AI concentration)
- https://bigideasdb.com/saas-market-saturation-2026 (30,000+ Stripe companies, 83 categories)
- https://bigideasdb.com/saas-ideas/dev-tools (dev tools median $68 MRR)
- https://preuve.ai/blog/vertical-ai-startup-ideas-2026 (vertical AI $10.3B, 3,800 shutdowns, freight/MEP/CRE data)
- https://preuve.ai/blog/are-micro-saas-ideas-still-profitable-2026 (wrapper economics, vertical SaaS $157B)
- https://www.ycombinator.com/library/Lt-vertical-ai-agents-could-be-10x-bigger-than-saas
- https://www.grandviewresearch.com/industry-analysis/vertical-ai-market-report
- https://www.wellington.com/en/insights/the-transformative-power-of-vertical-ai-agents
- https://zylos.ai/research/2026-06-27-vertical-ai-agent-deployment-horizontal-platform-domain-solutions/ (Harvey $190M ARR)

**Agentic AI market:**
- https://mev.com/blog/what-2025-2026-data-reveal-about-the-agentic-ai-market ($9.14B 2026; Gartner 40% stat)
- https://www.saastr.com/the-wave-of-ai-agent-churn-to-come-prompts-are-portable/ (one-year deals, churn risk)
- https://chartmogul.com/reports/saas-retention-the-ai-churn-wave/

**Churn Ledger competition:**
- https://churnkey.co/pricing ($250/mo starter)
- https://slickerhq.com/pricing (pay-for-performance, $50M+ slider)
- https://churnbuster.io/pricing (white-glove, advisory $1,000+)
- https://www.reduxpayments.com/blog/best-failed-payment-recovery-tools (pay-on-lift pricing models)
- https://www.flycode.com/benchmarks/stripe-failed-payment-recovery (lift-above-Stripe benchmark)
- https://docs.stripe.com/billing/revenue-recovery (Smart Retries default: 8 tries / 2 weeks)
- https://stripe.com/en-ch/lp/churn-benchmarks (Stripe recovered $6.5B in 2024)
- https://churnkey.co/blog/involuntary-churn-benchmarks (involuntary churn by price point)
- https://www.indiehackers.com/Retryfix (indie entrant, 10% rev-share)
- https://www.reddit.com/r/SaaS/comments/1s4da7u/ (indie $49/mo flat-fee entrant; $12K/yr fee complaints)
- https://www.reddit.com/r/SaaS/comments/uyi8l1/ (founder dunning pain thread)
- https://baremetrics.com/blog/dunning-solutions-for-startups (startup dunning context)

**Freight / MEP / CRE validation data:**
- https://preuve.ai/blog/vertical-ai-startup-ideas-2026 (sections: Freight Invoice Audit, Field Services Quoting, CRE Lease Abstraction)
