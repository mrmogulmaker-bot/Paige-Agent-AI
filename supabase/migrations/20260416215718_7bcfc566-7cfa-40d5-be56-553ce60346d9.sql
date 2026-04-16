-- Add reminder_sent column to tasks for task deadline notifications
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_reminder_pending
ON public.tasks (due_date)
WHERE reminder_sent = false;