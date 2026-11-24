# Contatti Interni

Messaggistica interna tra la **Casa madre** e i **punti vendita**: un canale chiuso, che non passa da email o app di messaggistica di terzi.

- I punti vendita scrivono solo alla Casa madre e vedono solo la propria conversazione.
- La Casa madre vede l'elenco dei punti vendita, con i messaggi da leggere, e risponde al singolo punto vendita.
- Solo testo, nome facoltativo, ora di invio e "Inviato ✓". In Casa madre anche "Da leggere" / "Letto".
- Notifiche di Windows con suono. Sul punto vendita la finestra torna davanti e resta una fascia gialla finché qualcuno non preme "Ho visto".
- L'app parte con Windows e resta attiva vicino all'orologio. Si aggiorna da sola.
- I messaggi più vecchi di 7 giorni vengono cancellati automaticamente.

> Stato: **tutte le 5 fasi completate**. Vedi [docs/CHECKLIST.md](docs/CHECKLIST.md) per le verifiche sul campo ancora da fare.

## Documenti
| Documento | Per chi |
|---|---|
| [docs/GUIDA.md](docs/GUIDA.md) | Consulente: Supabase, account, GitHub, installazione sui PC, gestione |
| [docs/SCHEDA-SICUREZZA.md](docs/SCHEDA-SICUREZZA.md) | IT del cliente: architettura, controlli, rischi residui |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | Stato delle fasi e punti aperti |

## Come è fatto
```
 PC negozio / Casa madre                     Supabase (UE, Francoforte)
┌──────────────────────────┐   HTTPS/WSS    ┌──────────────────────────────┐
│ App Tauri (WebView2)     │ ─────────────▶ │ Auth (un account per sede)   │
│ - chiave PUBBLICA        │                │ Postgres + Row Level Security│
│ - credenziali nel Gestore│ ◀───────────── │ Realtime (messaggi in arrivo)│
│   credenziali di Windows │   tempo reale  │ pg_cron (pulizia 7 giorni)   │
└──────────────────────────┘                └──────────────────────────────┘
          ▲  aggiornamenti firmati                     ▲ ping ogni 2 giorni
          │                                            │
     GitHub Releases ◀── GitHub Actions: test, installer, keep-alive
```

## Struttura del repository
| Cartella | Contenuto |
|---|---|
| `config/sedi.json` | Elenco e nomi delle sedi (l'unico file da toccare per i nomi) |
| `supabase/migrations/` | Database: tabelle, regole di sicurezza (RLS), funzioni, pulizia notturna |
| `supabase/tests/` | 47 test di sicurezza automatici |
| `admin/` | Script di amministrazione: account, password, punti vendita, verifica sicurezza, configurazione GitHub |
| `app/` | App desktop Tauri 2 (interfaccia in `src/`, parte nativa in `src-tauri/`) |
| `.github/workflows/` | `test-db` (test), `release` (installer e aggiornamenti), `keep-alive` |
| `docs/` | Guida, scheda di sicurezza, checklist |

## Comandi principali
| Cosa | Dove | Comando |
|---|---|---|
| Creare gli account | `admin` | `npm run crea-account` |
| Stato delle sedi | `admin` | `npm run elenco` |
| Cambiare i nomi (dopo aver modificato `config/sedi.json`) | `admin` | `npm run sincronizza-nomi` |
| Nuova password per una sede | `admin` | `npm run reimposta-password -- pv03` |
| Nuova password scelta da te | `admin` | `npm run reimposta-password -- pv03 --scelgo` |
| Aggiungere / disattivare un punto vendita | `admin` | `npm run aggiungi-punto-vendita -- pv19 "Nome"` / `npm run disattiva -- pv19` |
| Verifica di sicurezza sul progetto vero | `admin` | `npm run verifica-sicurezza` |
| Configurare GitHub (segreti + prima versione) | `admin` | `npm run configura-github` |
| Provare l'app sul PC di sviluppo | `app` | `npm run avvia` |
| Pubblicare una nuova versione | `app` | `npm run nuova-versione -- 0.2.0` |

## Scelte tecniche, in breve
- **Tauri 2 invece di Electron:** installer di circa 2 MB, poca memoria, usa WebView2 già presente in Windows 11.
- **Interfaccia senza framework** (TypeScript + HTML + CSS): due schermate semplici, meno codice da mantenere.
- **Sicurezza nel database:** l'app usa solo la chiave pubblica. Cosa può fare ciascuno lo decidono le regole RLS, verificate da test automatici.
- **Nessun messaggio perso:** a ogni riconnessione l'app ricarica gli ultimi 7 giorni; senza linea, i messaggi restano in coda e partono da soli.
