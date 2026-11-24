-- =====================================================================
-- Contatti Interni - 1. Schema: tabelle, vincoli, indici
-- =====================================================================

-- Tipi enumerati
create type public.ruolo_sede as enum ('casa_madre', 'punto_vendita');
create type public.direzione_messaggio as enum ('verso_sede', 'verso_punto_vendita');

-- ---------------------------------------------------------------------
-- SEDI: la Casa madre e i punti vendita. Ogni sede ha un account Auth.
-- I nomi si cambiano da config/sedi.json (script admin) o dal Table Editor.
-- ---------------------------------------------------------------------
create table public.sedi (
  id         bigint generated always as identity primary key,
  codice     text        not null unique
             check (codice ~ '^[a-z0-9_-]{2,20}$'),
  nome       text        not null
             check (char_length(btrim(nome)) between 1 and 60),
  ruolo      public.ruolo_sede not null,
  user_id    uuid        unique references auth.users (id) on delete set null,
  attivo     boolean     not null default true,
  ordine     integer     not null default 0,
  creato_il  timestamptz not null default now()
);

comment on table public.sedi is 'Casa madre e punti vendita. Un account Auth per sede.';
comment on column public.sedi.attivo is 'false = punto vendita disattivato: non può più leggere né scrivere.';

-- Una sola Casa madre
create unique index sedi_una_sola_casa_madre
  on public.sedi (ruolo) where ruolo = 'casa_madre';

-- ---------------------------------------------------------------------
-- MESSAGGI: ogni messaggio appartiene alla conversazione di un punto vendita.
-- ---------------------------------------------------------------------
create table public.messaggi (
  id               uuid primary key default gen_random_uuid(),
  punto_vendita_id bigint not null references public.sedi (id) on delete cascade,
  direzione        public.direzione_messaggio not null,
  testo            text not null
                   check (char_length(btrim(testo)) > 0 and char_length(testo) <= 2000),
  nome_mittente    text
                   check (nome_mittente is null or char_length(nome_mittente) <= 60),
  creato_il        timestamptz not null default now(),
  -- Solo per i messaggi verso_sede: quando la Casa madre li ha letti.
  letto_il         timestamptz,
  constraint messaggi_letto_solo_verso_sede
    check (letto_il is null or direzione = 'verso_sede')
);

comment on column public.messaggi.id is 'Generato dall''app: se un invio viene ripetuto, il messaggio non si duplica.';
comment on column public.messaggi.letto_il is 'Valorizzato dalla funzione segna_letti() quando la Casa madre apre la conversazione.';

create index messaggi_conversazione_idx on public.messaggi (punto_vendita_id, creato_il);
create index messaggi_creato_il_idx     on public.messaggi (creato_il);
create index messaggi_non_letti_idx     on public.messaggi (punto_vendita_id)
  where direzione = 'verso_sede' and letto_il is null;

-- ---------------------------------------------------------------------
-- MANUTENZIONE: una sola riga, utile per verificare keep-alive e pulizia
-- dal Table Editor di Supabase.
-- ---------------------------------------------------------------------
create table public.manutenzione (
  id                        smallint primary key default 1 check (id = 1),
  ultimo_ping               timestamptz,
  ultima_pulizia            timestamptz,
  messaggi_cancellati_ultima_pulizia integer
);
insert into public.manutenzione (id) values (1);

comment on table public.manutenzione is 'Stato dei job automatici: ultimo ping (keep-alive) e ultima pulizia notturna.';
