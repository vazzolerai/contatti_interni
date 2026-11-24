// Pubblica una nuova versione dell'app.
// Uso (dalla cartella app):   npm run nuova-versione -- 0.2.0
//
// 1. aggiorna il numero di versione nei 3 file dove compare
// 2. crea il commit e il tag "v0.2.0"
// 3. (dopo conferma) li invia a GitHub: parte il workflow che costruisce
//    l'installer; le app installate si aggiornano da sole.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RADICE = path.join(APP, '..');
const FILE = {
  pacchetto: path.join(APP, 'package.json'),
  tauri: path.join(APP, 'src-tauri', 'tauri.conf.json'),
  cargo: path.join(APP, 'src-tauri', 'Cargo.toml'),
  cargoLock: path.join(APP, 'src-tauri', 'Cargo.lock'),
};

const esci = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
const git = (...argomenti) => execFileSync('git', argomenti, { cwd: RADICE, encoding: 'utf8' }).trim();

const nuova = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(nuova ?? '')) {
  esci('Indica la nuova versione nel formato X.Y.Z, per esempio:\n  npm run nuova-versione -- 0.2.0');
}

const conf = JSON.parse(readFileSync(FILE.tauri, 'utf8'));
const attuale = conf.version;
const numeri = (v) => v.split('.').map(Number);
const [a, b] = [numeri(nuova), numeri(attuale)];
const maggiore = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
if (!maggiore) esci(`La nuova versione (${nuova}) deve essere maggiore di quella attuale (${attuale}).`);

if (git('status', '--porcelain')) {
  esci('Ci sono modifiche non salvate in git. Prima fai il commit (o chiedi a chi sviluppa).');
}
if (git('tag', '--list', `v${nuova}`)) esci(`Il tag v${nuova} esiste già.`);

// 1. numeri di versione
conf.version = nuova;
writeFileSync(FILE.tauri, JSON.stringify(conf, null, 2) + '\n');

const pacchetto = JSON.parse(readFileSync(FILE.pacchetto, 'utf8'));
pacchetto.version = nuova;
writeFileSync(FILE.pacchetto, JSON.stringify(pacchetto, null, 2) + '\n');

const cargo = readFileSync(FILE.cargo, 'utf8').replace(/^version = ".*"$/m, `version = "${nuova}"`);
writeFileSync(FILE.cargo, cargo);

const lock = readFileSync(FILE.cargoLock, 'utf8')
  .replace(/(name = "contatti-interni"\r?\nversion = )".*"/, `$1"${nuova}"`);
writeFileSync(FILE.cargoLock, lock);

// 2. commit e tag
git('add', FILE.pacchetto, FILE.tauri, FILE.cargo, FILE.cargoLock);
git('commit', '-m', `Versione ${nuova}`);
git('tag', '-a', `v${nuova}`, '-m', `Contatti Interni ${nuova}`);
console.log(`\n✔ Versione ${attuale} → ${nuova}: commit e tag v${nuova} creati.`);

// 3. invio a GitHub
const rl = createInterface({ input: process.stdin, output: process.stdout });
const risposta = (await rl.question('\nInviare ora a GitHub e pubblicare la versione? (s/n) ')).trim().toLowerCase();
rl.close();
if (risposta !== 's' && risposta !== 'si' && risposta !== 'sì') {
  console.log(`\nNon inviato. Quando vuoi, dalla cartella del progetto:\n  git push --follow-tags\n`);
  process.exit(0);
}
execFileSync('git', ['push', '--follow-tags'], { cwd: RADICE, stdio: 'inherit' });
console.log(`\n✔ Inviato. Segui la costruzione su GitHub → Actions → "Release (installer e aggiornamenti)".`);
console.log('  In circa 15 minuti la nuova versione sarà nelle Release.\n');
