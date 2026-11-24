// Piccoli aiuti per costruire l'interfaccia senza framework.
// Il testo viene sempre inserito come testo (mai come HTML): nessun rischio
// che un messaggio "contenga codice".

type Figlio = Node | string | null | undefined | false;
type Attributi = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributi?: Attributi | null,
  ...figli: Figlio[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [nome, valore] of Object.entries(attributi ?? {})) {
    if (valore === undefined || valore === null || valore === false) continue;
    if (typeof valore === 'function') el.addEventListener(nome.slice(2), valore);
    else if (valore === true) el.setAttribute(nome, '');
    else el.setAttribute(nome, String(valore));
  }
  for (const f of figli) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

const fmtOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtGiornoBreve = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });

export function ora(iso: string): string {
  return fmtOra.format(new Date(iso));
}

function inizioGiorno(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Oggi", "Ieri" oppure "lunedì 23 novembre". */
export function giorno(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((inizioGiorno(new Date()) - inizioGiorno(d)) / 86_400_000);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  const t = fmtGiorno.format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Per l'elenco della Casa madre: "10:32" se oggi, "Ieri", altrimenti "23 nov". */
export function quandoBreve(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((inizioGiorno(new Date()) - inizioGiorno(d)) / 86_400_000);
  if (diff === 0) return ora(iso);
  if (diff === 1) return 'Ieri';
  return fmtGiornoBreve.format(d);
}

/** Piccola finestra di conferma (Sì / No). */
export function conferma(domanda: string, si = 'Sì', no = 'Annulla'): Promise<boolean> {
  return new Promise((risolvi) => {
    const chiudi = (valore: boolean) => {
      sfondo.remove();
      risolvi(valore);
    };
    const sfondo = h('div', { class: 'modale-sfondo' },
      h('div', { class: 'modale', role: 'dialog' },
        h('p', null, domanda),
        h('div', { class: 'modale-pulsanti' },
          h('button', { class: 'pulsante secondario', onclick: () => chiudi(false) }, no),
          h('button', { class: 'pulsante', onclick: () => chiudi(true) }, si),
        ),
      ),
    );
    document.body.append(sfondo);
  });
}
