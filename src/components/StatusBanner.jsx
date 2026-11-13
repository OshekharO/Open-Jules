export default function StatusBanner({ kind, title, children }) {
  if (!kind) return null;

  return (
    <div className={`banner banner-${kind}`} role="status">
      <span className="banner-dot" aria-hidden="true" />
      <div className="banner-content">
        <p className="banner-title">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function ErrorDetail({ error }) {
  if (!error) return null;

  return (
    <>
      {error.githubStatus ? (
        <p className="banner-detail">
          GitHub status {error.githubStatus}
          {error.githubMessage ? `: ${error.githubMessage}` : '.'}
        </p>
      ) : null}
      {error.githubBody ? <pre className="error-body">{error.githubBody}</pre> : null}
    </>
  );
}