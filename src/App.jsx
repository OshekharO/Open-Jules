import { useState } from 'react';
import { errorDetails, postJson } from './api.js';
import CredentialsCard from './components/CredentialsCard.jsx';
import PermissionsGuide from './components/PermissionsGuide.jsx';
import PromptCard from './components/PromptCard.jsx';
import RepositoryCard from './components/RepositoryCard.jsx';

const IDLE = { status: 'idle', error: null };

export default function App() {
  const [token, setToken] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [branch, setBranch] = useState('');

  const [repos, setRepos] = useState([]);
  const [repoFullName, setRepoFullName] = useState('');
  const [repoState, setRepoState] = useState(IDLE);

  const [setup, setSetup] = useState({ status: 'idle', result: null, error: null });
  const [run, setRun] = useState({ status: 'idle', result: null, error: null });

  const repo = repos.find((item) => item.fullName === repoFullName) || null;
  const credentialsReady = token.trim().length > 0 && geminiKey.trim().length > 0;
  const canRun =
    token.trim().length > 0 && Boolean(repo) && prompt.trim().length > 0 && run.status !== 'running';

  async function handleLoadRepos() {
    setRepoState({ status: 'loading', error: null });
    try {
      const data = await postJson('/api/repos', { userToken: token.trim() });
      const nextRepos = Array.isArray(data.repos) ? data.repos : [];
      setRepos(nextRepos);
      setRepoFullName((current) =>
        nextRepos.some((item) => item.fullName === current) ? current : '',
      );
      setRepoState({ status: 'ready', error: null });
    } catch (error) {
      setRepoState({ status: 'error', error: errorDetails(error) });
    }
  }

  function handleSelectRepo(fullName) {
    setRepoFullName(fullName);
    setSetup({ status: 'idle', result: null, error: null });
    setRun({ status: 'idle', result: null, error: null });
  }

  async function handleSetup() {
    if (!repo) return;
    setSetup({ status: 'running', result: null, error: null });
    try {
      const data = await postJson('/api/setup', {
        repo: repo.fullName,
        userToken: token.trim(),
        geminiKey: geminiKey.trim(),
      });
      setSetup({ status: 'success', result: data, error: null });
    } catch (error) {
      setSetup({ status: 'error', result: null, error: errorDetails(error) });
    }
  }

  async function handleRun() {
    if (!repo || !prompt.trim()) return;
    setRun({ status: 'running', result: null, error: null });
    try {
      const data = await postJson('/api/run', {
        repo: repo.fullName,
        prompt,
        model: model.trim(),
        branch: branch.trim(),
        userToken: token.trim(),
      });
      setRun({ status: 'success', result: data, error: null });
    } catch (error) {
      setRun({ status: 'error', result: null, error: errorDetails(error) });
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="shell topbar-inner">
          <span className="wordmark">Jules Web</span>
          <p className="topbar-note">
            <svg
              className="lock"
              width="13"
              height="13"
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
            >
              <rect
                x="3.25"
                y="7"
                width="9.5"
                height="6.5"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            Credentials are never stored
          </p>
        </div>
      </header>

      <main className="shell">
        <section className="intro">
          <div className="intro-row">
            <h1>Run Gemini CLI on your repository.</h1>
            <a className="intro-link" href="#permissions">
              Required token permissions
            </a>
          </div>
        </section>

        <div className="workspace">
          <div className="rail">
            <CredentialsCard
              token={token}
              geminiKey={geminiKey}
              onTokenChange={setToken}
              onGeminiKeyChange={setGeminiKey}
            />
            <RepositoryCard
              token={token}
              repos={repos}
              repoState={repoState}
              selected={repoFullName}
              onSelect={handleSelectRepo}
              onLoad={handleLoadRepos}
              onSetup={handleSetup}
              setup={setup}
              geminiReady={credentialsReady}
            />
          </div>

          <PromptCard
            prompt={prompt}
            onPromptChange={setPrompt}
            model={model}
            onModelChange={setModel}
            branch={branch}
            onBranchChange={setBranch}
            repo={repo}
            onRun={handleRun}
            run={run}
            canRun={canRun}
          />
        </div>

        <PermissionsGuide />
      </main>

      <footer className="shell footer">
        <div className="footer-inner">
          <div className="footer-row">
            <p className="footer-brand">
              <span className="footer-name">Jules Web</span>
              <span className="footer-tag">
                Run Gemini CLI on your repository. Credentials are used per request and never stored.
              </span>
            </p>
            <a
              className="footer-repo"
              href="https://github.com/OshekharO/Open-Jules"
              target="_blank"
              rel="noreferrer"
            >
              https://github.com/OshekharO/Open-Jules
            </a>
          </div>
          <div className="footer-row">
            <p className="footer-note">Runs on Cloudflare Pages Functions.</p>
            <nav className="footer-links" aria-label="Documentation">
              <a
                href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                target="_blank"
                rel="noreferrer"
              >
                Token permissions
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://docs.github.com/en/rest/actions/secrets"
                target="_blank"
                rel="noreferrer"
              >
                Secrets API
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions"
                target="_blank"
                rel="noreferrer"
              >
                Workflow syntax
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}