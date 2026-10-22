import { createRng, pick, randomInt, shuffle } from '../rng.ts';
import {
  FIRST_NAMES,
  GENERIC_STREET_NAMES,
  LANDMARKS,
  LAST_NAMES,
  MAIN_STREET_NAME,
  PROFESSIONS,
  type LandmarkSpec,
  type ProfessionSpec,
} from './data.ts';
import type {
  Address,
  City,
  Gender,
  Landmark,
  Person,
  Point,
  Street,
  Subscriber,
} from './types.ts';

type Rng = () => number;

/** La prise 100 est la ligne de l'archiviste ; les abonnés occupent 101 à 179. */
export const ARCHIVIST_LINE = 100;
export const FIRST_SUBSCRIBER_LINE = 101;
export const SUBSCRIBER_COUNT = 79;

const STREET_COUNT = { min: 15, max: 20 };
const HOUSES_PER_BLOCK = 4;
/** Taille des familles homonymes (demandes T2 : « M. Dupont », il y en a trois). */
const HOMONYM_FAMILY_SIZES = [3, 3, 3, 2, 2, 2, 2];
const WIDOW_SHARE = 0.25;
const MARRIED_SHARE = 0.7;

export function generateCity(seed: number): City {
  const rng = createRng(seed);
  const streets = generateStreets(rng);
  const landmarks = placeLandmarks(rng, streets);
  const subscribers = generateSubscribers(rng, streets, landmarks);
  return { seed, streets, landmarks, subscribers };
}

/**
 * Plan en grille : des rues horizontales et verticales. Une rue principale dans chaque sens
 * traverse toute la ville, et chaque autre rue croise la principale perpendiculaire, ce qui
 * garantit un réseau d'un seul tenant.
 */
function generateStreets(rng: Rng): Street[] {
  const count = randomInt(rng, STREET_COUNT.min, STREET_COUNT.max);
  const rows = Math.floor(count / 2);
  const cols = count - rows;
  const width = cols + 1;
  const height = rows + 1;
  const mainRow = randomInt(rng, 2, rows - 1);
  const mainCol = randomInt(rng, 2, cols - 1);

  const segments: { from: Point; to: Point; main: boolean }[] = [];
  for (let y = 1; y <= rows; y++) {
    const main = y === mainRow;
    const [a, b] = main
      ? [0, width]
      : [randomInt(rng, 0, mainCol - 1), randomInt(rng, mainCol + 1, width)];
    segments.push({ from: { x: a, y }, to: { x: b, y }, main });
  }
  for (let x = 1; x <= cols; x++) {
    const main = x === mainCol;
    const [a, b] = main
      ? [0, height]
      : [randomInt(rng, 0, mainRow - 1), randomInt(rng, mainRow + 1, height)];
    segments.push({ from: { x, y: a }, to: { x, y: b }, main });
  }

  // La grande rue est horizontale, l'avenue de la gare verticale ; les autres repères
  // prennent des rues secondaires au hasard.
  const station = LANDMARKS.find((l) => l.kind === 'station') as LandmarkSpec;
  const otherLandmarks = LANDMARKS.filter((l) => l !== station);
  const secondary = shuffle(
    rng,
    segments.map((_, i) => i).filter((i) => !segments[i]?.main),
  );
  const names = new Map<number, string>();
  names.set(mainRow - 1, MAIN_STREET_NAME);
  names.set(rows + mainCol - 1, station.streetName);
  otherLandmarks.forEach((landmark, i) => names.set(secondary[i] as number, landmark.streetName));
  const generic = shuffle(rng, GENERIC_STREET_NAMES);
  secondary.slice(otherLandmarks.length).forEach((i, n) => names.set(i, generic[n] as string));

  return segments.map(({ from, to }, id) => ({
    id,
    name: names.get(id) as string,
    from,
    to,
    houseCount: (Math.abs(to.x - from.x) + Math.abs(to.y - from.y)) * HOUSES_PER_BLOCK,
  }));
}

function placeLandmarks(rng: Rng, streets: Street[]): Landmark[] {
  return LANDMARKS.map(({ kind, name, streetName }) => {
    const street = streets.find((s) => s.name === streetName) as Street;
    const houseNumber = kind === 'station' ? 1 : randomInt(rng, 1, street.houseCount);
    return { kind, name, address: { streetId: street.id, houseNumber } };
  });
}

function generateSubscribers(rng: Rng, streets: Street[], landmarks: Landmark[]): Subscriber[] {
  const lastNames = drawLastNames(rng);
  const professions = expandProfessions();
  const jobs = shuffle(rng, [
    ...professions,
    ...Array.from({ length: SUBSCRIBER_COUNT - professions.length }, () => null),
  ]);
  const lines = shuffle(
    rng,
    Array.from({ length: SUBSCRIBER_COUNT }, (_, i) => FIRST_SUBSCRIBER_LINE + i),
  );

  const taken = new Set(landmarks.map(({ address }) => addressKey(address)));
  const familyFirstNames = new Map<string, Set<string>>();
  const familyStreets = new Map<string, Set<number>>();

  const takeAddress = (allowed: Street[]): Address => {
    for (let attempt = 0; attempt < 10_000; attempt++) {
      const street = pick(rng, allowed);
      const address = { streetId: street.id, houseNumber: randomInt(rng, 1, street.houseCount) };
      if (!taken.has(addressKey(address))) {
        taken.add(addressKey(address));
        return address;
      }
    }
    throw new Error('generateCity : plus aucune adresse libre');
  };

  // Les métiers liés à un repère choisissent leur rue en premier, les autres s'adaptent.
  const order = jobs
    .map((_, i) => i)
    .sort((a, b) => Number(!jobs[a]?.nearLandmark) - Number(!jobs[b]?.nearLandmark));

  const subscribers: Subscriber[] = [];
  for (const i of order) {
    const job = jobs[i] ?? null;
    const lastName = lastNames[i] as string;
    const gender: Gender = job ? (job.gender ?? 'M') : rng() < WIDOW_SHARE ? 'F' : 'M';

    const usedFirstNames = getOrCreate(familyFirstNames, lastName);
    const holder: Person = { firstName: drawFirstName(rng, gender, usedFirstNames), gender };
    usedFirstNames.add(holder.firstName);

    const spouse: Person | null =
      gender === 'M' && !job?.single && rng() < MARRIED_SHARE
        ? { firstName: pick(rng, FIRST_NAMES.F), gender: 'F' }
        : null;

    // Des homonymes dans des rues différentes : la rue suffit alors à les départager.
    const usedStreets = getOrCreate(familyStreets, lastName);
    const landmarkStreet = landmarks.find((l) => l.kind === job?.nearLandmark)?.address.streetId;
    const freeStreets = streets.filter((s) => !usedStreets.has(s.id));
    const allowed =
      landmarkStreet !== undefined
        ? streets.filter((s) => s.id === landmarkStreet)
        : freeStreets.length > 0
          ? freeStreets
          : streets;
    const address = takeAddress(allowed);
    usedStreets.add(address.streetId);

    subscribers.push({
      line: lines[i] as number,
      lastName,
      holder,
      spouse,
      profession: job?.label ?? null,
      notable: job?.notable ?? false,
      address,
    });
  }

  return subscribers.sort((a, b) => a.line - b.line);
}

/** Les familles homonymes d'abord, puis des noms uniques ; l'ordre est mélangé ensuite. */
function drawLastNames(rng: Rng): string[] {
  const pool = shuffle(rng, LAST_NAMES);
  const names = HOMONYM_FAMILY_SIZES.flatMap((size, i) =>
    Array.from({ length: size }, () => pool[i] as string),
  );
  const unique = pool.slice(
    HOMONYM_FAMILY_SIZES.length,
    HOMONYM_FAMILY_SIZES.length + SUBSCRIBER_COUNT - names.length,
  );
  return shuffle(rng, [...names, ...unique]);
}

function expandProfessions(): ProfessionSpec[] {
  return PROFESSIONS.flatMap((spec) => Array.from({ length: spec.count }, () => spec));
}

function drawFirstName(rng: Rng, gender: Gender, exclude: Set<string>): string {
  const available = FIRST_NAMES[gender].filter((name) => !exclude.has(name));
  return pick(rng, available);
}

function getOrCreate<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  let set = map.get(key);
  if (!set) {
    set = new Set<V>();
    map.set(key, set);
  }
  return set;
}

function addressKey({ streetId, houseNumber }: Address): string {
  return `${streetId}:${houseNumber}`;
}
