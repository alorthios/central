import { describe, expect, it } from 'vitest';
import { Journal } from './journal.ts';

describe('Journal', () => {
  it('produit un CSV avec en-tête, heure de jeu et cellules échappées', () => {
    const journal = new Journal();
    journal.add(6_666.7, 'appel_recu', { call: 0, line: 149, detail: 'T0 normal' });
    journal.add(60_000, 'message_ligne100', { detail: 'standardiste: "Morel"; vite' });
    expect(journal.toCsv()).toBe(
      'heure;ms;evenement;appel;ligne;detail\r\n' +
        '9 h 06;6667;appel_recu;0;149;T0 normal\r\n' +
        '9 h 54;60000;message_ligne100;;;"standardiste: ""Morel""; vite"\r\n',
    );
    expect(journal.length).toBe(2);
  });
});
