-- =====================================================================
-- Contatti Interni - 3. Funzioni chiamabili dall'app e dagli script
-- =====================================================================

-- ---------------------------------------------------------------------
-- segna_letti: la Casa madre apre una conversazione => i messaggi in arrivo
-- da quel punto vendita diventano "letti". È l'UNICO modo di modificare un
-- messaggio, e tocca solo la colonna letto_il.
-- ---------------------------------------------------------------------
create function public.segna_letti(p_punto_vendita_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quanti integer;
begin
  if not privato.sono_casa_madre() then
    raise exception 'Operazione riservata alla Casa madre' using errcode = '42501';
  end if;

  update public.messaggi
     set letto_il = now()
   where punto_vendita_id = p_punto_vendita_id
     and direzione = 'verso_sede'
     and letto_il is null;

  get diagnostics v_quanti = row_count;
  return v_quanti;
end;
$$;

-- ---------------------------------------------------------------------
-- riepilogo_conversazioni: per la vista Casa madre. Un riga per punto vendita
-- attivo, con il numero di messaggi da leggere e l'ultimo messaggio.
-- ---------------------------------------------------------------------
create function public.riepilogo_conversazioni()
returns table (
  punto_vendita_id   bigint,
  codice             text,
  nome               text,
  ordine             integer,
  da_leggere         integer,
  ultimo_messaggio_il timestamptz,
  ultimo_testo       text,
  ultima_direzione   public.direzione_messaggio
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privato.sono_casa_madre() then
    raise exception 'Operazione riservata alla Casa madre' using errcode = '42501';
  end if;

  return query
  select s.id,
         s.codice,
         s.nome,
         s.ordine,
         coalesce((
           select count(*)::integer from public.messaggi m
           where m.punto_vendita_id = s.id
             and m.direzione = 'verso_sede'
             and m.letto_il is null
         ), 0),
         u.creato_il,
         left(u.testo, 120),
         u.direzione
    from public.sedi s
    left join lateral (
      select m.creato_il, m.testo, m.direzione
        from public.messaggi m
       where m.punto_vendita_id = s.id
       order by m.creato_il desc
       limit 1
    ) u on true
   where s.ruolo = 'punto_vendita' and s.attivo
   order by s.ordine, s.nome;
end;
$$;

-- ---------------------------------------------------------------------
-- ping: chiamata dal workflow di keep-alive (GitHub Actions) con la chiave
-- pubblica. Scrive l'ora dell'ultimo ping: si verifica dal Table Editor,
-- tabella "manutenzione". Non restituisce dati riservati.
-- ---------------------------------------------------------------------
create function public.ping()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.manutenzione set ultimo_ping = now() where id = 1;
  return json_build_object('ok', true, 'ora', now());
end;
$$;

-- ---------------------------------------------------------------------
-- admin_revoca_sessioni: usata SOLO dagli script di amministrazione
-- (chiave service_role) per scollegare un account (password reimpostata,
-- punto vendita disattivato). Cancella le sessioni e i relativi refresh token.
-- ---------------------------------------------------------------------
create function public.admin_revoca_sessioni(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quante integer;
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_quante = row_count;
  return v_quante;
end;
$$;

-- ---------------------------------------------------------------------
-- Permessi sulle funzioni (per default in Postgres sono eseguibili da tutti)
-- ---------------------------------------------------------------------
revoke all on function public.segna_letti(bigint)            from public, anon, authenticated;
revoke all on function public.riepilogo_conversazioni()      from public, anon, authenticated;
revoke all on function public.ping()                         from public, anon, authenticated;
revoke all on function public.admin_revoca_sessioni(uuid)    from public, anon, authenticated;

grant execute on function public.segna_letti(bigint)         to authenticated;
grant execute on function public.riepilogo_conversazioni()   to authenticated;
grant execute on function public.ping()                      to anon, authenticated;
grant execute on function public.admin_revoca_sessioni(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Realtime: l'app riceve i nuovi messaggi (e gli aggiornamenti "letto")
-- in tempo reale. Realtime applica le stesse regole RLS della lettura.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messaggi;
