-- Admin is a role, never a destination. Retire durable notification links that
-- could otherwise resurrect the removed product route after deployment.
begin;

update public.notifications
set action_url = '/choose-account'
where action_url ~* '^(https://(www\.)?paigeagent\.ai)?/admin(/|$|[?#])';

create or replace function public.normalize_retired_admin_notification_url()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.action_url ~* '^(https://(www\.)?paigeagent\.ai)?/admin(/|$|[?#])' then
    new.action_url := '/choose-account';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_normalize_retired_admin_notification_url
  on public.notifications;
create trigger trg_normalize_retired_admin_notification_url
before insert or update of action_url on public.notifications
for each row
execute function public.normalize_retired_admin_notification_url();

revoke all on function public.normalize_retired_admin_notification_url() from public;
revoke all on function public.normalize_retired_admin_notification_url() from anon;
revoke all on function public.normalize_retired_admin_notification_url() from authenticated;

comment on function public.normalize_retired_admin_notification_url() is
  'Normalizes retired Paige /admin notification destinations to the canonical account chooser.';


commit;
