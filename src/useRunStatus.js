import { useCallback, useEffect, useRef, useState } from 'react';
import { errorDetails, postJson } from './api.js';

const POLL_INTERVAL_MS = 10_000;
// A run that never appears (deleted workflow, wrong ref) should stop polling.
const MAX_WAIT_MS = 60 * 60 * 1000;

const IDLE = { status: 'idle', run: null, error: '' };

/**
 * Polls the run a dispatch started.
 *
 * `start` takes the dispatch response (`since` is the timestamp the API
 * returned) and polls until the run reaches a terminal state. Once the run is
 * found its id is reused, so later polls read one run instead of re-matching
 * the run list.
 */
export default function useRunStatus() {
  const [state, setState] = useState(IDLE);
  const [query, setQuery] = useState(null);
  const tokenRef = useRef('');
  const runIdRef = useRef(null);

  const start = useCallback(({ token, repo, branch, since }) => {
    tokenRef.current = token;
    runIdRef.current = null;
    setState({ status: 'queued', run: null, error: '' });
    setQuery({ repo, branch, since, startedAt: Date.now() });
  }, []);

  const reset = useCallback(() => {
    runIdRef.current = null;
    setQuery(null);
    setState(IDLE);
  }, []);

  useEffect(() => {
    if (!query) return undefined;

    let cancelled = false;
    let timer = null;

    async function poll() {
      const payload = { userToken: tokenRef.current, repo: query.repo, since: query.since };
      if (query.branch) payload.branch = query.branch;
      if (runIdRef.current !== null) payload.runId = runIdRef.current;

      let data;
      try {
        data = await postJson('/api/run-status', payload);
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', run: null, error: errorDetails(error).message });
        }
        return;
      }

      if (cancelled) return;

      const run = data.run || null;

      if (!run) {
        if (Date.now() - query.startedAt > MAX_WAIT_MS) {
          setState({
            status: 'timeout',
            run: null,
            error: 'No workflow run matched this dispatch.',
          });
          return;
        }
        setState({ status: 'queued', run: null, error: '' });
        timer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }

      if (runIdRef.current === null) runIdRef.current = run.id;

      if (run.status === 'completed') {
        setState({ status: run.conclusion === 'success' ? 'success' : 'failure', run, error: '' });
        return;
      }

      setState({ status: 'running', run, error: '' });
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [query]);

  return { state, start, reset };
}