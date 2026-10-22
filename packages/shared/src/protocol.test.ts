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

describe('parseClientMessage : salles', () => {
  it('accepte la création et la jonction, code normalisé', () => {
    expect(parseClientMessage('{"type":"createRoom","role":"archivist"}')).toEqual({
      type: 'createRoom',
      role: 'archivist',
    });
    expect(parseClientMessage('{"type":"joinRoom","code":" abcd ","token":null}')).toEqual({
      type: 'joinRoom',
      code: 'ABCD',
      token: null,
    });
  });

  it('accepte la salle de test, au rôle demandé ou libre', () => {
    expect(parseClientMessage('{"type":"devRoom","code":"test","token":null}')).toEqual({
      type: 'devRoom',
      code: 'TEST',
      token: null,
      role: null,
    });
    expect(
      parseClientMessage('{"type":"devRoom","code":"TEST","token":"t","role":"archivist"}'),
    ).toEqual({ type: 'devRoom', code: 'TEST', token: 't', role: 'archivist' });
  });

  it.each([
    '{"type":"createRoom","role":"meneur"}',
    '{"type":"devRoom","code":"TEST","token":null,"role":"meneur"}',
    '{"type":"devRoom","code":"TESTS","token":null}',
    '{"type":"joinRoom","code":"ABC","token":null}',
    '{"type":"joinRoom","code":"ABIO","token":null}',
    '{"type":"joinRoom","code":"ABCD"}',
    '{"type":"joinRoom","code":"ABCD","token":42}',
  ])('rejette %s', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('parseClientMessage : ligne 100', () => {
  it('accepte le combiné et les messages, coupés à la longueur maximale', () => {
    expect(parseClientMessage('{"type":"handset","offHook":true}')).toEqual({
      type: 'handset',
      offHook: true,
    });
    expect(parseClientMessage('{"type":"say","text":"  Morel, 134  "}')).toEqual({
      type: 'say',
      text: 'Morel, 134',
    });
    const long = parseClientMessage(JSON.stringify({ type: 'say', text: 'x'.repeat(500) }));
    expect(long?.type === 'say' && long.text.length).toBe(200);
  });

  it.each(['{"type":"handset","offHook":"oui"}', '{"type":"say","text":"   "}', '{"type":"say"}'])(
    'rejette %s',
    (raw) => {
      expect(parseClientMessage(raw)).toBeNull();
    },
  );
});
