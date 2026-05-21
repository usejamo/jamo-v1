-- chat_sessions RLS was using auth.jwt()->>'org_id' which is null (JWT doesn't carry that claim).
-- Switch to the same SECURITY DEFINER helper that proposals/templates/etc use.
drop policy if exists chat_sessions_select on public.chat_sessions;
drop policy if exists chat_sessions_insert on public.chat_sessions;
drop policy if exists chat_sessions_update on public.chat_sessions;
drop policy if exists chat_sessions_delete on public.chat_sessions;

create policy chat_sessions_select on public.chat_sessions
  for select using (org_id = (select private.get_user_org_id()) and user_id = auth.uid());

create policy chat_sessions_insert on public.chat_sessions
  for insert with check (org_id = (select private.get_user_org_id()) and user_id = auth.uid());

create policy chat_sessions_update on public.chat_sessions
  for update using (org_id = (select private.get_user_org_id()) and user_id = auth.uid())
  with check (org_id = (select private.get_user_org_id()) and user_id = auth.uid());

create policy chat_sessions_delete on public.chat_sessions
  for delete using (org_id = (select private.get_user_org_id()) and user_id = auth.uid());
