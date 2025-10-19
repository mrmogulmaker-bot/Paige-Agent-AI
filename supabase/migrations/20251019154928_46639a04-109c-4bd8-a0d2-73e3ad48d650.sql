-- Voice command telemetry logs
CREATE TABLE IF NOT EXISTS public.voice_command_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  turn_id text NOT NULL,
  utterance text NOT NULL,
  intent text,
  scope text,
  slots jsonb DEFAULT '{}'::jsonb,
  action jsonb,
  status text NOT NULL,
  latency_ms integer,
  confirmation_required boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Funding plans for users
CREATE TABLE IF NOT EXISTS public.funding_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  target_amount numeric NOT NULL,
  timeline text,
  status text NOT NULL DEFAULT 'active',
  current_tier text,
  readiness_score numeric,
  plan_steps jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Courses for Mogul Maker Academy
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework text NOT NULL, -- 'ACCEL' or 'BUILD'
  title text NOT NULL,
  description text,
  module_count integer DEFAULT 0,
  duration_minutes integer,
  difficulty_level text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Lessons within courses
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  module_number integer NOT NULL,
  title text NOT NULL,
  content_type text, -- 'video', 'article', 'quiz', 'checklist'
  content_url text,
  content_markdown text,
  duration_minutes integer,
  sort_order integer DEFAULT 0,
  is_required boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User progress tracking for courses
CREATE TABLE IF NOT EXISTS public.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  progress_percentage numeric DEFAULT 0,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, course_id, lesson_id)
);

-- Notification preferences and alert rules
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel text NOT NULL, -- 'app', 'email', 'sms'
  alert_type text NOT NULL, -- 'balance_low', 'task_due', 'funding_ready', etc.
  enabled boolean DEFAULT true,
  threshold_value numeric,
  threshold_operator text, -- 'less_than', 'greater_than', 'equals'
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, channel, alert_type)
);

-- Conversation context for multi-turn memory
CREATE TABLE IF NOT EXISTS public.conversation_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id text NOT NULL,
  turn_number integer NOT NULL DEFAULT 1,
  utterance text NOT NULL,
  intent text,
  entities jsonb DEFAULT '{}'::jsonb,
  context_stack jsonb DEFAULT '[]'::jsonb, -- Last 5 turns
  active_scope text, -- 'personal' or 'business'
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '1 hour')
);

-- Enable RLS on all tables
ALTER TABLE public.voice_command_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_context ENABLE ROW LEVEL SECURITY;

-- RLS Policies for voice_command_logs
CREATE POLICY "Users can view own command logs"
  ON public.voice_command_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert command logs"
  ON public.voice_command_logs FOR INSERT
  WITH CHECK (true);

-- RLS Policies for funding_plans
CREATE POLICY "Users can view own funding plans"
  ON public.funding_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own funding plans"
  ON public.funding_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own funding plans"
  ON public.funding_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own funding plans"
  ON public.funding_plans FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for courses (public read)
CREATE POLICY "Anyone can view active courses"
  ON public.courses FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage courses"
  ON public.courses FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for lessons (public read)
CREATE POLICY "Anyone can view lessons"
  ON public.lessons FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage lessons"
  ON public.lessons FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for user_progress
CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for notification_preferences
CREATE POLICY "Users can view own preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for conversation_context
CREATE POLICY "Users can view own context"
  ON public.conversation_context FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage context"
  ON public.conversation_context FOR ALL
  USING (current_setting('role') = 'service_role');

-- Indexes for performance
CREATE INDEX idx_voice_logs_user_created ON public.voice_command_logs(user_id, created_at DESC);
CREATE INDEX idx_funding_plans_user ON public.funding_plans(user_id);
CREATE INDEX idx_user_progress_user_course ON public.user_progress(user_id, course_id);
CREATE INDEX idx_conversation_session ON public.conversation_context(session_id, turn_number);
CREATE INDEX idx_conversation_expires ON public.conversation_context(expires_at);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_funding_plans_updated_at
  BEFORE UPDATE ON public.funding_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();