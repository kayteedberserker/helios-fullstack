import { demoRequest } from './demo.js';
import { readApiJson } from './httpResponse.js';
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE !== 'false';
const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
let csrf = '';
export async function api(path, { method = 'GET', body, signal } = {}) {
  let data;
  if (IS_DEMO) data = await demoRequest(path, { method, body });
  else {
    const response = await fetch(`${baseUrl}${path}`, { method, signal, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Helios-Client': '1', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    data = await readApiJson(response);
    if (!response.ok) {
      const error = new Error(data.message || 'The request could not be completed.'); error.status = response.status;
      if (response.status === 401 && !path.includes('/login')) window.dispatchEvent(new Event('helios:unauthorized'));
      throw error;
    }
  }
  if (data?.csrf) csrf = data.csrf;
  return data;
}
