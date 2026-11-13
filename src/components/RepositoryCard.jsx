import StatusBanner, { ErrorDetail } from './StatusBanner.jsx';

export default function RepositoryCard({
  token,
  repos,
  repoState,
  selected,
  onSelect,
  onLoad,
  onSetup,
  setup,
  geminiReady,
}) {
  const loading = repoState.status === 'loading';
  const selectedRepo = repos.find((repo) => repo.fullName === selected) || null;
  const canLoad = token.trim().length > 0 && !loading;
  const canSetup = geminiReady && Boolean(selectedRepo) && setup.status !== 'running';

  return (
    <section className="card" aria-labelledby="repository-title">
      <header className="card-head">
        <span className="step" aria-hidden="true">
          2
        </span>
        <h2 id="repository-title">Repository</h2>
      </header>

      <div className="field">
        <label className="label" htmlFor="repo-select">
          Repository
        </label>
        <div className="select-row">
          <div className="select-wrap">
            <select
              id="repo-select"
              className="select"
              value={selected}
              disabled={loading || repos.length === 0}
              onChange={(event) => onSelect(event.target.value)}
            >
              <option value="">
                {loading
                  ? 'Loading repositories'
                  : repos.length === 0
                    ? 'No repositories loaded'
                    : 'Select a repository'}
              </option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.fullName}>
                  {repo.fullName}
                  {repo.private ? ' (private)' : ''}
                </option>
              ))}
            </select>
            <svg
              className="select-caret"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={onLoad}
            disabled={!canLoad}
          >
            {loading ? 'Loading' : repos.length > 0 ? 'Refresh' : 'Load'}
          </button>
        </div>
      </div>

      {repoState.status === 'error' ? (
        <StatusBanner kind="error" title={repoState.error.message}>
          <ErrorDetail error={repoState.error} />
        </StatusBanner>
      ) : null}

      {repoState.status === 'ready' && repos.length === 0 ? (
        <p className="empty-note">
          No repositories were returned. Confirm the token can access at least one repository.
        </p>
      ) : null}

      {selectedRepo ? (
        <p className="repo-meta">
          <span>{selectedRepo.private ? 'Private' : 'Public'}</span>
          <span aria-hidden="true">/</span>
          <span>
            default branch <code>{selectedRepo.defaultBranch}</code>
          </span>
        </p>
      ) : null}

      <button
        type="button"
        className="button button-primary button-block"
        onClick={onSetup}
        disabled={!canSetup}
        aria-busy={setup.status === 'running'}
      >
        {setup.status === 'running' ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Setting up
          </>
        ) : (
          'Setup repo'
        )}
      </button>

      <p className="hint">
        Writes the encrypted <code>GEMINI_API_KEY</code> secret and installs{' '}
        <code>.github/workflows/jules-web-agent.yml</code> on{' '}
        {selectedRepo ? <code>{selectedRepo.defaultBranch}</code> : 'the default branch'}.
      </p>

      {setup.status === 'error' ? (
        <StatusBanner kind="error" title={setup.error.message}>
          <ErrorDetail error={setup.error} />
        </StatusBanner>
      ) : null}

      {setup.status === 'success' && setup.result ? (
        <>
          <StatusBanner
            kind="success"
            title={`Setup complete for ${setup.result.repo} on ${setup.result.defaultBranch}.`}
          />
          <ul className="steps" aria-label="Setup results">
            <li className="step-row">
              <span>Secret GEMINI_API_KEY</span>
              <span className="tag">{setup.result.steps.secret}</span>
            </li>
            <li className="step-row">
              <span>Workflow file</span>
              <span className="tag">{setup.result.steps.workflow}</span>
            </li>
          </ul>
        </>
      ) : null}
    </section>
  );
}