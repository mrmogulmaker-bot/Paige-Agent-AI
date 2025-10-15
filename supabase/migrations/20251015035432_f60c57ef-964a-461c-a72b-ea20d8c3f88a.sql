-- Create business type enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE public.business_hierarchy_type AS ENUM ('holding', 'parent', 'subsidiary', 'standalone');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add hierarchical fields to businesses table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'business_type') THEN
    ALTER TABLE public.businesses ADD COLUMN business_type public.business_hierarchy_type DEFAULT 'standalone';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'parent_business_id') THEN
    ALTER TABLE public.businesses ADD COLUMN parent_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'organizational_level') THEN
    ALTER TABLE public.businesses ADD COLUMN organizational_level integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'display_order') THEN
    ALTER TABLE public.businesses ADD COLUMN display_order integer DEFAULT 0;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_businesses_parent ON public.businesses(parent_business_id);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON public.businesses(owner_user_id);

-- Create function to get business hierarchy
CREATE OR REPLACE FUNCTION public.get_business_hierarchy(_user_id uuid)
RETURNS TABLE (
  id uuid,
  legal_name text,
  business_type public.business_hierarchy_type,
  parent_business_id uuid,
  organizational_level integer,
  display_order integer,
  entity_type public.entity_type,
  ein text,
  child_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE business_tree AS (
    SELECT 
      b.id,
      b.legal_name,
      b.business_type,
      b.parent_business_id,
      b.organizational_level,
      b.display_order,
      b.entity_type,
      b.ein,
      0 as depth
    FROM public.businesses b
    WHERE b.owner_user_id = _user_id
      AND b.parent_business_id IS NULL
    
    UNION ALL
    
    SELECT 
      b.id,
      b.legal_name,
      b.business_type,
      b.parent_business_id,
      b.organizational_level,
      b.display_order,
      b.entity_type,
      b.ein,
      bt.depth + 1
    FROM public.businesses b
    INNER JOIN business_tree bt ON b.parent_business_id = bt.id
    WHERE b.owner_user_id = _user_id
  )
  SELECT 
    bt.id,
    bt.legal_name,
    bt.business_type,
    bt.parent_business_id,
    bt.organizational_level,
    bt.display_order,
    bt.entity_type,
    bt.ein,
    (SELECT COUNT(*) FROM public.businesses child WHERE child.parent_business_id = bt.id) as child_count
  FROM business_tree bt
  ORDER BY bt.depth, bt.display_order, bt.legal_name;
$$;

-- Add document folder support
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'folder_path') THEN
    ALTER TABLE public.documents ADD COLUMN folder_path text DEFAULT '/';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'tags') THEN
    ALTER TABLE public.documents ADD COLUMN tags text[] DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_business ON public.documents(business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON public.documents(user_id, business_id, folder_path);