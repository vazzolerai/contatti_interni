// Vista PUNTO VENDITA: una sola conversazione, con la Casa madre.
//
// Un messaggio della sede NON deve passare inosservato:
//  - la finestra viene portata in primo piano e l'icona lampeggia
//  - suona una volta (anche con "Non disturbare" attivo)
//  - notifica di Windows se la finestra non era davanti
//  - una fascia gialla "Nuovo messaggio dalla Casa madre" resta finché
//    qualcuno non preme "Ho visto" (o risponde)
import type { Archivio } from './archivio';
import { aggiornaBadge, finestraDavanti, notifica, portaInPrimoPiano, raggruppa, suono } from './avvisi';
import { aggiornaFascia, creaComposer, disegnaChat } from './componenti';
import { log } from './log';
import { supabase } from './supabase';
import type { Messaggio } from './tipi';
import { h } from './ui';

export interface Vista {
  distruggi(): void;
}

export function vistaPuntoVendita(radice: HTMLElement, archivio: Archivio): Vista {
  const sede = archivio.sede;
  let nomeSede = sede.nome;
  let nomeCasaMadre = 'Casa madre';

  // Fino a quando i messaggi della sede sono stati "visti" (salvato su questo PC)
  const chiaveVisto = `ci-visto-${sede.codice}`;
  const leggiVisto = () => {
    try { return localStorage.getItem(chiaveVisto); } catch { return null; }
  };
  const scriviVisto = (iso: string) => {
    try { localStorage.setItem(chiaveVisto, iso); } catch { /* ignora */ }
  };
  // Primo avvio su questo PC: i messaggi già presenti non fanno scattare l'avviso
  if (!leggiVisto()) scriviVisto(new Date().toISOString());

  const nonVisti = (): Messaggio[] => {
    const visto = leggiVisto() ?? '';
    return archivio.voci(sede.id)
      .filter((v) => v.tipo === 'server' && archivio.inArrivo(v.m) && (v.m as Messaggio).creato_il > visto)
      .map((v) => v.m as Messaggio);
  };

  const segnaVisti = () => {
    const ultimi = nonVisti();
    if (ultimi.length === 0) return;
    scriviVisto(ultimi[ultimi.length - 1].creato_il);
    disegna();
  };

  const titolo = h('h1', { class: 'titolo' }, nomeCasaMadre);
  const sottotitolo = h('div', { class: 'sottotitolo' });
  const fascia = h('div', { class: 'fascia', hidden: true, role: 'status' });
  const testoNuovo = h('span', { class: 'nuovo-testo' });
  const fasciaNuovo = h('div', { class: 'fascia-nuovo', hidden: true, role: 'alert' },
    h('span', { class: 'nuovo-icona', 'aria-hidden': 'true' }, '✉'),
    testoNuovo,
    h('button', { class: 'pulsante pulsante-visto', type: 'button', onclick: segnaVisti }, 'Ho visto'),
  );
  const chat = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite' });

  const composer = creaComposer(`ci-bozza-${sede.codice}`, (testo, nome) => {
    archivio.invia(sede.id, testo, nome);
    segnaVisti(); // chi risponde ha evidentemente visto
  });

  radice.replaceChildren(
    h('div', { class: 'vista vista-pv' },
      h('header', { class: 'testata' }, titolo, sottotitolo),
      fascia,
      fasciaNuovo,
      chat,
      composer.elemento,
    ),
  );

  function disegna() {
    const nuovi = nonVisti();
    titolo.textContent = nomeCasaMadre;
    sottotitolo.textContent = `Messaggi tra ${nomeSede} e ${nomeCasaMadre}`;
    aggiornaFascia(fascia, archivio);
    fasciaNuovo.hidden = nuovi.length === 0;
    testoNuovo.textContent = nuovi.length === 1
      ? `Nuovo messaggio da ${nomeCasaMadre}`
      : `${nuovi.length} nuovi messaggi da ${nomeCasaMadre}`;
    disegnaChat(chat, archivio.voci(sede.id), {
      archivio,
      nomeAltraParte: nomeCasaMadre,
      nuovi: new Set(nuovi.map((m) => m.id)),
      onTestoRecuperato: (t) => composer.inserisciTesto(t),
    });
    void aggiornaBadge(nuovi.length);
  }

  // Arrivo di messaggi dalla sede (raggruppati se arrivano a raffica)
  const avvisa = raggruppa<Messaggio>(800, (arrivati) => {
    const eraDavanti = finestraDavanti();
    void portaInPrimoPiano();
    suono();
    if (!eraDavanti) {
      const corpo = arrivati.length === 1 ? arrivati[0].testo : `Hai ${arrivati.length} nuovi messaggi.`;
      void notifica(`Messaggio da ${nomeCasaMadre}`, corpo);
    }
    log.info('Avviso nuovo messaggio dalla sede', { quanti: arrivati.length, eraDavanti });
  });
  archivio.onNuovoInArrivo = avvisa;

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
      archivio.onNuovoInArrivo = undefined;
      window.removeEventListener('online', aggiornaRete);
      window.removeEventListener('offline', aggiornaRete);
    },
  };
}
