import StatusBanner, { ErrorDetail } from './StatusBanner.jsx';

const WORKFLOW_FILE = 'jules-web-agent.yml';

export default function PromptCard({
  prompt,
  onPromptChange,
  model,
  onModelChange,
  branch,
  onBranchChange,
  repo,
  onRun,
  run,
  canRun,
}) {
  const actionsUrl = repo ? `https://github.com/${repo.fullName}/actions` : null;

  return (
    <section className="card card-stage" aria-labelledby="prompt-title">
      <header className="card-head">
        <span className="step" aria-hidden="true">
          3
        </span>
        <h2 id="prompt-title">Prompt</h2>
      </header>

      <div className="field">
        <label className="label" htmlFor="prompt-input">
          What should Gemini CLI do?
        </label>
        <textarea
          id="prompt-input"
          className="textarea"
          value={prompt}
          placeholder="Example: Add a README section that documents the local setup steps, then open a pull request."
          onChange={(event) => onPromptChange(event.target.value)}
          rows={9}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="model-input">
          Model
        </label>
        <input
          id="model-input"
          className="input"
          type="text"
          value={model}
          placeholder="gemini-3.5-flash-lite"
          onChange={(event) => onModelChange(event.target.value)}
          spellCheck="false"
          autoComplete="off"
        />
        <p className="hint">
          Optional. Blank uses the workflow default, <code>gemini-3.5-flash-lite</code>.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="branch-input">
          Branch to update
        </label>
        <input
          id="branch-input"
          className="input"
          type="text"
          value={branch}
          placeholder="jules/run-43373690604"
          onChange={(event) => onBranchChange(event.target.value)}
          spellCheck="false"
          autoComplete="off"
        />
        <p className="hint">
          Optional. An existing pull request head branch to commit to. Blank creates a new branch
          and opens a new pull request.
        </p>
      </div>

      <dl className="target" aria-label="Dispatch target">
        <div className="target-row">
          <dt>Repository</dt>
          <dd>{repo ? repo.fullName : 'Not selected'}</dd>
        </div>
        <div className="target-row">
          <dt>Ref</dt>
          <dd>{repo ? repo.defaultBranch : 'Not selected'}</dd>
        </div>
        <div className="target-row">
          <dt>Workflow</dt>
          <dd>{WORKFLOW_FILE}</dd>
        </div>
      </dl>

      <div className="run-row">
        <p className="hint">
          Dispatches the workflow from the default branch. If you set a branch above, changes are
          committed there; otherwise the run opens a new pull request.
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={onRun}
          disabled={!canRun}
          aria-busy={run.status === 'running'}
        >
          {run.status === 'running' ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Running
            </>
          ) : (
            'Run task'
          )}
        </button>
      </div>

      {run.status === 'error' ? (
        <StatusBanner kind="error" title={run.error.message}>
          <ErrorDetail error={run.error} />
        </StatusBanner>
      ) : null}

      {run.status === 'success' && run.result ? (
        <StatusBanner
          kind="success"
          title={`Dispatched to ${run.result.repo} on ${run.result.ref}${
            run.result.model ? ` using ${run.result.model}` : ''
          }. GitHub returned 204.`}
        >
        <p className="banner-detail">
          {run.result.branch ? (
            <>
              The run is queued now. Changes will be committed to{' '}
              <code>{run.result.branch}</code>, and the pull request will update automatically.
            </>
          ) : (
            <>
              The run is queued now. If the agent changes files, it commits them to a new branch and
              opens a pull request.
            </>
          )}{' '}
          {actionsUrl ? (
            <a href={actionsUrl} target="_blank" rel="noreferrer">
              Open the Actions tab
            </a>
          ) : null}
        </p>
        </StatusBanner>
      ) : null}
    </section>
  );
}