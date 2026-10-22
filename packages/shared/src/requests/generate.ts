import { BALANCE, type DayConfig, type RequestType, type Source } from '../balance.ts';
import type { City, Subscriber } from '../city/types.ts';
import { createRng, deriveSeed, pick, shuffle } from '../rng.ts';
import type { ScheduledCall } from '../schedule.ts';
import { extraClueText, requestText } from './phrasing.ts';
import { type Clue, isNearLandmark, resolveClues } from './resolve.ts';

type Rng = () => number;

export interface CallRequest {
  type: RequestType;
  /** La ligne que le client veut joindre. */
  targetLine: number;
  /** Ce que le client dit en décrochant. */
  clues: Clue[];
  text: string;
  /** Précision gardée pour « Lequel ? » ; null si la demande suffit déjà. */
  extraClue: Clue | null;
  extraText: string | null;
}

/** Une demande par appel du planning, dans le même ordre. */
export function generateRequests(
  seed: number,
  city: City,
  calls: readonly ScheduledCall[],
  day: DayConfig,
): CallRequest[] {
  const rng = createRng(deriveSeed(seed, `requests:${day.name}`));
  return calls.map((call) => generateRequest(rng, city, call.callerLine, day));
}

/**
 * Règle d'unicité (§9.3) : avec les sources du jour, les indices de la demande et la
 * précision de « Lequel ? » désignent exactement un abonné, celui que le client veut joindre.
 */
export function generateRequest(
  rng: Rng,
  city: City,
  callerLine: number,
  day: DayConfig,
): CallRequest {
  const has = (source: Source) => day.sources.includes(source);
  const others = city.subscribers.filter((s) => s.line !== callerLine);
  const count = (key: (s: Subscriber) => string | null, value: string | null) =>
    city.subscribers.filter((s) => key(s) === value).length;
  const familySize = (s: Subscriber) => count((x) => x.lastName, s.lastName);
  const colleagues = (s: Subscriber) => count((x) => x.profession, s.profession);

  const pools: Record<RequestType, Subscriber[]> = {
    T0: others,
    T1: has('directory') ? others.filter((s) => familySize(s) === 1) : [],
    T2: has('directory') ? others.filter((s) => familySize(s) > 1) : [],
    // Sans le plan, seul un métier exercé par une seule personne est sans ambiguïté.
    T3: has('professions')
      ? others.filter((s) => s.profession !== null && (has('map') || colleagues(s) === 1))
      : [],
  };
  const options = (Object.entries(day.requests) as [RequestType, number][]).filter(
    ([type, weight]) => weight > 0 && pools[type].length > 0,
  );
  const type = weightedPick(rng, options);
  const target = pick(rng, pools[type]);

  const base: Clue = baseClue(type, target);
  const hints = type === 'T0' || type === 'T1' ? [] : disambiguatingHints(target, base);
  const ambiguous = resolveClues(city, [base], day.sources).length > 1;
  const hint = ambiguous ? (hints[0] ?? null) : null;
  if (ambiguous && !hint) throw new Error(`generateRequest : demande ${type} sans issue`);

  const reserved = hint !== null && rng() < BALANCE.reservedHintShare;
  const clues = hint && !reserved ? [base, hint] : [base];
  const extraClue = reserved ? hint : null;
  return {
    type,
    targetLine: target.line,
    clues,
    text: requestText(city, target, clues),
    extraClue,
    extraText: extraClue ? extraClueText(city, target, extraClue) : null,
  };

  function baseClue(requestType: RequestType, s: Subscriber): Clue {
    switch (requestType) {
      case 'T0':
        return { kind: 'line', line: s.line };
      case 'T1':
      case 'T2':
        return { kind: 'lastName', lastName: s.lastName };
      case 'T3':
        return { kind: 'profession', profession: s.profession as string };
    }
  }

  /** Les précisions qui rendent la demande univoque, de la plus naturelle à la moins. */
  function disambiguatingHints(s: Subscriber, base: Clue): Clue[] {
    const candidates: Clue[][] =
      base.kind === 'lastName'
        ? [
            shuffle(rng, [
              { kind: 'firstName', firstName: s.holder.firstName },
              ...(has('map') ? [streetClue(s)] : []),
            ]),
          ]
        : [
            shuffle(
              rng,
              city.landmarks
                .filter((l) => isNearLandmark(city, s, l.kind))
                .map((l): Clue => ({ kind: 'nearLandmark', landmark: l.kind })),
            ),
            [streetClue(s)],
            [{ kind: 'lastName', lastName: s.lastName }],
          ];
    return candidates.flat().filter((hint) => {
      const found = resolveClues(city, [base, hint], day.sources);
      return found.length === 1 && found[0]?.line === s.line;
    });
  }
}

function streetClue(s: Subscriber): Clue {
  return { kind: 'street', streetId: s.address.streetId };
}

function weightedPick<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of options) {
    if (roll < weight) return value;
    roll -= weight;
  }
  const last = options.at(-1);
  if (!last) throw new Error('weightedPick : aucune option');
  return last[0];
}
