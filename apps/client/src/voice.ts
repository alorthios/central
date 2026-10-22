import type { Role, RtcSignal } from '@allo-central/shared';
import type { Connection } from './net.ts';
import { audio } from './sounds.ts';

type VoiceState = 'idle' | 'connecting' | 'connected' | 'failed';

export interface Voice {
  element: HTMLElement;
  /** La ligne 100 s'ouvre ou se ferme : le micro et le haut-parleur suivent. */
  setOpen(open: boolean): void;
}

/** Les serveurs ICE (STUN, TURN) ; vide, la voix ne passe qu'entre machines joignables. */
const iceServers: RTCIceServer[] = [];

/**
 * La voix de la ligne 100 (§8.1), en WebRTC pair à pair. Le serveur relaie la signalisation
 * et décide quand la ligne est ouverte : hors de là, le micro est coupé au départ et le
 * haut-parleur à l'arrivée. Le standardiste fait l'offre dès que l'étage est prêt.
 */
export function voiceLink(connection: Connection, me: Role): Voice {
  const element = document.createElement('div');
  element.className = 'voice';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const micButton = Object.assign(document.createElement('button'), { type: 'button' });
  micButton.textContent = 'Activer le micro';
  element.append(status, micButton);

  let peer: RTCPeerConnection | null = null;
  let pending: RTCIceCandidateInit[] = [];
  let mic: MediaStreamTrack | null = null;
  let micState: 'off' | 'asking' | 'on' | 'denied' = 'off';
  let state: VoiceState = 'idle';
  let open = false;
  /** Le numéro de la dernière offre : une réponse à une offre remplacée est ignorée. */
  let offerId = 0;
  let output: { gain: GainNode | null; sink: HTMLAudioElement } | null = null;
  // Les signaux sont traités un par un : les étapes WebRTC sont asynchrones.
  let queue = Promise.resolve();

  const send = (signal: RtcSignal) => connection.send({ type: 'rtc', signal });

  const render = () => {
    const lines: Record<VoiceState, string> = {
      idle: 'Voix : en attente de l’autre joueur.',
      connecting: 'Voix : connexion…',
      connected: open ? 'Voix : en ligne.' : 'Voix prête.',
      failed: 'Voix indisponible : la ligne passe par écrit.',
    };
    status.textContent = lines[state];
    element.dataset.state = state;
    micButton.hidden = micState === 'on';
    micButton.disabled = micState === 'asking';
    if (micState === 'denied') {
      micButton.textContent = 'Réessayer le micro';
      status.textContent += ' Micro refusé : vous entendez, écrivez pour répondre.';
    }
  };

  /** Le haut-parleur : bande téléphonique (300 à 3 400 Hz) et une pointe de saturation. */
  const play = (stream: MediaStream) => {
    output?.sink.remove();
    // Chrome ne fait couler un flux distant dans Web Audio que s'il est aussi lu par un élément.
    const sink = Object.assign(document.createElement('audio'), { autoplay: true });
    sink.srcObject = stream;
    const ctx = audio();
    if (!ctx) {
      sink.muted = !open;
      output = { gain: null, sink };
      return;
    }
    sink.muted = true;
    const source = ctx.createMediaStreamSource(stream);
    const highpass = Object.assign(ctx.createBiquadFilter(), { type: 'highpass' });
    highpass.frequency.value = 300;
    const lowpass = Object.assign(ctx.createBiquadFilter(), { type: 'lowpass' });
    lowpass.frequency.value = 3_400;
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturation(2.5);
    const gain = ctx.createGain();
    gain.gain.value = open ? 1 : 0;
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(shaper)
      .connect(gain)
      .connect(ctx.destination);
    output = { gain, sink };
  };

  const applyOpen = () => {
    if (mic) mic.enabled = open;
    if (!output) return;
    if (output.gain) {
      const ctx = output.gain.context;
      output.gain.gain.setTargetAtTime(open ? 1 : 0, ctx.currentTime, 0.02);
    } else {
      output.sink.muted = !open;
    }
  };

  const newPeer = (): RTCPeerConnection => {
    peer?.close();
    pending = [];
    const pc = new RTCPeerConnection({ iceServers });
    peer = pc;
    pc.addEventListener('icecandidate', ({ candidate }) => {
      if (pc !== peer || !candidate?.candidate) return;
      send({
        kind: 'ice',
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    });
    pc.addEventListener('track', ({ streams, track }) => {
      if (pc === peer) play(streams[0] ?? new MediaStream([track]));
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc !== peer) return;
      if (pc.connectionState === 'connected') state = 'connected';
      else if (pc.connectionState === 'failed') state = 'failed';
      else if (pc.connectionState === 'connecting') state = 'connecting';
      render();
    });
    state = 'connecting';
    render();
    return pc;
  };

  /** Le micro part sur l'unique piste audio de la connexion, sans renégocier. */
  const attachMic = async (pc: RTCPeerConnection) => {
    const transceiver = pc.getTransceivers()[0];
    if (!transceiver) return;
    transceiver.direction = 'sendrecv';
    await transceiver.sender.replaceTrack(mic);
  };

  // Un candidat d'une connexion remplacée est refusé par la nouvelle : sans conséquence.
  const addCandidate = (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) =>
    pc.addIceCandidate(candidate).catch(() => undefined);

  const flushCandidates = async (pc: RTCPeerConnection) => {
    for (const candidate of pending.splice(0)) await addCandidate(pc, candidate);
  };

  const offer = async () => {
    const pc = newPeer();
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    await attachMic(pc);
    await pc.setLocalDescription(await pc.createOffer());
    send({ kind: 'offer', id: ++offerId, sdp: pc.localDescription?.sdp ?? '' });
  };

  const handle = async (signal: RtcSignal) => {
    switch (signal.kind) {
      case 'hello':
        // Le standardiste appelle ; l'archiviste répond « présent » pour se faire appeler.
        if (me === 'operator') await offer();
        else send({ kind: 'hello' });
        break;
      case 'offer': {
        if (me !== 'archivist') return;
        const pc = newPeer();
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        await attachMic(pc);
        await pc.setLocalDescription(await pc.createAnswer());
        send({ kind: 'answer', id: signal.id, sdp: pc.localDescription?.sdp ?? '' });
        await flushCandidates(pc);
        break;
      }
      case 'answer':
        if (me !== 'operator' || signal.id !== offerId) return;
        if (!peer || peer.signalingState !== 'have-local-offer') return;
        await peer.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        await flushCandidates(peer);
        break;
      case 'ice': {
        const candidate = {
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        };
        if (peer?.remoteDescription) await addCandidate(peer, candidate);
        else pending.push(candidate);
        break;
      }
    }
  };

  const fail = (error: unknown) => {
    console.warn('Voix :', error);
    state = 'failed';
    render();
  };

  if (typeof RTCPeerConnection === 'undefined') {
    state = 'failed';
    micButton.hidden = true;
    status.textContent = 'Voix indisponible dans ce navigateur : la ligne passe par écrit.';
  } else {
    connection.listen((message) => {
      if (message.type !== 'rtc') return;
      queue = queue.then(() => handle(message.signal)).catch(fail);
    });
    send({ kind: 'hello' });
    render();
  }

  micButton.addEventListener('click', () => {
    micState = 'asking';
    render();
    audio();
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then(async (stream) => {
        mic = stream.getAudioTracks()[0] ?? null;
        micState = mic ? 'on' : 'denied';
        applyOpen();
        if (peer) await attachMic(peer);
      })
      .catch(() => (micState = 'denied'))
      .finally(render);
  });

  return {
    element,
    setOpen(value) {
      if (open === value) return;
      open = value;
      applyOpen();
      render();
    },
  };
}

/** Une courbe de saturation douce : le grain d'un écouteur de 1953. */
function saturation(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1_024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}
