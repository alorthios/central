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
    '{"type":"plug","pair":0,"end":2,"line":141}',
    '{"type":"plug","pair":0,"end":0}',
    '{"type":"plug","pair":"0","end":0,"line":141}',
    '{"type":"unplug","pair":0}',
  ])('rejette %s', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});
