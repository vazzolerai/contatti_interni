# Checklist delle fasi

Legenda: ✅ fatto · 🧪 da provare (consulente) · ⬜ da fare

## Fase 1 – Supabase e test RLS
- ✅ Schema: `sedi`, `messaggi` (con `letto_il`), `manutenzione`
- ✅ RLS su tutte le tabelle + permessi per colonna
- ✅ Funzioni: `segna_letti`, `riepilogo_conversazioni`, `ping`, `admin_revoca_sessioni`
- ✅ Pulizia notturna con pg_cron (messaggi > 7 giorni)
- ✅ 47 test pgTAP + workflow GitHub `test-db.yml`
- ✅ Script admin: crea-account, elenco, sincronizza-nomi, reimposta-password, aggiungi/disattiva/riattiva, verifica-sicurezza
- 🧪 Creare progetto Supabase, applicare migrazioni, creare account (docs/GUIDA.md, Parte 1)
- 🧪 `npm run verifica-sicurezza` sul progetto vero
- ✅ Test su GitHub Actions verdi

## Fase 2 – App con le due viste
- ✅ Progetto Tauri 2 + Vite/TypeScript (senza framework)
- ✅ Login (codice sede + password); token di sessione e password nel Gestore credenziali di Windows (con test automatico)
- ✅ Vista punto vendita (chat unica, nome facoltativo, ora, "Inviato ✓")
- ✅ Vista Casa madre (elenco punti vendita, contatori da leggere, "Nuovi messaggi", Letto / Da leggere, risposta)
- ✅ Realtime + ricarica completa a ogni riconnessione (nessun messaggio perso)
- ✅ Coda di invio offline salvata sul PC, nuovi tentativi automatici (provata in anteprima)
- ✅ Rinnovo sessione automatico; se impossibile, rientro con le credenziali salvate; altrimenti login con messaggio chiaro
- ✅ File di log locale, nessun errore tecnico a schermo
- ✅ Funzione `mia_sede()` (nuova migrazione 5) + 3 test
- ✅ Anteprima con dati finti (solo sviluppo)
- 🧪 Prova con il progetto Supabase vero (docs/GUIDA.md, Parte 2)

## Fase 3 – Notifiche, tray, avvio automatico
- ✅ Icona nell'area di notifica (Apri / Esci con conferma); la X nasconde la finestra
- ✅ Una sola copia dell'app alla volta
- ✅ Avvio automatico con Windows (solo versione installata)
- ✅ Notifica Windows con suono; badge con numero su barra delle applicazioni e area di notifica
- ✅ Punto vendita: finestra in primo piano + lampeggio + din-don (una volta) + fascia "Ho visto"
- ✅ Casa madre: notifica con nome del punto vendita, raggruppata se arrivano più messaggi
- ✅ WebView2 non rallentato quando la finestra è nascosta; suono senza bisogno di clic
- ✅ Provato nella finestra vera con messaggi simulati (log: primo piano riuscito, nessun errore)
- 🧪 Da vedere con i tuoi occhi: icona vicino all'orologio, pallino rosso, notifica, X che nasconde
- 🧪 Avvio automatico: verificabile solo con l'installer (fase 4)

## Fase 4 – Build, installer, aggiornamenti
- ⬜ Workflow release su runner Windows (installer NSIS .exe)
- ⬜ Chiave di firma updater nei segreti GitHub
- ⬜ Updater da GitHub Releases
- ⬜ Workflow keep-alive ogni 2-3 giorni

## Fase 5 – Documentazione
- ⬜ README completo
- ⬜ Guida: installazione su Windows 11, SmartScreen, configurazione PC
- ⬜ Scheda di sicurezza per l'IT del cliente

## Punti aperti / rischi residui
- Keep-alive: GitHub disattiva i workflow pianificati dopo 60 giorni senza attività nel repo (da gestire in fase 4).
- Portare la finestra in primo piano può essere limitato da Windows (mitigazioni in fase 3).
- App non firmata → avviso SmartScreen al primo avvio (documentato in fase 5).
- Realtime con finestra nascosta: il battito gira in un worker per non essere rallentato da Windows; da verificare sul campo in fase 3 (finestra chiusa nell'area di notifica per ore).
- La coda dei messaggi non ancora inviati e le bozze sono salvate in chiaro nella cartella dati dell'app sul PC (solo finché non partono). Rischio basso: indicato nella scheda di sicurezza.
