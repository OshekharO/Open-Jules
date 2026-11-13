import {
  fail,
  githubFailure,
  githubFetch,
  json,
  parseRepoSlug,
  readJson,
  requireToken,
} from './_lib/http.js';

const WORKFLOW_FILE = 'jules-web-agent.yml';
const RUNS_PER_PAGE = 30;
const MAX_BRANCH_LENGTH = 255;
// GitHub and the Pages host do not share a clock, so accept runs created just
// before the dispatch timestamp as well.
const CLOCK_SKEW_MS = 30_000;

export async function onRequestPost(context) {
  const body = await readJson(context.request);
  if (!body) {
    return fail('Expected a JSON body with { repo, userToken, since?, runId?, branch? }.', 400);
  }

  const slug = parseRepoSlug(body.repo);
  if (!slug) return fail('repo must use the "owner/name" form.', 400);

  const token = requireToken(body.userToken);
  if (!token) return fail('Missing GitHub token.', 400);

  const runId = readRunId(body.runId);
  if (runId === false) return fail('runId must be a positive integer.', 400);

  const since = typeof body.since === 'string' ? body.since.trim() : '';
  if (runId === null && !since) return fail('Provide runId or since.', 400);
  if (runId === null && Number.isNaN(Date.parse(since))) {
    return fail('since must be an ISO timestamp.', 400);
  }

  const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
  if (branch.length > MAX_BRANCH_LENGTH) {
    return fail(`branch is limited to ${MAX_BRANCH_LENGTH} characters.`, 400);
  }

  const repoPath = `/repos/${slug.owner}/${slug.name}`;

  if (runId !== null) {
    const response = await githubFetch(token, `${repoPath}/actions/runs/${runId}`);
    if (!response.ok) return githubFailure('read the workflow run', response);
    return json({ ok: true, run: mapRun(await response.json()) });
  }

  const query = new URLSearchParams({
    per_page: String(RUNS_PER_PAGE),
    event: 'workflow_dispatch',
  });
  if (branch) query.set('branch', branch);

  const response = await githubFetch(
    token,
    `${repoPath}/actions/workflows/${WORKFLOW_FILE}/runs?${query}`,
  );
  if (!response.ok) return githubFailure('list workflow runs', response);

  const data = await response.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  const sinceMs = Date.parse(since) - CLOCK_SKEW_MS;
  const match = runs.find(
    (run) =>
      Date.parse(run.created_at) >= sinceMs && (!branch || run.head_branch === branch),
  );

  return json({ ok: true, run: match ? mapRun(match) : null });
}

/** null when absent, false when present but unusable. */
function readRunId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return false;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : false;
}

function mapRun(run) {
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    headBranch: run.head_branch,
    displayName: run.display_title,
    htmlUrl: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}