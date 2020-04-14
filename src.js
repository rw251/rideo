var server = { urls: "stun:stun.l.google.com:19302" };

var dc, pc = new RTCPeerConnection({ iceServers: [server] });
pc.onaddstream = e => v2.srcObject = e.stream;
pc.ondatachannel = e => dcInit(dc = e.channel);
pc.oniceconnectionstatechange = e => log(pc.iceConnectionState);

var haveGum = navigator.mediaDevices.getUserMedia({video:true, audio:true})
  .then(stream => pc.addStream(v1.srcObject = stream)).catch(log);

function dcInit() {
  dc.onopen = () => log("Chat!");
  dc.onmessage = e => log(e.data);
}

function createOffer() {
  button.disabled = true;
  dcInit(dc = pc.createDataChannel("chat"));
  haveGum.then(() => pc.createOffer()).then(d => pc.setLocalDescription(d))
    .catch(log);
  pc.onicecandidate = e => {
    if (e.candidate) return;
    offer.value = pc.localDescription.sdp;
    offer.select();
    answer.placeholder = "Paste answer here";
  };
};

offer.onkeypress = e => {
  if (!enterPressed(e) || pc.signalingState != "stable") return;
  button.disabled = offer.disabled = true;
  var desc = new RTCSessionDescription({ type:"offer", sdp:offer.value });
  pc.setRemoteDescription(desc)
    .then(() => pc.createAnswer()).then(d => pc.setLocalDescription(d))
    .catch(log);
  pc.onicecandidate = e => {
    if (e.candidate) return;
    answer.focus();
    answer.value = pc.localDescription.sdp;
    answer.select();
  };
};

answer.onkeypress = e => {
  if (!enterPressed(e) || pc.signalingState != "have-local-offer") return;
  answer.disabled = true;
  var desc = new RTCSessionDescription({ type:"answer", sdp:answer.value });
  pc.setRemoteDescription(desc).catch(log);
};

chat.onkeypress = e => {
  if (!enterPressed(e)) return;
  dc.send(chat.value);
  log(chat.value);
  chat.value = "";
};

var enterPressed = e => e.keyCode == 13;
var log = msg => div.innerHTML += "<p>" + msg + "</p>";