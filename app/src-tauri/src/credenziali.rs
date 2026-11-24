//! Salvataggio sicuro nel Gestore credenziali di Windows
//! (Pannello di controllo → Gestione credenziali → Credenziali di Windows,
//! voci "accesso.ContattiInterni" e "sessione.ContattiInterni").
//!
//! Sono ammesse solo due voci:
//!  - "accesso":  codice sede e password (per il rientro automatico)
//!  - "sessione": il token di rinnovo della sessione Supabase

use keyring::Entry;

const SERVIZIO: &str = "ContattiInterni";
const VOCI_AMMESSE: [&str; 2] = ["accesso", "sessione"];

fn voce(chiave: &str) -> Result<Entry, String> {
    if !VOCI_AMMESSE.contains(&chiave) {
        return Err(format!("voce non ammessa: {chiave}"));
    }
    Entry::new(SERVIZIO, chiave).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credenziali_leggi(chiave: String) -> Result<Option<String>, String> {
    match voce(&chiave)?.get_password() {
        Ok(valore) => Ok(Some(valore)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            log::error!("Lettura credenziale '{chiave}' non riuscita: {e}");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn credenziali_salva(chiave: String, valore: String) -> Result<(), String> {
    voce(&chiave)?.set_password(&valore).map_err(|e| {
        log::error!("Salvataggio credenziale '{chiave}' non riuscito: {e}");
        e.to_string()
    })
}

#[cfg(test)]
mod test {
    use super::*;

    /// Prova reale sul Gestore credenziali: salva, rilegge, cancella.
    #[test]
    fn salva_legge_cancella() {
        let valore = "prova-di-test-123".to_string();
        credenziali_salva("sessione".into(), valore.clone()).unwrap();
        assert_eq!(credenziali_leggi("sessione".into()).unwrap(), Some(valore));
        credenziali_cancella("sessione".into()).unwrap();
        assert_eq!(credenziali_leggi("sessione".into()).unwrap(), None);
    }

    #[test]
    fn rifiuta_voci_non_ammesse() {
        assert!(credenziali_salva("altro".into(), "x".into()).is_err());
    }
}

#[tauri::command]
pub fn credenziali_cancella(chiave: String) -> Result<(), String> {
    match voce(&chiave)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            log::error!("Cancellazione credenziale '{chiave}' non riuscita: {e}");
            Err(e.to_string())
        }
    }
}
