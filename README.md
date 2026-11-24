# Contatti Interni

Messaggistica interna tra la **Casa madre** e i **punti vendita**: un canale chiuso, che non passa da email o app di messaggistica di terzi.

- I punti vendita scrivono solo alla Casa madre e vedono solo la propria conversazione.
- La Casa madre vede tutte le conversazioni e risponde al singolo punto vendita.
- I messaggi più vecchi di 7 giorni vengono cancellati automaticamente.

> Stato: **fase 2 di 5** (app con le due viste). Vedi [docs/CHECKLIST.md](docs/CHECKLIST.md).

## Struttura

| Cartella | Contenuto |
|---|---|
| `config/sedi.json` | Elenco e nomi delle sedi (l'unico file da toccare per i nomi) |
| `supabase/migrations/` | Database: tabelle, regole di sicurezza (RLS), funzioni, pulizia notturna |
| `supabase/tests/` | Test di sicurezza automatici |
| `admin/` | Script di amministrazione (account, password, punti vendita) |
| `app/` | App desktop Tauri (fase 2) |
| `.github/workflows/` | Automazioni GitHub: test, build, keep-alive |
| `docs/` | Guida passo passo, checklist, scheda di sicurezza |

## Per iniziare
Segui [docs/GUIDA.md](docs/GUIDA.md).
