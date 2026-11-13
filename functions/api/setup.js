import { cryptoBoxSeal } from './_crypto.js';
import {
  base64ToBytes,
  bytesToBase64,
  fail,
  githubFailure,
  githubFetch,
  json,
  parseRepoSlug,
  readJson,
  requireToken,
  textToBase64,
} from './_lib/http.js';
import { WORKFLOW_PATH, WORKFLOW_YAML } from './_lib/workflow.js';

const SECRET_NAME = 'GEMINI_API_KEY';

export async function onRequestPost(context) {
  const body = await readJson(context.request);
  if (!body) return fail('Expected a JSON body with { repo, userToken, geminiKey }.', 400);

  const slug = parseRepoSlug(body.repo);
  if (!slug) return fail('repo must use the "owner/name" form.', 400);

  const token = requireToken(body.userToken);
  if (!token) return fail('Missing GitHub token.', 400);

  const geminiKey = typeof body.geminiKey === 'string' ? body.geminiKey.trim() : '';
  if (!geminiKey) return fail('Missing Gemini API key.', 400);

  const repoPath = `/repos/${slug.owner}/${slug.name}`;

  // The workflow must live on the default branch for workflow_dispatch to work.
  const repoResponse = await githubFetch(token, repoPath);
  if (!repoResponse.ok) return githubFailure('read repository metadata', repoResponse);
  const repo = await repoResponse.json();
  const defaultBranch = repo.default_branch;
  if (!defaultBranch) return fail('GitHub did not report a default branch for this repository.', 502);

  // GitHub rejects plaintext secret values: fetch the repo key, seal the value, send it back.
  const publicKeyResponse = await githubFetch(token, `${repoPath}/actions/secrets/public-key`);
  if (!publicKeyResponse.ok) return githubFailure('fetch the repository Actions public key', publicKeyResponse);
  const publicKey = await publicKeyResponse.json();
  if (typeof publicKey.key !== 'string' || typeof publicKey.key_id !== 'string') {
    return fail('GitHub returned a malformed Actions public key.', 502);
  }

  const sealed = cryptoBoxSeal(new TextEncoder().encode(geminiKey), base64ToBytes(publicKey.key));
  const encryptedValue = bytesToBase64(sealed);

  const secretResponse = await githubFetch(token, `${repoPath}/actions/secrets/${SECRET_NAME}`, {
    method: 'PUT',
    body: { encrypted_value: encryptedValue, key_id: publicKey.key_id },
  });
  if (!secretResponse.ok) return githubFailure(`write the ${SECRET_NAME} repository secret`, secretResponse);
  const secretAction = secretResponse.status === 201 ? 'created' : 'updated';

  const workflowUrl = `${repoPath}/contents/${WORKFLOW_PATH}`;
  const fileResponse = await githubFetch(token, `${workflowUrl}?ref=${encodeURIComponent(defaultBranch)}`);
  let sha;
  if (fileResponse.status === 404) {
    sha = undefined;
  } else if (!fileResponse.ok) {
    return githubFailure('read the existing workflow file', fileResponse);
  } else {
    const file = await fileResponse.json();
    sha = typeof file.sha === 'string' ? file.sha : undefined;
  }

  const writeResponse = await githubFetch(token, workflowUrl, {
    method: 'PUT',
    body: {
      message: 'chore(jules-web): install Gemini CLI agent workflow',
      content: textToBase64(WORKFLOW_YAML),
      branch: defaultBranch,
      ...(sha ? { sha } : {}),
    },
  });
  if (!writeResponse.ok) return githubFailure('write the workflow file', writeResponse);

  return json({
    ok: true,
    repo: `${slug.owner}/${slug.name}`,
    defaultBranch,
    workflowPath: WORKFLOW_PATH,
    steps: {
      secret: secretAction,
      workflow: sha ? 'updated' : 'created',
    },
  });
}