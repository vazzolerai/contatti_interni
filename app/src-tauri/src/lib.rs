//! Parte "nativa" dell'app:
//!  - icona nell'area di notifica (vicino all'orologio) e chiusura "nella tray"
//!  - una sola copia dell'app aperta alla volta
//!  - avvio automatico con Windows (solo nella versione installata)
//!  - badge, finestra in primo piano, Gestore credenziali, log su file

mod badge;
mod credenziali;

use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, UserAttentionType, WebviewWindow, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const ID_TRAY: &str = "principale";

/// Ultimo numero mostrato sul badge: serve a rimetterlo quando la finestra
/// ricompare (Windows perde il badge della barra se la finestra era nascosta).
static BADGE: AtomicU32 = AtomicU32::new(0);

fn applica_sovrapposizione(window: &WebviewWindow) {
    let n = BADGE.load(Ordering::Relaxed);
    let _ = window.set_overlay_icon(if n > 0 { Some(badge::sovrapposizione(n)) } else { None });
}

/// Rimette il badge poco dopo che la finestra è ricomparsa sulla barra.
fn riapplica_badge(window: &WebviewWindow) {
    let w = window.clone();
    std::thread::spawn(move || {
        for attesa in [300, 1500] {
            std::thread::sleep(Duration::from_millis(attesa));
            applica_sovrapposizione(&w);
        }
    });
}

/// Mostra la finestra principale e la porta davanti.
fn mostra(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        riapplica_badge(&w);
    }
}

fn crea_tray(app: &AppHandle) -> tauri::Result<()> {
    let apri = MenuItem::with_id(app, "apri", "Apri Contatti Interni", true, None::<&str>)?;
    let esci = MenuItem::with_id(app, "esci", "Esci", true, None::<&str>)?;
    // Riga non cliccabile: utile al consulente per sapere se il PC è aggiornato
    let versione = MenuItem::with_id(
        app, "versione", format!("Versione {}", app.package_info().version), false, None::<&str>,
    )?;
    let separatore = tauri::menu::PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&apri, &esci, &separatore, &versione])?;

    let mut tray = TrayIconBuilder::with_id(ID_TRAY)
        .tooltip("Contatti Interni")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id.as_ref() {
            "apri" => mostra(app),
            "esci" => {
                // La conferma la chiede l'interfaccia (testo comprensibile).
                mostra(app);
                let _ = app.emit("richiesta-uscita", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, evento| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                mostra(tray.app_handle());
            }
        });
    if let Some(icona) = app.default_window_icon() {
        tray = tray.icon(icona.clone());
    }
    tray.build(app)?;
    Ok(())
}

// ------------------------------------------------------------- comandi

/// Porta la finestra davanti a tutto e fa lampeggiare l'icona sulla barra.
/// (Windows può impedire a un'app di "rubare" il primo piano: per questo
/// la finestra resta "sempre in primo piano" per un attimo e l'icona lampeggia
/// finché qualcuno non la guarda.)
#[tauri::command]
fn porta_in_primo_piano(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
    let _ = window.request_user_attention(Some(UserAttentionType::Critical));
    riapplica_badge(&window);
    let w = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2500));
        let _ = w.set_always_on_top(false);
    });
}

/// Fa lampeggiare l'icona sulla barra delle applicazioni (senza spostare la finestra).
#[tauri::command]
fn richiama_attenzione(window: WebviewWindow) {
    if !window.is_focused().unwrap_or(false) {
        let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    }
}

/// Aggiorna badge sulla barra delle applicazioni, icona e testo nell'area di notifica.
#[tauri::command]
fn aggiorna_badge(app: AppHandle, window: WebviewWindow, conteggio: u32) {
    let base = app.default_window_icon().cloned();
    if let Some(tray) = app.tray_by_id(ID_TRAY) {
        if let Some(base) = &base {
            let icona = if conteggio > 0 { badge::icona_con_pallino(base) } else { base.clone().to_owned() };
            let _ = tray.set_icon(Some(icona));
        }
        let testo = match conteggio {
            0 => "Contatti Interni".to_string(),
            1 => "Contatti Interni – 1 messaggio da leggere".to_string(),
            n => format!("Contatti Interni – {n} messaggi da leggere"),
        };
        let _ = tray.set_tooltip(Some(testo));
    }
    BADGE.store(conteggio, Ordering::Relaxed);
    applica_sovrapposizione(&window);
}

/// Chiude davvero l'app (dopo la conferma nell'interfaccia).
#[tauri::command]
fn esci_app(app: AppHandle) {
    log::info!("Uscita richiesta dall'utente");
    app.exit(0);
}

// ---------------------------------------------------------------- avvio
pub fn run() {
    let log = tauri_plugin_log::Builder::new()
        .targets([
            // %LOCALAPPDATA%\it.contattiinterni.app\logs\contatti-interni.log
            Target::new(TargetKind::LogDir { file_name: Some("contatti-interni".into()) }),
            Target::new(TargetKind::Stdout),
        ])
        .max_file_size(2_000_000)
        .rotation_strategy(RotationStrategy::KeepOne)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .level(log::LevelFilter::Info)
        .build();

    tauri::Builder::default()
        // Deve essere il primo: se l'app è già aperta, la nuova copia mostra quella esistente.
        .plugin(tauri_plugin_single_instance::init(|app, _argomenti, _cartella| mostra(app)))
        .plugin(log)
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            crea_tray(app.handle())?;

            // Avvio automatico con Windows: attivato solo nella versione installata,
            // non durante le prove sul PC di sviluppo.
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let avvio = app.autolaunch();
                if !avvio.is_enabled().unwrap_or(false) {
                    match avvio.enable() {
                        Ok(()) => log::info!("Avvio automatico attivato"),
                        Err(e) => log::error!("Avvio automatico non attivato: {e}"),
                    }
                }
            }
            log::info!("Contatti Interni avviato (versione {})", app.package_info().version);
            Ok(())
        })
        // La X della finestra la nasconde: l'app resta attiva vicino all'orologio.
        .on_window_event(|window, evento| {
            if let WindowEvent::CloseRequested { api, .. } = evento {
                api.prevent_close();
                let _ = window.hide();
                let _ = window.emit("finestra-nascosta", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            credenziali::credenziali_leggi,
            credenziali::credenziali_salva,
            credenziali::credenziali_cancella,
            porta_in_primo_piano,
            richiama_attenzione,
            aggiorna_badge,
            esci_app,
        ])
        .run(tauri::generate_context!())
        .expect("errore all'avvio di Contatti Interni");
}
