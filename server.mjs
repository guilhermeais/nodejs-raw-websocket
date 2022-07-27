import { createServer } from 'node:http'
import crypto from 'crypto'
const PORT = 1337
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const SEVEN_BITS_INTEGER_MARKER = 125
const SIXTEEN_BITS_INTEGER_MARKER = 126
const SIXTYFOUR_BITS_INTEGER_MARKER = 127

const MASK_KEY_BYTES_LENGTH = 4 
const OPCODE_TEXT = 0x01 // 1 bit in binary 1

const FIRST_BIT = 128 // One bit

function handle(request, response) {
  response.writeHead(200)
  response.end('hey there')
}

const server = createServer(handle)
.listen(PORT, () => console.log(`server listening on port ${PORT}`))

server.on('upgrade', onSocketUpgrade )

function onSocketUpgrade(request, socket, head) {
  const {'sec-websocket-key': webClientSocketKey} = request.headers
  console.log(`${webClientSocketKey} connected!`);
  const headers = prepareHandShakeHeaders(webClientSocketKey)
  socket.write(headers)
  socket.on('readable', () => onSocketReadable(socket))
}

function sendMessage(msg, socket) {
  socket.write(prepareMessage(msg))  
}

function prepareMessage(message) {
  const msg = Buffer.from(message)
  const msgLength = msg.length
  
  let dataFrameBuffer;
  let offset = 2;

  // 0x80 === 128 in binary
  // '0x' + Math.abs(128).toString(16) === '0x80'
  const firstByte = 0x80 | OPCODE_TEXT // single frame + text
  if (msgLength <= SIXTEEN_BITS_INTEGER_MARKER) {
    // 16 bits or less -> 1 byte
   const bytes = [firstByte]
   dataFrameBuffer = Buffer.from(bytes.concat(msgLength))
  }else{
    throw new Error('message too long!')
  }

  const totalLength = dataFrameBuffer.byteLength + msgLength
  const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength)
  return dataFrameResponse
}

function concat(bufferList, totalLength) {
  const target = Buffer.allocUnsafe(totalLength)
  let offset = 0;
  for (const buffer of bufferList) {
    target.set(buffer, offset)
    offset += buffer.length
  }

  return target
}

function onSocketReadable(socket) {
  // consume optcode (first byte)
  // 1 -> 1 byte - 8 bits
  socket.read(1)
  const [markerAndPayloadLength] = socket.read(1)
  // Because the first bit is always 1 for clint-to-server messages
  // You can subtract one bit (128 or '10000000') from this byte to get rid of the MAS bit
  const lengthIndicatorBits = markerAndPayloadLength - FIRST_BIT
  let messageLength = 0

  if(lengthIndicatorBits <= SEVEN_BITS_INTEGER_MARKER) {
    // 7 bits or less -> 1 byte
    messageLength = lengthIndicatorBits
  } else { 
   throw new Error(`you message is too long! for now we don't handle 64 bits message`)
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH)
  const encoded = socket.read(messageLength)
  const decoded = unMask(encoded, maskKey)
  const received = decoded.toString('utf-8')
  
  const data = JSON.parse(received)

  const msg = JSON.stringify({
    message: data,
    at: new Date().toISOString() 
  })

  sendMessage(msg, socket)
}

function unMask(encodedBuffer, maskKey) {
  const finalBuffer = Buffer.from(encodedBuffer)
  // because the mask key has only 4 bytes
  // index % 4 === 0, 1, 2, 3; that are the index bits needed to decode the message

  // ^ is bitwise XOR
  // returns 1 if both are different
  // returns 0 if both are equal

  // (71).toString(2).padStart(8, "0") = 0 1 0 0 0 1 1 1 -> binary representation of 71
  // (53).toString(2).padStart(8, "0") = 0 0 1 1 0 1 0 1 -> binary representation of 53
  //                                     0 1 1 1 0 0 1 0 -> XOR result

  // Parsing the 01110010 XOR result, to decimal using parseInt('01110010', 2), we get 114, that is a char code
  // and if we search this char code, with String.fromCharCode(114), we get the character 'r'
  const fillWithEigthZeros= (t) => t.padStart(8, "0")
  const toBinary = (t) => fillWithEigthZeros(t.toString(2))
  const fromBinaryToDemail = (t) => parseInt(toBinary(t), 2)
  const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDemail(t))

  for(let i = 0; i < finalBuffer.length; i++) {
    finalBuffer[i] = encodedBuffer[i] ^ maskKey[i % MASK_KEY_BYTES_LENGTH]
    const logger = {
      unmaskingCalc: `${toBinary(encodedBuffer[i])} ^ ${toBinary(maskKey[i % MASK_KEY_BYTES_LENGTH])}(maskKey at ${i % MASK_KEY_BYTES_LENGTH}) = ${toBinary(finalBuffer[i])}`,
      decoded: getCharFromBinary(finalBuffer[i]),
      
    }

    console.log(logger);
  }

  return finalBuffer
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
