import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.ts';

describe('parseClientMessage', () => {
  it('accepte les messages valides', () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseClientMessage('{"type":"startDay","seed":1953,"dayIndex":2,"speed":10}')).toEqual({
      type: 'startDay',
      seed: 1953,
      dayIndex: 2,
      speed: 10,
    });
    expect(parseClientMessage('{"type":"startDay","seed":1,"dayIndex":0}')).toMatchObject({
      speed: 1,
    });
    expect(parseClientMessage('{"type":"plug","pair":3,"end":1,"line":141}')).toEqual({
      type: 'plug',
      pair: 3,
      end: 1,
      line: 141,
    });
    expect(parseClientMessage('{"type":"unplug","pair":0,"end":0}')).toEqual({
      type: 'unplug',
      pair: 0,
      end: 0,
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
    '{"type":"startDay","seed":1,"dayIndex":0,"speed":0}',
    '{"type":"startDay","seed":1,"dayIndex":0,"speed":61}',
    '{"type":"plug","pair":0,"end":2,"line":141}',
    '{"type":"plug","pair":0,"end":0}',
    '{"type":"plug","pair":"0","end":0,"line":141}',
    '{"type":"unplug","pair":0}',
  ])('rejette %s', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('parseClientMessage : clés', () => {
  it.each(['talk', 'rest', 'ring'])('accepte la clé %s', (action) => {
    expect(parseClientMessage(JSON.stringify({ type: 'key', pair: 2, action }))).toEqual({
      type: 'key',
      pair: 2,
      action,
    });
  });

  it('rejette une position inconnue', () => {
    expect(parseClientMessage('{"type":"key","pair":2,"action":"down"}')).toBeNull();
  });
});
