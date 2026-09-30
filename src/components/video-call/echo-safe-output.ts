"use client";

// Where the translated voice (Soniox/ElevenLabs, made with Web Audio) is
// played. Chrome's echo cancellation ignores sound played through Web
// Audio, so with speakers (no headphones) the translated voice went back
// into the listener's microphone. Sound that arrives over a WebRTC
// connection is cancelled, so the voice is sent through a connection
// inside the page (loopback) and played from there.
//
// `input` is where to connect the sound; its gain is the volume. Until the
// loopback is up (or if it fails) the sound goes straight to the speakers.

export interface EchoSafeOutput {
  input: GainNode;
  close: () => void;
}

export function createEchoSafeOutput(context: AudioContext): EchoSafeOutput {
  const gain = context.createGain();
  gain.connect(context.destination);

  const destination = context.createMediaStreamDestination();
  const sender = new RTCPeerConnection();
  const receiver = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let closed = false;
  let playing = false;
  let connected = false;

  // Only switch once the sound really comes out of the loopback
  const switchWhenReady = () => {
    if (closed || !playing || !connected) return;
    gain.disconnect();
    gain.connect(destination);
  };

  sender.onicecandidate = ({ candidate }) => {
    if (candidate) receiver.addIceCandidate(candidate).catch(() => {});
  };
  receiver.onicecandidate = ({ candidate }) => {
    if (candidate) sender.addIceCandidate(candidate).catch(() => {});
  };
  receiver.onconnectionstatechange = () => {
    if (receiver.connectionState === "connected") {
      connected = true;
      switchWhenReady();
    }
  };
  receiver.ontrack = ({ streams }) => {
    if (closed) return;
    audio.srcObject = streams[0];
    audio
      .play()
      .then(() => {
        playing = true;
        switchWhenReady();
      })
      .catch(() => {
        // Autoplay refused: keep playing straight to the speakers
      });
  };

  for (const track of destination.stream.getAudioTracks()) {
    sender.addTrack(track, destination.stream);
  }
  (async () => {
    const offer = await sender.createOffer();
    await sender.setLocalDescription(offer);
    await receiver.setRemoteDescription(offer);
    const answer = await receiver.createAnswer();
    await receiver.setLocalDescription(answer);
    await sender.setRemoteDescription(answer);
  })().catch((error) => {
    console.warn("[Voice] echo-safe output unavailable:", error);
  });

  return {
    input: gain,
    close() {
      closed = true;
      sender.close();
      receiver.close();
      audio.srcObject = null;
    },
  };
}
