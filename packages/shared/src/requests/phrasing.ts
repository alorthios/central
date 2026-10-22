import { LANDMARKS, MAIN_STREET_NAME, PROFESSIONS } from '../city/data.ts';
import type { City, Gender, Subscriber } from '../city/types.ts';
import type { Clue } from './resolve.ts';

const ELISION = /^[aeiouyéèêàâîôûh]/i;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const title = (gender: Gender) => (gender === 'M' ? 'M.' : 'Mme');
const pronoun = (gender: Gender) => (gender === 'M' ? 'Celui' : 'Celle');

/** « le docteur », « l'épicier », « la couturière ». */
export function professionPhrase(profession: string): string {
  if (ELISION.test(profession)) return `l'${profession}`;
  const gender = PROFESSIONS.find((p) => p.label === profession)?.gender ?? 'M';
  return `${gender === 'F' ? 'la' : 'le'} ${profession}`;
}

/** « de la rue Haute », « du chemin des Vignes », « de l'avenue de la Gare ». */
export function streetPhrase(name: string): string {
  if (name === MAIN_STREET_NAME) return `de la ${name}`;
  const [type = '', ...rest] = name.split(' ');
  const tail = [type.toLowerCase(), ...rest].join(' ');
  if (ELISION.test(tail)) return `de l'${tail}`;
  return type === 'Chemin' ? `du ${tail}` : `de la ${tail}`;
}

function nearPhrase(clue: Extract<Clue, { kind: 'nearLandmark' }>): string {
  return LANDMARKS.find((l) => l.kind === clue.landmark)?.nearPhrase ?? '';
}

function streetName(city: City, streetId: number): string {
  return city.streets[streetId]?.name ?? '';
}

/** Ce que dit le client en décrochant. */
export function requestText(city: City, target: Subscriber, clues: readonly Clue[]): string {
  const gender = target.holder.gender;
  const first = clues[0];
  const hint = clues[1];

  if (first?.kind === 'line') return `Passez-moi le ${first.line}, s'il vous plaît.`;

  if (first?.kind === 'lastName') {
    if (hint?.kind === 'firstName') {
      return `${title(gender)} ${hint.firstName} ${first.lastName}, s'il vous plaît.`;
    }
    if (hint?.kind === 'street') {
      return `${title(gender)} ${first.lastName}, ${streetPhrase(streetName(city, hint.streetId))}, s'il vous plaît.`;
    }
    return `${title(gender)} ${first.lastName}, s'il vous plaît.`;
  }

  if (first?.kind === 'profession') {
    const who = capitalize(professionPhrase(first.profession));
    if (hint?.kind === 'nearLandmark') return `${who} ${nearPhrase(hint)}, s'il vous plaît.`;
    if (hint?.kind === 'street') {
      return `${who} ${streetPhrase(streetName(city, hint.streetId))}, s'il vous plaît.`;
    }
    if (hint?.kind === 'lastName') return `${who} ${hint.lastName}, s'il vous plaît.`;
    return `${who}, s'il vous plaît.`;
  }

  return 'Allô, mademoiselle ? Passez-moi… euh…';
}

/** La précision donnée après « Lequel ? ». */
export function extraClueText(city: City, target: Subscriber, clue: Clue): string {
  const who = pronoun(target.holder.gender);
  switch (clue.kind) {
    case 'firstName':
      return `${who} qui s'appelle ${clue.firstName}.`;
    case 'street':
      return `${who} ${streetPhrase(streetName(city, clue.streetId))}.`;
    case 'nearLandmark':
      return `${who} ${nearPhrase(clue)}.`;
    case 'lastName':
      return `${title(target.holder.gender)} ${clue.lastName}.`;
    case 'profession':
      return `${capitalize(professionPhrase(clue.profession))}.`;
    case 'line':
      return `Le ${clue.line}.`;
  }
}
