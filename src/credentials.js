const STORAGE_KEY = 'jules-web.credentials.v1';

/**
 * Reads the remembered credentials.
 *
 * Returns null when nothing is stored, the payload is malformed, or storage is
 * unavailable. Never throws: a blocked storage area must not break the app.
 */
export function loadCredentials() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const geminiKey = typeof parsed.geminiKey === 'string' ? parsed.geminiKey : '';
    return token || geminiKey ? { token, geminiKey } : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses the write. */
export function saveCredentials({ token, geminiKey }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, geminiKey }));
    return true;
  } catch {
    return false;
  }
}

export function clearCredentials() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear, or storage is blocked.
  }
}

export { STORAGE_KEY };