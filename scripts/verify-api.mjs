import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

import { onRequestPost as setup } from '../functions/api/setup.js';
import { onRequestPost as run } from '../functions/api/run.js';
import { onRequestPost as listRepos } from '../functions/api/repos.js';
import { base64ToBytes, bytesToBase64 } from '../functions/api/_lib/http.js';
import { DEFAULT_GEMINI_MODEL, WORKFLOW_PATH, WORKFLOW_YAML } from '../functions/api/_lib/workflow.js';

const TOKEN = 'github_pat_test_token';
const GEMINI_KEY = 'AIza-test-gemini-key';
const recipient = nacl.box.keyPair();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installGithubMock({ fileExists = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const method = init.method ?? 'GET';
    calls.push({ href, method, body: init.body, headers: init.headers });

    if (href.endsWith('/repos/acme/widgets')) {
      return jsonResponse({ default_branch: 'main' });
    }
    if (href.endsWith('/actions/secrets/public-key')) {
      return jsonResponse({ key_id: 'kid-1', key: bytesToBase64(recipient.publicKey) });
    }
    if (href.endsWith('/actions/secrets/GEMINI_API_KEY')) {
      return new Response(null, { status: 204 });
    }
    if (href.endsWith('/dispatches')) {
      return new Response(null, { status: 204 });
    }
    if (href.includes('/contents/' + WORKFLOW_PATH)) {
      if (method === 'GET') {
        return fileExists
          ? jsonResponse({ sha: 'abc123' })
          : jsonResponse({ message: 'Not Found' }, 404);
      }
      return jsonResponse({ content: { sha: 'newsha' } }, 201);
    }
    return jsonResponse({ message: `unexpected call: ${method} ${href}` }, 500);
  };
  return calls;
}

async function post(handler, payload) {
  const request = new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const response = await handler({ request });
  return { status: response.status, data: await response.json() };
}

function openSealed(sealed) {
  const ephemeralPublicKey = sealed.subarray(0, nacl.box.publicKeyLength);
  const encrypted = sealed.subarray(nacl.box.publicKeyLength);
  const input = new Uint8Array(ephemeralPublicKey.length + recipient.publicKey.length);
  input.set(ephemeralPublicKey, 0);
  input.set(recipient.publicKey, ephemeralPublicKey.length);
  const nonce = blake2b(input, undefined, nacl.box.nonceLength);
  const opened = nacl.box.open(encrypted, nonce, ephemeralPublicKey, recipient.secretKey);
  assert.ok(opened, 'secret value did not decrypt');
  return new TextDecoder().decode(opened);
}

// Repo listing: GitHub payload is mapped for the selector.
{
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    return jsonResponse([
      {
        id: 42,
        name: 'widgets',
        full_name: 'acme/widgets',
        owner: { login: 'acme' },
        private: true,
        default_branch: 'main',
        html_url: 'https://github.com/acme/widgets',
        archived: false,
      },
    ]);
  };

  const result = await post(listRepos, { userToken: TOKEN });
  assert.equal(result.status, 200);
  assert.equal(result.data.repos.length, 1);
  assert.deepEqual(result.data.repos[0], {
    id: 42,
    name: 'widgets',
    fullName: 'acme/widgets',
    owner: 'acme',
    private: true,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/acme/widgets',
    archived: false,
  });
  assert.ok(calls[0].includes('/user/repos?'), 'repo listing must call /user/repos');
  assert.ok(calls[0].includes('per_page=100'), 'repo listing must request 100 per page');

  console.log('repo listing OK');
}

// Setup: existing workflow file, so the PUT must carry the sha.
{
  const calls = installGithubMock({ fileExists: true });
  const result = await post(setup, {
    repo: 'acme/widgets',
    userToken: TOKEN,
    geminiKey: GEMINI_KEY,
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.defaultBranch, 'main');
  assert.deepEqual(result.data.steps, { secret: 'updated', workflow: 'updated' });

  const secretCall = calls.find((call) => call.href.endsWith('/actions/secrets/GEMINI_API_KEY'));
  assert.equal(secretCall.method, 'PUT');
  const secretPayload = JSON.parse(secretCall.body);
  assert.equal(secretPayload.key_id, 'kid-1');
  assert.equal(openSealed(base64ToBytes(secretPayload.encrypted_value)), GEMINI_KEY);

  const putCall = calls.find((call) => call.method === 'PUT' && call.href.includes('/contents/'));
  const putPayload = JSON.parse(putCall.body);
  assert.equal(putPayload.branch, 'main');
  assert.equal(putPayload.sha, 'abc123');
  assert.equal(new TextDecoder().decode(base64ToBytes(putPayload.content)), WORKFLOW_YAML);

  const serialized = JSON.stringify(result.data);
  assert.ok(!serialized.includes(TOKEN), 'response leaked the GitHub token');
  assert.ok(!serialized.includes(GEMINI_KEY), 'response leaked the Gemini key');

  for (const call of calls) {
    const headers = new Headers(call.headers);
    assert.equal(headers.get('user-agent'), 'jules-web', 'GitHub request is missing a User-Agent');
    assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  }

  console.log('setup with existing file OK');
}

// Setup: no workflow file yet, so the PUT must omit the sha.
{
  const calls = installGithubMock({ fileExists: false });
  const result = await post(setup, {
    repo: 'acme/widgets',
    userToken: TOKEN,
    geminiKey: GEMINI_KEY,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.data.steps, { secret: 'updated', workflow: 'created' });
  const putCall = calls.find((call) => call.method === 'PUT' && call.href.includes('/contents/'));
  assert.equal('sha' in JSON.parse(putCall.body), false, 'new file must not send a sha');

  console.log('setup with new file OK');
}

// Run: workflow_dispatch answers 204.
{
  const calls = installGithubMock({ fileExists: true });
  const result = await post(run, {
    repo: 'acme/widgets',
    prompt: 'Add a setup section to the README',
    userToken: TOKEN,
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.ref, 'main');
  assert.equal(result.data.model, DEFAULT_GEMINI_MODEL);
  assert.equal(result.data.branch, null);

  const dispatch = calls.find((call) => call.method === 'POST' && call.href.endsWith('/dispatches'));
  const payload = JSON.parse(dispatch.body);
  assert.equal(payload.ref, 'main');
  assert.equal(payload.inputs.user_prompt, 'Add a setup section to the README');
  assert.equal('gemini_model' in payload.inputs, false, 'blank model must use the workflow default');
  assert.equal('branch' in payload.inputs, false, 'blank branch must open a new PR');

  console.log('run dispatch OK');
}

// Run: an explicit model is forwarded to the workflow.
{
  const calls = installGithubMock({ fileExists: true });
  const result = await post(run, {
    repo: 'acme/widgets',
    prompt: 'hello',
    model: 'gemini-3.8-flash',
    userToken: TOKEN,
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.model, 'gemini-3.8-flash');

  const dispatch = calls.find((call) => call.method === 'POST' && call.href.endsWith('/dispatches'));
  const payload = JSON.parse(dispatch.body);
  assert.equal(payload.inputs.gemini_model, 'gemini-3.8-flash');

  console.log('run with model OK');
}

// Run: an existing branch is updated instead of opening a new PR.
{
  const calls = installGithubMock({ fileExists: true });
  const result = await post(run, {
    repo: 'acme/widgets',
    prompt: 'fix the typo',
    branch: 'jules/run-43373690604',
    userToken: TOKEN,
  });

  assert.equal(result.status, 200);
  assert.equal(result.data.branch, 'jules/run-43373690604');

  const dispatch = calls.find((call) => call.method === 'POST' && call.href.endsWith('/dispatches'));
  const payload = JSON.parse(dispatch.body);
  assert.equal(payload.ref, 'main', 'workflow file must come from the default branch');
  assert.equal(payload.inputs.branch, 'jules/run-43373690604');

  console.log('run updates branch OK');
}

// Run: malformed branch names are rejected before any GitHub call.
{
  const calls = installGithubMock({ fileExists: true });
  for (const branch of ['bad branch', '..', '-nope', 'trailing/', 'refs/heads/main']) {
    const result = await post(run, {
      repo: 'acme/widgets',
      prompt: 'hello',
      branch,
      userToken: TOKEN,
    });
    assert.equal(result.status, 400, `branch ${branch} must be rejected`);
  }
  assert.equal(calls.length, 0, 'invalid branch must not call GitHub');

  console.log('run rejects bad branch OK');
}

// Run: the default branch cannot be used as the update target.
{
  const calls = installGithubMock({ fileExists: true });
  const result = await post(run, {
    repo: 'acme/widgets',
    prompt: 'hello',
    branch: 'main',
    userToken: TOKEN,
  });

  assert.equal(result.status, 400);
  assert.match(result.data.error, /must differ from the default branch/);
  assert.equal(calls.length, 1, 'only repository metadata is read before the rejection');

  console.log('run rejects default branch OK');
}

// Run: a malformed model is rejected before any GitHub call.
{
  const calls = installGithubMock({ fileExists: true });
  const result = await post(run, {
    repo: 'acme/widgets',
    prompt: 'hello',
    model: 'gemini 2.5 pro',
    userToken: TOKEN,
  });

  assert.equal(result.status, 400);
  assert.match(result.data.error, /Model must use only/);
  assert.equal(calls.length, 0);

  console.log('run rejects bad model OK');
}

// Run: a GitHub 403 body must reach the client unchanged.
{
  globalThis.fetch = async () =>
    jsonResponse(
      {
        message:
          'Refusing to allow a Personal Access Token to create or update workflow without `workflow` scope',
      },
      403,
    );

  const result = await post(run, {
    repo: 'acme/widgets',
    prompt: 'hello',
    userToken: TOKEN,
  });

  assert.equal(result.status, 502);
  assert.equal(result.data.ok, false);
  assert.equal(result.data.githubStatus, 403);
  assert.match(result.data.githubBody, /workflow` scope/);

  console.log('run 403 passthrough OK');
}

console.log('api verification complete');