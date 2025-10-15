-- Create business type enum for organizational structure
CREATE TYPE public.business_hierarchy_type AS ENUM ('holding', 'parent', 'subsidiary', 'standalone');

-- Add hierarchical fields to businesses table
ALTER TABLE public.businesses
ADD COLUMN business_type public.business_hierarchy_type DEFAULT 'standalone',
ADD COLUMN parent_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
ADD COLUMN organizational_level integer DEFAULT 0,
ADD COLUMN display_order integer DEFAULT 0;

-- Create index for parent lookups
CREATE INDEX idx_businesses_parent ON public.businesses(parent_business_id);

-- Create index for user's businesses
CREATE INDEX idx_businesses_owner ON public.businesses(owner_user_id);

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
    -- Root level businesses (holdings and standalones)
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
    
    -- Child businesses
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

-- Update documents table to better support business context
ALTER TABLE public.documents
ADD COLUMN folder_path text DEFAULT '/',
ADD COLUMN tags text[] DEFAULT '{}';

CREATE INDEX idx_documents_business ON public.documents(business_id) WHERE business_id IS NOT NULL;
CREATE INDEX idx_documents_folder ON public.documents(user_id, business_id, folder_path);