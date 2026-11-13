# Jules Web

A multi-user web UI for running Gemini CLI against a GitHub repository through GitHub Actions. Each user brings their own GitHub fine-grained token and Gemini API key. Neither credential is stored on the server.

The flow is three steps:

1. Enter a GitHub token and a Gemini API key.
2. Pick a repository and run **Setup repo**. This writes the encrypted `GEMINI_API_KEY` repository secret and installs `.github/workflows/jules-web-agent.yml` on the repository's default branch.
3. Enter a prompt, optionally set a model, and run **Run task**. This dispatches the workflow, which edits the repository and opens a pull request with the changes.

## Stack

- Cloudflare Pages with Pages Functions (`functions/api/`), deployed as a static frontend plus a Worker.
- React 19 and Vite for the frontend.
- `tweetnacl` and `blakejs` for LibSodium `crypto_box_seal` in the Workers runtime.
- No database, no KV, no server-side credential storage.

## How it works

```
Browser (React state only)
  POST /api/repos   -> GET    /user/repos
  POST /api/setup   -> GET    /repos/{owner}/{repo}
                    -> GET    /repos/{owner}/{repo}/actions/secrets/public-key
                    -> seal  GEMINI_API_KEY with crypto_box_seal
                    -> PUT    /repos/{owner}/{repo}/actions/secrets/GEMINI_API_KEY
                    -> GET    /repos/{owner}/{repo}/contents/.github/workflows/jules-web-agent.yml
                    -> PUT    /repos/{owner}/{repo}/contents/.github/workflows/jules-web-agent.yml
  POST /api/run     -> GET    /repos/{owner}/{repo}
                    -> POST   /repos/{owner}/{repo}/actions/workflows/jules-web-agent.yml/dispatches
```

`workflow_dispatch` answers `204 No Content` on success, not `200`. The function treats both as success and surfaces any GitHub error body verbatim.

## Prerequisites

- Node.js 22.12 or newer. Wrangler 4 refuses to run on Node 20.
- A Cloudflare account and `npx wrangler login`.
- A GitHub fine-grained personal access token.
- A Gemini API key.

## Run locally

```bash
npm install
npm run dev:pages
```

This builds the frontend and serves the UI plus the Pages Functions on `http://127.0.0.1:8788`.

For frontend-only iteration, run the two halves separately:

```bash
npm run build
npx wrangler pages dev dist --port 8788   # API on :8788
npm run dev                               # Vite on :5173, proxies /api to :8788
```

## Deploy to Cloudflare Pages

```bash
npx wrangler login
npx wrangler pages project create jules-web --production-branch main
npm run deploy
```

`npm run deploy` builds `dist/` and uploads it with Wrangler, using the `jules-web` Pages project name from `package.json`. The project only needs to be created once. To deploy through the Cloudflare dashboard instead, connect the repository and set:

- Build command: `npm run build`
- Build output directory: `dist`

The `functions/` directory is picked up automatically. `public/_routes.json` limits Function invocation to `/api/*`, so static assets are served without a Function charge.

## Automatic deployment

`.github/workflows/deploy.yml` builds `dist/` and deploys it on every push to `main`, on pull requests targeting `main`, and on manual runs.

Add a Cloudflare API token as a repository secret first:

1. In the Cloudflare dashboard, create an API token with the **Cloudflare Pages: Edit** permission for the account that owns the project.
2. In GitHub, open Settings, Secrets and variables, Actions, and add `CLOUDFLARE_API_TOKEN`.

The workflow creates the `jules-web` Pages project on its first run, then deploys to it. To create the project yourself instead, run `npx wrangler pages project create jules-web --production-branch main` once, or use the Cloudflare dashboard under Workers & Pages, Create, Pages, Upload assets. The project must exist before the first deploy, otherwise Wrangler exits with "The Pages project does not exist".

Pushes to `main` deploy to the project's production branch. Pull requests create preview deployments named after the source branch. Fork pull requests do not receive repository secrets, so their deploy step fails by design.

The workflow uses `npm ci` and `npx wrangler`, so the Wrangler version comes from `devDependencies` instead of a global install. The `environment.url` in the workflow points at the default `https://jules-web.pages.dev`; change it if the project uses a custom domain.

## GitHub token permissions

Create the token under GitHub Settings, Developer settings, Personal access tokens, Fine-grained tokens. Set repository access to **Only select repositories** and pick the repositories you want to use.

| Permission | Access | Why it is needed |
| --- | --- | --- |
| Metadata | Read-only | Lists the repositories the token can reach. |
| Contents | Read and write | Reads the current workflow file `sha` and writes the workflow file. |
| Workflows | Read and write | GitHub requires this for any write under `.github/workflows/`. |
| Actions | Read and write | Writes the `GEMINI_API_KEY` secret and dispatches the workflow. |
| Secrets | Read and write | Stores the encrypted Gemini key as a repository secret. |

GitHub answers `403` when a permission is missing. The UI prints the failing step and GitHub's raw response body so the missing permission is visible without guessing.

## Installed workflow

The workflow installed at `.github/workflows/jules-web-agent.yml`:

```yaml
name: Jules Web Agent
on:
  workflow_dispatch:
    inputs:
      user_prompt:
        description: 'Prompt for Gemini CLI'
        required: true
        type: string
      gemini_model:
        description: 'Gemini model to run'
        required: false
        default: 'gemini-3.5-flash-lite'
        type: string
jobs:
  run-gemini:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    env:
      # Gemini CLI refuses to run in an untrusted directory.
      GEMINI_CLI_TRUST_WORKSPACE: 'true'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: google-github-actions/run-gemini-cli@v0
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          prompt: |
            You are running in a GitHub Actions checkout of this repository.
            Make the requested changes directly in the working tree. Do not commit or push; a later step commits and opens a pull request.

            Request: ${{ inputs.user_prompt }}
          gemini_model: ${{ inputs.gemini_model }}
      - name: Commit changes and open a pull request
        env:
          GH_TOKEN: ${{ github.token }}
          USER_PROMPT: ${{ inputs.user_prompt }}
        run: |
          set -euo pipefail

          # The action writes these into the workspace; never commit them.
          printf '%s\n' '.gemini/' 'gemini-artifacts/' 'gha-creds-*.json' >> .git/info/exclude

          if [[ -z "$(git status --porcelain)" ]]; then
            echo 'Gemini CLI made no file changes; skipping pull request.'
            exit 0
          fi

          git config user.name 'jules-web[bot]'
          git config user.email 'jules-web[bot]@users.noreply.github.com'

          branch="jules/run-$GITHUB_RUN_ID"
          git checkout -b "$branch"
          git add -A
          git commit -m "Apply Gemini CLI changes from run $GITHUB_RUN_ID [skip ci]"
          git push --set-upstream origin "$branch"

          body_file="$(mktemp)"
          {
            echo "Automated changes from the Jules Web Agent workflow (run $GITHUB_RUN_ID)."
            echo
            echo '### Prompt'
            echo
            echo '```'
            printf '%s\n' "$USER_PROMPT"
            echo '```'
          } > "$body_file"

          title="Gemini CLI: $(printf '%s' "$USER_PROMPT" | head -n 1 | cut -c 1-72)"
          gh pr create --base "$GITHUB_REF_NAME" --head "$branch" --title "$title" --body-file "$body_file"
```

After the CLI finishes, the second step checks the working tree. If the CLI changed files, it commits them on `jules/run-<run id>`, pushes that branch, and opens a pull request against the dispatched branch. If the CLI made no changes, the step exits without opening a PR. `.gemini/`, `gemini-artifacts/`, and `gha-creds-*.json` are excluded so the action's own files are never committed.

The `gemini_model` input defaults to `gemini-3.5-flash-lite`. Gemini 2.5 Flash is deprecated and Google routes it to this model from December 1, 2026, so pinning the replacement avoids the deprecation path. The web UI's **Model** field overrides it per run; leave the field blank to use the default. You can also override it from the Actions tab's **Run workflow** form, or by sending `inputs.gemini_model` to the dispatch API.

The `GEMINI_CLI_TRUST_WORKSPACE` environment variable is required: every `actions/checkout` workspace is untrusted, and Gemini CLI 0.68 refuses to start there. The env var applies to the whole job, including the action's internal step, so the action needs no extra input.

The file must exist on the repository's default branch for `workflow_dispatch` to find it. Setup writes it to the default branch and Run dispatches with `ref` set to that same branch. If you install the file manually on another branch, dispatch returns `404`.

`run-gemini-cli` is pre-1.0, so its moving major tag is `v0` and there is no `v1`. `v0` currently resolves to `v0.1.22`; pin that exact tag if you want a fixed version. The template uses the action's `gemini_api_key`, `prompt`, and `gemini_model` inputs.

## Security model

- Credentials live in React state and are sent as JSON request bodies to this app's own `/api/*` routes. They are never written to `localStorage`, `sessionStorage`, URLs, logs, KV, or D1.
- The functions keep the token and key in request-scoped variables and discard them when the response is returned. Responses never echo either credential.
- The Gemini key is not sent to GitHub as plaintext. The function fetches the repository's Actions public key, seals the value with LibSodium `crypto_box_seal` (X25519 plus XSalsa20-Poly1305 with a BLAKE2b derived nonce), base64 encodes it, and sends `{ encrypted_value, key_id }`.
- The app operator still terminates TLS and can observe request bodies, which is true of any proxy that forwards user credentials. Do not add request logging to these functions.

`libsodium-wrappers` is deliberately not used: it loads WASM, which has a history of failing in the Workers runtime. `tweetnacl` and `blakejs` are pure JavaScript and run in workerd. `npm run test:crypto` proves the sealed box round trip in Node.

## API reference

All routes are `POST` with a JSON body. The GitHub token is only accepted in the body, never in a URL.

### `POST /api/repos`

```json
{ "userToken": "github_pat_..." }
```

Returns `{ ok: true, repos: [{ id, name, fullName, owner, private, defaultBranch, htmlUrl, archived }] }`. The function pages through up to five pages of 100 repositories, so at most 500 are returned.

`GET /api/repos` with an `x-github-token` header returns the same payload. The UI uses POST so the token never appears in a URL. Other methods return `405`.

### `POST /api/setup`

```json
{ "repo": "owner/name", "userToken": "github_pat_...", "geminiKey": "AIza..." }
```

Returns:

```json
{
  "ok": true,
  "repo": "owner/name",
  "defaultBranch": "main",
  "workflowPath": ".github/workflows/jules-web-agent.yml",
  "steps": { "secret": "created", "workflow": "created" }
}
```

Each step is `created` or `updated`. On failure the response carries `error`, `step`, `githubStatus`, `githubMessage`, and `githubBody`.

### `POST /api/run`

```json
{ "repo": "owner/name", "prompt": "...", "userToken": "github_pat_...", "model": "gemini-3.5-flash-lite" }
```

`model` is optional. It must match `^[A-Za-z0-9._:-]+$` and be at most 100 characters. When it is blank or omitted, the request sends no `gemini_model` input, so the workflow's default applies.

Returns `{ ok: true, repo, ref, model, workflowPath }` on the `204` from GitHub. `model` is the value sent, or the workflow default when the field is blank. Failures use the same shape as `/api/setup`.

The response returns as soon as the dispatch is accepted. The workflow then runs the CLI, commits any changes to `jules/run-<run id>`, and opens the pull request. The PR URL is printed in the Actions run log; the API does not wait for it.

## Tests

```bash
npm test
```

- `scripts/verify-crypto.mjs` seals a message, opens it with the recipient secret key, checks the base64 round trip, and asserts the workflow template kept its GitHub expressions.
- `scripts/verify-api.mjs` mocks the GitHub API, runs `onRequestPost` for setup and run, decrypts the `encrypted_value` that setup sends, checks the workflow PUT carries `sha` only when the file exists, checks the model input is forwarded when set and omitted when blank, rejects a malformed model, and checks that a GitHub `403` body reaches the client unchanged.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401 Bad credentials` | The token is wrong, expired, or revoked. |
| `403` on listing repositories | The token was not granted access to any repository, or Metadata is missing. |
| `403` on setup, step `write the GEMINI_API_KEY repository secret` | Secrets read/write is missing. |
| `403` on setup, step `write the workflow file` | Contents or Workflows read/write is missing. |
| `403` on run, step `dispatch the workflow` | Actions read/write is missing. |
| `404` on run | The workflow file is not on the default branch, or the token cannot read Actions. |
| `422` on setup | The workflow file changed on GitHub between the read and the write. Run Setup repo again. |
| `Gemini CLI is not running in a trusted directory` in the run log | The installed workflow predates the `GEMINI_CLI_TRUST_WORKSPACE` job env. Run Setup repo again, or add that env var to the job by hand. |
| `503 ... This model is currently experiencing high demand` after 10 retries | Google's side is out of capacity. The CLI already retried for about five minutes. Re-run the workflow; the template already uses `gemini-3.5-flash-lite` for this reason. |

## Project layout

```
.github/workflows/deploy.yml  Builds and deploys this project to Cloudflare Pages
functions/
  api/
    _crypto.js        LibSodium sealed box (not routed)
    _lib/http.js      GitHub fetch, errors, base64 helpers (not routed)
    _lib/workflow.js  Workflow template (not routed)
    repos.js          POST /api/repos
    setup.js          POST /api/setup
    run.js            POST /api/run
public/
  _routes.json        Limits Function invocation to /api/*
src/
  App.jsx             Form state and request handling
  api.js              fetch wrapper and error details
  components/         Credentials, Repository, Prompt, Permissions, Status
  styles.css
scripts/              Crypto and API verification
wrangler.toml         Pages project config
```

Files and directories under `functions/` that start with an underscore are not routed by Pages. `GET /api/_crypto` falls back to the SPA, which is the expected behavior.

## Notes

- This is v1: there is no run status polling. The UI reports the dispatch result and links to the Actions tab.
- The workflow commits to a new branch and opens a pull request; it never pushes to the branch it was dispatched on.
- The GitHub token is scoped to whatever the user grants it. The app asks for the five permissions above and nothing else.
- The frontend sends credentials over the same origin, so a deployed instance needs HTTPS, which Cloudflare Pages provides by default.