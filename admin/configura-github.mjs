// Configura GitHub in un colpo solo:
//  1. carica i segreti del repository (letti da admin/.env e dalla chiave di firma)
//  2. lancia il keep-alive e la costruzione della prima versione dell'installer
//
// Uso (dalla cartella admin):  npm run configura-github
// Serve la GitHub CLI ("gh") con login già fatto: vedi docs/GUIDA.md, passo 4.2.
// I valori segreti non vengono mai stampati a schermo.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { esci, impostazioni } from './comune.mjs';

const FILE_CHIAVE = path.join(os.homedir(), '.tauri', 'contatti-interni-updater.key');

// "gh" appena installato può non essere ancora nel PATH dei terminali già aperti
const GH = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh';

function gh(argomenti, input) {
  return execFileSync(GH, argomenti, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
  }).trim();
}

// --- controlli preliminari ---------------------------------------------
try {
  gh(['--version']);
} catch {
  esci('La GitHub CLI ("gh") non è installata. Vedi docs/GUIDA.md, passo 4.2.');
}
try {
  gh(['auth', 'status']);
} catch {
  esci('Non hai ancora fatto il login a GitHub. Lancia prima:\n  & "C:\\Program Files\\GitHub CLI\\gh.exe" auth login --web --git-protocol https\n  (accedi con l\'account vazzolerai)');
}

const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
const corrisp = remoto.match(/github\.com[/:]([^/]+\/[^/.]+)/);
if (!corrisp) esci(`Non riconosco il repository GitHub (${remoto}).`);
const repo = corrisp[1];

const utente = gh(['api', 'user', '--jq', '.login']);
const proprietario = repo.split('/')[0];
if (utente.toLowerCase() !== proprietario.toLowerCase()) {
  esci(`Sei collegato a GitHub come "${utente}", ma il repository appartiene a "${proprietario}".\n  Esci e rientra con l'account giusto:\n  gh auth logout\n  gh auth login --web --git-protocol https`);
}

const { url, pubblica, dominio } = impostazioni({ serveChiavePubblica: true });
if (!pubblica.startsWith('sb_publishable_') && !pubblica.startsWith('eyJ')) {
  esci('SUPABASE_CHIAVE_PUBBLICA in admin/.env non sembra una chiave pubblica.');
}
if (pubblica.startsWith('sb_secret_')) esci('Attenzione: in SUPABASE_CHIAVE_PUBBLICA c\'è una chiave SEGRETA. Correggi admin/.env.');
if (!existsSync(FILE_CHIAVE)) esci(`Chiave di firma non trovata: ${FILE_CHIAVE}`);
const chiaveFirma = readFileSync(FILE_CHIAVE, 'utf8').trim();

// --- 1. segreti ----------------------------------------------------------
console.log(`\nRepository: ${repo} (account ${utente})\n`);
const segreti = {
  SUPABASE_URL: url,
  SUPABASE_CHIAVE_PUBBLICA: pubblica,
  TAURI_SIGNING_PRIVATE_KEY: chiaveFirma,
  DOMINIO_EMAIL: dominio,
};
for (const [nome, valore] of Object.entries(segreti)) {
  gh(['secret', 'set', nome, '--repo', repo], valore);
  console.log(`  ✔ segreto ${nome} impostato`);
}

// --- 2. keep-alive e prima versione -------------------------------------
console.log('');
gh(['workflow', 'run', 'keep-alive.yml', '--repo', repo]);
console.log('  ✔ Keep-alive avviato');

const release = gh(['release', 'list', '--repo', repo, '--limit', '1']);
if (!release) {
  gh(['workflow', 'run', 'release.yml', '--repo', repo, '--ref', 'main']);
  console.log('  ✔ Costruzione della prima versione avviata (circa 15 minuti)');
} else {
  console.log('  · Esiste già una Release: per una nuova versione usa  npm run nuova-versione -- X.Y.Z  (cartella app)');
}

console.log(`\nSegui l'avanzamento qui: https://github.com/${repo}/actions`);
console.log(`L'installer comparirà qui:  https://github.com/${repo}/releases\n`);
