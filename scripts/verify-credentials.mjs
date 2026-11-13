import assert from 'node:assert/strict';

import { clearCredentials, loadCredentials, saveCredentials, STORAGE_KEY } from '../src/credentials.js';

function installStorage(overrides = {}) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      ...overrides,
    },
  };
  return store;
}

// Nothing stored yet.
{
  installStorage();
  assert.equal(loadCredentials(), null);
  console.log('credentials empty OK');
}

// Save and load round trip.
{
  const store = installStorage();
  assert.equal(saveCredentials({ token: 'github_pat_test', geminiKey: 'AIza-test' }), true);
  assert.ok(store.has(STORAGE_KEY), 'save must use the versioned key');
  assert.deepEqual(loadCredentials(), { token: 'github_pat_test', geminiKey: 'AIza-test' });
  console.log('credentials round trip OK');
}

// A blocked write is reported, not thrown.
{
  installStorage({
    setItem() {
      throw new Error('QuotaExceededError');
    },
  });
  assert.equal(saveCredentials({ token: 't', geminiKey: 'k' }), false);
  console.log('credentials blocked write OK');
}

// Forget removes the stored values.
{
  const store = installStorage();
  saveCredentials({ token: 't', geminiKey: 'k' });
  clearCredentials();
  assert.equal(store.has(STORAGE_KEY), false);
  assert.equal(loadCredentials(), null);
  console.log('credentials clear OK');
}

// Corrupt or empty payloads are ignored.
{
  const store = installStorage();
  store.set(STORAGE_KEY, '{not json');
  assert.equal(loadCredentials(), null);

  store.set(STORAGE_KEY, JSON.stringify({ token: '', geminiKey: '' }));
  assert.equal(loadCredentials(), null);
  console.log('credentials corrupt payload OK');
}

// A storage area that throws must not break the app.
{
  installStorage({
    getItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  });
  assert.equal(loadCredentials(), null);
  clearCredentials();
  console.log('credentials unavailable storage OK');
}

console.log('credentials verification complete');