-- =====================================================================
-- Contatti Interni - 2. Sicurezza: funzioni di supporto, trigger, RLS, permessi
-- =====================================================================
-- Principio: l'app usa solo la chiave pubblica (anon). Tutto ciò che un
-- utente può fare è deciso QUI, nel database, non nell'app.
-- =====================================================================

-- Schema privato: non è esposto dalle API di Supabase.
create schema if not exists privato;
revoke all on schema privato from public;
grant usage on schema privato to authenticated;

-- ---------------------------------------------------------------------
-- Funzioni di supporto usate dalle regole RLS
-- (security definer: leggono "sedi" senza passare dalle RLS, evitando ricorsioni)
-- ---------------------------------------------------------------------

-- id della sede collegata all'utente connesso (null se non collegato o disattivato)
create function privato.mia_sede_id()
returns bigint
language sql stable security definer
set search_path = ''
as $$
  select s.id
  from public.sedi s
  where s.user_id = (select auth.uid()) and s.attivo
$$;

-- true se l'utente connesso è la Casa madre (attiva)
create function privato.sono_casa_madre()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sedi s
    where s.user_id = (select auth.uid())
      and s.ruolo = 'casa_madre'
      and s.attivo
  )
$$;

-- true se l'id indicato è un punto vendita attivo
create function privato.e_punto_vendita_attivo(p_id bigint)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sedi s
    where s.id = p_id and s.ruolo = 'punto_vendita' and s.attivo
  )
$$;

revoke all on function privato.mia_sede_id()                  from public;
revoke all on function privato.sono_casa_madre()              from public;
revoke all on function privato.e_punto_vendita_attivo(bigint) from public;
grant execute on function privato.mia_sede_id()                  to authenticated;
grant execute on function privato.sono_casa_madre()              to authenticated;
grant execute on function privato.e_punto_vendita_attivo(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Trigger: valori decisi dal server, non dal client
-- ---------------------------------------------------------------------
-- security definer: il controllo sulla sede deve vedere tutte le sedi, non solo
-- quelle visibili all'utente (altrimenti l'errore arriverebbe da qui e non dalle RLS).
create function privato.prepara_nuovo_messaggio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- L'ora la decide il server; un nuovo messaggio non è mai "letto".
  new.creato_il := now();
  new.letto_il  := null;

  -- Nome facoltativo: spazi tolti, vuoto = null
  new.nome_mittente := nullif(btrim(new.nome_mittente), '');

  -- La conversazione deve appartenere a un punto vendita (non alla Casa madre)
  if not exists (
    select 1 from public.sedi s
    where s.id = new.punto_vendita_id and s.ruolo = 'punto_vendita'
  ) then
    raise exception 'La conversazione deve appartenere a un punto vendita'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger messaggi_prima_inserimento
  before insert on public.messaggi
  for each row execute function privato.prepara_nuovo_messaggio();

-- ---------------------------------------------------------------------
-- Row Level Security: attiva su TUTTE le tabelle
-- ---------------------------------------------------------------------
alter table public.sedi         enable row level security;
alter table public.messaggi     enable row level security;
alter table public.manutenzione enable row level security;

-- SEDI ----------------------------------------------------------------
-- Casa madre: vede tutte le sedi.
-- Punto vendita: vede solo sé stesso e la Casa madre (non gli altri negozi).
create policy sedi_lettura on public.sedi
  for select to authenticated
  using (
    (select privato.sono_casa_madre())
    or id = (select privato.mia_sede_id())
    or (ruolo = 'casa_madre' and (select privato.mia_sede_id()) is not null)
  );
-- Nessuna policy di insert/update/delete: le sedi le gestisce solo lo script admin.

-- MESSAGGI ------------------------------------------------------------
-- Lettura: la Casa madre tutto; il punto vendita solo la propria conversazione.
create policy messaggi_lettura on public.messaggi
  for select to authenticated
  using (
    (select privato.sono_casa_madre())
    or punto_vendita_id = (select privato.mia_sede_id())
  );

-- Scrittura:
--  - punto vendita: solo "verso_sede" e solo nella propria conversazione
--  - Casa madre: solo "verso_punto_vendita" verso un punto vendita attivo
create policy messaggi_inserimento on public.messaggi
  for insert to authenticated
  with check (
    (
      direzione = 'verso_sede'
      and not (select privato.sono_casa_madre())
      and punto_vendita_id = (select privato.mia_sede_id())
    )
    or
    (
      direzione = 'verso_punto_vendita'
      and (select privato.sono_casa_madre())
      and privato.e_punto_vendita_attivo(punto_vendita_id)
    )
  );
-- Nessuna policy di update/delete: nessuno modifica o cancella dal client.

-- MANUTENZIONE: nessuna policy => nessun accesso dal client.

-- ---------------------------------------------------------------------
-- Permessi sulle tabelle (seconda linea di difesa, oltre alle RLS)
-- ---------------------------------------------------------------------
revoke all on public.sedi, public.messaggi, public.manutenzione from anon, authenticated;

-- sedi: sola lettura, senza la colonna user_id
grant select (id, codice, nome, ruolo, attivo, ordine) on public.sedi to authenticated;

-- messaggi: lettura e inserimento; in inserimento solo le colonne "di contenuto"
-- (creato_il e letto_il non sono scrivibili dal client)
grant select on public.messaggi to authenticated;
grant insert (id, punto_vendita_id, direzione, testo, nome_mittente)
  on public.messaggi to authenticated;
