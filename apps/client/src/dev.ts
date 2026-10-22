import { DEV_ROOM_CODE, ROLES, ROOM_CODE_PATTERN, type Role } from '@allo-central/shared';

export interface DevMode {
  /** La salle de test : `?dev=ABCD`, ou `TEST` par défaut. */
  code: string;
  /** `?role=archivist` impose un rôle ; sinon le premier rôle libre. */
  role: Role | null;
}

/**
 * Le mode développeur (`?dev`) : saute l'écran d'accueil pour tester seul, un rôle par
 * onglet, avec la graine et la vitesse de l'horloge réglables dans le bandeau.
 */
export function devMode(): DevMode | null {
  const params = new URLSearchParams(location.search);
  if (!params.has('dev')) return null;
  const wanted = params.get('dev')?.trim().toUpperCase() ?? '';
  const role = params.get('role');
  return {
    code: ROOM_CODE_PATTERN.test(wanted) ? wanted : DEV_ROOM_CODE,
    role: ROLES.includes(role as Role) ? (role as Role) : null,
  };
}

/** Le lien qui ouvre l'autre rôle de la salle de test dans un nouvel onglet. */
export function otherRoleLink(code: string, me: Role): HTMLAnchorElement {
  const other: Role = me === 'operator' ? 'archivist' : 'operator';
  const params = new URLSearchParams(location.search);
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('dev', code);
  url.searchParams.set('role', other);
  for (const keep of ['seed', 'speed']) {
    const value = params.get(keep);
    if (value) url.searchParams.set(keep, value);
  }
  const link = Object.assign(document.createElement('a'), {
    href: url.toString(),
    target: '_blank',
    className: 'dev-link',
  });
  link.textContent = other === 'operator' ? 'Onglet standardiste' : 'Onglet archiviste';
  return link;
}
