# Doctrine §201 — Public-Facing Language Discipline

**Status:** Codified 2026-07-02 with Sprint P.0.

## Rule
Public-facing surfaces (landing pages, `/for-owners`, `/pricing`, `/about`, `/blog`, legal pages, transactional email templates, in-product upgrade prompts) must:

1. **Never** use the word "operator" as a noun for the audience. Replace with **business owner**, **entrepreneur**, **founder**, **executive**, or **boss**.
2. Read at **8th–9th grade** level or below (Flesch–Kincaid), consistent with FCRA consumer-comprehension standards.
3. Avoid unexplained jargon: pipeline, GTM, SaaS, orchestration, ontology, primitive.
4. Legal disclaimers may exceed the grade cap where regulation dictates.

## Enforcement
- Edge function `doctrine-201-language-sweep` runs weekly (pg_cron).
- Sweeps: `/`, `/for-owners`, `/about`, `/blog`, `/legal/*`, `PricingSection.tsx`, `Footer.tsx`.
- Regex: `\boperator(s)?\b` case-insensitive, plus reading-level heuristic.
- Findings written to `paige_audit_log` with `action='doctrine_201_violation'` and notify platform owner.

## Exceptions
- Internal (admin-only) copy is exempt.
- Doctrine documents themselves and RCA/postmortem text may quote the forbidden term when explaining §201.
- Backend variable names, database columns, and code identifiers are exempt (see §193 vendor-neutral naming for the internal companion rule).
