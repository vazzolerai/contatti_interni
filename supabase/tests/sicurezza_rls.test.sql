-- =====================================================================
-- Test di sicurezza (pgTAP): dimostrano che
--   - un punto vendita vede SOLO la propria conversazione
--   - un punto vendita NON può scrivere a nome di un altro
--   - nessuno può modificare o cancellare messaggi dal client
--   - la Casa madre legge tutto e scrive solo "verso_punto_vendita"
-- Si eseguono con:  supabase test db   (in automatico su GitHub Actions)
-- Tutto avviene in una transazione annullata alla fine: nessun dato resta.
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(44);

-- ---------------------------------------------------------------------
-- Preparazione: 4 account di prova (Casa madre, PV1, PV2, PV3 disattivato)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-1111-1111-111111111100', 'test-sede@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('11111111-1111-1111-1111-111111111101', 'test-pv1@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('11111111-1111-1111-1111-111111111102', 'test-pv2@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('11111111-1111-1111-1111-111111111103', 'test-pv3@test.local',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into public.sedi (codice, nome, ruolo, user_id, ordine, attivo) values
  ('t-sede', 'Casa madre test', 'casa_madre',    '11111111-1111-1111-1111-111111111100', 0, true),
  ('t-pv1',  'PV test 1',       'punto_vendita', '11111111-1111-1111-1111-111111111101', 1, true),
  ('t-pv2',  'PV test 2',       'punto_vendita', '11111111-1111-1111-1111-111111111102', 2, true),
  ('t-pv3',  'PV test 3',       'punto_vendita', '11111111-1111-1111-1111-111111111103', 3, false);

-- Tabellina di appoggio con gli id, leggibile anche durante i test "da utente"
create temp table t_ids as select codice, id from public.sedi where codice like 't-%';
grant select on t_ids to authenticated, anon;

-- Messaggi esistenti (inseriti come amministratore)
insert into public.messaggi (punto_vendita_id, direzione, testo) values
  ((select id from t_ids where codice = 't-pv1'), 'verso_sede',          'PV1: primo'),
  ((select id from t_ids where codice = 't-pv1'), 'verso_sede',          'PV1: secondo'),
  ((select id from t_ids where codice = 't-pv1'), 'verso_punto_vendita', 'Sede a PV1'),
  ((select id from t_ids where codice = 't-pv2'), 'verso_sede',          'PV2: riservato'),
  ((select id from t_ids where codice = 't-pv3'), 'verso_sede',          'PV3: vecchio');

-- Funzione di comodo: "agisci come" l'account della sede indicata
create function pg_temp.come(p_codice text) returns void language plpgsql as $$
declare v_uid uuid;
begin
  select user_id into v_uid from public.sedi where codice = p_codice;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- =====================================================================
-- PUNTO VENDITA 1
-- =====================================================================
select pg_temp.come('t-pv1');

select is((select count(*)::int from public.messaggi), 3,
  'PV1 vede solo i 3 messaggi della propria conversazione');

select is((select count(*)::int from public.messaggi
            where punto_vendita_id = (select id from t_ids where codice = 't-pv2')), 0,
  'PV1 non vede nessun messaggio di PV2');

select is((select count(*)::int from public.messaggi where testo like 'PV2%' or testo like 'PV3%'), 0,
  'PV1 non trova i testi degli altri punti vendita nemmeno cercandoli');

select is((select count(*)::int from public.sedi), 2,
  'PV1 vede solo sé stesso e la Casa madre nella tabella sedi');

select lives_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo, nome_mittente)
           values (%s, 'verso_sede', 'Ciao sede', 'Anna')$$,
         (select id from t_ids where codice = 't-pv1')),
  'PV1 può scrivere alla sede nella propria conversazione');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_sede', 'Mi fingo PV2')$$,
         (select id from t_ids where codice = 't-pv2')),
  '42501', null,
  'PV1 NON può scrivere a nome di PV2');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_punto_vendita', 'Mi fingo la sede')$$,
         (select id from t_ids where codice = 't-pv1')),
  '42501', null,
  'PV1 NON può scrivere messaggi "verso_punto_vendita" (fingendosi la sede)');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_punto_vendita', 'A PV2 da PV1')$$,
         (select id from t_ids where codice = 't-pv2')),
  '42501', null,
  'PV1 NON può scrivere a un altro punto vendita');

select throws_ok(
  $$update public.messaggi set testo = 'modificato'$$,
  '42501', null,
  'PV1 NON può modificare i messaggi');

select throws_ok(
  $$delete from public.messaggi$$,
  '42501', null,
  'PV1 NON può cancellare i messaggi');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo, creato_il)
           values (%s, 'verso_sede', 'Data falsa', '2000-01-01')$$,
         (select id from t_ids where codice = 't-pv1')),
  '42501', null,
  'PV1 NON può impostare la data del messaggio');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo, letto_il)
           values (%s, 'verso_sede', 'Già letto?', now())$$,
         (select id from t_ids where codice = 't-pv1')),
  '42501', null,
  'PV1 NON può impostare lo stato "letto"');

select throws_ok(
  format($$select public.segna_letti(%s)$$, (select id from t_ids where codice = 't-pv1')),
  '42501', null,
  'PV1 NON può segnare messaggi come letti');

select throws_ok(
  $$select * from public.riepilogo_conversazioni()$$,
  '42501', null,
  'PV1 NON può leggere il riepilogo di tutte le conversazioni');

select throws_ok(
  $$select user_id from public.sedi$$,
  '42501', null,
  'PV1 NON può leggere gli id degli account');

select throws_ok(
  $$insert into public.sedi (codice, nome, ruolo) values ('finto', 'Finto', 'punto_vendita')$$,
  '42501', null,
  'PV1 NON può creare sedi');

select throws_ok(
  $$update public.sedi set nome = 'Rinominato'$$,
  '42501', null,
  'PV1 NON può rinominare le sedi');

select throws_ok(
  $$select * from public.manutenzione$$,
  '42501', null,
  'PV1 NON può leggere la tabella di manutenzione');

select throws_ok(
  $$select public.admin_revoca_sessioni('11111111-1111-1111-1111-111111111102')$$,
  '42501', null,
  'PV1 NON può usare la funzione di amministrazione');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_sede', '   ')$$,
         (select id from t_ids where codice = 't-pv1')),
  '23514', null,
  'Un messaggio vuoto (solo spazi) viene rifiutato');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_sede', repeat('a', 2001))$$,
         (select id from t_ids where codice = 't-pv1')),
  '23514', null,
  'Un messaggio oltre 2000 caratteri viene rifiutato');

-- =====================================================================
-- PUNTO VENDITA 2
-- =====================================================================
reset role;
select pg_temp.come('t-pv2');

select is((select count(*)::int from public.messaggi), 1,
  'PV2 vede solo il proprio messaggio (non quelli di PV1, nemmeno il nuovo)');

-- =====================================================================
-- CASA MADRE
-- =====================================================================
reset role;
select pg_temp.come('t-sede');

select is((select count(*)::int from public.messaggi), 6,
  'La Casa madre vede i messaggi di tutti i punti vendita');

select is((select count(*)::int from public.sedi), 4,
  'La Casa madre vede tutte le sedi');

select lives_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo, nome_mittente)
           values (%s, 'verso_punto_vendita', 'Risposta a PV2', 'Marco')$$,
         (select id from t_ids where codice = 't-pv2')),
  'La Casa madre può rispondere a un punto vendita');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_sede', 'Mi fingo PV2')$$,
         (select id from t_ids where codice = 't-pv2')),
  '42501', null,
  'La Casa madre NON può scrivere messaggi "verso_sede" (fingendosi un punto vendita)');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_punto_vendita', 'A un PV disattivato')$$,
         (select id from t_ids where codice = 't-pv3')),
  '42501', null,
  'La Casa madre NON può scrivere a un punto vendita disattivato');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_punto_vendita', 'A me stessa')$$,
         (select id from t_ids where codice = 't-sede')),
  '23514', null,
  'Una conversazione può appartenere solo a un punto vendita');

select throws_ok(
  $$update public.messaggi set testo = 'modificato'$$,
  '42501', null,
  'La Casa madre NON può modificare i messaggi');

select throws_ok(
  $$delete from public.messaggi$$,
  '42501', null,
  'La Casa madre NON può cancellare i messaggi');

select is(
  (select da_leggere from public.riepilogo_conversazioni()
    where codice = 't-pv1'), 3,
  'Il riepilogo conta 3 messaggi da leggere per PV1');

select is(
  (select count(*)::int from public.riepilogo_conversazioni()), 2,
  'Il riepilogo elenca solo i punti vendita attivi');

select is(
  public.segna_letti((select id from t_ids where codice = 't-pv1')), 3,
  'Aprendo la conversazione di PV1, 3 messaggi diventano letti');

select is(
  (select da_leggere from public.riepilogo_conversazioni()
    where codice = 't-pv1'), 0,
  'Dopo la lettura, PV1 ha 0 messaggi da leggere');

select is(
  (select da_leggere from public.riepilogo_conversazioni()
    where codice = 't-pv2'), 1,
  'PV2 ha ancora 1 messaggio da leggere (segna_letti non tocca le altre conversazioni)');

-- =====================================================================
-- PUNTO VENDITA DISATTIVATO
-- =====================================================================
reset role;
select pg_temp.come('t-pv3');

select is((select count(*)::int from public.messaggi), 0,
  'Un punto vendita disattivato non vede più nulla');

select throws_ok(
  format($$insert into public.messaggi (punto_vendita_id, direzione, testo)
           values (%s, 'verso_sede', 'Ci sono ancora?')$$,
         (select id from t_ids where codice = 't-pv3')),
  '42501', null,
  'Un punto vendita disattivato non può più scrivere');

-- =====================================================================
-- UTENTE NON AUTENTICATO (solo chiave pubblica)
-- =====================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok(
  $$select * from public.messaggi$$,
  '42501', null,
  'Senza login non si legge nessun messaggio');

select throws_ok(
  $$select * from public.sedi$$,
  '42501', null,
  'Senza login non si legge l''elenco delle sedi');

select lives_ok(
  $$select public.ping()$$,
  'Senza login si può solo chiamare ping() (keep-alive)');

-- =====================================================================
-- SERVER: data imposta dal server, pulizia, job pianificato
-- =====================================================================
reset role;

select is(
  (select count(*)::int from public.messaggi where creato_il < now() - interval '1 minute'), 0,
  'L''ora dei messaggi è sempre quella del server');

update public.messaggi set creato_il = now() - interval '8 days' where testo = 'PV3: vecchio';

select is(privato.pulisci_messaggi_vecchi(), 1,
  'La pulizia cancella i messaggi più vecchi di 7 giorni (e solo quelli)');

select is(
  (select count(*)::int from cron.job where jobname = 'pulizia-messaggi-vecchi'), 1,
  'Il job notturno di pulizia è pianificato');

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'Row Level Security è attiva su tutte le tabelle');

select * from finish();
rollback;
