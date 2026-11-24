// Archivio dei messaggi: caricamento, tempo reale (Realtime), coda di invio.
//
// - All'avvio e a ogni (ri)connessione ricarica gli ultimi 7 giorni: così
//   nessun messaggio arrivato mentre la linea era assente va perso.
// - I messaggi scritti finiscono prima in una coda salvata su questo PC e
//   vengono inviati appena possibile, con nuovi tentativi automatici.
// - Ogni messaggio ha un id generato qui: se un invio viene ripetuto, il
//   server lo riconosce e non lo duplica.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { GIORNI_STORICO } from './config';
import { log } from './log';
import { erroreDiRete, supabase } from './supabase';
import type { Messaggio, MessaggioInCoda, Sede, VoceChat } from './tipi';

const ATTESA_MINIMA = 3_000;
const ATTESA_MASSIMA = 60_000;

export class Archivio {
  /** Chiamata quando arriva un messaggio "in entrata" nuovo (per le notifiche). */
  onNuovoInArrivo?: (m: Messaggio) => void;
  /** Chiamata dopo ogni ricarica completa (es. per aggiornare i nomi delle sedi). */
  onRicaricato?: () => void;

  readonly sonoCasaMadre: boolean;
  private messaggi = new Map<string, Messaggio>();
  private coda: MessaggioInCoda[];
  private ascoltatori = new Set<() => void>();
  private canale?: RealtimeChannel;
  private _connesso = false;
  private primoCaricamentoFatto = false;
  private elaborazioneInCorso = false;
  private attesa = ATTESA_MINIMA;
  private timerRitenta?: number;
  private timerControllo?: number;
  private disconnessoDa = 0;
  private chiusa = false;

  constructor(readonly sede: Sede) {
    this.sonoCasaMadre = sede.ruolo === 'casa_madre';
    this.coda = this.leggiCodaSalvata();
  }

  // ------------------------------------------------------------------ avvio
  async avvia(): Promise<void> {
    window.addEventListener('online', this.quandoTornaLaRete);
    await this.ricarica();
    this.sottoscrivi();
    void this.elaboraCoda();
    // Controllo locale (non interroga il server): se il canale resta giù a
    // lungo con la rete presente, lo ricrea.
    this.timerControllo = window.setInterval(() => this.controllaCanale(), 30_000);
  }

  chiudi(): void {
    this.chiusa = true;
    window.removeEventListener('online', this.quandoTornaLaRete);
    window.clearTimeout(this.timerRitenta);
    window.clearInterval(this.timerControllo);
    if (this.canale) void supabase.removeChannel(this.canale);
    this.ascoltatori.clear();
  }

  get connesso(): boolean {
    return this._connesso;
  }

  get messaggiInCoda(): number {
    return this.coda.length;
  }

  /** Registra una funzione da chiamare a ogni cambiamento. */
  ascolta(fn: () => void): () => void {
    this.ascoltatori.add(fn);
    return () => this.ascoltatori.delete(fn);
  }

  private avvisa(): void {
    for (const fn of this.ascoltatori) {
      try {
        fn();
      } catch (e) {
        log.errore('Errore durante l\'aggiornamento dello schermo', e);
      }
    }
  }

  private quandoTornaLaRete = () => {
    log.info('Rete di nuovo disponibile');
    this.attesa = ATTESA_MINIMA;
    void this.elaboraCoda();
    void this.ricarica();
  };

  // ------------------------------------------------------------- lettura
  /** È un messaggio che QUESTA sede riceve (e non che ha scritto)? */
  inArrivo(m: { direzione: string }): boolean {
    return this.sonoCasaMadre ? m.direzione === 'verso_sede' : m.direzione === 'verso_punto_vendita';
  }

  async ricarica(): Promise<void> {
    const da = new Date(Date.now() - GIORNI_STORICO * 86_400_000).toISOString();
    const nuovi = new Map<string, Messaggio>();
    const PAGINA = 1000;

    for (let inizio = 0; ; inizio += PAGINA) {
      let q = supabase
        .from('messaggi')
        .select('*')
        .gte('creato_il', da)
        .order('creato_il', { ascending: true })
        .order('id', { ascending: true })
        .range(inizio, inizio + PAGINA - 1);
      if (!this.sonoCasaMadre) q = q.eq('punto_vendita_id', this.sede.id);

      const { data, error } = await q;
      if (error) {
        if (erroreDiRete(error)) log.avviso('Ricarica messaggi rimandata: rete assente');
        else log.errore('Ricarica messaggi non riuscita', { code: error.code, message: error.message });
        return;
      }
      for (const m of data as Messaggio[]) nuovi.set(m.id, m);
      if (data.length < PAGINA) break;
    }
    if (this.chiusa) return;

    // Messaggi arrivati mentre eravamo scollegati → vanno notificati
    if (this.primoCaricamentoFatto) {
      for (const m of nuovi.values()) {
        if (!this.messaggi.has(m.id) && this.inArrivo(m)) this.onNuovoInArrivo?.(m);
      }
    }
    this.messaggi = nuovi;
    this.primoCaricamentoFatto = true;
    this.togliDallaCodaGiaArrivati();
    this.onRicaricato?.();
    this.avvisa();
  }

  /** Messaggi di una conversazione, in ordine: prima quelli del server, poi quelli in coda. */
  voci(puntoVenditaId: number): VoceChat[] {
    const inCoda = this.coda.filter((m) => m.punto_vendita_id === puntoVenditaId);
    const idInCoda = new Set(inCoda.map((m) => m.id));
    const server = [...this.messaggi.values()]
      .filter((m) => m.punto_vendita_id === puntoVenditaId && !idInCoda.has(m.id))
      .sort((a, b) => a.creato_il.localeCompare(b.creato_il));
    return [
      ...server.map((m) => ({ tipo: 'server' as const, m })),
      ...inCoda.map((m) => ({ tipo: 'coda' as const, m })),
    ];
  }

  /** Messaggi dei punti vendita non ancora letti dalla Casa madre. */
  daLeggere(puntoVenditaId: number): number {
    let n = 0;
    for (const m of this.messaggi.values()) {
      if (m.punto_vendita_id === puntoVenditaId && m.direzione === 'verso_sede' && !m.letto_il) n++;
    }
    return n;
  }

  daLeggereTotale(): number {
    let n = 0;
    for (const m of this.messaggi.values()) if (m.direzione === 'verso_sede' && !m.letto_il) n++;
    return n;
  }

  ultimo(puntoVenditaId: number): Messaggio | undefined {
    let ultimo: Messaggio | undefined;
    for (const m of this.messaggi.values()) {
      if (m.punto_vendita_id === puntoVenditaId && (!ultimo || m.creato_il > ultimo.creato_il)) ultimo = m;
    }
    return ultimo;
  }

  /** Casa madre: segna come letti i messaggi di una conversazione. */
  async segnaLetti(puntoVenditaId: number): Promise<void> {
    if (!this.sonoCasaMadre || this.daLeggere(puntoVenditaId) === 0) return;
    const ora = new Date().toISOString();
    for (const m of this.messaggi.values()) {
      if (m.punto_vendita_id === puntoVenditaId && m.direzione === 'verso_sede' && !m.letto_il) m.letto_il = ora;
    }
    this.avvisa();
    const { error } = await supabase.rpc('segna_letti', { p_punto_vendita_id: puntoVenditaId });
    if (error) {
      log.avviso('segna_letti non riuscita (verrà corretto alla prossima ricarica)', { code: error.code, message: error.message });
    }
  }

  // ------------------------------------------------------------ Realtime
  private sottoscrivi(): void {
    const filtro = this.sonoCasaMadre ? {} : { filter: `punto_vendita_id=eq.${this.sede.id}` };
    this.canale = supabase
      .channel(`messaggi-${this.sede.codice}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messaggi', ...filtro },
        (p) => this.arrivato(p.new as Messaggio))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messaggi', ...filtro },
        (p) => this.aggiornato(p.new as Messaggio))
      .subscribe((stato, errore) => {
        if (this.chiusa) return;
        if (stato === 'SUBSCRIBED') {
          log.info('Realtime collegato');
          this._connesso = true;
          this.disconnessoDa = 0;
          this.avvisa();
          // Recupera ciò che può essere arrivato mentre il canale era giù
          void this.ricarica();
          void this.elaboraCoda();
        } else {
          if (this._connesso) log.avviso(`Realtime scollegato (${stato})`, errore);
          this._connesso = false;
          if (!this.disconnessoDa) this.disconnessoDa = Date.now();
          this.avvisa();
        }
      });
  }

  private controllaCanale(): void {
    if (this._connesso || !navigator.onLine) return;
    if (this.disconnessoDa && Date.now() - this.disconnessoDa > 60_000) {
      log.avviso('Canale Realtime fermo da oltre un minuto: lo ricreo');
      if (this.canale) void supabase.removeChannel(this.canale);
      this.disconnessoDa = Date.now();
      this.sottoscrivi();
    }
  }

  private arrivato(m: Messaggio): void {
    const nuovo = !this.messaggi.has(m.id);
    this.messaggi.set(m.id, m);
    this.togliDallaCodaGiaArrivati();
    if (nuovo && this.primoCaricamentoFatto && this.inArrivo(m)) this.onNuovoInArrivo?.(m);
    this.avvisa();
  }

  private aggiornato(m: Messaggio): void {
    const esistente = this.messaggi.get(m.id);
    if (esistente) esistente.letto_il = m.letto_il;
    else this.messaggi.set(m.id, m);
    this.avvisa();
  }

  // ------------------------------------------------------ coda di invio
  private get chiaveCoda(): string {
    return `ci-coda-${this.sede.codice}`;
  }

  private leggiCodaSalvata(): MessaggioInCoda[] {
    try {
      const v = JSON.parse(localStorage.getItem(this.chiaveCoda) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private salvaCoda(): void {
    try {
      localStorage.setItem(this.chiaveCoda, JSON.stringify(this.coda));
    } catch (e) {
      log.errore('Salvataggio coda non riuscito', e);
    }
  }

  private togliDallaCodaGiaArrivati(): void {
    const prima = this.coda.length;
    this.coda = this.coda.filter((c) => !this.messaggi.has(c.id));
    if (this.coda.length !== prima) this.salvaCoda();
  }

  /** Mette un messaggio in coda e prova a inviarlo subito. */
  invia(puntoVenditaId: number, testo: string, nome: string | null): void {
    this.coda.push({
      id: crypto.randomUUID(),
      punto_vendita_id: puntoVenditaId,
      direzione: this.sonoCasaMadre ? 'verso_punto_vendita' : 'verso_sede',
      testo,
      nome_mittente: nome?.trim() || null,
      creato_locale: new Date().toISOString(),
      stato: 'in_invio',
    });
    this.salvaCoda();
    this.avvisa();
    this.attesa = ATTESA_MINIMA;
    void this.elaboraCoda();
  }

  riprova(id: string): void {
    const m = this.coda.find((c) => c.id === id);
    if (!m) return;
    m.stato = 'in_invio';
    this.salvaCoda();
    this.avvisa();
    void this.elaboraCoda();
  }

  /** Toglie dalla coda un messaggio non inviato e ne restituisce il testo. */
  elimina(id: string): string | null {
    const m = this.coda.find((c) => c.id === id);
    if (!m) return null;
    this.coda = this.coda.filter((c) => c.id !== id);
    this.salvaCoda();
    this.avvisa();
    return m.testo;
  }

  private async elaboraCoda(): Promise<void> {
    if (this.elaborazioneInCorso || this.chiusa) return;
    this.elaborazioneInCorso = true;
    window.clearTimeout(this.timerRitenta);
    try {
      for (const m of [...this.coda]) {
        if (m.stato !== 'in_invio' || this.chiusa) continue;
        const esito = await this.inviaUno(m);
        if (esito === 'ok') {
          this.coda = this.coda.filter((c) => c.id !== m.id);
          this.attesa = ATTESA_MINIMA;
        } else if (esito === 'riprova') {
          this.timerRitenta = window.setTimeout(() => void this.elaboraCoda(), this.attesa);
          this.attesa = Math.min(this.attesa * 2, ATTESA_MASSIMA);
          break;
        } else {
          m.stato = 'non_inviato';
        }
        this.salvaCoda();
        this.avvisa();
      }
    } finally {
      this.elaborazioneInCorso = false;
    }
  }

  private async inviaUno(m: MessaggioInCoda): Promise<'ok' | 'riprova' | 'rifiutato'> {
    const { data, error } = await supabase
      .from('messaggi')
      .insert({
        id: m.id,
        punto_vendita_id: m.punto_vendita_id,
        direzione: m.direzione,
        testo: m.testo,
        nome_mittente: m.nome_mittente,
      })
      .select()
      .single();

    if (!error) {
      this.arrivato(data as Messaggio);
      return 'ok';
    }
    // Già arrivato al server in un tentativo precedente
    if (error.code === '23505') {
      const r = await supabase.from('messaggi').select('*').eq('id', m.id).maybeSingle();
      if (r.data) this.arrivato(r.data as Messaggio);
      return 'ok';
    }
    // Sessione scaduta: rinnova e riprova
    if (error.code === 'PGRST301' || error.code === 'PGRST303' || /jwt/i.test(error.message)) {
      log.avviso('Sessione scaduta durante l\'invio: rinnovo');
      await supabase.auth.refreshSession().catch(() => {});
      return 'riprova';
    }
    if (!error.code || erroreDiRete(error)) {
      log.avviso('Invio non riuscito per problemi di rete: nuovo tentativo', { attesaMs: this.attesa });
      return 'riprova';
    }
    log.errore('Invio rifiutato dal server', { code: error.code, message: error.message });
    return 'rifiutato';
  }
}
