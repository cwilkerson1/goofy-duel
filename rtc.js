// The fast lane: a WebRTC data channel between each browser and the server, set up over the normal
// WebSocket. It behaves like UDP: a lost packet is simply skipped (the next update replaces it 33 ms
// later) instead of holding up everything behind it, which is what makes TCP freeze on Wi-Fi.
// Game updates and movement go this way; one-off actions (swing, release, kick...) and events (hits,
// sounds) stay on the WebSocket, which never loses anything. If the library is missing or the
// channel can't connect, everything just keeps using the WebSocket.
let RTCPeerConnection = null;
try { ({ RTCPeerConnection } = await import('werift')); }
catch { console.log('WebRTC library not installed (run npm install): using the WebSocket only.'); }

export const rtcReady = () => !!RTCPeerConnection;

// Answer a browser's offer. Calls onOpen(channel) when the channel is up and onGone() if it fails or closes.
export async function answerOffer(sdp, { onOpen, onMessage, onGone }) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  let gone = false;
  const bye = () => { if (gone) return; gone = true; onGone(); try { pc.close(); } catch {} };
  pc.onDataChannel.subscribe((ch) => {
    const ready = () => onOpen(ch);
    if (ch.readyState === 'open') ready(); else ch.stateChanged.subscribe((s) => { if (s === 'open') ready(); else if (s === 'closed') bye(); });
    ch.onMessage.subscribe((data) => onMessage(typeof data === 'string' ? data : data.toString()));
  });
  pc.connectionStateChange.subscribe((s) => { if (s === 'failed' || s === 'closed') bye(); });
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  return { sdp: pc.localDescription.sdp, close: bye };
}
