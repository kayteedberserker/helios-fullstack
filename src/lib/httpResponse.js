export async function readApiJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The API returned a page instead of JSON. Check the Vercel API deployment and /api routing.');
  }
  try { return await response.json(); }
  catch { throw new Error('The API returned an unreadable response. Check the API runtime logs and try again.'); }
}
