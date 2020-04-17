const express = require('express');
const morgan = require('morgan');
const server = require('http').createServer();
const forceSsl = require('express-force-ssl');
const WebSocketServer = require('ws').Server;
const path = require('path');

const port = process.env.PORT || 3078;

const app = express();
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '..', 'client')));

if (process.env.NODE_ENV === 'production') {
  console.log('ATTEMPTING FORCESSL');
  app.use(forceSsl);
}

// So that on heroku it recognises requests as https rather than http
app.enable('trust proxy');

app.get('*', function(req, res){
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'))
});

const wsClients = {};
const wss = new WebSocketServer({ server });
const id = () => Math.floor(Math.random()*10000000000);

server.on('request', app);

wss.on('connection', (ws) => {

  const connId = id();
  console.log('connection up', connId);

  wsClients[connId] = { ws };

  //connection is up, let's add a simple simple event
  ws.on('message', (message) => {
    const signal = JSON.parse(message);
    switch(signal.type) {
      case 'offer': {
        const { remoteId, ...rest } = signal;
        rest.remoteId = connId;
        wsClients[remoteId].ws.send(JSON.stringify(rest));
        break;
      }
      case 'answer': {
        const { remoteId, ...rest } = signal;
        rest.remoteId = connId;
        wsClients[remoteId].ws.send(JSON.stringify(rest));
        break;
      }
      case 'join':
        //join room
        wsClients[connId].ws.send(JSON.stringify({
          type:'participantList', 
          participants: Object.keys(wsClients[signal.roomId].participants),
        }));
        wsClients[signal.roomId].participants[connId] = true;
        wsClients[connId].roomId = signal.roomId;
        break;
      case 'ice':
        const { remoteId, ...rest } = signal;
        rest.remoteId = connId;
        wsClients[remoteId].ws.send(JSON.stringify(rest));
        break;
      case 'host':
        wsClients[connId].hosting = true;
        wsClients[connId].participants = {};
        //wsClients[connId].participants[connId] = true;
        break;
      case 'hangup':
        break;
      default:
        console.log(signal);
    }
  });

  //send immediatly a feedback to the incoming connection    
  ws.send(JSON.stringify({type: 'id', connId}));
});

server.listen(port, err => {
  if (err) throw err
  console.log(`> Ready on server http://localhost:${port}`)
})
