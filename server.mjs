import { createServer } from 'node:http'
import crypto from 'crypto'
const PORT = 1337
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function handle(request, response) {
  response.writeHead(200)
  response.end('hey there')
}

const server = createServer(handle)
.listen(PORT, () => console.log(`server listening on port ${PORT}`))

server.on('upgrade', onSocketUpgrade)

function onSocketUpgrade(request, socket, head) {
  const {'sec-websocket-key': webClientSocketKey} = request.headers
  console.log(`${webClientSocketKey} connected!`);
  const headers = prepareHandShakeHeaders(webClientSocketKey)
  socket.write(headers)
}

function prepareHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id)
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`, 
    ''
  ].map(line => line.concat('\r\n')).join('')
  return headers
}

function createSocketAccept(id) {
  const shaOne = crypto.createHash('sha1')
  shaOne.update(`${id}${WEBSOCKET_MAGIC_STRING_KEY}`)
  return shaOne.digest('base64')
}

;
[
'uncaughtException',
'unhandledRejection'
].forEach(
  event => process.on(event, (error) => {
    console.error(`[${event}] ${error}`)
  }) 
)
