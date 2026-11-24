# Contatti Interni – Scheda di sicurezza

**Cos'è:** messaggistica testuale interna tra la Casa madre e 18 punti vendita. Canale chiuso, senza email né servizi di messaggistica di terzi.

## Architettura e dati
- **Client:** app desktop Windows 11 (Tauri 2 + WebView2), installazione per utente, senza diritti di amministratore. Comunica solo via HTTPS/WSS con il backend. La Content Security Policy limita le connessioni a `*.supabase.co`.
- **Backend:** Supabase (PostgreSQL gestito), regione **UE – Francoforte**. Nessun altro server.
- **GitHub:** ospita il codice (repository pubblico, **senza segreti**), costruisce l'installer e distribuisce gli aggiornamenti. **Non transitano messaggi.**
- **Dati trattati:** testo (massimo 2000 caratteri), nome facoltativo di chi scrive, ora di invio, stato "letto". Nessun allegato. **Cancellazione automatica dopo 7 giorni** (job notturno nel database).

## Controlli di sicurezza
| Area | Misura |
|---|---|
| Account | Un account per sede, creato solo da script di amministrazione; **registrazione pubblica disattivata**. Password generate casualmente, 20 caratteri (circa 100 bit). Nessuna email reale usata o inviata. |
| Autorizzazione | **Row Level Security su tutte le tabelle**. Un punto vendita legge e scrive solo la propria conversazione e solo verso la sede. La Casa madre legge tutto e scrive solo verso i punti vendita. **Nessuno può modificare o cancellare messaggi** dal client. Ora e stato "letto" sono decisi dal server. Permessi anche per singola colonna. |
| Verifica | **47 test automatici** (pgTAP) a ogni modifica del database, più uno script di verifica sul progetto reale (14 prove, Realtime compreso). |
| Chiavi | Nell'app c'è solo la chiave **pubblica**. La chiave **segreta** è solo sul PC del consulente (file escluso da git), usata dagli script di amministrazione. |
| Credenziali sul PC | Password e token di sessione nel **Gestore credenziali di Windows** (protetti con DPAPI, legati all'utente Windows). Sessione: token di 1 ora rinnovato automaticamente. Revoca immediata dall'amministrazione (reimposta password / disattiva sede). |
| Aggiornamenti | Scaricati da GitHub Releases via HTTPS e **firmati** (Ed25519): l'app rifiuta pacchetti non firmati con la chiave del progetto. |
| Log | File locale con soli eventi tecnici: **niente testi dei messaggi, password o token**. |

## Rischi residui e mitigazioni
| Rischio | Mitigazione proposta |
|---|---|
| Chi usa l'utente Windows di un negozio può leggere la chat (7 giorni) e, con strumenti appositi, estrarre la password della sede. | Blocco schermo con password sull'utente Windows. In caso di sospetto: reimpostazione password (scollega subito i PC) o disattivazione della sede. |
| Account **per sede**, non per persona: il campo "nome" non è verificato. | Regola d'uso interna. Se servisse tracciabilità individuale, servirebbero account personali. |
| Chiave segreta Supabase sul PC del consulente: chi la ottiene ha pieno accesso al database. | Disco cifrato (BitLocker), autenticazione a due fattori sull'account Supabase, rotazione della chiave dal pannello Supabase in caso di dubbio. |
| Chiave di firma degli aggiornamenti: chi la ottiene può distribuire aggiornamenti accettati dalle app. | Conservata solo nei segreti GitHub e in copia nel gestore di password del consulente. Autenticazione a due fattori su GitHub. |
| **Installer non firmato** (Authenticode): avviso SmartScreen al primo avvio; con "Controllo intelligente delle app" attivo, l'installazione è bloccata. | Accettabile per 19 PC gestiti. Per eliminarlo: firma del codice (es. Azure Trusted Signing, circa 10 €/mese, con verifica dell'identità aziendale). |
| Piano gratuito Supabase: nessuno SLA, nessun backup gestito, pausa dopo 7 giorni senza attività. | Keep-alive automatico ogni 2 giorni (verificabile in tabella `manutenzione`). Assenza di backup coerente con la conservazione di 7 giorni. Per uno SLA: piano Pro. |
| Messaggi non ancora inviati (offline) e bozze salvati **in chiaro** nella cartella dati dell'utente Windows, solo finché non partono. | Stesso perimetro del primo rischio. Volume minimo e temporaneo. |
| Trattamento dati personali (nomi facoltativi, contenuti). | Dati in UE. Sottoscrivere il **DPA di Supabase** (accordo sul trattamento dati, disponibile nella sezione legale di Supabase) e indicare il fornitore nel registro dei trattamenti. |

*Verifiche consigliate all'IT:* `supabase/migrations` (regole RLS), `supabase/tests` (test), `docs/GUIDA.md` (installazione e gestione).
