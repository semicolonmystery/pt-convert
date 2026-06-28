import pako from "pako";
import { twofish } from "twofish";

const BLOCK_SIZE = 16;
const PACKET_KEY = new Uint8Array(BLOCK_SIZE).fill(137);
const PACKET_IV = new Uint8Array(BLOCK_SIZE).fill(16);
const twf = twofish();

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error("XOR inputs must have equal length.");
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

function leftShiftOne(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(block.length);
  let carry = 0;
  for (let i = block.length - 1; i >= 0; i -= 1) {
    const value = block[i];
    out[i] = ((value << 1) & 0xff) | carry;
    carry = (value & 0x80) >>> 7;
  }
  return out;
}

function pad(block: Uint8Array): Uint8Array {
  const padded = new Uint8Array(BLOCK_SIZE);
  padded.set(block, 0);
  padded[block.length] = 0x80;
  return padded;
}

function encryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  if (block.length !== BLOCK_SIZE) {
    throw new Error("Twofish block must be 16 bytes.");
  }
  const encrypted = twf.encrypt(Array.from(key), Array.from(block));
  return Uint8Array.from(encrypted);
}

function incrementCounterBe(counter: Uint8Array): void {
  for (let i = BLOCK_SIZE - 1; i >= 0; i -= 1) {
    counter[i] = (counter[i] + 1) & 0xff;
    if (counter[i] !== 0) {
      break;
    }
  }
}

function ctrProcess(key: Uint8Array, initialCounter: Uint8Array, data: Uint8Array): Uint8Array {
  const counter = new Uint8Array(initialCounter);
  const out = new Uint8Array(data.length);
  let offset = 0;

  while (offset < data.length) {
    const keystream = encryptBlock(key, counter);
    incrementCounterBe(counter);

    const blockLen = Math.min(BLOCK_SIZE, data.length - offset);
    for (let i = 0; i < blockLen; i += 1) {
      out[offset + i] = data[offset + i] ^ keystream[i];
    }
    offset += blockLen;
  }

  return out;
}

function generateSubkeys(key: Uint8Array): { k1: Uint8Array; k2: Uint8Array } {
  const rb = 0x87;
  const zero = new Uint8Array(BLOCK_SIZE);
  const l = encryptBlock(key, zero);

  const k1 = leftShiftOne(l);
  if ((l[0] & 0x80) !== 0) {
    k1[k1.length - 1] ^= rb;
  }

  const k2 = leftShiftOne(k1);
  if ((k1[0] & 0x80) !== 0) {
    k2[k2.length - 1] ^= rb;
  }

  return { k1, k2 };
}

function cmacDigest(key: Uint8Array, data: Uint8Array): Uint8Array {
  const { k1, k2 } = generateSubkeys(key);
  const blocks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += BLOCK_SIZE) {
    blocks.push(data.subarray(i, i + BLOCK_SIZE));
  }

  let last: Uint8Array;
  let processingBlocks = blocks;
  if (blocks.length === 0) {
    last = xorBytes(pad(new Uint8Array(0)), k2);
  } else if (blocks[blocks.length - 1].length === BLOCK_SIZE) {
    last = xorBytes(blocks[blocks.length - 1], k1);
    processingBlocks = blocks.slice(0, -1);
  } else {
    last = xorBytes(pad(blocks[blocks.length - 1]), k2);
    processingBlocks = blocks.slice(0, -1);
  }

  let x: Uint8Array<ArrayBufferLike> = new Uint8Array(BLOCK_SIZE);
  for (const block of processingBlocks) {
    x = encryptBlock(key, xorBytes(x, block));
  }
  return encryptBlock(key, xorBytes(x, last));
}

function omacWithPrefix(key: Uint8Array, prefix: number, data: Uint8Array): Uint8Array {
  const p = new Uint8Array(BLOCK_SIZE);
  p[BLOCK_SIZE - 1] = prefix;
  return cmacDigest(key, concatBytes(p, data));
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function eaxEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array = new Uint8Array(0)
): { ciphertext: Uint8Array; tag: Uint8Array } {
  const nTag = omacWithPrefix(key, 0x00, nonce);
  const hTag = omacWithPrefix(key, 0x01, aad);
  const ciphertext = ctrProcess(key, nTag, plaintext);
  const cTag = omacWithPrefix(key, 0x02, ciphertext);
  const tag = xorBytes(xorBytes(nTag, hTag), cTag);
  return { ciphertext, tag };
}

function eaxDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  aad: Uint8Array = new Uint8Array(0)
): Uint8Array {
  const nTag = omacWithPrefix(key, 0x00, nonce);
  const plaintext = ctrProcess(key, nTag, ciphertext);
  const hTag = omacWithPrefix(key, 0x01, aad);
  const cTag = omacWithPrefix(key, 0x02, ciphertext);
  const expected = xorBytes(xorBytes(nTag, hTag), cTag);
  if (!constantTimeEquals(expected, tag)) {
    throw new Error("EAX authentication failed.");
  }
  return plaintext;
}

function obfStage2(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  const len = data.length;
  for (let i = 0; i < len; i += 1) {
    out[i] = data[i] ^ ((len - i) & 0xff);
  }
  return out;
}

function obfStage1(data: Uint8Array): Uint8Array {
  const len = data.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    const keyByte = (len - i * len) & 0xff;
    out[len - 1 - i] = data[i] ^ keyByte;
  }
  return out;
}

function deobfStage1(data: Uint8Array): Uint8Array {
  const len = data.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = data[len - 1 - i] ^ ((len - i * len) & 0xff);
  }
  return out;
}

function compressQt(xmlData: Uint8Array): Uint8Array {
  const compressed = pako.deflate(xmlData);
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, xmlData.length, false);
  return concatBytes(header, compressed);
}

function uncompressQt(blob: Uint8Array): Uint8Array {
  if (blob.length < 4) {
    throw new Error("Compressed packet payload is too small.");
  }
  const expectedSize = new DataView(blob.buffer, blob.byteOffset, blob.byteLength).getUint32(0, false);
  const inflated = pako.inflate(blob.subarray(4));
  return inflated.subarray(0, expectedSize);
}

export function encryptXml(xmlData: Uint8Array): Uint8Array {
  const stage2Input = compressQt(xmlData);
  const decryptedBlob = obfStage2(stage2Input);
  const { ciphertext, tag } = eaxEncrypt(PACKET_KEY, PACKET_IV, decryptedBlob);
  const stage1Input = concatBytes(ciphertext, tag);
  return obfStage1(stage1Input);
}

export function decryptPacket(packetData: Uint8Array): Uint8Array {
  if (packetData.length <= BLOCK_SIZE) {
    throw new Error("Packet is too small to contain authentication tag.");
  }
  const stage1 = deobfStage1(packetData);
  const ciphertext = stage1.subarray(0, stage1.length - BLOCK_SIZE);
  const tag = stage1.subarray(stage1.length - BLOCK_SIZE);
  const decrypted = eaxDecrypt(PACKET_KEY, PACKET_IV, ciphertext, tag);
  const stage2 = obfStage2(decrypted);
  return uncompressQt(stage2);
}
