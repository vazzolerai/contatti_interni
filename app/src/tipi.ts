export type Ruolo = 'casa_madre' | 'punto_vendita';
export type Direzione = 'verso_sede' | 'verso_punto_vendita';

export interface Sede {
  id: number;
  codice: string;
  nome: string;
  ruolo: Ruolo;
}

/** Messaggio come salvato sul server. */
export interface Messaggio {
  id: string;
  punto_vendita_id: number;
  direzione: Direzione;
  testo: string;
  nome_mittente: string | null;
  creato_il: string;
  letto_il: string | null;
}

/** Messaggio scritto su questo PC e non ancora confermato dal server. */
export interface MessaggioInCoda {
  id: string;
  punto_vendita_id: number;
  direzione: Direzione;
  testo: string;
  nome_mittente: string | null;
  creato_locale: string;
  stato: 'in_invio' | 'non_inviato';
}

/** Ciò che le viste mostrano: messaggi del server + quelli in coda. */
export type VoceChat =
  | { tipo: 'server'; m: Messaggio }
  | { tipo: 'coda'; m: MessaggioInCoda };
