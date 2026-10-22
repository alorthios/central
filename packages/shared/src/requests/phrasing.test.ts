import { describe, expect, it } from 'vitest';
import { professionPhrase, streetPhrase } from './phrasing.ts';

describe('professionPhrase', () => {
  it.each([
    ['docteur', 'le docteur'],
    ['épicier', "l'épicier"],
    ['instituteur', "l'instituteur"],
    ['horloger', "l'horloger"],
    ['couturière', 'la couturière'],
    ['sage-femme', 'la sage-femme'],
    ['chef de gare', 'le chef de gare'],
  ])('%s → %s', (profession, expected) => {
    expect(professionPhrase(profession)).toBe(expected);
  });
});

describe('streetPhrase', () => {
  it.each([
    ['Rue Haute', 'de la rue Haute'],
    ['Place du Marché', 'de la place du Marché'],
    ['Avenue de la Gare', "de l'avenue de la Gare"],
    ['Chemin des Vignes', 'du chemin des Vignes'],
    ['Grande Rue', 'de la Grande Rue'],
  ])('%s → %s', (street, expected) => {
    expect(streetPhrase(street)).toBe(expected);
  });
});
