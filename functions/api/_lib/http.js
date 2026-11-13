const GITHUB_API = 'https://api.github.com';
const GITHUB_ACCEPT = 'application/vnd.github+json';
const GITHUB_API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ERROR_BODY = 2_000;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function fail(error, status = 400, extra = {}) {
  return json({ ok: false, error, ...extra }, status);
}

export async function readJson(request) {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function parseRepoSlug(value) {
  if (typeof value !== 'string') return null;
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value.trim());
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

export function requireToken(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

export async function githubFetch(token, path, { method = 'GET', body } = {}) {
  const headers = {
    accept: GITHUB_ACCEPT,
    'x-github-api-version': GITHUB_API_VERSION,
    // The Workers runtime does not add a User-Agent, and GitHub refuses requests without one.
    'user-agent': 'jules-web',
    authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';

  return fetch(`${GITHUB_API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function readErrorDetail(response) {
  const text = await response.text().catch(() => '');
  let message = '';
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.message === 'string') message = parsed.message;
  } catch {
    // GitHub returned a non-JSON body. The raw text is surfaced instead.
  }
  return {
    status: response.status,
    message,
    body: text.slice(0, MAX_ERROR_BODY),
  };
}

/**
 * Builds a client-facing failure that keeps GitHub's status code, message and raw
 * body, so a missing token permission is actionable in the UI.
 */
export async function githubFailure(action, response) {
  const detail = await readErrorDetail(response);
  return fail(`GitHub rejected the request to ${action}.`, response.status === 401 ? 401 : 502, {
    step: action,
    githubStatus: detail.status,
    githubMessage: detail.message,
    githubBody: detail.body,
  });
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}