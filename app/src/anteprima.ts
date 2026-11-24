// SOLO SVILUPPO: anteprima dell'interfaccia con dati finti, senza Supabase.
// Si apre con  npm run dev  e poi  http://localhost:1420/?anteprima=pv  oppure  ?anteprima=sede
// Questo file non entra mai nell'installer (viene caricato solo con import.meta.env.DEV).

import { sviluppo } from './config';

type Riga = Record<string, unknown>;

export function installaAnteprima(modo: 'pv' | 'sede'): void {
  sviluppo.anteprima = true;
  const sedi: Riga[] = [{ id: 100, codice: 'sede', nome: 'Casa madre', ruolo: 'casa_madre', attivo: true, ordine: 0 }];
  for (let i = 1; i <= 18; i++) {
    sedi.push({ id: i, codice: `pv${String(i).padStart(2, '0')}`, nome: `Punto vendita ${i}`, ruolo: 'punto_vendita', attivo: true, ordine: i });
  }
  const io = modo === 'sede' ? sedi[0] : sedi[3];

  const fa = (minuti: number) => new Date(Date.now() - minuti * 60_000).toISOString();
  let n = 0;
  const msg = (pv: number, dir: string, testo: string, minuti: number, nome: string | null, letto: boolean): Riga => ({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    punto_vendita_id: pv, direzione: dir, testo, nome_mittente: nome,
    creato_il: fa(minuti), letto_il: letto ? fa(minuti - 1) : null,
  });
  let messaggi: Riga[] = [
    msg(3, 'verso_sede', 'Buongiorno, è arrivata la merce ma manca un collo.', 60 * 26, 'Giulia', true),
    msg(3, 'verso_punto_vendita', 'Grazie, verifichiamo con il corriere e vi facciamo sapere.', 60 * 25, 'Marco', false),
    msg(3, 'verso_sede', 'Il registratore di cassa si blocca all\'apertura.\nAbbiamo già provato a riavviarlo.', 35, 'Anna', false),
    msg(3, 'verso_sede', 'Ora funziona, grazie!', 12, null, false),
    msg(7, 'verso_sede', 'Domani apriamo alle 10 per l\'inventario.', 90, 'Paola', false),
    msg(1, 'verso_punto_vendita', 'Ricordate di inviare le presenze entro venerdì.', 60 * 50, 'Ufficio personale', false),
    msg(1, 'verso_sede', 'Fatto, inviate.', 60 * 49, 'Luca', true),
  ];

  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'anteprima', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }));
  const sessione = {
    access_token: `${header}.${payload}.firma`, token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'anteprima',
    user: { id: 'anteprima', aud: 'authenticated', role: 'authenticated', email: 'anteprima@locale' },
  };

  const json = (dati: unknown, stato = 200) =>
    new Response(JSON.stringify(dati), { status: stato, headers: { 'Content-Type': 'application/json' } });

  const fetchOriginale = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!url.hostname.endsWith('supabase.co')) return fetchOriginale(input, init);
    await new Promise((r) => setTimeout(r, 150));
    const p = url.pathname;
    const metodo = (init?.method ?? 'GET').toUpperCase();

    if (p.startsWith('/auth/v1/token')) return json(sessione);
    if (p.startsWith('/auth/v1/logout')) return new Response(null, { status: 204 });
    if (p === '/rest/v1/rpc/mia_sede') return json([io]);
    if (p === '/rest/v1/rpc/segna_letti') {
      const { p_punto_vendita_id: pv } = JSON.parse(String(init?.body ?? '{}'));
      messaggi = messaggi.map((m) => (m.punto_vendita_id === pv && m.direzione === 'verso_sede' && !m.letto_il ? { ...m, letto_il: fa(0) } : m));
      return json(1);
    }
    if (p === '/rest/v1/sedi') {
      const visibili = modo === 'sede' ? sedi : sedi.filter((s) => s === io || s.ruolo === 'casa_madre');
      const ruolo = url.searchParams.get('ruolo');
      return json(ruolo ? visibili.filter((s) => `eq.${s.ruolo}` === ruolo) : visibili);
    }
    if (p === '/rest/v1/messaggi' && metodo === 'POST') {
      const nuovo = { ...JSON.parse(String(init?.body)), creato_il: fa(0), letto_il: null };
      messaggi.push(nuovo);
      return json(nuovo, 201);
    }
    if (p === '/rest/v1/messaggi') {
      return json(modo === 'sede' ? messaggi : messaggi.filter((m) => m.punto_vendita_id === io.id));
    }
    return json({ message: 'anteprima: non gestito' }, 404);
  };

  // Simula un messaggio in arrivo (dalla console: __simulaArrivo('testo'),
  // oppure in automatico con VITE_ANTEPRIMA_ARRIVO_SECONDI nel file .env).
  const simula = (testo = 'Messaggio di prova in arrivo') => {
    const dir = modo === 'sede' ? 'verso_sede' : 'verso_punto_vendita';
    const pv = modo === 'sede' ? 1 + Math.floor(Math.random() * 18) : (io.id as number);
    messaggi.push(msg(pv, dir, testo, 0, 'Prova', false));
    window.dispatchEvent(new Event('online')); // fa ricaricare l'archivio
  };
  (window as unknown as { __simulaArrivo: typeof simula }).__simulaArrivo = simula;
  const ogni = Number(import.meta.env.VITE_ANTEPRIMA_ARRIVO_SECONDI ?? 0);
  if (ogni > 0) setInterval(() => simula(`Messaggio automatico delle ${new Date().toLocaleTimeString('it-IT')}`), ogni * 1000);

  // Accesso automatico in anteprima
  sessionStorage.setItem('sviluppo-accesso', JSON.stringify({ codice: io.codice, password: 'anteprima' }));
  sessionStorage.removeItem('sviluppo-sessione');
}
