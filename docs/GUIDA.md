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

---

## Parte 3 – Come si comporta l'app (notifiche, icona vicino all'orologio)

| Situazione | Cosa succede |
|---|---|
| Si preme la **X** della finestra | La finestra si nasconde, l'app resta attiva: icona vicino all'orologio. La prima volta compare una notifica che lo spiega. |
| Clic sull'icona vicino all'orologio | La finestra si riapre. |
| Tasto destro sull'icona → **Esci** | Chiede conferma ("non riceverai più i messaggi fino al prossimo avvio"). |
| Si apre l'app una seconda volta | Non parte una seconda copia: si mostra quella già aperta. |
| Accensione del PC | L'app parte da sola (solo nella versione **installata**, non in quella di prova). |

**Punto vendita – arriva un messaggio dalla sede:**
1. la finestra torna davanti a tutto (anche se era chiusa nella tray) e l'icona sulla barra lampeggia;
2. suona un "din-don", **una sola volta**;
3. se la finestra non era davanti, compare anche la notifica di Windows;
4. in alto resta una **fascia gialla "Nuovo messaggio da Casa madre"** finché qualcuno non preme **Ho visto** (o risponde);
5. pallino rosso con il numero sull'icona della barra e su quella vicino all'orologio.

**Casa madre – arriva un messaggio da un punto vendita:**
- notifica di Windows con il **nome del punto vendita** e l'inizio del messaggio (se arrivano più messaggi insieme, una sola notifica riassuntiva);
- l'icona sulla barra lampeggia; contatore rosso accanto al punto vendita nell'elenco; numero totale sul pallino dell'icona;
- nessuna notifica se quella conversazione è già aperta davanti agli occhi.

### Limiti di Windows da conoscere
- **"Non disturbare" / Assistente notifiche**: se attivo, Windows nasconde le notifiche e il loro suono. Per questo sul punto vendita l'app fa comunque suonare il proprio "din-don" e porta la finestra davanti. Consiglio: sui PC dei negozi lasciare "Non disturbare" disattivato (Impostazioni → Sistema → Notifiche).
- **Primo piano**: Windows a volte impedisce a un'app di mettersi davanti mentre si sta scrivendo in un'altra. In quel caso la finestra lampeggia sulla barra delle applicazioni e la fascia gialla resta finché qualcuno non la vede.
- Nella versione di prova (`npm run avvia`) le notifiche possono comparire con il nome "Windows PowerShell": nella versione installata compariranno come "Contatti Interni".

### Anteprima della fase 3 nella finestra vera
Per vedere notifiche e primo piano senza Supabase, crea il file `app\.env.development.local` con:

```
VITE_ANTEPRIMA=pv
VITE_ANTEPRIMA_ARRIVO_SECONDI=40
```

poi `npm run avvia`: ogni 40 secondi arriva un messaggio finto. **Cancella il file finita la prova**, altrimenti l'app di prova resta in anteprima.

---

## Parte 4 – Installer, aggiornamenti automatici e keep-alive

### 4.1 La chiave di firma degli aggiornamenti (già creata)
Gli aggiornamenti sono **firmati**: l'app installata accetta solo file firmati con la chiave del progetto. Così nessuno può distribuire una versione falsa, nemmeno chi riuscisse a caricare file nelle Release.

- Chiave **pubblica**: è già dentro l'app (`app/src-tauri/tauri.conf.json`). Non è segreta.
- Chiave **privata**: `%USERPROFILE%\.tauri\contatti-interni-updater.key`, sul tuo PC e **fuori** dal progetto.

> ⚠️ **Fai subito una copia di sicurezza della chiave privata** nel tuo gestore di password (come nota o allegato). Se la perdi, le app installate non accetteranno più aggiornamenti e bisognerà reinstallarle a mano su tutti i PC.

### 4.2 Segreti su GitHub (una volta sola)
Su GitHub: repository `contatti_interni` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crea questi segreti, con il **nome esatto**:

| Nome | Valore |
|---|---|
| `SUPABASE_URL` | lo stesso di `admin/.env` (es. `https://abcd….supabase.co`) |
| `SUPABASE_CHIAVE_PUBBLICA` | la chiave **pubblica** (Publishable / anon). **Mai** quella segreta |
| `TAURI_SIGNING_PRIVATE_KEY` | il contenuto del file della chiave privata (vedi sotto) |

Per copiare la chiave privata negli appunti senza aprirla:

```powershell
Get-Content "$env:USERPROFILE\.tauri\contatti-interni-updater.key" | Set-Clipboard
```

poi incolla (Ctrl+V) nel campo *Secret* su GitHub.

> Facoltativo: `DOMINIO_EMAIL`, solo se in `admin/.env` hai cambiato `DOMINIO_EMAIL`. La chiave è senza password, quindi `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` non serve.

### 4.3 Pubblicare una versione
Dalla cartella `app`:

```powershell
cd "C:\Users\gmgar\Desktop\programmazione\Messaggistica Vazzoler\app"
```

```powershell
npm run nuova-versione -- 0.1.1
```

Lo script aggiorna il numero di versione, crea il commit e il tag, chiede conferma (`s`) e invia tutto a GitHub. Su GitHub → **Actions** → **Release (installer e aggiornamenti)** parte la costruzione, che dura circa 15 minuti. Alla fine, in **Releases** trovi:
- `Contatti Interni_0.1.1_x64-setup.exe` → **l'installer da usare sui PC**;
- `latest.json` e un file `.sig` → servono agli aggiornamenti automatici, non toccarli.

> La **prima** versione si può pubblicare anche senza cambiare numero: GitHub → Actions → *Release (installer e aggiornamenti)* → **Run workflow**. Crea la Release `v0.1.0`.

### 4.4 Come arrivano gli aggiornamenti sui PC
- Ogni app controlla GitHub **1 minuto dopo l'avvio e poi ogni 6 ore**.
- Se c'è una versione nuova la scarica in silenzio e la installa **solo quando il PC non è usato da 3 minuti** e non ci sono messaggi in attesa di invio. Compare per qualche secondo una piccola barra di avanzamento, poi l'app si riapre da sola. Bozze e messaggi in coda restano.
- Per controllare la versione di un PC: tasto destro sull'icona vicino all'orologio → l'ultima riga del menu dice **Versione X.Y.Z**.

### 4.5 Keep-alive (evita la pausa di Supabase)
Il piano gratuito di Supabase mette in pausa il progetto dopo 7 giorni senza attività (es. ferie con i PC spenti). Il workflow **Keep-alive Supabase** chiama il database ogni 2 giorni.

**Verifica che funzioni** (dopo aver impostato i segreti):
1. GitHub → **Actions** → **Keep-alive Supabase** → **Run workflow**. Dopo circa 30 secondi deve comparire la spunta verde; aprendo l'esecuzione, il riepilogo mostra `Keep-alive riuscito` e la risposta del database.
2. Supabase → **Table Editor** → tabella `manutenzione` → la colonna `ultimo_ping` deve avere data e ora di adesso. Nella stessa riga, `ultima_pulizia` indica quando è girata l'ultima pulizia notturna dei messaggi vecchi.
3. Nelle settimane successive basta guardare ogni tanto `ultimo_ping`: deve essere al massimo di 2-3 giorni prima.

**Il limite dei 60 giorni di GitHub:** GitHub sospende i workflow pianificati dei repository pubblici senza attività da 60 giorni. Il keep-alive si "riattiva" da solo a ogni esecuzione per azzerare il conteggio. Se comunque venisse sospeso, GitHub manda un'email all'account `vazzolerai` e nella pagina del workflow compare un pulsante **Enable workflow**: basta premerlo.

**Se il progetto Supabase è già in pausa:** su supabase.com apri il progetto e premi **Restore project** (qualche minuto). Le app si ricollegano da sole.
