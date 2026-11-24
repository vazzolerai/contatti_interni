// Verifica sul progetto Supabase VERO che l'isolamento tra punti vendita funzioni,
// usando la chiave pubblica esattamente come fa l'app.
// Crea due punti vendita temporanei (zz-prova-a, zz-prova-b), esegue le prove
// e cancella tutto alla fine. Non tocca le sedi e i messaggi reali.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { clientAdmin, impostazioni, emailDi, generaPassword, trovaUtentePerEmail, esci } from './comune.mjs';

const { url, pubblica } = impostazioni({ serveChiavePubblica: true });
const admin = clientAdmin();
const opzioni = { auth: { persistSession: false, autoRefreshToken: false } };

let superate = 0;
let fallite = 0;
function verifica(condizione, descrizione) {
  if (condizione) { superate++; console.log(`  ✔ ${descrizione}`); }
  else { fallite++; console.log(`  ✖ ${descrizione}`); }
}
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const prove = [
  { codice: 'zz-prova-a', nome: 'Prova A (temporaneo)' },
  { codice: 'zz-prova-b', nome: 'Prova B (temporaneo)' },
];

async function prepara() {
  for (const p of prove) {
    // pulizia di eventuali resti di un'esecuzione precedente
    await admin.from('sedi').delete().eq('codice', p.codice);
    const vecchio = await trovaUtentePerEmail(admin, emailDi(p.codice));
    if (vecchio) await admin.auth.admin.deleteUser(vecchio.id);

    p.password = generaPassword();
    const { data: u, error: e1 } = await admin.auth.admin.createUser({
      email: emailDi(p.codice), password: p.password, email_confirm: true,
    });
    if (e1) throw new Error(`creazione utente di prova: ${e1.message}`);
    p.userId = u.user.id;

    const { data: s, error: e2 } = await admin.from('sedi')
      .insert({ codice: p.codice, nome: p.nome, ruolo: 'punto_vendita', user_id: p.userId, ordine: 999 })
      .select().single();
    if (e2) throw new Error(`creazione sede di prova: ${e2.message}`);
    p.id = s.id;

    p.client = createClient(url, pubblica, opzioni);
    const { error: e3 } = await p.client.auth.signInWithPassword({ email: emailDi(p.codice), password: p.password });
    if (e3) throw new Error(`login di prova: ${e3.message}`);
  }
}

async function pulisci() {
  for (const p of prove) {
    try { await p.client?.removeAllChannels(); } catch { /* ignora */ }
    await admin.from('sedi').delete().eq('codice', p.codice); // cancella anche i messaggi
    if (p.userId) await admin.auth.admin.deleteUser(p.userId);
  }
}

async function esegui() {
  const [A, B] = prove;

  console.log('\nPreparazione di due punti vendita temporanei...');
  await prepara();

  // Realtime: B si mette in ascolto
  const ricevutiDaB = [];
  const canale = B.client.channel('prova-b')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messaggi' },
        (evento) => ricevutiDaB.push(evento.new));
  await new Promise((ok) => canale.subscribe((stato) => { if (stato === 'SUBSCRIBED') ok(); }));
  await attendi(1500);

  console.log('\nProve:');
  const r1 = await A.client.from('messaggi')
    .insert({ id: randomUUID(), punto_vendita_id: A.id, direzione: 'verso_sede', testo: 'Messaggio riservato di A' });
  verifica(!r1.error, 'A può scrivere alla sede nella propria conversazione');

  const r2 = await A.client.from('messaggi')
    .insert({ id: randomUUID(), punto_vendita_id: B.id, direzione: 'verso_sede', testo: 'A si finge B' });
  verifica(!!r2.error, 'A NON può scrivere a nome di B');

  const r3 = await A.client.from('messaggi')
    .insert({ id: randomUUID(), punto_vendita_id: B.id, direzione: 'verso_punto_vendita', testo: 'A scrive a B' });
  verifica(!!r3.error, 'A NON può scrivere a B');

  const r4 = await A.client.from('messaggi')
    .insert({ id: randomUUID(), punto_vendita_id: A.id, direzione: 'verso_punto_vendita', testo: 'A si finge la sede' });
  verifica(!!r4.error, 'A NON può fingersi la Casa madre');

  const r5 = await B.client.from('messaggi').select('*');
  verifica(!r5.error && r5.data.length === 0, 'B non vede il messaggio di A');

  const r6 = await B.client.from('messaggi').update({ testo: 'modificato' }).eq('punto_vendita_id', A.id).select();
  verifica(!!r6.error || r6.data.length === 0, 'B NON può modificare i messaggi di A');

  const r7 = await A.client.from('messaggi').update({ testo: 'modificato' }).eq('punto_vendita_id', A.id).select();
  verifica(!!r7.error || r7.data.length === 0, 'A NON può modificare nemmeno i propri messaggi');

  const r8 = await A.client.from('messaggi').delete().eq('punto_vendita_id', A.id).select();
  verifica(!!r8.error || r8.data.length === 0, 'A NON può cancellare i messaggi');

  const r9 = await B.client.from('sedi').select('codice');
  verifica(!r9.error && !r9.data.some((s) => s.codice === A.codice), 'B non vede A nell\'elenco delle sedi');

  const anonimo = createClient(url, pubblica, opzioni);
  const r10 = await anonimo.from('messaggi').select('*');
  verifica(!!r10.error || r10.data.length === 0, 'Senza login non si legge nessun messaggio');

  const r11 = await anonimo.auth.signUp({ email: `intruso-${Date.now()}@example.com`, password: generaPassword() });
  verifica(!!r11.error, 'La registrazione pubblica è disattivata');

  // Realtime: B scrive un proprio messaggio (deve riceverlo) e non deve aver ricevuto quello di A
  await B.client.from('messaggi')
    .insert({ id: randomUUID(), punto_vendita_id: B.id, direzione: 'verso_sede', testo: 'Messaggio di B' });
  await attendi(4000);
  verifica(ricevutiDaB.some((m) => m.testo === 'Messaggio di B'), 'Realtime funziona: B riceve in tempo reale i propri messaggi');
  verifica(!ricevutiDaB.some((m) => m.punto_vendita_id === A.id), 'Realtime: B NON riceve i messaggi di A');

  const r12 = await anonimo.rpc('ping');
  verifica(!r12.error, 'La funzione ping() del keep-alive risponde');
}

try {
  await esegui();
} catch (e) {
  fallite++;
  console.log(`\n  ✖ Errore durante la verifica: ${e.message}`);
} finally {
  console.log('\nPulizia dei dati temporanei...');
  await pulisci();
}

console.log(`\nRisultato: ${superate} prove superate, ${fallite} fallite.\n`);
if (fallite) esci('ATTENZIONE: la verifica di sicurezza NON è superata.');
