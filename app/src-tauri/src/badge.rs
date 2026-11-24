//! Disegno dei "badge": pallino rosso con il numero dei messaggi da leggere,
//! sovrapposto all'icona nella barra delle applicazioni e nell'area di notifica.
//! Disegnato a mano (pochi pixel) per non aggiungere librerie.

use tauri::image::Image;

/// Cifre 3x5 pixel (1 = acceso), riga per riga.
const CIFRE: [[u8; 15]; 10] = [
    [1,1,1, 1,0,1, 1,0,1, 1,0,1, 1,1,1], // 0
    [0,1,0, 1,1,0, 0,1,0, 0,1,0, 1,1,1], // 1
    [1,1,1, 0,0,1, 1,1,1, 1,0,0, 1,1,1], // 2
    [1,1,1, 0,0,1, 0,1,1, 0,0,1, 1,1,1], // 3
    [1,0,1, 1,0,1, 1,1,1, 0,0,1, 0,0,1], // 4
    [1,1,1, 1,0,0, 1,1,1, 0,0,1, 1,1,1], // 5
    [1,1,1, 1,0,0, 1,1,1, 1,0,1, 1,1,1], // 6
    [1,1,1, 0,0,1, 0,1,0, 0,1,0, 0,1,0], // 7
    [1,1,1, 1,0,1, 1,1,1, 1,0,1, 1,1,1], // 8
    [1,1,1, 1,0,1, 1,1,1, 0,0,1, 1,1,1], // 9
];
const PIU: [u8; 15] = [0,0,0, 0,1,0, 1,1,1, 0,1,0, 0,0,0];

const ROSSO: [u8; 4] = [0xd3, 0x2f, 0x2f, 0xff];
const BIANCO: [u8; 4] = [0xff, 0xff, 0xff, 0xff];

fn pixel(buf: &mut [u8], larghezza: u32, x: i32, y: i32, colore: [u8; 4]) {
    if x < 0 || y < 0 || x as u32 >= larghezza || y as u32 * larghezza * 4 >= buf.len() as u32 {
        return;
    }
    let i = ((y as u32 * larghezza + x as u32) * 4) as usize;
    buf[i..i + 4].copy_from_slice(&colore);
}

/// Cerchio rosso pieno di centro (cx, cy) e raggio r, con bordo bianco.
fn cerchio(buf: &mut [u8], larghezza: u32, cx: f32, cy: f32, r: f32) {
    let (x0, x1) = ((cx - r - 2.0) as i32, (cx + r + 2.0) as i32);
    let (y0, y1) = ((cy - r - 2.0) as i32, (cy + r + 2.0) as i32);
    for y in y0..=y1 {
        for x in x0..=x1 {
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            if d <= r {
                pixel(buf, larghezza, x, y, ROSSO);
            } else if d <= r + r * 0.12 + 1.0 {
                pixel(buf, larghezza, x, y, BIANCO);
            }
        }
    }
}

/// Scrive il numero (1-9, oltre "9+") centrato in (cx, cy).
fn numero(buf: &mut [u8], larghezza: u32, cx: f32, cy: f32, scala: i32, conteggio: u32) {
    let simboli: Vec<&[u8; 15]> = if conteggio <= 9 {
        vec![&CIFRE[conteggio as usize]]
    } else {
        vec![&CIFRE[9], &PIU]
    };
    let largo = simboli.len() as i32 * 3 * scala + (simboli.len() as i32 - 1) * scala;
    let alto = 5 * scala;
    let mut x_inizio = (cx - largo as f32 / 2.0).round() as i32;
    let y_inizio = (cy - alto as f32 / 2.0).round() as i32;
    for s in simboli {
        for riga in 0..5 {
            for col in 0..3 {
                if s[(riga * 3 + col) as usize] == 1 {
                    for dy in 0..scala {
                        for dx in 0..scala {
                            pixel(buf, larghezza, x_inizio + col * scala + dx, y_inizio + riga * scala + dy, BIANCO);
                        }
                    }
                }
            }
        }
        x_inizio += 4 * scala;
    }
}

/// Icona sovrapposta per la barra delle applicazioni (32x32): pallino con numero.
pub fn sovrapposizione(conteggio: u32) -> Image<'static> {
    let lato = 32u32;
    let mut buf = vec![0u8; (lato * lato * 4) as usize];
    cerchio(&mut buf, lato, 16.0, 16.0, 14.0);
    numero(&mut buf, lato, 16.0, 16.0, if conteggio <= 9 { 3 } else { 2 }, conteggio);
    Image::new_owned(buf, lato, lato)
}

/// Icona dell'area di notifica con pallino rosso in alto a destra.
pub fn icona_con_pallino(base: &Image<'_>) -> Image<'static> {
    let (w, h) = (base.width(), base.height());
    let mut buf = base.rgba().to_vec();
    let r = w as f32 * 0.24;
    cerchio(&mut buf, w, w as f32 - r - 1.0, r + 1.0, r);
    let _ = h;
    Image::new_owned(buf, w, h)
}
