import type { DayConfig, Source } from '../balance.ts';
import { MAIN_STREET_NAME } from '../city/data.ts';
import { addressPoint } from '../city/geometry.ts';
import type { Address, City, Point } from '../city/types.ts';

/** Une ligne de l'annuaire : un foyer, son numéro et son adresse (§7.1). */
export interface DirectoryEntry {
  lastName: string;
  /** « Paul et Jeanne », ou le seul prénom du titulaire. */
  household: string;
  line: number;
  address: string;
}

/** Une fiche du tiroir des professions : un métier et ceux qui l'exercent, sans leur numéro. */
export interface ProfessionCard {
  profession: string;
  people: { name: string; address: string }[];
}

export interface MapData {
  width: number;
  height: number;
  streets: { name: string; from: Point; to: Point }[];
  landmarks: { name: string; at: Point }[];
  /** Les maisons habitées et leur numéro, sans le nom des habitants. */
  houses: { at: Point; number: number }[];
}

/**
 * Le bureau de l'archiviste : les documents du jour, chacun arrivant à sa journée (§7.1).
 * Un document pas encore arrivé vaut null. Rien de ce que contient le bureau n'est envoyé
 * au standardiste.
 */
export interface ArchivistDesk {
  sources: Source[];
  directory: DirectoryEntry[] | null;
  professions: ProfessionCard[] | null;
  map: MapData | null;
}

const collator = new Intl.Collator('fr');

/** « rue Haute », « place du Marché » ; la Grande Rue garde sa majuscule. */
export function streetLabel(name: string): string {
  if (name === MAIN_STREET_NAME) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function formatAddress(city: City, { streetId, houseNumber }: Address): string {
  return `${houseNumber}, ${streetLabel(city.streets[streetId]?.name ?? '')}`;
}

function directory(city: City): DirectoryEntry[] {
  return city.subscribers
    .map((s) => ({
      lastName: s.lastName,
      household: s.spouse ? `${s.holder.firstName} et ${s.spouse.firstName}` : s.holder.firstName,
      line: s.line,
      address: formatAddress(city, s.address),
    }))
    .sort(
      (a, b) =>
        collator.compare(a.lastName, b.lastName) || collator.compare(a.household, b.household),
    );
}

function professions(city: City): ProfessionCard[] {
  const cards = new Map<string, ProfessionCard['people']>();
  for (const s of city.subscribers) {
    if (!s.profession) continue;
    const people = cards.get(s.profession) ?? [];
    people.push({
      name: `${s.lastName} ${s.holder.firstName}`,
      address: formatAddress(city, s.address),
    });
    cards.set(s.profession, people);
  }
  return [...cards]
    .map(([profession, people]) => ({
      profession,
      people: people.sort((a, b) => collator.compare(a.name, b.name)),
    }))
    .sort((a, b) => collator.compare(a.profession, b.profession));
}

function map(city: City): MapData {
  const at = (address: Address): Point => {
    const street = city.streets[address.streetId];
    return street ? addressPoint(street, address.houseNumber) : { x: 0, y: 0 };
  };
  return {
    width: Math.max(...city.streets.flatMap((s) => [s.from.x, s.to.x])),
    height: Math.max(...city.streets.flatMap((s) => [s.from.y, s.to.y])),
    streets: city.streets.map(({ name, from, to }) => ({ name, from, to })),
    landmarks: city.landmarks.map((l) => ({ name: l.name, at: at(l.address) })),
    houses: city.subscribers.map((s) => ({ at: at(s.address), number: s.address.houseNumber })),
  };
}

export function archivistDesk(city: City, day: DayConfig): ArchivistDesk {
  const has = (source: Source) => day.sources.includes(source);
  return {
    sources: [...day.sources],
    directory: has('directory') ? directory(city) : null,
    professions: has('professions') ? professions(city) : null,
    map: has('map') ? map(city) : null,
  };
}
