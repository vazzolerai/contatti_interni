// Vista PUNTO VENDITA: una sola conversazione, con la Casa madre.
import type { Archivio } from './archivio';
import { aggiornaFascia, creaComposer, disegnaChat } from './componenti';
import { log } from './log';
import { supabase } from './supabase';
import { h } from './ui';

export interface Vista {
  distruggi(): void;
}

export function vistaPuntoVendita(radice: HTMLElement, archivio: Archivio): Vista {
  const sede = archivio.sede;
  let nomeSede = sede.nome;
  let nomeCasaMadre = 'Casa madre';

  const titolo = h('h1', { class: 'titolo' }, nomeCasaMadre);
  const sottotitolo = h('div', { class: 'sottotitolo' });
  const fascia = h('div', { class: 'fascia', hidden: true, role: 'status' });
  const chat = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite' });

  const composer = creaComposer(`ci-bozza-${sede.codice}`, (testo, nome) => {
    archivio.invia(sede.id, testo, nome);
  });

  radice.replaceChildren(
    h('div', { class: 'vista vista-pv' },
      h('header', { class: 'testata' }, titolo, sottotitolo),
      fascia,
      chat,
      composer.elemento,
    ),
  );

  const disegna = () => {
    titolo.textContent = nomeCasaMadre;
    sottotitolo.textContent = `Messaggi tra ${nomeSede} e ${nomeCasaMadre}`;
    aggiornaFascia(fascia, archivio);
    disegnaChat(chat, archivio.voci(sede.id), {
      archivio,
      nomeAltraParte: nomeCasaMadre,
      onTestoRecuperato: (t) => composer.inserisciTesto(t),
    });
  };

  // I nomi si leggono dal database: cambiarli non richiede di reinstallare.
  const caricaNomi = async () => {
    const { data, error } = await supabase.from('sedi').select('id, nome, ruolo');
    if (error) {
      log.avviso('Lettura nomi sedi non riuscita', { code: error.code });
      return;
    }
    for (const s of data) {
      if (s.ruolo === 'casa_madre') nomeCasaMadre = s.nome;
      if (Number(s.id) === sede.id) nomeSede = s.nome;
    }
    disegna();
  };

  archivio.onRicaricato = () => void caricaNomi();
  const smetti = archivio.ascolta(disegna);
  const aggiornaRete = () => aggiornaFascia(fascia, archivio);
  window.addEventListener('online', aggiornaRete);
  window.addEventListener('offline', aggiornaRete);

  disegna();
  void caricaNomi();
  composer.focus();

  return {
    distruggi() {
      smetti();
      window.removeEventListener('online', aggiornaRete);
      window.removeEventListener('offline', aggiornaRete);
    },
  };
}
