// Nasconde la finestra della console nelle versioni installate.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    contatti_interni_lib::run()
}
