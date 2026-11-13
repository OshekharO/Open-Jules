import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

// The Workers runtime exposes crypto.getRandomValues. Wire it in explicitly so
// key generation never depends on tweetnacl's environment sniffing.
if (typeof globalThis.crypto?.getRandomValues === 'function' && typeof nacl.setPRNG === 'function') {
  nacl.setPRNG((target, length) => {
    const size = typeof length === 'number' ? length : target.length;
    const QUOTA = 65_536;
    for (let offset = 0; offset < size; offset += QUOTA) {
      globalThis.crypto.getRandomValues(target.subarray(offset, Math.min(offset + QUOTA, size)));
    }
  });
}

function deriveNonce(ephemeralPublicKey, recipientPublicKey) {
  const input = new Uint8Array(ephemeralPublicKey.length + recipientPublicKey.length);
  input.set(ephemeralPublicKey, 0);
  input.set(recipientPublicKey, ephemeralPublicKey.length);
  return blake2b(input, undefined, nacl.box.nonceLength);
}

/**
 * LibSodium crypto_box_seal for the Workers runtime: X25519 + XSalsa20-Poly1305
 * with a BLAKE2b derived nonce. GitHub requires this exact construction when
 * writing Actions secrets; plaintext is rejected.
 */
export function cryptoBoxSeal(message, recipientPublicKey) {
  const ephemeralKeyPair = nacl.box.keyPair();
  const nonce = deriveNonce(ephemeralKeyPair.publicKey, recipientPublicKey);
  const encryptedMessage = nacl.box(message, nonce, recipientPublicKey, ephemeralKeyPair.secretKey);
  const sealed = new Uint8Array(ephemeralKeyPair.publicKey.length + encryptedMessage.length);
  sealed.set(ephemeralKeyPair.publicKey, 0);
  sealed.set(encryptedMessage, ephemeralKeyPair.publicKey.length);
  return sealed;
}