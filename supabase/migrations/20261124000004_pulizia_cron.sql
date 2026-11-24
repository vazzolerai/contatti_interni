-- =====================================================================
-- Contatti Interni - 4. Pulizia automatica dei messaggi (pg_cron)
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- Cancella i messaggi più vecchi di 7 giorni e annota l'esito nella
-- tabella "manutenzione" (visibile dal Table Editor).
create function privato.pulisci_messaggi_vecchi()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancellati integer;
begin
  delete from public.messaggi
   where creato_il < now() - interval '7 days';
  get diagnostics v_cancellati = row_count;

  update public.manutenzione
     set ultima_pulizia = now(),
         messaggi_cancellati_ultima_pulizia = v_cancellati
   where id = 1;

  return v_cancellati;
end;
$$;

revoke all on function privato.pulisci_messaggi_vecchi() from public, anon, authenticated;

-- Ogni notte alle 02:00 UTC = 03:00 ora italiana d'inverno, 04:00 d'estate.
-- (Se il job esiste già con questo nome, viene aggiornato.)
select cron.schedule(
  'pulizia-messaggi-vecchi',
  '0 2 * * *',
  'select privato.pulisci_messaggi_vecchi();'
);
