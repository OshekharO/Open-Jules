export default function CredentialsCard({
  token,
  geminiKey,
  onTokenChange,
  onGeminiKeyChange,
}) {
  return (
    <section className="card" aria-labelledby="credentials-title">
      <header className="card-head">
        <span className="step" aria-hidden="true">
          1
        </span>
        <h2 id="credentials-title">Credentials</h2>
      </header>

      <p className="card-note">
        Sent with each request and discarded when it ends. Nothing is written to storage, logs,
        or URLs.
      </p>

      <div className="field">
        <label className="label" htmlFor="github-token">
          GitHub token
        </label>
        <input
          id="github-token"
          className="input"
          type="password"
          name="github-token"
          autoComplete="off"
          spellCheck="false"
          placeholder="github_pat_..."
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
        />
        <p className="hint">
          Fine-grained personal access token. <a href="#permissions">See required permissions</a>.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="gemini-key">
          Gemini API key
        </label>
        <input
          id="gemini-key"
          className="input"
          type="password"
          name="gemini-key"
          autoComplete="off"
          spellCheck="false"
          placeholder="AIza..."
          value={geminiKey}
          onChange={(event) => onGeminiKeyChange(event.target.value)}
        />
        <p className="hint">
          Stored as the <code>GEMINI_API_KEY</code> repository secret, encrypted with LibSodium
          sealed box before it leaves this app.
        </p>
      </div>
    </section>
  );
}