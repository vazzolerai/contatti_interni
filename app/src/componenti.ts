// Componenti condivisi dalle due viste: elenco messaggi, casella di scrittura,
// fascia sullo stato della connessione.
import type { Archivio } from './archivio';
import { MAX_CARATTERI, MAX_NOME } from './config';
import type { VoceChat } from './tipi';
import { giorno, h, ora } from './ui';

// ----------------------------------------------------------- elenco messaggi
export interface OpzioniChat {
  archivio: Archivio;
  /** Nome di chi sta dall'altra parte (es. "Casa madre" o "Punto vendita 3"). */
  nomeAltraParte: string;
  /** Casa madre: id dei messaggi che erano "da leggere" all'apertura. */
  nuovi?: Set<string>;
  /** Casa madre: mostra "Letto" sui messaggi ricevuti. */
  mostraLetto?: boolean;
  /** Testo rimesso nella casella quando si elimina un messaggio non inviato. */
  onTestoRecuperato?: (testo: string) => void;
}

export function disegnaChat(contenitore: HTMLElement, voci: VoceChat[], o: OpzioniChat): void {
  const eraInFondo = contenitore.scrollHeight - contenitore.scrollTop - contenitore.clientHeight < 80;
  contenitore.replaceChildren();

  if (voci.length === 0) {
    contenitore.append(h('div', { class: 'chat-vuota' }, 'Nessun messaggio negli ultimi 7 giorni.'));
    return;
  }

  let giornoPrecedente = '';
  let separatoreNuoviMesso = false;

  for (const v of voci) {
    const quando = v.tipo === 'server' ? v.m.creato_il : v.m.creato_locale;
    const g = giorno(quando);
    if (g !== giornoPrecedente) {
      contenitore.append(h('div', { class: 'giorno' }, h('span', null, g)));
      giornoPrecedente = g;
    }

    const ricevuto = o.archivio.inArrivo(v.m);
    const nuovo = v.tipo === 'server' && o.nuovi?.has(v.m.id);
    if (nuovo && !separatoreNuoviMesso) {
      contenitore.append(h('div', { class: 'separatore-nuovi' }, h('span', null, 'Nuovi messaggi')));
      separatoreNuoviMesso = true;
    }

    const mittente = ricevuto ? o.nomeAltraParte : 'Tu';
    const intestazione = v.m.nome_mittente ? `${mittente} · ${v.m.nome_mittente}` : mittente;

    let stato: Node;
    if (v.tipo === 'coda') {
      stato = v.m.stato === 'in_invio'
        ? h('span', { class: 'stato in-invio' }, `${ora(quando)} · In invio…`)
        : h('span', { class: 'stato non-inviato' },
            `${ora(quando)} · Non inviato `,
            h('button', { class: 'link', onclick: () => o.archivio.riprova(v.m.id) }, 'Riprova'),
            ' ',
            h('button', {
              class: 'link',
              onclick: () => {
                const testo = o.archivio.elimina(v.m.id);
                if (testo) o.onTestoRecuperato?.(testo);
              },
            }, 'Elimina'),
          );
    } else if (!ricevuto) {
      stato = h('span', { class: 'stato inviato' }, `${ora(quando)} · Inviato ✓`);
    } else if (o.mostraLetto) {
      stato = v.m.letto_il
        ? h('span', { class: 'stato' }, `${ora(quando)} · Letto`)
        : h('span', { class: 'stato da-leggere' }, `${ora(quando)} · Da leggere`);
    } else {
      stato = h('span', { class: 'stato' }, ora(quando));
    }

    contenitore.append(
      h('div', { class: `messaggio ${ricevuto ? 'ricevuto' : 'mio'}${nuovo ? ' nuovo' : ''}` },
        h('div', { class: 'mittente' }, intestazione),
        h('div', { class: 'testo' }, v.m.testo),
        h('div', { class: 'piede' }, stato),
      ),
    );
  }

  if (eraInFondo || contenitore.dataset.primaVolta !== 'no') {
    contenitore.scrollTop = contenitore.scrollHeight;
    contenitore.dataset.primaVolta = 'no';
  }
}

// ------------------------------------------------------ casella di scrittura
export interface Composer {
  elemento: HTMLElement;
  inserisciTesto(testo: string): void;
  focus(): void;
}

export function creaComposer(chiaveBozza: string, onInvia: (testo: string, nome: string | null) => void): Composer {
  const leggi = (k: string) => {
    try { return localStorage.getItem(k) ?? ''; } catch { return ''; }
  };
  const scrivi = (k: string, v: string) => {
    try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignora */ }
  };

  const nome = h('input', {
    class: 'campo-nome',
    type: 'text',
    maxlength: MAX_NOME,
    placeholder: 'Il tuo nome (facoltativo)',
    'aria-label': 'Il tuo nome (facoltativo)',
  });
  nome.value = leggi('ci-nome');
  nome.addEventListener('input', () => scrivi('ci-nome', nome.value.trim()));

  const testo = h('textarea', {
    class: 'campo-testo',
    rows: 3,
    maxlength: MAX_CARATTERI,
    placeholder: 'Scrivi qui il messaggio…',
    'aria-label': 'Messaggio',
  });
  testo.value = leggi(chiaveBozza);

  const contatore = h('span', { class: 'contatore' });
  const invia = h('button', { class: 'pulsante pulsante-invia', type: 'button' }, 'Invia');

  const aggiorna = () => {
    const pieno = testo.value.trim().length > 0;
    invia.toggleAttribute('disabled', !pieno);
    const restanti = MAX_CARATTERI - testo.value.length;
    contatore.textContent = restanti < 200 ? `Ancora ${restanti} caratteri` : '';
  };

  const esegui = () => {
    const t = testo.value.trim();
    if (!t) return;
    onInvia(t, nome.value.trim() || null);
    testo.value = '';
    scrivi(chiaveBozza, '');
    aggiorna();
    testo.focus();
  };

  testo.addEventListener('input', () => {
    scrivi(chiaveBozza, testo.value);
    aggiorna();
  });
  testo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      esegui();
    }
  });
  invia.addEventListener('click', esegui);
  aggiorna();

  const elemento = h('div', { class: 'composer' },
    nome,
    testo,
    h('div', { class: 'composer-piede' },
      h('span', { class: 'suggerimento' }, 'Invio = invia · Maiusc+Invio = a capo'),
      contatore,
      invia,
    ),
  );

  return {
    elemento,
    inserisciTesto(t: string) {
      testo.value = testo.value ? `${t}\n${testo.value}` : t;
      scrivi(chiaveBozza, testo.value);
      aggiorna();
      testo.focus();
    },
    focus: () => testo.focus(),
  };
}

// -------------------------------------------------- fascia della connessione
export function aggiornaFascia(fascia: HTMLElement, archivio: Archivio): void {
  const inCoda = archivio.messaggiInCoda;
  let testo = '';
  let classe = '';
  if (!navigator.onLine) {
    testo = 'Nessuna connessione a Internet. ' +
      (inCoda ? 'I messaggi scritti verranno inviati appena torna la linea.' : 'Puoi scrivere: i messaggi partiranno appena torna la linea.');
    classe = 'avviso';
  } else if (!archivio.connesso) {
    testo = 'Collegamento in corso…' + (inCoda ? ' I messaggi in attesa verranno inviati a breve.' : '');
    classe = 'info';
  }
  fascia.textContent = testo;
  fascia.className = `fascia ${classe}`;
  fascia.hidden = !testo;
}
