# Creative Engine — Owner Spec (verbatim, 2026-07-19)

> Source: owner (Antonio). Build to this TO A T (#343).

  I just want you to see it for yourself. Whatever was done is not able to be seen. I'm showing you the difference between dark mode and light mode right now, and unfortunately, dark mode right now looks like it's light mode. 

This is probably the last thing that we need to build out on the inside of the vibe studio. These are the enhancements that we're going to make to the actual creative abilities inside of the project sessions when it comes to our ability to create on high levels. 

Vibe Studio Upgrade — Intelligence + Interaction + Premium Motion
Owner: Antonio Cook · Doctrine anchors: §1 (team), §5 (compliance officer), §7 (intelligent portal), §11 (world-class floor — gold discipline), §12 (extend, don't rebuild), §13 (world-class build), §14 (right model per capability), §15 (Paige is the innovative assistant that learns), §17 (model router = margin), §25 (design taste — screenshot review loop).
Objective
Bring Vibe Studio from "competent AI-generated pages" to "Hormozi/Brunson/Perspective/Framer/Vercel-tier direct-response and premium-motion output." Six coordinated upgrades in this wave, one wave deferred honestly. Nothing about this is one file's problem — this is a Studio-wide capability upgrade wired at the router, memory, prompt-forge, agent, and rendering layers together.
The six upgrades (this wave)
Generative UI in chat — the Design Agent returns clickable choice cards, not just text
Extended-thinking display — collapsible reasoning panel using Claude's native thinking parameter
Studio session memory — working scratchpad + tenant tokens + Phase A/B integration
Direct-response pattern library — 8 expert-crafted meta-prompt templates for landing pages / funnels / quizzes
Design-critic gold-discipline hardening — fix the shipped bug where gold-as-background made it to production
Premium motion + 3D + CSS toolkit — install and scaffold Framer Motion, React Three Fiber, Spline, and a curated CSS effects library so the Design Agent has actual premium visual capabilities
Grounding requirements (§18) — before any Edit
Read the current Design Agent implementation. Where does its system prompt live? What models does it call? What tools does it have access to?
Read the Studio chat message schema. What message types exist? How are agent messages rendered in the UI?
Read the design-critic implementation Claude Code just built. Confirm where §11 gold discipline is enforced — and identify WHY the gold-as-background page shipped despite the critic being in place.
Confirm Phase A + Phase B foundation status. If not yet shipped, this upgrade is BLOCKED — pause and land Phase A/B first.
Confirm which Claude model tier is being used for the Design Agent today (Sonnet 4.5? Haiku? Opus?). Design Agent MUST be on Sonnet 4.5 or Opus 4.8 with extended thinking for this upgrade to matter.
Upgrade 1 — Generative UI (choice cards in chat)
What it does: when the Design Agent needs to ask a discrete choice question (2–4 options), it returns structured agent_choice output instead of plain text. Studio UI renders clickable cards. User's selection flows back as the next turn.
Implementation:
New Anthropic Tool definition on the Design Agent: present_choices(question, options[{label, description, preview?}], allow_multiple, allow_other)
Update Design Agent's system prompt: "When there are 2–4 discrete paths forward, ALWAYS use present_choices — never enumerate options as plain text in prose."
New message type in Studio chat schema: type: 'agent_choice' with the choices payload
Studio chat UI: render agent_choice messages as a card grid (each card: label + short description + optional preview thumbnail)
On click, send type: 'user_choice_response' with the selected value(s) as the next turn
Files:
src/components/admin/studio/chat/AgentChoiceCard.tsx (new)
src/components/admin/studio/chat/ChatMessage.tsx (extend to route agent_choice type)
supabase/functions/paige-ai-chat/index.ts (register present_choices tool; update system prompt)
supabase/functions/_shared/design-agent-prompt.ts (new — externalized system prompt so operator can edit)
Cards must use the primitive layer per §11 — SectionCard, hover state uses indigo focus ring (NOT gold), selection state uses gold ONLY on confirm.
Upgrade 2 — Extended-thinking display
What it does: the "flailing agent" problem from your screenshot ("I see the issue — the funnel tool needs a different approach") goes into a collapsed thinking panel, not the main chat stream. User sees smooth outcome by default; can expand to see reasoning.
Implementation:
Upgrade the Design Agent's Claude call to enable extended thinking:
typescript  {
    model: 'claude-sonnet-4-5',
    thinking: { type: 'enabled', budget_tokens: 8000 },
    ...
  }
Anthropic returns two content block types: thinking and text. Route them separately:
thinking blocks stream into a collapsed <ReasoningPanel /> component
text blocks stream into the main message thread
ReasoningPanel: closed by default with a subtle "Thinking..." label + duration; click to expand and show the reasoning trace with syntax highlighting
Files:
src/components/admin/studio/chat/ReasoningPanel.tsx (new)
src/components/admin/studio/chat/ChatMessage.tsx (route thinking blocks)
supabase/functions/paige-ai-chat/index.ts (enable extended thinking, stream thinking blocks separately)
supabase/functions/_shared/claude.ts (extend to return {thinking_stream, text_stream} tuple)
§13 discipline: if the agent's reasoning includes an error or dead-end (like the "funnel tool needs a different approach" case), the thinking panel captures it honestly — do NOT strip failures. The whole point of visible reasoning is trust, and hiding failures kills trust.
Upgrade 3 — Studio session memory + Phase A/B integration
What it does: the Design Agent stops thrashing because it has real per-session working memory + per-tenant persistent memory.
Three layers:
Session scratchpad — a studio_session_scratchpad field (jsonb) on the existing studio_sessions table. Agent updates it every turn with structured state: {current_goal, sub_goals[], tried[], worked[], failed[], next_step}. Every turn re-injects it into context. Prevents thrash.
Tenant Playbook injection — every Design Agent turn opens with the tenant's brand tokens (name, palette, voice, target market, references) pulled from Playbook. This IS the Phase A prompt-forge running for text.
Cross-session vector recall (Phase B) — before generating anything design-related, the agent runs a recall(userIntent, tenantId) against paige_prompt_memory and pulls the top 3 similar past-approved artifacts as few-shot examples in the prompt. "Tenant approved these before — use them as anchors."
Files:
Migration: add scratchpad jsonb default '{}'::jsonb to studio_sessions
supabase/functions/_shared/session-memory.ts (new — read/write scratchpad, inject on each turn)
supabase/functions/_shared/prompt-forge.ts (already exists from Phase A — extend with recallSimilar(userIntent, tenantId) from paige_prompt_memory)
Design Agent system prompt update: mandatory scratchpad-update instruction
Upgrade 4 — Direct-response pattern library
What it does: Studio outputs go from "AI-generic landing page" to "Hormozi/Brunson/Perspective-tier conversion-optimized design" because the Design Agent has real direct-response patterns in its meta-prompt library — not generic "make a landing page" wingspan.
Seed 8 initial templates into paige_prompt_template:
template_namemodalityproviderpurposelanding-assessment-quiztextclaudeHormozi-style assessment lead magnet (like the one Antonio was building)landing-quiz-funnel-mobiletextclaudePerspective.co-style mobile quiz funnel, one question per screen, progress-drivenlanding-sales-page-longformtextclaudeBrunson-style long-form sales page with story arc, offer stack, guaranteelanding-webinar-registrationtextclaudeWebinar reg with countdown urgency + preview reellanding-product-launchtextclaudeProduct launch with pre-order social proof + waitlist mechaniclanding-lead-magnet-optintextclaudeSimple opt-in for downloadable + email sequence entrylanding-hero-treatmentimageideogramHero visual treatment for landing pages — includes brand-locked type + gold-restraint clauselanding-css-motion-recipetextclaudeThe CSS + Framer Motion patterns to apply to any landing hero — see Upgrade 6
Each template MUST be 400+ tokens, expert-crafted, and end with an explicit Avoid: {{anti_patterns}} clause pulling from CHEESY-TELLS.md. Do NOT phone these in — they are the difference between $30k-copywriter output and generic-AI output.
Reference the greats: each template should be informed by public examples — Alex Hormozi's assessment funnels, Russell Brunson's ClickFunnels templates, Perspective.co's mobile quiz mechanics. This is not copying; it's pattern-learning.
Upgrade 5 — Design-critic gold-discipline hardening (BUG FIX)
The bug: the Design Agent shipped a landing page with gold as the hero BACKGROUND FILL. Per §11, gold is reserved for the act/approve/on moment — never for surface fills, resting borders, or decorative color. The design critic did not catch this.
Fix:
Add explicit rule to the design critic's operating brief (docs/design-references/DESIGN-CRITIC-PROMPT.md) as a BLOCKER-level check:
  ## §11 GOLD DISCIPLINE — HARD BLOCKER
  Gold (--accent, --gold, --gold-dark) is used ONLY for:
  - Primary CTA button fill (Button variant="gold")
  - "On" / "active" / "selected" pill states (StatePill state="on")
  Gold is NEVER used for:
  - Background fills (hero, section, card)
  - Resting borders
  - Decorative icons or avatars
  - Focus rings (indigo only)
  - Body text emphasis (--gold-dark is allowed for headline accent word ONLY)
  Any gold-as-background finding is a BLOCKER, not a should-fix.
Add a code-level linter that greps generated JSX/TSX for bg-gold, bg-yellow, or background: gold on hero/section elements. Fails the build.
Add a live-render check (when Chrome MCP is available in interactive sessions) — screenshot the rendered page, dominant-color-check the top 40% of the viewport. If dominant color falls in the gold hue range (H: 40–60°, S: >40%, L: >30%), flag as §11 violation.
Update the Design Agent's system prompt to explicitly state the gold rule in-line, so it's never composing gold-as-background prompts in the first place.
Upgrade 6 — Premium motion + 3D + CSS toolkit (this is the big one)
What it does: gives the Design Agent actual capabilities for Framer/Vercel/Linear-tier motion, 3D, and premium CSS effects — not just knowledge of them.
Install these libraries into the project:
bash# Motion
npm install framer-motion
npm install lenis                     # smooth scrolling
npm install @studio-freight/hamo      # scroll utilities
npm install lottie-react              # After Effects animations in browser
npm install @rive-app/react-canvas    # Rive interactive animations
# 3D
npm install three @react-three/fiber @react-three/drei
npm install @splinetool/react-spline  # Spline scene embedding
npm install @react-three/postprocessing  # Bloom, chromatic aberration, etc.
# Premium UI motion primitives
npm install sonner                    # best-in-class toasts
npm install vaul                      # best-in-class drawer/sheet
npm install cmdk                      # command menu (Linear cmd+k)
npm install @radix-ui/react-*         # (should already be present via shadcn)
# Premium visual libraries (use SPARINGLY per §11)
# Aceternity UI and Magic UI are copy-paste — no npm install needed
# Curated components go into src/components/premium-motion/
Create the premium motion primitive layer at src/components/premium-motion/:
FadeInSection.tsx — scroll-triggered fade-in with subtle upward drift (uses Framer Motion + Lenis)
AnimatedText.tsx — word-by-word or char-by-char reveals with spring physics
MagneticCTA.tsx — CTA button with subtle magnetic hover (Linear-style)
GradientMasked.tsx — mask-image gradient overlays (Framer marketing does this heavily)
NoiseOverlay.tsx — subtle grain/noise texture (premium editorial feel)
GlassCard.tsx — restrained glassmorphism (backdrop-blur + border + subtle inset shadow)
Spotlight.tsx — mouse-following radial gradient (Aceternity pattern, tastefully done)
ScrollReveal.tsx — CSS-scroll-linked animations (with reduced-motion fallback)
SplineScene.tsx — wrapper for embedding Spline 3D scenes with loading skeleton
R3FScene.tsx — wrapper for React Three Fiber custom 3D
RiveEmbed.tsx — wrapper for Rive interactive animations
Every primitive is useReducedMotion-gated per §11. No exceptions.
Add CSS techniques catalog at docs/design-references/CSS-EFFECTS.md:
CSS mask-image gradient fades (bottom-of-screen fade-outs)
backdrop-filter: blur() with proper webkit-backdrop-filter fallback
Conic gradients for premium borders (border-image: conic-gradient(...))
CSS @property for animatable custom properties
Container queries for component-level responsive
View Transitions API for page transitions (progressive enhancement)
CSS Scroll-Driven Animations (progressive)
CSS color-mix() for programmatic hue shifts
text-wrap: balance for premium typography
hanging-punctuation for editorial
Add motion anti-patterns to CHEESY-TELLS.md:
No animate-bounce on non-loading elements
No parallax that exceeds 20% of scroll distance
No animation without useReducedMotion guard
No "reveal on scroll" for every element — motion serves the moment
No 3D scenes on mobile without prefers-reduced-motion skip
No sound on autoplay video/audio, ever
No motion durations over 800ms — feels sluggish
No linear easing on organic elements — use spring or cubic-bezier
Motion must have a purpose: guide attention, communicate state, or delight — never decorate
Update Design Agent's toolkit registration:
Register the premium motion library as callable capabilities the Design Agent can request:
typescript// _shared/design-agent-tools.ts
export const DESIGN_AGENT_MOTION_TOOLS = [
  'use_framer_motion_reveal',
  'use_spline_3d_scene',
  'use_r3f_custom_3d',
  'use_lottie_animation',
  'use_rive_interactive',
  'use_scroll_triggered_animation',
  'use_magnetic_cta',
  'use_gradient_mask',
  'use_glass_card',
  'use_spotlight_effect',
];
When the Design Agent recognizes a moment that warrants premium motion, it invokes the tool, which composes the appropriate JSX using the primitive layer. Not raw CSS — always the primitive.
Spline integration for 3D scenes specifically:
Set up Spline account (spline.design)
Store scene URLs in paige_studio_asset table (extend existing studio_library_items table)
Design Agent can request "generate a 3D hero scene for X" — this generates the R3F code OR references a curated Spline scene from the tenant's asset library
Studio operator can upload Spline scenes to the tenant's asset library
3D scenes lazy-load with skeleton fallbacks; skip entirely under prefers-reduced-motion
Model stack per capability (§14 right model per job)
TaskModelTierDesign Agent reasoning + copyClaude Sonnet 4.5 with extended thinkingfrontierDeep design critiqueClaude Opus 4.8frontierPrompt refinement passClaude Haikufrontier (cheap)High-volume text variationGroq Llama 3.3 70Bopen-fastEmbedding for memory recallFeatherless bge-large-en-v1.5open-flexibleHero graphics + text-in-imageIdeogram(dedicated)Illustration + hero backgroundsFlux Pro via Replicate(dedicated)3D models (text-to-3D)Meshy(dedicated)React component generation for landing pagesClaude Sonnet 4.5 (primary), optional v0 API fallbackfrontier
Doctrine gates — enforced in code
§9 tenant scope — session scratchpad, memory recall, asset library all tenant-scoped by RLS
§11 gold discipline — hard blocker in critic + code linter (see Upgrade 5)
§13 honest reasoning — extended thinking captures failures, doesn't strip them
§17 open-tier for volume — embeddings never route to frontier
§25 screenshot review loop — mandatory Chrome-MCP pass before Studio surface merge
What NOT to do this wave (deferred honestly)
Do NOT wire v0 API this wave. Claude Sonnet 4.5 direct is sufficient for React generation. Add v0 as a specialty fallback in Wave 2 if quality gap emerges.
Do NOT wire Rive interactive animations into a real Studio surface this wave. Install the library and build the primitive wrapper only. Real Rive scene creation is a Wave 3 lift.
Do NOT ship Spline scenes to production without a tenant approving the specific scene. Auto-generated 3D is genuinely bad. Curated + tenant-approved only.
Do NOT enable View Transitions API on Studio-generated pages until browser support hits >90% globally. Progressive enhancement only.
Do NOT build a full drag-and-drop scene editor. That's a Framer-scale product; not this quarter.
Verification before merge (report back)
Diff summary — every file created / modified.
Generative UI proof — screenshot of a Studio session where the Design Agent presented choice cards. User clicks flow through correctly. Paste the flow.
Extended-thinking proof — screenshot of the collapsed thinking panel + expanded view showing real reasoning trace from a live Studio session.
Session memory proof — take a new Studio session, ask something. Take a second session same tenant, reference "like last time." Confirm the memory recall pulled the right past artifact into context. Paste the retrieved prompt.
Pattern library proof — query paige_prompt_template for the 8 new templates. Paste names + sample body from the landing-assessment-quiz template. Confirm body quality bar (not phoned-in filler).
Design critic gold fix proof — attempt to have the Design Agent generate a page with gold-as-background. Critic MUST block. Paste the blocker output.
Motion toolkit proof — screenshot of the src/components/premium-motion/ folder with all primitives created. Import test from a Studio surface confirming they compile.
3D primitive proof — a test SplineScene invocation with a placeholder scene URL renders correctly with loading skeleton + prefers-reduced-motion fallback.
§11 gold discipline linter proof — run the linter against a synthetic file with bg-gold on a hero element. Confirm build fails.
CI deploy green — all edge functions rebundle successfully.
Report structure back to Antonio
"What shipped" — file list, migrations, packages installed
"Six upgrades verified" — the 10 proofs above with paste-in evidence
"Live test" — take one existing Studio session (or create a new one), run a full test flow: user asks for a landing page, agent uses choice cards to clarify, thinking panel shows reasoning, memory recall pulls past patterns, design critic gates for §11, motion primitives are available. Paste screenshots at each stage.
"Model calls per session" — average token cost of a full landing-page generation with the new stack. Cost should be under $0.50 per session for pattern + refinement + critic passes.
"Open questions / follow-ups" — anything you had to decide unilaterally

I'm going to go to bed after we finish shipping this one.