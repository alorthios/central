import { BALANCE, type Source } from '../balance.ts';
import { addressPoint } from '../city/geometry.ts';
import type { City, LandmarkKind, Subscriber } from '../city/types.ts';

/** Un élément d'information donné par le client sur la personne qu'il veut joindre. */
export type Clue =
  | { kind: 'line'; line: number }
  | { kind: 'lastName'; lastName: string }
  | { kind: 'firstName'; firstName: string }
  | { kind: 'profession'; profession: string }
  | { kind: 'nearLandmark'; landmark: LandmarkKind }
  | { kind: 'street'; streetId: number };

/** Le document dont l'archiviste a besoin pour exploiter un indice ; null : aucun. */
export function clueSource(clue: Clue): Source | null {
  switch (clue.kind) {
    case 'line':
      return null;
    case 'lastName':
    case 'firstName':
      return 'directory';
    case 'profession':
      return 'professions';
    case 'nearLandmark':
    case 'street':
      return 'map';
  }
}

export function isNearLandmark(city: City, subscriber: Subscriber, kind: LandmarkKind): boolean {
  const landmark = city.landmarks.find((l) => l.kind === kind);
  const landmarkStreet = landmark && city.streets[landmark.address.streetId];
  const street = city.streets[subscriber.address.streetId];
  if (!landmark || !landmarkStreet || !street) return false;
  const a = addressPoint(street, subscriber.address.houseNumber);
  const b = addressPoint(landmarkStreet, landmark.address.houseNumber);
  return Math.hypot(a.x - b.x, a.y - b.y) <= BALANCE.nearDistance;
}

function matches(city: City, subscriber: Subscriber, clue: Clue): boolean {
  switch (clue.kind) {
    case 'line':
      return subscriber.line === clue.line;
    case 'lastName':
      return subscriber.lastName === clue.lastName;
    case 'firstName':
      return subscriber.holder.firstName === clue.firstName;
    case 'profession':
      return subscriber.profession === clue.profession;
    case 'nearLandmark':
      return isNearLandmark(city, subscriber, clue.landmark);
    case 'street':
      return subscriber.address.streetId === clue.streetId;
  }
}

/**
 * Les abonnés que l'archiviste peut retenir à partir des indices, avec les seules sources
 * dont il dispose : un indice dont il n'a pas le document ne l'aide pas.
 */
export function resolveClues(
  city: City,
  clues: readonly Clue[],
  sources: readonly Source[],
): Subscriber[] {
  const usable = clues.filter((clue) => {
    const source = clueSource(clue);
    return source === null || sources.includes(source);
  });
  return city.subscribers.filter((s) => usable.every((clue) => matches(city, s, clue)));
}
