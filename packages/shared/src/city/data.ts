import type { Gender, LandmarkKind } from './types.ts';

// prettier-ignore
export const LAST_NAMES = [
  'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy',
  'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'David', 'Bertrand', 'Roux', 'Vincent',
  'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François',
  'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guérin', 'Henry', 'Roussel', 'Perrin',
  'Morin', 'Mathieu', 'Clément', 'Gauthier', 'Dumont', 'Fontaine', 'Chevalier', 'Robin', 'Masson',
  'Gérard', 'Boyer', 'Denis', 'Lemaire', 'Duval', 'Joly', 'Roger', 'Roche', 'Noël', 'Lucas',
  'Meunier', 'Marchand', 'Dufour', 'Blanchard', 'Barbier', 'Brun', 'Dumas', 'Brunet', 'Leroux',
  'Colin', 'Renard', 'Arnaud', 'Rolland', 'Caron', 'Aubert', 'Giraud', 'Leclerc', 'Vidal',
  'Bourgeois', 'Renaud', 'Lemoine', 'Picard', 'Gaillard', 'Lacroix', 'Fabre', 'Dupuis', 'Olivier',
  'Hubert', 'Rivière', 'Guillot', 'Lebrun', 'Berger', 'Fleury', 'Deschamps', 'Carpentier', 'Poirier',
] as const;

// prettier-ignore
export const FIRST_NAMES: Record<Gender, readonly string[]> = {
  M: [
    'Jean', 'Pierre', 'Louis', 'André', 'René', 'Marcel', 'Henri', 'Georges', 'Paul', 'Roger',
    'Robert', 'Joseph', 'Maurice', 'Lucien', 'Raymond', 'Fernand', 'Albert', 'Émile', 'Gaston',
    'Marius', 'Léon', 'Charles', 'Jacques', 'Gérard', 'Michel', 'Claude', 'Roland', 'Edmond',
  ],
  F: [
    'Marie', 'Jeanne', 'Marguerite', 'Germaine', 'Louise', 'Suzanne', 'Yvonne', 'Madeleine',
    'Simone', 'Renée', 'Lucienne', 'Odette', 'Paulette', 'Denise', 'Andrée', 'Hélène', 'Juliette',
    'Berthe', 'Henriette', 'Colette', 'Geneviève', 'Jacqueline', 'Marcelle', 'Gilberte', 'Lucie',
    'Alice', 'Antoinette', 'Mireille',
  ],
};

export const MAIN_STREET_NAME = 'Grande Rue';

// prettier-ignore
export const GENERIC_STREET_NAMES = [
  'Rue Haute', 'Rue Basse', 'Rue du Moulin', 'Rue Pasteur', 'Rue Victor-Hugo', 'Rue Jean-Jaurès',
  'Rue des Lilas', 'Chemin des Vignes', 'Rue de la Fontaine', 'Rue du Château', 'Rue Gambetta',
  'Rue des Tanneurs', 'Rue du Lavoir', 'Rue Saint-Martin', 'Rue de la République',
  'Rue des Jardins', 'Rue du Pont',
] as const;

export interface LandmarkSpec {
  kind: LandmarkKind;
  name: string;
  streetName: string;
}

/** La gare est toujours au bout de l'avenue principale ; les autres repères ont leur rue. */
export const LANDMARKS: readonly LandmarkSpec[] = [
  { kind: 'station', name: 'Gare', streetName: 'Avenue de la Gare' },
  { kind: 'church', name: 'Église', streetName: "Rue de l'Église" },
  { kind: 'townHall', name: 'Mairie', streetName: 'Place de la Mairie' },
  { kind: 'market', name: 'Marché', streetName: 'Place du Marché' },
  { kind: 'school', name: 'École', streetName: 'Rue des Écoles' },
  { kind: 'postOffice', name: 'Poste', streetName: 'Rue de la Poste' },
];

export interface ProfessionSpec {
  label: string;
  count: number;
  /** Genre imposé du titulaire ; sinon un homme, comme le voulait l'usage en 1953. */
  gender?: Gender;
  notable?: boolean;
  /** Le titulaire vit dans la rue de ce repère. */
  nearLandmark?: LandmarkKind;
  /** Jamais de conjoint. */
  single?: boolean;
}

/** Les métiers présents en plusieurs exemplaires alimentent les demandes T3 (« le docteur près de… »). */
export const PROFESSIONS: readonly ProfessionSpec[] = [
  { label: 'docteur', count: 2, notable: true },
  { label: 'boulanger', count: 2 },
  { label: 'boucher', count: 2 },
  { label: 'épicier', count: 2 },
  { label: 'cafetier', count: 2 },
  { label: 'coiffeur', count: 2 },
  { label: 'instituteur', count: 2 },
  { label: 'gendarme', count: 2 },
  { label: 'facteur', count: 2 },
  { label: 'couturière', count: 2, gender: 'F' },
  { label: 'cultivateur', count: 3 },
  { label: 'pharmacien', count: 1, notable: true },
  { label: 'notaire', count: 1, notable: true },
  { label: 'curé', count: 1, notable: true, nearLandmark: 'church', single: true },
  { label: 'maire', count: 1, notable: true, nearLandmark: 'townHall' },
  { label: 'vétérinaire', count: 1, notable: true },
  { label: 'chef de gare', count: 1, nearLandmark: 'station' },
  { label: 'receveur des postes', count: 1, nearLandmark: 'postOffice' },
  { label: 'garagiste', count: 1 },
  { label: 'menuisier', count: 1 },
  { label: 'forgeron', count: 1 },
  { label: 'cordonnier', count: 1 },
  { label: 'sage-femme', count: 1, gender: 'F' },
  { label: 'horloger', count: 1 },
  { label: 'quincaillier', count: 1 },
  { label: 'charcutier', count: 1 },
  { label: 'libraire', count: 1 },
  { label: 'dentiste', count: 1 },
  { label: 'fleuriste', count: 1, gender: 'F' },
];
