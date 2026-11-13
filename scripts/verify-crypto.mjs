import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

import { cryptoBoxSeal } from '../functions/api/_crypto.js';
import { base64ToBytes, bytesToBase64, textToBase64 } from '../functions/api/_lib/http.js';
import { WORKFLOW_YAML } from '../functions/api/_lib/workflow.js';

const secret = 'AIza-roundtrip-check';
const recipient = nacl.box.keyPair();
const sealed = cryptoBoxSeal(new TextEncoder().encode(secret), recipient.publicKey);

const ephemeralPublicKey = sealed.subarray(0, nacl.box.publicKeyLength);
const encrypted = sealed.subarray(nacl.box.publicKeyLength);
const input = new Uint8Array(ephemeralPublicKey.length + recipient.publicKey.length);
input.set(ephemeralPublicKey, 0);
input.set(recipient.publicKey, ephemeralPublicKey.length);
const nonce = blake2b(input, undefined, nacl.box.nonceLength);

const opened = nacl.box.open(encrypted, nonce, ephemeralPublicKey, recipient.secretKey);
assert.ok(opened, 'sealed box did not open');
assert.equal(new TextDecoder().decode(opened), secret);

assert.deepEqual(base64ToBytes(bytesToBase64(sealed)), sealed);

const unicode = 'héllo ✓ 日本語';
assert.deepEqual(
  base64ToBytes(textToBase64(unicode)),
  new TextEncoder().encode(unicode),
);

assert.ok(
  WORKFLOW_YAML.includes('gemini_api_key: ${{ secrets.GEMINI_API_KEY }}'),
  'workflow template lost the secrets expression',
);
assert.ok(
  WORKFLOW_YAML.includes('Request: ${{ inputs.user_prompt }}'),
  'workflow template lost the input expression',
);
assert.ok(
  WORKFLOW_YAML.startsWith('name: Jules Web Agent\n'),
  'workflow template changed shape',
);
assert.ok(
  WORKFLOW_YAML.includes('google-github-actions/run-gemini-cli@v0'),
  'workflow template must use the v0 major tag',
);
assert.ok(
  !WORKFLOW_YAML.includes('run-gemini-cli@v1'),
  'run-gemini-cli has no v1 tag',
);
assert.ok(
  WORKFLOW_YAML.includes("GEMINI_CLI_TRUST_WORKSPACE: 'true'"),
  'workflow template must trust the Actions workspace for Gemini CLI',
);
assert.ok(
  WORKFLOW_YAML.includes("default: 'gemini-3.5-flash-lite'"),
  'workflow template must default the model input to gemini-3.5-flash-lite',
);
assert.ok(
  WORKFLOW_YAML.includes('gemini_model: ${{ inputs.gemini_model }}'),
  'workflow template must pass the model input to the action',
);
assert.ok(
  WORKFLOW_YAML.includes('git push --set-upstream origin "$branch"'),
  'workflow template must push the agent branch',
);
assert.ok(
  WORKFLOW_YAML.includes('gh pr create'),
  'workflow template must open a pull request',
);

console.log('crypto round-trip OK');
console.log('sealed box bytes:', sealed.length);
console.log('workflow template lines:', WORKFLOW_YAML.split('\n').length);