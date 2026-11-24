# Checklist delle fasi

Legenda: ✅ fatto · 🧪 da provare (consulente) · ⬜ da fare

## Fase 1 – Supabase e test RLS
- ✅ Schema: `sedi`, `messaggi` (con `letto_il`), `manutenzione`
- ✅ RLS su tutte le tabelle + permessi per colonna
- ✅ Funzioni: `segna_letti`, `riepilogo_conversazioni`, `ping`, `admin_revoca_sessioni`
- ✅ Pulizia notturna con pg_cron (messaggi > 7 giorni)
- ✅ 44 test pgTAP + workflow GitHub `test-db.yml`
- ✅ Script admin: crea-account, elenco, sincronizza-nomi, reimposta-password, aggiungi/disattiva/riattiva, verifica-sicurezza
- 🧪 Creare progetto Supabase, applicare migrazioni, creare account (docs/GUIDA.md, Parte 1)
- 🧪 `npm run verifica-sicurezza` sul progetto vero
- 🧪 Test su GitHub Actions verdi (dopo il primo push)

## Fase 2 – App con le due viste
- ⬜ Progetto Tauri 2 + Vite/TypeScript
- ⬜ Login (codice sede + password), sessione e password nel Gestore credenziali di Windows
- ⬜ Vista punto vendita (chat unica, nome facoltativo, ora, "inviato")
- ⬜ Vista Casa madre (elenco 18 conversazioni, contatori, letto/da leggere, risposta)
- ⬜ Realtime + recupero messaggi persi alla riconnessione
- ⬜ Coda di invio offline con nuovi tentativi automatici
- ⬜ Rinnovo sessione / nuovo login automatico
- ⬜ File di log locale, nessun errore tecnico a schermo

## Fase 3 – Notifiche, tray, avvio automatico
- ⬜ Icona nell'area di notifica, la chiusura della finestra non esce dall'app
- ⬜ Avvio automatico con Windows
- ⬜ Notifica Windows con suono; badge su icona e tray
- ⬜ Punto vendita: finestra in primo piano + fascia "Nuovo messaggio dalla sede" con "Ho visto" (suono una volta)
- ⬜ Casa madre: notifica con nome del punto vendita

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
