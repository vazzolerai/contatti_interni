-- =====================================================================
-- Contatti Interni - 6. Permessi espliciti per la chiave segreta (service_role)
-- =====================================================================
-- I progetti Supabase recenti non danno più permessi automatici sulle
-- nuove tabelle. Gli script di amministrazione (chiave segreta, solo sul
-- PC del consulente) devono poter gestire sedi e messaggi: li concediamo
-- esplicitamente. anon e authenticated restano come definito nella migrazione 2.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on public.sedi, public.messaggi, public.manutenzione
  to service_role;

grant usage, select on all sequences in schema public to service_role;

grant execute on function public.admin_revoca_sessioni(uuid) to service_role;
grant execute on function public.ping() to service_role;
