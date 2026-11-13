import { fail, githubFailure, githubFetch, json, readJson, requireToken } from './_lib/http.js';

const PER_PAGE = 100;
const MAX_PAGES = 5;

async function listRepos(token) {
  const repos = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = [
      `per_page=${PER_PAGE}`,
      `page=${page}`,
      'affiliation=owner,collaborator,organization_member',
      'sort=updated',
      'direction=desc',
    ].join('&');

    const response = await githubFetch(token, `/user/repos?${query}`);
    if (!response.ok) return githubFailure('list your repositories', response);

    const batch = await response.json();
    if (!Array.isArray(batch)) return fail('GitHub returned an unexpected repository payload.', 502);

    for (const repo of batch) {
      repos.push({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner?.login ?? '',
        private: repo.private === true,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        archived: repo.archived === true,
      });
    }

    if (batch.length < PER_PAGE) break;
  }

  return json({ ok: true, repos });
}

export async function onRequestGet(context) {
  // The UI uses POST so the token never travels in a URL. GET with a header is
  // supported for direct API use.
  const token = requireToken(context.request.headers.get('x-github-token'));
  if (!token) return fail('Missing x-github-token header.', 400);
  return listRepos(token);
}

export async function onRequestPost(context) {
  const body = await readJson(context.request);
  if (!body) return fail('Expected a JSON body with { userToken }.', 400);

  const token = requireToken(body.userToken);
  if (!token) return fail('Missing GitHub token.', 400);

  return listRepos(token);
}

export async function onRequest(context) {
  return fail('Use POST with a JSON body, or GET with an x-github-token header.', 405);
}