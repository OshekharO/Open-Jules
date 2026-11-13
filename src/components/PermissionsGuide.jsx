const PERMISSIONS = [
  {
    name: 'Metadata',
    access: 'Read-only',
    detail: 'Lists the repositories the token can reach.',
  },
  {
    name: 'Contents',
    access: 'Read and write',
    detail: 'Reads the current workflow sha and writes the workflow file.',
  },
  {
    name: 'Workflows',
    access: 'Read and write',
    detail: 'GitHub requires this for any write under .github/workflows/.',
  },
  {
    name: 'Actions',
    access: 'Read and write',
    detail: 'Stores the GEMINI_API_KEY secret and dispatches the workflow.',
  },
  {
    name: 'Secrets',
    access: 'Read and write',
    detail: 'Writes the encrypted Gemini key to repository secrets.',
  },
];

export default function PermissionsGuide() {
  return (
    <section id="permissions" className="permissions" aria-labelledby="permissions-title">
      <div className="permissions-head">
        <h2 id="permissions-title">Required token permissions</h2>
        <p>
          Create a fine-grained personal access token under GitHub Settings, Developer settings,
          Personal access tokens, Fine-grained tokens. Set repository access to the repositories
          you want to use, then grant the scopes below.
        </p>
      </div>

      <ul className="perm-list">
        {PERMISSIONS.map((permission) => (
          <li className="perm-row" key={permission.name}>
            <h3>{permission.name}</h3>
            <p>{permission.detail}</p>
            <span className="scope">{permission.access}</span>
          </li>
        ))}
      </ul>

      <div className="notice">
        <h3>If GitHub returns 403</h3>
        <p>
          The response body below the failing action is GitHub's own message. Add the permission
          it names to the token, or grant the token access to that repository.
        </p>
        <h3>If dispatch returns 404</h3>
        <p>
          workflow_dispatch only finds the workflow on the repository's default branch. This app
          writes the file and dispatches on the default branch, so a 404 means the file is missing
          there or the token cannot read Actions.
        </p>
      </div>
    </section>
  );
}