const wsConfig = { wssHost: 'ws://localhost:3078' };
const wsc = new WebSocket(wsConfig.wssHost);

let connId;
// DEfault configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let roomDialog = null;
let roomId = null;

const $landing = document.getElementById('landing');
const $hosting = document.getElementById('hosting');
const $joining = document.getElementById('joining');

const $hostBtn = document.getElementById('hostBtn');
const $joinBtn = document.getElementById('joinBtn');
const $endBtn = document.getElementById('endBtn');

const $localVideo = document.querySelector('#localVideo');
const $videoArray = document.querySelector('#videoArray');

const $remoteVideos = {};

const addVideo = (id) => {
  const remoteStream = new MediaStream();

  const videoEl = document.createElement('video');
  videoEl.setAttribute('height', 120);
  videoEl.setAttribute('width', 160);
  videoEl.setAttribute('autoplay', '');
  videoEl.srcObject = remoteStream;
  $videoArray.append(videoEl);
  
  $remoteVideos[id] = { el: videoEl, stream: remoteStream };
};

function init() {
  const [, action, value] = window.location.pathname.split('/');
  console.log(action, value);
  if(action === 'host') {
    $hosting.style.display = 'block';
  } else if(action === 'join') {
    $joining.style.display = 'block';
  } else {
    $landing.style.display = 'block';
    $hostBtn.addEventListener('click', createRoom);
    $joinBtn.addEventListener('click', joinRoom);
    $endBtn.addEventListener('click', hangUp);
  }
}

function hangUp() {
  wsc.send(JSON.stringify({"type": "hangup" }));
}

async function initiatePeerConnection(remoteId) {
  addVideo(remoteId);
  const peerConnection = new RTCPeerConnection(configuration);
  $remoteVideos[remoteId].peerConnection = peerConnection;
  
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    wsc.send(JSON.stringify({type: 'ice', remoteId, candidate: event.candidate}));
  });
  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      $remoteVideos[remoteId].stream.addTrack(track);
    });
  });
}

async function initiatePeerConnectionAndSendOffer(remoteId) {
  await initiatePeerConnection(remoteId);
  const offer = await $remoteVideos[remoteId].peerConnection.createOffer();
  await $remoteVideos[remoteId].peerConnection.setLocalDescription(offer);
  wsc.send(JSON.stringify({type: 'offer', remoteId, offer }));
}

async function initiatePeerConnectionAndSendOffers(remoteIds) {
  Promise.all(remoteIds.map(x => initiatePeerConnectionAndSendOffer(x)));
}

async function createRoom() {
  wsc.send(JSON.stringify({ type:'host' }));
  if(!localStream) {
    await openUserMedia();
  } 
}

async function joinRoom() {
  roomId = document.querySelector('#room-id').value;
  console.log('Join room: ', roomId);
  console.log(`Current room is ${roomId} - You are the callee!`);
  await joinRoomById(roomId);
}

async function joinRoomById(roomId) {
  if(!localStream) {
    await openUserMedia();
  }

  wsc.send(JSON.stringify({type: 'join', roomId}));

  await initiatePeerConnectionAndSendOffer(roomId);
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
  $localVideo.srcObject = stream;
  localStream = stream;
}

async function hangUp(e) {
  const tracks = $localVideo.srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

wsc.onmessage = function (evt) {
  const signal = JSON.parse(evt.data);
  switch (signal.type) {
    case 'id':
      connId = signal.connId;
      console.log(connId);
      break;
    case 'ice':
      $remoteVideos[signal.remoteId].peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      break;
    case 'offer':
      initiatePeerConnection(signal.remoteId)
        .then(() => $remoteVideos[signal.remoteId].peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer)))
        .then(() => $remoteVideos[signal.remoteId].peerConnection.createAnswer())
        .then(answer => $remoteVideos[signal.remoteId].peerConnection.setLocalDescription(answer))
        .then(() => wsc.send(JSON.stringify({type: 'answer', remoteId: signal.remoteId, answer: $remoteVideos[signal.remoteId].peerConnection.localDescription})));
      break;
    case 'answer':
      $remoteVideos[signal.remoteId].peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
      break;
    case 'newMember':
      initiatePeerConnectionAndSendOffer(signal.id);
      break;
    case 'participantList':
      initiatePeerConnectionAndSendOffers(signal.participants);
      break;
    default:
      console.log(signal);
  }
  return;
};

init();
