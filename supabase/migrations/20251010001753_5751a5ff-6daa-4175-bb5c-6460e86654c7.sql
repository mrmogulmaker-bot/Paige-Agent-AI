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
-- [de-brand Task #46] knowledge_base seed removed: MMA 3M curriculum is per-tenant KB, not a global default (Task #25 horizontal doctrine).


-- Insert BUILD Framework details
-- [de-brand Task #46] knowledge_base seed removed: MMA 3M curriculum is per-tenant KB, not a global default (Task #25 horizontal doctrine).


-- Insert Money Follows Management Framework
-- [de-brand Task #46] knowledge_base seed removed: MMA 3M curriculum is per-tenant KB, not a global default (Task #25 horizontal doctrine).


-- Insert Growth Stages
-- [de-brand Task #46] knowledge_base seed removed: MMA 3M curriculum is per-tenant KB, not a global default (Task #25 horizontal doctrine).
