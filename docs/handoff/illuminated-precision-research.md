# Illuminated Precision — visual research and design-system note

**Date:** 2026-08-22  
**Scope:** final visual pass for `/tenant-redesign`

## Research method and access note

The pass began with the repository’s existing PAIGE taxonomy, handoff, capability matrix, symbol contract, connected Calendar and Conversations implementations, responsive CSS, and verification tests. External reference retrieval was attempted against Apple Human Interface Guidelines, IBM Carbon data-visualization guidance, and W3C focus guidance; both the configured web tool and direct HTTPS access were blocked by the execution environment (401/403 proxy responses). No unverifiable quotation or copied external implementation is presented as research evidence.

The following published reference families informed principle-level review from their established public design guidance, not visual imitation:

- Apple HIG: spatial continuity, reduced-motion respect, and motion that explains origin/destination.
- IBM Carbon data visualization: non-color status encoding, accessible categorical distinction, and data-legibility before decoration.
- W3C WCAG 2.2: perceivable focus, keyboard operation, contrast, and status communication that does not depend on color.
- Figma’s canvas/inspector interaction model: preserve the working object while revealing contextual controls.
- Stripe-style information design: progressive disclosure and consequence-first transactional clarity.
- Linear/Vercel-style restraint: compact hierarchy, disciplined density, and responsive precision.
- Operational lineage systems: nodes and paths must identify real source, state, dependency, and impact rather than form a decorative network.
- Architectural and automotive controls: warm/cool material temperature, limited high-attention zones, precise alignment, and controls grouped by consequence.

## Extracted principles

1. Give operational work the viewport; move explanation into concise truth lines, inspectors, and evidence drawers.
2. One global command bar and one compact location row are sufficient. Operational pages do not need an editorial banner.
3. Use material temperature before shadow: cool recessed fields for infrastructure/data, neutral graphite for routine work, warm instruments for human authority and PAIGE guidance.
4. Reserve spectral illumination for selected intelligence and transition edges, never whole-screen decoration.
5. Distinguish status with shape, label, icon, edge, and position as well as color.
6. Treat Calendar, Conversations, Studio, and Insights as continuous instruments with internal scroll regions—not long marketing pages.
7. Spatial transitions must preserve object selection, draft, scroll position, tenant, and authority context.
8. Light mode requires independent tonal decisions: warm mineral atmosphere, cooler plotting wells, smoked type, bronze/graphite rules, and reduced illumination radius.

## Intentionally rejected

- Recognizable layouts, icons, animations, or brand signatures from any named reference.
- Purple/blue “AI” gradients, generic glass cards, glow as hierarchy, ornamental node galaxies, KPI-card grids, and oversized editorial introductions on operational screens.
- Introducing an animation, chart, or window-management dependency for visual novelty.
- Treating fixture counts as live metrics or using polished fictional data to fill space.

## PAIGE distinction

PAIGE’s system is built around the Command Mark, Sovereign authority, five physical depth levels, warm/cool operational temperature, cut/stepped geometry, evidence-linked intelligence, and visible movement from signal → interpretation → governed action → execution. Calendar events, conversation promises, Studio artifacts, and insight signals can all open PAIGE in the current object context without becoming separate chats.

## Open-source code and licenses

No dependency or third-party visual asset was added in this pass. Existing project dependencies used by the prototype are:

- React — MIT License.
- Lucide React — ISC License. Icons are normalized through PAIGE’s instrument treatment; no third-party brand icon is adopted.

All new layout, material, Calendar/Conversations anatomy, semantic tokens, transitions, and workspace synchronization code is repository-native.
