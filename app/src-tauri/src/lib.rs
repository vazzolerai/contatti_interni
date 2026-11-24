//! Parte "nativa" dell'app: accesso al Gestore credenziali di Windows e log su file.
//! L'interfaccia (cartella src/) chiama queste funzioni tramite `invoke`.

mod credenziali;

use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

pub fn run() {
    let log = tauri_plugin_log::Builder::new()
        .targets([
            // %LOCALAPPDATA%\it.contattiinterni.app\logs\contatti-interni.log
            Target::new(TargetKind::LogDir {
                file_name: Some("contatti-interni".into()),
            }),
            Target::new(TargetKind::Stdout),
        ])
        .max_file_size(2_000_000)
        .rotation_strategy(RotationStrategy::KeepOne)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .level(log::LevelFilter::Info)
        .build();

    tauri::Builder::default()
        .plugin(log)
        .invoke_handler(tauri::generate_handler![
            credenziali::credenziali_leggi,
            credenziali::credenziali_salva,
            credenziali::credenziali_cancella,
        ])
        .run(tauri::generate_context!())
        .expect("errore all'avvio di Contatti Interni");
}
