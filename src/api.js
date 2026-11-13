const NETWORK_ERROR =
  'Could not reach the Jules Web API. Check that the Pages Functions are running.';

export async function postJson(path, payload) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data || data.ok === false) {
    const error = new Error(
      (data && data.error) || `Request failed with status ${response.status}.`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function errorDetails(error) {
  const data = error && error.data;
  return {
    message: (data && data.error) || (error && error.message) || 'Request failed.',
    step: data && typeof data.step === 'string' ? data.step : '',
    githubStatus: data && data.githubStatus ? data.githubStatus : null,
    githubMessage: data && data.githubMessage ? data.githubMessage : '',
    githubBody: data && data.githubBody ? data.githubBody : '',
  };
}