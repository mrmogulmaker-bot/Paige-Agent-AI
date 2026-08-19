# Analytics — research note and gap analysis

Written for the Claude Code handoff. Sources are 2026 industry benchmarks; every
figure below is a benchmark to compare against, not a claim about our fleet.

## What the research says each tier looks for

**SMB / Solo tenants** care about one question: is this paying for itself. They
read CAC payback (SMB median 8–12 months), simple channel ROAS, and whether the
tool is being used. They do not read cohort tables.

**Mid-market / Agency tenants** care about efficiency and portfolio health. NRR
best-in-class sits around 110%+ for mid-market B2B SaaS. CAC payback 14–18
months. They read blended ROAS across clients, per-client margin, and utilisation.

**Enterprise tenants** care about forecast confidence and governance. CAC payback
18–24 months, higher CLV (often $46k+ with expansion), and they expect a forward
revenue outlook with a stated confidence interval, not a point estimate.

## The three lenses we were missing

### 1. Marketing / Ads
The single biggest gap. Research is unanimous on one point: **platform-reported
ROAS is systemically inflated** because every platform claims credit for the same
conversion. A brand seeing 4.2x on Meta, 6x on Google and 3.5x on TikTok can still
be breaking even. The honest metrics are:

- **MER / blended ROAS** — total revenue ÷ total spend. Cannot be gamed by
  attribution windows. Use for budget allocation and board reporting.
- **Channel ROAS** — still needed, because MER cannot tell you what to cut.
- **Attribution gap** — platform-claimed revenue vs blended reality, shown as a
  number. This is the metric nobody displays and everybody needs.
- **Gross-margin ROAS** — profit after cost ÷ spend. 4x on a 30% margin product
  is not 4x on a 70% margin product.
- **Blended CAC and channel CAC** — exclude retention spend from the numerator.
- Spend, CPC, CTR, impressions per platform, with per-column shading.

Benchmark: blended ROAS around 3.0 is solid for US DTC. Blended CAC ratio hit
$1.61 spent per $1 of new ARR in 2023, up 22% year over year.

### 2. Social
Organic against paid, engagement rate, follower growth, sessions by channel,
share of voice. The 2026 shift is server-side tracking (Meta CAPI) plus marketing
mix modelling for total lift, because cookies are gone. Contextual targeting now
performs within 5–8% of behavioural on CTR — worth stating so nobody assumes
privacy compliance costs performance.

### 3. Forecast (predictive)
Research consensus: most dashboards are 90% descriptive, 10% diagnostic, and the
2026 opportunity is a predictive layer **on top** rather than a replacement. The
recommended build order, easiest first:

1. **Anomaly detection** — cheapest win, catches the 20% overnight drop and
   distinguishes it from a gradual 5% decline.
2. **Churn prediction** — score per tenant with the *driver named*. Feature
   importance is the point: one platform found "days since last comment" was the
   top driver, which produced a product change, not just a warning.
3. **Predictive LTV / expansion propensity** — upsell scoring lifted one team's
   upsell conversion from 8% to 15%.
4. **Revenue forecast with a confidence interval** — a 30-day forward outlook at
   95% CI is what enterprise and investors expect. A point estimate reads as a
   guess.

Even a 70% accurate churn model pays for itself, because effort concentrates on
genuinely at-risk accounts. A 10% lift in churn-detection accuracy is worth
roughly 3–5% of ARR.

## Where predictive belongs — a ruling worth making

The owner asked whether Analytics is the right home for predictive measurement.
Recommendation: **the reading belongs in Analytics, the action does not.**

Analytics is where you see the churn score, the forecast band, the anomaly. But
the *act* belongs where that act lives — a retention outreach is a Comms draft,
a tier change is a Provisioning ruling, widening her lane is a Trust Compass
knob. If Analytics starts executing, it becomes a second control surface and §18
breaks. Every predictive card should therefore end in a link to the surface that
owns the action, never a button that does it in place.

## Metrics missing from lenses we already had

**Revenue** — ARPU, CLV, **LTV:CAC ratio** (3:1 is the health line), CAC payback
by tier, expansion revenue as its own line, quick ratio (new+expansion ÷
churned+contracted).

**Retention** — logo retention separate from revenue retention; monthly plans
churn 4.7× faster than annual, so plan term belongs in the cohort view.

**Product** — activation rate, time-to-value, DAU/WAU/MAU stickiness. One study
found 1 in 4 paying customers does nothing at all, which is the metric that
predicts churn earliest.

## Substrate needed

None of the above exists as a record yet. Order of dependency:

1. Ad-platform connectors (Meta, Google, LinkedIn, TikTok, Bing) writing spend,
   impressions, clicks and platform-claimed conversions per day per tenant.
2. A revenue-attribution join so blended ROAS and the attribution gap can be
   computed rather than asserted.
3. An event stream with tenant_id for activation, stickiness and anomaly
   detection.
4. A model-serving path for churn score and forecast, storing the score, the
   confidence, and the top three drivers — the drivers are what make it usable.

Until each exists the corresponding lens shows the amber marker and says the
figures are stand-ins. A predicted number presented as fact is worse than no
prediction.
