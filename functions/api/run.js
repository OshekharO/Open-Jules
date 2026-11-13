import {
  fail,
  githubFailure,
  githubFetch,
  json,
  parseRepoSlug,
  readJson,
  requireToken,
} from './_lib/http.js';
import { DEFAULT_GEMINI_MODEL, WORKFLOW_PATH } from './_lib/workflow.js';

const WORKFLOW_FILE = 'jules-web-agent.yml';
const MAX_PROMPT_LENGTH = 100_000;
const MAX_MODEL_LENGTH = 100;
const MODEL_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_BRANCH_LENGTH = 255;
const BRANCH_PATTERN = /^(?!-)[A-Za-z0-9._/-]+$/;

export async function onRequestPost(context) {
  const body = await readJson(context.request);
  if (!body) {
    return fail('Expected a JSON body with { repo, prompt, userToken, model?, branch? }.', 400);
  }

  const slug = parseRepoSlug(body.repo);
  if (!slug) return fail('repo must use the "owner/name" form.', 400);

  const token = requireToken(body.userToken);
  if (!token) return fail('Missing GitHub token.', 400);

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return fail('Prompt must not be empty.', 400);
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return fail(`Prompt is limited to ${MAX_PROMPT_LENGTH} characters.`, 400);
  }

  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (model.length > MAX_MODEL_LENGTH) {
    return fail(`Model is limited to ${MAX_MODEL_LENGTH} characters.`, 400);
  }
  if (model && !MODEL_PATTERN.test(model)) {
    return fail('Model must use only letters, digits, dots, colons, hyphens, or underscores.', 400);
  }

  const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
  if (branch.startsWith('refs/')) {
    return fail('Branch must be a branch name, not a full ref.', 400);
  }
  if (branch.length > MAX_BRANCH_LENGTH) {
    return fail(`Branch is limited to ${MAX_BRANCH_LENGTH} characters.`, 400);
  }
  if (branch && (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.endsWith('/'))) {
    return fail('Branch must use only letters, digits, dots, slashes, hyphens, or underscores.', 400);
  }

  const repoPath = `/repos/${slug.owner}/${slug.name}`;
  const repoResponse = await githubFetch(token, repoPath);
  if (!repoResponse.ok) return githubFailure('read repository metadata', repoResponse);
  const repo = await repoResponse.json();
  const ref = repo.default_branch;
  if (!ref) return fail('GitHub did not report a default branch for this repository.', 502);
  if (branch && branch === ref) {
    return fail('Branch must differ from the default branch.', 400);
  }

  // Omit inputs when blank so the workflow defaults apply.
  const inputs = { user_prompt: prompt };
  if (model) inputs.gemini_model = model;
  if (branch) inputs.branch = branch;

  const dispatchResponse = await githubFetch(
    token,
    `${repoPath}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    { method: 'POST', body: { ref, inputs } },
  );

  // workflow_dispatch answers 204 No Content on success. A 200 is accepted too,
  // because some GitHub Enterprise versions answer with a body.
  if (dispatchResponse.status === 204 || dispatchResponse.ok) {
    return json({
      ok: true,
      repo: `${slug.owner}/${slug.name}`,
      ref,
      model: model || DEFAULT_GEMINI_MODEL,
      branch: branch || null,
      workflowPath: WORKFLOW_PATH,
    });
  }

  return githubFailure('dispatch the workflow', dispatchResponse);
}