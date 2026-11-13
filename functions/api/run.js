import {
  fail,
  githubFailure,
  githubFetch,
  json,
  parseRepoSlug,
  readJson,
  requireToken,
} from './_lib/http.js';
import { WORKFLOW_PATH } from './_lib/workflow.js';

const WORKFLOW_FILE = 'jules-web-agent.yml';
const MAX_PROMPT_LENGTH = 100_000;

export async function onRequestPost(context) {
  const body = await readJson(context.request);
  if (!body) return fail('Expected a JSON body with { repo, prompt, userToken }.', 400);

  const slug = parseRepoSlug(body.repo);
  if (!slug) return fail('repo must use the "owner/name" form.', 400);

  const token = requireToken(body.userToken);
  if (!token) return fail('Missing GitHub token.', 400);

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return fail('Prompt must not be empty.', 400);
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return fail(`Prompt is limited to ${MAX_PROMPT_LENGTH} characters.`, 400);
  }

  const repoPath = `/repos/${slug.owner}/${slug.name}`;
  const repoResponse = await githubFetch(token, repoPath);
  if (!repoResponse.ok) return githubFailure('read repository metadata', repoResponse);
  const repo = await repoResponse.json();
  const ref = repo.default_branch;
  if (!ref) return fail('GitHub did not report a default branch for this repository.', 502);

  const dispatchResponse = await githubFetch(
    token,
    `${repoPath}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    { method: 'POST', body: { ref, inputs: { user_prompt: prompt } } },
  );

  // workflow_dispatch answers 204 No Content on success. A 200 is accepted too,
  // because some GitHub Enterprise versions answer with a body.
  if (dispatchResponse.status === 204 || dispatchResponse.ok) {
    return json({ ok: true, repo: `${slug.owner}/${slug.name}`, ref, workflowPath: WORKFLOW_PATH });
  }

  return githubFailure('dispatch the workflow', dispatchResponse);
}