-- Create knowledge base tables for Paige AI

-- Create an enum for knowledge categories
CREATE TYPE public.knowledge_category AS ENUM (
  'framework',
  'principle',
  'practice',
  'model',
  'stage',
  'implementation'
);

-- Create knowledge_base table to store all framework content
CREATE TABLE public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category knowledge_category NOT NULL,
  framework TEXT NOT NULL, -- e.g., "3M", "Make", "Manage", "Multiply", "MFM", "BUILD", etc.
  content TEXT NOT NULL,
  summary TEXT,
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster searches
CREATE INDEX idx_knowledge_base_framework ON public.knowledge_base(framework);
CREATE INDEX idx_knowledge_base_category ON public.knowledge_base(category);
CREATE INDEX idx_knowledge_base_tags ON public.knowledge_base USING GIN(tags);
CREATE INDEX idx_knowledge_base_content_search ON public.knowledge_base USING gin(to_tsvector('english', content));

-- Enable Row Level Security
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read knowledge base
CREATE POLICY "Knowledge base is readable by authenticated users"
ON public.knowledge_base
FOR SELECT
TO authenticated
USING (true);

-- Only admins can manage knowledge base
CREATE POLICY "Admins can manage knowledge base"
ON public.knowledge_base
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_knowledge_base_updated_at
BEFORE UPDATE ON public.knowledge_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert 3M Framework knowledge
INSERT INTO public.knowledge_base (title, category, framework, content, summary, tags) VALUES
('3M Framework Overview', 'framework', '3M', 
'The 3M Framework—Make, Manage and Multiply—is the backbone of Mogul Maker Academy''s offer. Each "M" represents a distinct stage of wealth building: creating the foundation, stewarding the resources and scaling through investment and acquisitions.',
'Core framework with three stages: Make (foundation), Manage (stewardship), and Multiply (scaling)',
ARRAY['3M', 'framework', 'wealth-building', 'core']),

('MAKE - Foundation & Creation', 'framework', 'Make',
'Making money requires both earning income and building a reliable foundation. This includes: holding jobs, starting businesses (physical and online), investing in assets, offering freelance services, creating digital products, affiliate marketing, and renting out assets. Critical requirements include strong personal and business credit profiles, proper budgeting, and compliance. Corresponds to BUILD, LAUNCH, and DRIVE frameworks.',
'First stage: Build income streams and establish credit foundation',
ARRAY['make', 'income', 'credit', 'BUILD', 'LAUNCH', 'DRIVE']),

('MANAGE - Stewardship & Optimization', 'framework', 'Manage',
'Effective money management involves budgeting, saving, debt reduction, risk management and asset protection. Key activities: identifying financial leaks, developing savings habits, reducing frivolous spending, paying off high-interest debt, building emergency funds, maintaining good credit (paying bills on time, using credit responsibly), monitoring credit reports, and implementing risk management frameworks. Supports MFM (Money Follows Management), REPORT, SHIELD, and ACCEL frameworks.',
'Second stage: Optimize resources through budgeting, risk management, and asset protection',
ARRAY['manage', 'budgeting', 'risk-management', 'MFM', 'REPORT', 'SHIELD', 'ACCEL']),

('MULTIPLY - Scaling & Expansion', 'framework', 'Multiply',
'Multiplying wealth requires using existing capital to generate additional returns through investments, acquisitions and scaling strategies. Methods include: real estate investing, stock market investing, building diversified portfolios, compound interest reinvestment, launching new businesses, creating side-hustles, and passive income streams. Real estate offers cash flow, tax breaks, appreciation, equity building, portfolio diversification, leverage, and inflation hedging. Supports FUND, REAL, KEYS, and ACQUIRE frameworks.',
'Third stage: Scale wealth through investments, acquisitions, and strategic growth',
ARRAY['multiply', 'investing', 'real-estate', 'acquisitions', 'FUND', 'REAL', 'KEYS', 'ACQUIRE']);

-- Insert BUILD Framework details
INSERT INTO public.knowledge_base (title, category, framework, content, summary, tags) VALUES
('BUILD Framework', 'framework', 'BUILD',
'Business credit building framework with 5 steps: B - Business Formation (establish legal entity), U - Utilize Credit (build business credit profile), I - Income Verification (document revenue streams), L - Leverage Funding (access business credit lines), D - Diversify Credit (expand credit portfolio). Essential for establishing foundational business credit and funding access.',
'5-step framework for building business credit: Business, Utilize, Income, Leverage, Diversify',
ARRAY['BUILD', 'business-credit', 'framework', 'make']);

-- Insert Money Follows Management Framework
INSERT INTO public.knowledge_base (title, category, framework, content, summary, tags) VALUES
('Money Follows Management Framework Overview', 'framework', 'MFM',
'Comprehensive mindset and leadership framework that integrates timeless success wisdom (Think and Grow Rich, Rich Dad Poor Dad, Dale Carnegie) with modern neuroscience and coaching insights (Steve Jobs, Tony Robbins, Alex Hormozi). Core principle: transforming mindset drives growth and wealth creation.',
'Leadership framework combining classic success principles with modern neuroscience',
ARRAY['MFM', 'mindset', 'leadership', 'framework']),

('Aligning Mission and Purpose', 'principle', 'MFM',
'True success begins by aligning personal values with business goals. Clarity of purpose creates an inner compass and resilience. Define a "Definite Major Purpose" (Napoleon Hill) - a burning desire or vision that guides all effort. Wealth comes from managing fear and making money work for us, not just earnings. Practices: Create personal mission statement, list core values and business goals, daily reflection on "why I''m in business" through journaling or vision-boarding. Mental models: Ikigai, Burning Bow, Eisenhower Matrix.',
'Align values with goals to create purpose-driven success',
ARRAY['purpose', 'mission', 'values', 'MFM']),

('Focus: Signal Over Noise', 'principle', 'MFM',
'High performers filter out everything but the signal. Steve Jobs defined "signal" as the top 3-5 mission-critical tasks and ruthlessly blocked out the rest as "noise". Decision quality hinges on mental clarity and concentration, not multitasking. Practices: Time-blocking for deep work, Daily Top 3 task list, no-meeting/no-screen periods, Pomodoro Technique.',
'Ruthlessly prioritize critical tasks and eliminate distractions',
ARRAY['focus', 'productivity', 'prioritization', 'MFM']),

('Neuroscience of Clarity and Discipline', 'principle', 'MFM',
'Calm, focused attention yields better outcomes. Leaders reach a "clarity state" (balanced mind-body-emotion equilibrium) when relaxed, positive, and focused. Under stress, brains fall into cortical inhibition, closing down parts of the brain. Practices: Daily mindfulness/meditation (10 min breathing), physical exercise before work, journaling, prime time visualization. Mental models: Zone of Optimal Performance, Stoic Dichotomy, Cognitive offloading.',
'Train brain for clarity through mindfulness and stress management',
ARRAY['neuroscience', 'discipline', 'clarity', 'MFM']),

('Habit Reprogramming', 'principle', 'MFM',
'Sustainable discipline comes from habits hardwired in the brain. Breaking bad habits or instilling good ones requires rewiring neural circuits through repetition (neuroplasticity). Practices: Identify keystone habits, habit stacking, trigger-routine-reward tracking, accountability partners, self-reflection journaling. Mental models: Habit Loop (Cue→Craving→Response→Reward), Kaizen Principle (1% daily improvements), Activation Energy concept, If-Then Plans.',
'Rewire brain through deliberate habit formation and neuroplasticity',
ARRAY['habits', 'discipline', 'neuroscience', 'MFM']);

-- Insert Growth Stages
INSERT INTO public.knowledge_base (title, category, framework, content, summary, tags) VALUES
('Stage 1 - Treadmill (Solo Hustle)', 'stage', 'MFM',
'Revenue ~$0–$1M. Founder does everything (sales, ops, admin). Life feels like non-stop grind. Mindset shift: Begin transitioning from doer to builder. Start delegating one task and time-blocking strategic work.',
'Initial startup stage: founder-led everything, transition to delegation begins',
ARRAY['growth-stage', 'startup', 'solo', 'MFM']),

('Stage 2 - Trailblazer (Chaos Manager)', 'stage', 'MFM',
'Early team (1-5 people). Roles blur, communication spotty, enthusiasm spikes into chaos. Mindset shift: Embrace structure. Introduce basic processes (regular team meetings, clarified roles), hire first lieutenant, think long-term strategy instead of fire-fighting.',
'Early team stage: managing chaos through structure and processes',
ARRAY['growth-stage', 'team-building', 'structure', 'MFM']),

('Stage 3 - Strategy Maturation', 'stage', 'MFM',
'Founder must think in systems and strategy, not individual deals. Mindset shift: Adopt coachable mindset. Invest in learning (executive coaches, MBAs, masterminds), design workflows, focus on planning (marketing plan, hiring roadmap). Growth depends on designed processes, not just hustle.',
'Strategic growth stage: systems thinking and process design',
ARRAY['growth-stage', 'strategy', 'systems', 'MFM']),

('Stage 4 - Pathfinder (Scaling Systems)', 'stage', 'MFM',
'Processes documented, revenue doesn''t depend on founder, culture consistent. Mindset shift: Personal leadership growth must match organizational growth. Focus on optimization and delegation: measure KPIs, empower middle managers, refine culture. "I''m the problem, and I''m the solution."',
'Scaling stage: systematic growth and leadership development',
ARRAY['growth-stage', 'scaling', 'systems', 'MFM']),

('Stage 5 - Legacy (Enterprise Leadership)', 'stage', 'MFM',
'Business becomes self-sustaining beyond founder. Mindset shift: Think long-term legacy - succession planning, systematizing knowledge, handing off without collapse. Leadership is visionary and mentoring next generation.',
'Legacy stage: sustainable enterprise and succession planning',
ARRAY['growth-stage', 'legacy', 'succession', 'MFM']);