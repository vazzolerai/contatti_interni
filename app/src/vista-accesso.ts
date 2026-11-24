// Schermate di servizio: accesso, attesa, app non configurata.
import { accedi, type Esito } from './supabase';
import type { Sede } from './tipi';
import { h } from './ui';

export const MESSAGGI_ESITO: Record<string, string> = {
  credenziali: 'Codice o password non corretti. Controlla e riprova.',
  rete: 'Nessuna connessione a Internet. Controlla la linea e riprova.',
  non_attivo: 'Questo account non è attivo. Contatta la Casa madre.',
  altro: 'Accesso non riuscito per un problema temporaneo. Riprova tra qualche minuto.',
};

/** Schermata di accesso (codice sede + password). */
export function vistaAccesso(radice: HTMLElement, avviso: string | null, onAccesso: (sede: Sede) => void): void {
  const codice = h('input', { id: 'codice', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'es. pv01' });
  const password = h('input', { id: 'password', type: 'password', autocomplete: 'current-password' });
  const errore = h('p', { class: 'errore', role: 'alert', hidden: !avviso }, avviso ?? '');
  const pulsante = h('button', { class: 'pulsante grande', type: 'submit' }, 'Accedi');

  const modulo = h('form', { class: 'modulo-accesso' },
    h('h1', null, 'Contatti Interni'),
    h('p', { class: 'spiegazione' }, 'Inserisci il codice della sede e la password. Andranno inserite solo questa volta.'),
    h('label', { for: 'codice' }, 'Codice sede'),
    codice,
    h('label', { for: 'password' }, 'Password'),
    password,
    errore,
    pulsante,
  );

  modulo.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!codice.value.trim() || !password.value) {
      errore.textContent = 'Compila sia il codice sia la password.';
      errore.hidden = false;
      return;
    }
    pulsante.setAttribute('disabled', '');
    pulsante.textContent = 'Accesso in corso…';
    errore.hidden = true;

    const esito: Esito = await accedi(codice.value, password.value);
    if (esito.ok) {
      onAccesso(esito.sede);
      return;
    }
    errore.textContent = MESSAGGI_ESITO[esito.motivo] ?? MESSAGGI_ESITO.altro;
    errore.hidden = false;
    pulsante.removeAttribute('disabled');
    pulsante.textContent = 'Accedi';
    if (esito.motivo === 'credenziali') password.select();
  });

  radice.replaceChildren(h('div', { class: 'schermata-centrale' }, modulo));
  codice.focus();
}

/** Schermata di attesa con messaggio semplice. */
export function vistaAttesa(radice: HTMLElement, testo: string, dettaglio?: string): void {
  radice.replaceChildren(
    h('div', { class: 'schermata-centrale' },
      h('div', { class: 'attesa' },
        h('div', { class: 'rotella', 'aria-hidden': 'true' }),
        h('p', { class: 'attesa-testo' }, testo),
        dettaglio ? h('p', { class: 'spiegazione' }, dettaglio) : null,
      ),
    ),
  );
}
