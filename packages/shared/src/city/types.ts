/** Coordonnées sur la grille du plan (une unité = un pâté de maisons). */
export interface Point {
  x: number;
  y: number;
}

export interface Street {
  id: number;
  name: string;
  from: Point;
  to: Point;
  /** Les maisons sont numérotées de 1 à houseCount, impairs d'un côté, pairs de l'autre. */
  houseCount: number;
}

export interface Address {
  streetId: number;
  houseNumber: number;
}

export type LandmarkKind = 'church' | 'station' | 'townHall' | 'market' | 'school' | 'postOffice';

export interface Landmark {
  kind: LandmarkKind;
  name: string;
  address: Address;
}

export type Gender = 'M' | 'F';

export interface Person {
  firstName: string;
  gender: Gender;
}

/** Un abonné = une ligne du standard, au nom du titulaire, avec son foyer. */
export interface Subscriber {
  line: number;
  lastName: string;
  holder: Person;
  spouse: Person | null;
  profession: string | null;
  notable: boolean;
  address: Address;
}

export interface City {
  seed: number;
  streets: Street[];
  landmarks: Landmark[];
  subscribers: Subscriber[];
}
