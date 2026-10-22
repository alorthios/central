import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.ts';

describe('parseClientMessage', () => {
  it('accepte les messages valides', () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseClientMessage('{"type":"startDay","seed":1953,"dayIndex":2}')).toEqual({
      type: 'startDay',
      seed: 1953,
      dayIndex: 2,
    });
  });

  it.each([
    'pas du json',
    'null',
    '42',
    '{"type":"inconnu"}',
    '{"type":"startDay","seed":"1953","dayIndex":0}',
    '{"type":"startDay","seed":1953,"dayIndex":7}',
    '{"type":"startDay","seed":1953,"dayIndex":-1}',
    '{"type":"startDay","seed":1.5,"dayIndex":0}',
  ])('rejette %s', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});
