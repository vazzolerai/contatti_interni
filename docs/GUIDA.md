# Guida passo passo – Contatti Interni

Guida per il consulente. I comandi sono pronti da copiare in **PowerShell**.
Le parti delle fasi successive (installer, aggiornamenti, PC dei negozi) verranno aggiunte man mano.

---

## Parte 1 – Progetto Supabase

### 1.1 Creare il progetto
1. Vai su <https://supabase.com> ed entra con l'account **dedicato** a questo cliente.
2. **New project**:
   - *Name*: `contatti-interni`
   - *Database password*: premi **Generate a password** e **salvala nel tuo gestore di password** (serve al passo 1.4).
   - *Region*: **Central EU (Frankfurt)**.
   - Piano: **Free**.
3. Attendi un paio di minuti che il progetto sia pronto.

### 1.2 Disattivare la registrazione pubblica (importante)
1. Nel progetto: **Authentication → Sign In / Providers** (in alcune versioni: *Authentication → Settings*).
2. Disattiva **Allow new users to sign up**. Salva.
3. Nella stessa pagina, sezione **Email**: lascia attivo il provider Email (serve al login), ma disattiva **Confirm email** se presente (gli account li conferma lo script).

> Da questo momento nessuno può creare account dall'esterno: solo lo script di amministrazione, che usa la chiave segreta.

### 1.3 Chiavi del progetto
**Project Settings → API Keys**. Ti servono tre valori:

| Nome nel file `.env` | Dove si trova | Segreta? |
|---|---|---|
| `SUPABASE_URL` | *Project Settings → Data API → Project URL* (es. `https://abcd….supabase.co`) | no |
| `SUPABASE_CHIAVE_PUBBLICA` | **Publishable key** (`sb_publishable_…`), oppure nella scheda *Legacy* la chiave **anon** | no, finisce nell'app |
| `SUPABASE_CHIAVE_SEGRETA` | **Secret key** (`sb_secret_…`), oppure nella scheda *Legacy* la chiave **service_role** | **SÌ** |

> ⚠️ La chiave segreta dà accesso completo al database. Va **solo** nel file `admin/.env` sul tuo PC. Mai nell'app, mai su GitHub, mai via email.

### 1.4 Applicare le migrazioni (crea tabelle, regole di sicurezza, pulizia notturna)
Apri PowerShell nella cartella del progetto:

```powershell
cd "C:\Users\gmgar\Desktop\programmazione\Messaggistica Vazzoler"
```

Accedi a Supabase con l'account dedicato (si apre il browser: **controlla che sia l'account giusto**):

```powershell
npx supabase login
```

Collega la cartella al progetto. Il *project ref* è la parte iniziale dell'indirizzo (`https://<ref>.supabase.co`). Ti chiederà la password del database del passo 1.1:

```powershell
npx supabase link --project-ref INSERISCI_QUI_IL_REF
```

Applica le migrazioni:

```powershell
npx supabase db push
```

Deve elencare 5 file (`…_schema.sql`, `…_sicurezza_rls.sql`, `…_funzioni.sql`, `…_pulizia_cron.sql`, `…_mia_sede.sql`) e terminare senza errori.

**Controllo:** nel pannello Supabase, **Table Editor** → devono comparire le tabelle `sedi`, `messaggi`, `manutenzione`. In **Integrations → Cron** (o *Database → Cron Jobs*) deve esserci il job `pulizia-messaggi-vecchi`.

> Alternativa senza riga di comando: apri **SQL Editor** e incolla/esegui i 5 file di `supabase/migrations` **in ordine**. Funziona uguale, ma poi `db push` non saprà che sono già applicati: scegli un metodo e usa sempre quello.

### 1.5 Creare gli account delle sedi
Prepara il file delle impostazioni:

```powershell
cd admin
```

```powershell
Copy-Item .env.example .env
```

```powershell
notepad .env
```

Compila `SUPABASE_URL`, `SUPABASE_CHIAVE_PUBBLICA`, `SUPABASE_CHIAVE_SEGRETA` (passo 1.3) e salva.

Installa le dipendenze degli script (solo la prima volta):

```powershell
npm install
```

Crea tutti gli account dal file `config/sedi.json`:

```powershell
npm run crea-account
```

Lo script stampa **una sola volta** codice e password di ogni sede. **Copiali subito** nel tuo gestore di password: non vengono salvati da nessuna parte. Se rilanci il comando, gli account già esistenti non vengono toccati.

Controlla lo stato:

```powershell
npm run elenco
```

### 1.6 Verificare la sicurezza sul progetto vero
Crea due punti vendita temporanei, prova a "sconfinare" con la chiave pubblica (come farebbe l'app) e poi cancella tutto:

```powershell
npm run verifica-sicurezza
```

Risultato atteso: `14 prove superate, 0 fallite`.

---

## Comandi di amministrazione (dalla cartella `admin`)

| Cosa vuoi fare | Comando |
|---|---|
| Creare gli account mancanti | `npm run crea-account` |
| Vedere lo stato delle sedi e l'ultimo accesso | `npm run elenco` |
| Cambiare i nomi (dopo aver modificato `config/sedi.json`) | `npm run sincronizza-nomi` |
| Nuova password per una sede (scollega i PC di quella sede) | `npm run reimposta-password -- pv03` |
| Aggiungere un punto vendita | `npm run aggiungi-punto-vendita -- pv19 "Punto vendita 19"` |
| Disattivare un punto vendita | `npm run disattiva -- pv19` |
| Riattivarlo | `npm run riattiva -- pv19` |
| Verifica di sicurezza | `npm run verifica-sicurezza` |

> Nota: il `--` prima del codice è necessario (separa gli argomenti di npm da quelli dello script).

### Cambiare i nomi dei punti vendita
1. Apri `config/sedi.json` e modifica solo il campo `"nome"` (non il `"codice"`).
2. `npm run sincronizza-nomi`
3. Le app mostrano i nuovi nomi alla successiva riconnessione o riavvio. **Nessuna reinstallazione.**

In alternativa puoi cambiare un nome direttamente dal **Table Editor** di Supabase (tabella `sedi`, colonna `nome`), ma ricordati di aggiornare anche il file, altrimenti alla prossima sincronizzazione torna il nome del file.

---

## Test automatici su GitHub
A ogni modifica della cartella `supabase/`, GitHub avvia un Supabase temporaneo, applica le migrazioni ed esegue i **47 test di sicurezza** (`supabase/tests/sicurezza_rls.test.sql`).
Per vederli: repository su GitHub → scheda **Actions** → workflow **Test database e sicurezza** → l'ultima esecuzione deve avere la spunta verde. Si può lanciare anche a mano con **Run workflow**.

---

## Parte 2 – Provare l'app sul tuo PC

Sul tuo PC ci sono già Rust e gli strumenti di compilazione (installati in fase 2).

### 2.1 Anteprima con dati finti (senza Supabase)
Serve a vedere l'aspetto delle due viste. Dalla cartella del progetto:

```powershell
cd app
```

```powershell
npm install
```

```powershell
npm run dev
```

Poi apri nel browser:
- vista punto vendita: <http://localhost:1420/?anteprima=pv>
- vista Casa madre: <http://localhost:1420/?anteprima=sede>

In anteprima compare la fascia "Collegamento in corso…" perché non c'è un server vero: è normale. Per fermare: `Ctrl+C` nel terminale.

### 2.2 App vera collegata al tuo progetto Supabase
1. Copia il file di esempio e compilalo con **URL e chiave pubblica** (passo 1.3; mai la chiave segreta):

```powershell
Copy-Item .env.example .env
```

```powershell
notepad .env
```

2. Avvia l'app (la prima volta la compilazione richiede qualche minuto):

```powershell
npm run avvia
```

3. Nella finestra dell'app accedi come punto vendita (es. `pv01` e la sua password).
4. **Per vedere le due viste insieme**, mentre l'app è aperta apri nel browser <http://localhost:1420> (senza `?anteprima`): è la stessa app, collegata allo stesso Supabase. Lì accedi come `sede`. Scrivi da una parte e guarda arrivare il messaggio dall'altra, in tempo reale.

### Cose utili da sapere
- **Scollegare un PC dall'account** (es. per cambiare sede): nella finestra dell'app premi **Ctrl+Maiusc+L** e conferma. È una scorciatoia "nascosta", pensata per te e non per le commesse.
- **File di log** (errori tecnici, mai mostrati all'utente): `%LOCALAPPDATA%\it.contattiinterni.app\logs\contatti-interni.log`. Per aprire la cartella:

```powershell
explorer "$env:LOCALAPPDATA\it.contattiinterni.app\logs"
```

- **Credenziali salvate**: Pannello di controllo → Gestione credenziali → Credenziali di Windows → voci `accesso.ContattiInterni` e `sessione.ContattiInterni`.
- **Senza linea**: i messaggi scritti restano "In invio…" e partono da soli appena torna la connessione, anche dopo un riavvio del PC.
