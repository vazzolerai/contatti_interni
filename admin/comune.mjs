// Funzioni condivise dagli script di amministrazione.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARTELLA = path.dirname(fileURLToPath(import.meta.url));
export const FILE_SEDI = path.join(CARTELLA, '..', 'config', 'sedi.json');

export function esci(messaggio) {
  console.error(`\n✖ ${messaggio}\n`);
  process.exit(1);
}

/** Legge le impostazioni dal file admin/.env */
export function impostazioni({ serveChiavePubblica = false } = {}) {
  const url = process.env.SUPABASE_URL?.trim();
  const segreta = process.env.SUPABASE_CHIAVE_SEGRETA?.trim();
  const pubblica = process.env.SUPABASE_CHIAVE_PUBBLICA?.trim();
  const dominio = (process.env.DOMINIO_EMAIL || 'contatti-interni.local').trim();

  if (!url || !segreta) {
    esci('Mancano SUPABASE_URL o SUPABASE_CHIAVE_SEGRETA.\n  Copia admin/.env.example in admin/.env e compila i valori (vedi docs/GUIDA.md).');
  }
  if (serveChiavePubblica && !pubblica) {
    esci('Manca SUPABASE_CHIAVE_PUBBLICA nel file admin/.env.');
  }
  return { url, segreta, pubblica, dominio };
}

/** Client con la chiave segreta: SOLO per gli script, mai nell'app. */
export function clientAdmin() {
  const { url, segreta } = impostazioni();
  return createClient(url, segreta, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function emailDi(codice) {
  return `${codice}@${impostazioni().dominio}`;
}

/**
 * Password lunga e leggibile, es. "Xk7m-Pq2R-tW9z-Hn4c-Ja8F" (~100 bit).
 * Esclusi i caratteri che si confondono (0/O, 1/l/I).
 */
export function generaPassword() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const gruppi = [];
    for (let g = 0; g < 5; g++) {
      let s = '';
      for (let i = 0; i < 4; i++) s += alfabeto[randomInt(alfabeto.length)];
      gruppi.push(s);
    }
    const pw = gruppi.join('-');
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
}

const REGOLA_CODICE = /^[a-z0-9_-]{2,20}$/;

/** Legge e controlla config/sedi.json */
export function leggiFileSedi() {
  let dati;
  try {
    dati = JSON.parse(readFileSync(FILE_SEDI, 'utf8'));
  } catch (e) {
    esci(`Non riesco a leggere ${FILE_SEDI}: ${e.message}`);
  }
  const sedi = dati.sedi;
  if (!Array.isArray(sedi) || sedi.length === 0) esci('config/sedi.json: manca l\'elenco "sedi".');

  const visti = new Set();
  let caseMadri = 0;
  sedi.forEach((s, i) => {
    const dove = `config/sedi.json, voce ${i + 1}`;
    if (!REGOLA_CODICE.test(s.codice ?? '')) esci(`${dove}: codice "${s.codice}" non valido (solo minuscole, numeri, - e _, da 2 a 20 caratteri).`);
    if (visti.has(s.codice)) esci(`${dove}: codice "${s.codice}" ripetuto.`);
    visti.add(s.codice);
    const nome = (s.nome ?? '').trim();
    if (nome.length < 1 || nome.length > 60) esci(`${dove}: il nome deve avere da 1 a 60 caratteri.`);
    if (!['casa_madre', 'punto_vendita'].includes(s.ruolo)) esci(`${dove}: ruolo deve essere "casa_madre" o "punto_vendita".`);
    if (s.ruolo === 'casa_madre') caseMadri++;
  });
  if (caseMadri !== 1) esci('config/sedi.json: deve esserci esattamente una sede con ruolo "casa_madre".');

  return { dati, sedi: sedi.map((s, i) => ({ ...s, nome: s.nome.trim(), ordine: i })) };
}

export function scriviFileSedi(dati) {
  writeFileSync(FILE_SEDI, JSON.stringify(dati, null, 2) + '\n', 'utf8');
}

export function controllaCodice(codice) {
  if (!codice) esci('Indica il codice della sede, per esempio: pv03');
  if (!REGOLA_CODICE.test(codice)) esci(`Codice "${codice}" non valido.`);
  return codice;
}

/** Cerca un utente Auth per email (scorre tutte le pagine). */
export async function trovaUtentePerEmail(admin, email) {
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const trovato = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (trovato) return trovato;
    if (data.users.length < 200) return null;
  }
}

/** Stampa il riepilogo delle password (una sola volta). */
export function stampaPassword(righe) {
  if (righe.length === 0) return;
  const larghezzaNome = Math.max(4, ...righe.map((r) => r.nome.length));
  const linea = '═'.repeat(larghezzaNome + 44);
  console.log(`\n╔${linea}╗`);
  console.log('  CREDENZIALI - copiale ORA in un posto sicuro (es. gestore di password).');
  console.log('  Non verranno mostrate di nuovo e non sono salvate da nessuna parte.');
  console.log(`╚${linea}╝\n`);
  console.log(`  ${'CODICE'.padEnd(10)} ${'NOME'.padEnd(larghezzaNome)}  PASSWORD`);
  for (const r of righe) {
    console.log(`  ${r.codice.padEnd(10)} ${r.nome.padEnd(larghezzaNome)}  ${r.password}`);
  }
  console.log('');
}
