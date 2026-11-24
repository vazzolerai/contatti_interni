// Script di amministrazione di Contatti Interni.
// Uso (dalla cartella admin):  npm run <comando> [-- argomenti]
// Vedi docs/GUIDA.md per gli esempi.
import {
  clientAdmin, emailDi, esci, generaPassword, leggiFileSedi, scriviFileSedi,
  controllaCodice, trovaUtentePerEmail, stampaPassword,
} from './comune.mjs';

let admin; // creato dopo aver controllato il comando

// ---------------------------------------------------------------------
async function sediNelDatabase() {
  const { data, error } = await admin.from('sedi').select('*').order('ordine');
  if (error) esci(`Lettura delle sedi non riuscita: ${error.message}\n  Hai applicato le migrazioni? (docs/GUIDA.md)`);
  return data;
}

async function sedeDaCodice(codice) {
  const { data, error } = await admin.from('sedi').select('*').eq('codice', codice).maybeSingle();
  if (error) esci(error.message);
  if (!data) esci(`Nessuna sede con codice "${codice}". Usa "npm run elenco" per vedere i codici.`);
  return data;
}

async function revocaSessioni(userId) {
  const { error } = await admin.rpc('admin_revoca_sessioni', { p_user_id: userId });
  if (error) console.warn(`  ! Sessioni non revocate: ${error.message}`);
}

/** Crea (o recupera) l'account Auth della sede e lo collega. Restituisce la password. */
async function creaAccount(sede) {
  const email = emailDi(sede.codice);
  const password = generaPassword();
  let userId;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { codice: sede.codice },
  });

  if (error) {
    // L'utente esiste già in Auth ma non era collegato (es. esecuzione interrotta)
    const esistente = await trovaUtentePerEmail(admin, email);
    if (!esistente) esci(`Creazione account ${sede.codice} non riuscita: ${error.message}`);
    const { error: e2 } = await admin.auth.admin.updateUserById(esistente.id, { password });
    if (e2) esci(`Aggiornamento account ${sede.codice} non riuscito: ${e2.message}`);
    userId = esistente.id;
  } else {
    userId = data.user.id;
  }

  const { error: e3 } = await admin.from('sedi').update({ user_id: userId }).eq('id', sede.id);
  if (e3) esci(`Collegamento account ${sede.codice} non riuscito: ${e3.message}`);
  return password;
}

// ---------------------------------------------------------------------
// COMANDI
// ---------------------------------------------------------------------
const comandi = {
  /** Crea sedi e account mancanti a partire da config/sedi.json */
  async 'crea-account'() {
    const { sedi } = leggiFileSedi();
    const nelDb = await sediNelDatabase();
    const credenziali = [];

    for (const s of sedi) {
      let riga = nelDb.find((r) => r.codice === s.codice);
      if (!riga) {
        const { data, error } = await admin.from('sedi')
          .insert({ codice: s.codice, nome: s.nome, ruolo: s.ruolo, ordine: s.ordine })
          .select().single();
        if (error) esci(`Inserimento sede ${s.codice} non riuscito: ${error.message}`);
        riga = data;
      }
      if (riga.user_id) {
        console.log(`  · ${s.codice.padEnd(10)} account già presente (nessuna modifica)`);
        continue;
      }
      const password = await creaAccount(riga);
      console.log(`  ✔ ${s.codice.padEnd(10)} account creato`);
      credenziali.push({ codice: s.codice, nome: riga.nome, password });
    }

    if (credenziali.length === 0) console.log('\nTutti gli account esistono già.');
    stampaPassword(credenziali);
  },

  /** Nuova password per una sede; scollega i PC già collegati. */
  async 'reimposta-password'(codice) {
    controllaCodice(codice);
    const sede = await sedeDaCodice(codice);
    if (!sede.user_id) esci(`La sede ${codice} non ha ancora un account: usa "npm run crea-account".`);

    const password = generaPassword();
    const { error } = await admin.auth.admin.updateUserById(sede.user_id, { password });
    if (error) esci(`Reimpostazione non riuscita: ${error.message}`);
    await revocaSessioni(sede.user_id);

    console.log(`\n  ✔ Password di ${codice} reimpostata. I PC collegati con questo account`);
    console.log('    chiederanno di nuovo il login (entro un\'ora al massimo).');
    stampaPassword([{ codice, nome: sede.nome, password }]);
  },

  /** Aggiunge un punto vendita al file e crea il suo account. */
  async 'aggiungi-punto-vendita'(codice, ...parole) {
    controllaCodice(codice);
    const nome = parole.join(' ').trim();
    if (!nome) esci('Indica anche il nome, per esempio:\n  npm run aggiungi-punto-vendita -- pv19 "Punto vendita 19"');

    const { dati } = leggiFileSedi();
    if (dati.sedi.some((s) => s.codice === codice)) esci(`Il codice ${codice} è già nel file config/sedi.json.`);
    dati.sedi.push({ codice, nome, ruolo: 'punto_vendita' });
    scriviFileSedi(dati);
    leggiFileSedi(); // ricontrolla il file appena scritto
    console.log(`  ✔ ${codice} aggiunto a config/sedi.json`);

    await comandi['crea-account']();
  },

  /** Disattiva un punto vendita: non può più accedere, leggere o scrivere. */
  async disattiva(codice) {
    controllaCodice(codice);
    const sede = await sedeDaCodice(codice);
    if (sede.ruolo !== 'punto_vendita') esci('Si possono disattivare solo i punti vendita.');

    const { error } = await admin.from('sedi').update({ attivo: false }).eq('id', sede.id);
    if (error) esci(error.message);
    if (sede.user_id) {
      await admin.auth.admin.updateUserById(sede.user_id, { ban_duration: '876000h' });
      await revocaSessioni(sede.user_id);
    }
    console.log(`\n  ✔ ${codice} disattivato. La sua conversazione sparisce dall'elenco della Casa madre.`);
    console.log(`    Per riattivarlo: npm run riattiva -- ${codice}\n`);
  },

  async riattiva(codice) {
    controllaCodice(codice);
    const sede = await sedeDaCodice(codice);
    const { error } = await admin.from('sedi').update({ attivo: true }).eq('id', sede.id);
    if (error) esci(error.message);
    if (sede.user_id) await admin.auth.admin.updateUserById(sede.user_id, { ban_duration: 'none' });
    console.log(`\n  ✔ ${codice} riattivato.\n`);
  },

  /**
   * Cambia il codice di accesso di una sede (es. sede → casamadre).
   * Aggiorna database, account di accesso e config/sedi.json. La password resta uguale.
   * I PC già collegati con quella sede dovranno rifare l'accesso con il nuovo codice.
   */
  async 'rinomina-codice'(vecchio, nuovo) {
    controllaCodice(vecchio);
    controllaCodice(nuovo);
    if (vecchio === nuovo) esci('Il nuovo codice è uguale a quello attuale.');
    const sede = await sedeDaCodice(vecchio);
    const { data: occupato } = await admin.from('sedi').select('id').eq('codice', nuovo).maybeSingle();
    if (occupato) esci(`Il codice ${nuovo} è già usato da un'altra sede.`);

    if (sede.user_id) {
      const { error } = await admin.auth.admin.updateUserById(sede.user_id, {
        email: emailDi(nuovo),
        email_confirm: true,
        app_metadata: { codice: nuovo },
      });
      if (error) esci(`Aggiornamento dell'account non riuscito: ${error.message}`);
      await revocaSessioni(sede.user_id);
    }
    const { error } = await admin.from('sedi').update({ codice: nuovo }).eq('id', sede.id);
    if (error) esci(`Aggiornamento della sede non riuscito: ${error.message}`);

    const { dati } = leggiFileSedi();
    const voce = dati.sedi.find((s) => s.codice === vecchio);
    if (voce) {
      voce.codice = nuovo;
      scriviFileSedi(dati);
      leggiFileSedi();
    } else {
      console.log(`  ! ${vecchio} non era in config/sedi.json: aggiornalo a mano.`);
    }

    console.log(`\n  ✔ Codice cambiato: ${vecchio} → ${nuovo} (database, account e config/sedi.json).`);
    console.log('    La password è la stessa. I PC collegati con questa sede chiederanno di nuovo l\'accesso.\n');
  },

  /** Copia nomi e ordine da config/sedi.json al database. */
  async 'sincronizza-nomi'() {
    const { sedi } = leggiFileSedi();
    const nelDb = await sediNelDatabase();
    let modifiche = 0;

    for (const s of sedi) {
      const riga = nelDb.find((r) => r.codice === s.codice);
      if (!riga) {
        console.log(`  ! ${s.codice}: non è nel database (usa "npm run crea-account")`);
        continue;
      }
      if (riga.nome !== s.nome || riga.ordine !== s.ordine) {
        const { error } = await admin.from('sedi').update({ nome: s.nome, ordine: s.ordine }).eq('id', riga.id);
        if (error) esci(error.message);
        console.log(`  ✔ ${s.codice.padEnd(10)} "${riga.nome}" → "${s.nome}"`);
        modifiche++;
      }
    }
    for (const r of nelDb) {
      if (!sedi.some((s) => s.codice === r.codice)) {
        console.log(`  ! ${r.codice}: è nel database ma non nel file (non modificato)`);
      }
    }
    console.log(modifiche ? `\n${modifiche} sedi aggiornate. Le app mostrano i nuovi nomi al prossimo riavvio o riconnessione.\n`
                          : '\nNessuna modifica: database e file coincidono.\n');
  },

  /** Mostra lo stato di tutte le sedi. */
  async elenco() {
    const nelDb = await sediNelDatabase();
    const utenti = new Map();
    for (let pagina = 1; ; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) esci(error.message);
      data.users.forEach((u) => utenti.set(u.id, u));
      if (data.users.length < 200) break;
    }
    const larghezza = Math.max(4, ...nelDb.map((r) => r.nome.length));
    console.log(`\n  ${'CODICE'.padEnd(10)} ${'NOME'.padEnd(larghezza)}  ${'STATO'.padEnd(12)} ULTIMO ACCESSO`);
    for (const r of nelDb) {
      const u = r.user_id ? utenti.get(r.user_id) : null;
      const stato = !r.attivo ? 'disattivato' : !u ? 'senza account' : 'attivo';
      const accesso = u?.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('it-IT') : '-';
      console.log(`  ${r.codice.padEnd(10)} ${r.nome.padEnd(larghezza)}  ${stato.padEnd(12)} ${accesso}`);
    }
    console.log('');
  },
};

// ---------------------------------------------------------------------
const [comando, ...argomenti] = process.argv.slice(2);
if (!comandi[comando]) {
  console.log(`
Comandi disponibili (dalla cartella admin):
  npm run crea-account
  npm run elenco
  npm run sincronizza-nomi
  npm run reimposta-password -- pv03
  npm run aggiungi-punto-vendita -- pv19 "Punto vendita 19"
  npm run disattiva -- pv19
  npm run riattiva -- pv19
  npm run rinomina-codice -- sede casamadre
  npm run verifica-sicurezza
`);
  process.exit(comando ? 1 : 0);
}

admin = clientAdmin();
try {
  await comandi[comando](...argomenti);
} catch (e) {
  esci(`Errore imprevisto: ${e.message}`);
}
