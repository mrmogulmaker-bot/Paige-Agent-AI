
-- ============================================================
-- client_notes
-- ============================================================
CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notes TO authenticated;
GRANT ALL ON public.client_notes TO service_role;

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_client_notes_contact ON public.client_notes(contact_id, pinned DESC, created_at DESC);
CREATE INDEX idx_client_notes_search ON public.client_notes USING gin (to_tsvector('english', body));

CREATE POLICY "Staff can read notes for their contacts"
  ON public.client_notes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_notes.contact_id
        AND (c.assigned_coach_user_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

CREATE POLICY "Staff can create notes"
  ON public.client_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coach'::app_role)
    )
  );

CREATE POLICY "Authors and admins can update notes"
  ON public.client_notes FOR UPDATE
  TO authenticated
  USING (author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authors and admins can delete notes"
  ON public.client_notes FOR DELETE
  TO authenticated
  USING (author_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_client_notes_updated
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- client_files
-- ============================================================
CREATE TYPE public.client_file_visibility AS ENUM ('internal', 'shared', 'client_upload');

CREATE TABLE public.client_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  uploaded_by_user_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  visibility public.client_file_visibility NOT NULL DEFAULT 'internal',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_files TO authenticated;
GRANT ALL ON public.client_files TO service_role;

ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_client_files_contact ON public.client_files(contact_id, created_at DESC);

CREATE POLICY "Staff read files"
  ON public.client_files FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_files.contact_id
        AND (c.assigned_coach_user_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

CREATE POLICY "Clients read own shared/uploads"
  ON public.client_files FOR SELECT TO authenticated
  USING (
    visibility IN ('shared', 'client_upload')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_files.contact_id AND c.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "Staff insert files"
  ON public.client_files FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coach'::app_role)
    )
  );

CREATE POLICY "Clients upload own"
  ON public.client_files FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND visibility = 'client_upload'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_files.contact_id AND c.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "Uploader or admin update files"
  ON public.client_files FOR UPDATE TO authenticated
  USING (uploaded_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Uploader or admin delete files"
  ON public.client_files FOR DELETE TO authenticated
  USING (uploaded_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_client_files_updated
  BEFORE UPDATE ON public.client_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- storage.objects policies for client-files bucket
-- Path: {tenant_id}/{contact_id}/{visibility}/{filename}
-- ============================================================
CREATE POLICY "client-files: staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-files'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coach'::app_role)
    )
  );

CREATE POLICY "client-files: client read own shared/uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-files'
    AND (storage.foldername(name))[3] IN ('shared', 'client_upload')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = ((storage.foldername(name))[2])::uuid
        AND c.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "client-files: staff write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-files'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coach'::app_role)
    )
  );

CREATE POLICY "client-files: client upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-files'
    AND (storage.foldername(name))[3] = 'client_upload'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = ((storage.foldername(name))[2])::uuid
        AND c.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "client-files: staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-files'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );
