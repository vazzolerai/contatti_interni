// Vista CASA MADRE: elenco dei punti vendita a sinistra, conversazione a destra.
import type { Archivio } from './archivio';
import { aggiornaFascia, creaComposer, disegnaChat, type Composer } from './componenti';
import { log } from './log';
import { supabase } from './supabase';
import { h, quandoBreve } from './ui';
import type { Vista } from './vista-punto-vendita';

interface PuntoVendita {
  id: number;
  codice: string;
  nome: string;
}

export function vistaCasaMadre(radice: HTMLElement, archivio: Archivio): Vista {
  let puntiVendita: PuntoVendita[] = [];
  let aperto: PuntoVendita | null = null;
  /** Messaggi che erano "da leggere" quando la conversazione è stata aperta. */
  let nuoviAllApertura = new Set<string>();
  let composer: Composer | null = null;

  const elenco = h('nav', { class: 'elenco', 'aria-label': 'Punti vendita' });
  const fascia = h('div', { class: 'fascia', hidden: true, role: 'status' });
  const titolo = h('h1', { class: 'titolo' });
  const chat = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite' });
  const zonaComposer = h('div');
  const conversazione = h('main', { class: 'conversazione' });

  radice.replaceChildren(
    h('div', { class: 'vista vista-sede' },
      h('aside', { class: 'colonna-elenco' },
        h('div', { class: 'testata-elenco' }, 'Punti vendita'),
        elenco,
      ),
      conversazione,
    ),
  );

  // -------------------------------------------------------------- elenco
  const disegnaElenco = () => {
    elenco.replaceChildren(
      ...puntiVendita.map((pv) => {
        const daLeggere = archivio.daLeggere(pv.id);
        const ultimo = archivio.ultimo(pv.id);
        const anteprima = ultimo
          ? `${archivio.inArrivo(ultimo) ? '' : 'Tu: '}${ultimo.testo.replace(/\s+/g, ' ')}`
          : 'Nessun messaggio';
        return h('button', {
          class: `voce-elenco${aperto?.id === pv.id ? ' attiva' : ''}${daLeggere ? ' con-nuovi' : ''}`,
          type: 'button',
          onclick: () => apri(pv),
        },
          h('div', { class: 'voce-riga' },
            h('span', { class: 'voce-nome' }, pv.nome),
            ultimo ? h('span', { class: 'voce-ora' }, quandoBreve(ultimo.creato_il)) : null,
          ),
          h('div', { class: 'voce-riga' },
            h('span', { class: 'voce-anteprima' }, anteprima),
            daLeggere ? h('span', { class: 'contatore-nuovi', 'aria-label': `${daLeggere} da leggere` }, String(daLeggere)) : null,
          ),
        );
      }),
    );
  };

  // -------------------------------------------------------- conversazione
  const disegnaConversazione = () => {
    aggiornaFascia(fascia, archivio);
    if (!aperto) {
      conversazione.replaceChildren(
        fascia,
        h('div', { class: 'scegli' }, 'Scegli un punto vendita dall\'elenco a sinistra.'),
      );
      return;
    }
    titolo.textContent = aperto.nome;
    disegnaChat(chat, archivio.voci(aperto.id), {
      archivio,
      nomeAltraParte: aperto.nome,
      nuovi: nuoviAllApertura,
      mostraLetto: true,
      onTestoRecuperato: (t) => composer?.inserisciTesto(t),
    });
  };

  const apri = (pv: PuntoVendita) => {
    if (aperto?.id === pv.id) return;
    aperto = pv;
    nuoviAllApertura = new Set(
      archivio.voci(pv.id)
        .filter((v) => v.tipo === 'server' && v.m.direzione === 'verso_sede' && !v.m.letto_il)
        .map((v) => v.m.id),
    );
    composer = creaComposer(`ci-bozza-sede-${pv.codice}`, (testo, nome) => archivio.invia(pv.id, testo, nome));
    zonaComposer.replaceChildren(composer.elemento);
    chat.dataset.primaVolta = '';
    conversazione.replaceChildren(
      h('header', { class: 'testata' }, titolo),
      fascia,
      chat,
      zonaComposer,
    );
    disegnaConversazione();
    disegnaElenco();
    segnaLettiSeVisibile();
    composer.focus();
  };

  /** I messaggi diventano "letti" solo se la conversazione è davvero davanti agli occhi. */
  const segnaLettiSeVisibile = () => {
    if (!aperto || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    for (const v of archivio.voci(aperto.id)) {
      if (v.tipo === 'server' && v.m.direzione === 'verso_sede' && !v.m.letto_il) nuoviAllApertura.add(v.m.id);
    }
    void archivio.segnaLetti(aperto.id);
  };

  // ------------------------------------------------------ nomi delle sedi
  const caricaPuntiVendita = async () => {
    const { data, error } = await supabase
      .from('sedi')
      .select('id, codice, nome, ordine')
      .eq('ruolo', 'punto_vendita')
      .eq('attivo', true)
      .order('ordine')
      .order('nome');
    if (error) {
      log.avviso('Lettura elenco punti vendita non riuscita', { code: error.code });
      return;
    }
    puntiVendita = data.map((r) => ({ id: Number(r.id), codice: r.codice, nome: r.nome }));
    if (aperto) {
      const aggiornato = puntiVendita.find((p) => p.id === aperto!.id);
      if (aggiornato) aperto = aggiornato;
      else {
        aperto = null;
        zonaComposer.replaceChildren();
      }
    }
    disegnaElenco();
    disegnaConversazione();
  };

  // ------------------------------------------------------------ eventi
  archivio.onRicaricato = () => void caricaPuntiVendita();
  const smetti = archivio.ascolta(() => {
    disegnaElenco();
    disegnaConversazione();
    segnaLettiSeVisibile();
  });
  const aggiornaRete = () => aggiornaFascia(fascia, archivio);
  window.addEventListener('online', aggiornaRete);
  window.addEventListener('offline', aggiornaRete);
  window.addEventListener('focus', segnaLettiSeVisibile);
  document.addEventListener('visibilitychange', segnaLettiSeVisibile);

  disegnaConversazione();
  void caricaPuntiVendita();

  return {
    distruggi() {
      smetti();
      window.removeEventListener('online', aggiornaRete);
      window.removeEventListener('offline', aggiornaRete);
      window.removeEventListener('focus', segnaLettiSeVisibile);
      document.removeEventListener('visibilitychange', segnaLettiSeVisibile);
    },
  };
}
