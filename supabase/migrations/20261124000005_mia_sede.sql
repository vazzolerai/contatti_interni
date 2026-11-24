-- =====================================================================
-- Contatti Interni - 5. mia_sede(): l'app chiede "chi sono?" dopo il login
-- =====================================================================
-- Restituisce la sede collegata all'account connesso (nessuna riga se
-- l'account non è collegato o la sede è disattivata). In base al ruolo
-- l'app mostra la vista punto vendita o la vista Casa madre.

create function public.mia_sede()
returns table (id bigint, codice text, nome text, ruolo public.ruolo_sede)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.codice, s.nome, s.ruolo
    from public.sedi s
   where s.user_id = (select auth.uid())
     and s.attivo
$$;

revoke all on function public.mia_sede() from public, anon, authenticated;
grant execute on function public.mia_sede() to authenticated;
