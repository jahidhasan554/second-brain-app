const BASE = 'https://api.github.com';
export const REPO = 'second-brain-notes';

async function ghFetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub ${res.status}`);
  return data;
}

export function encodeB64(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
}
export function decodeB64(b64) {
  return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
}

export async function getUser(token) {
  return ghFetch(token, '/user');
}

export async function loadNotes(token, owner) {
  try {
    const d = await ghFetch(token, `/repos/${owner}/${REPO}/contents/notes.json`);
    const p = decodeB64(d.content);
    return { notes: p.notes || [], folders: p.folders || [], sha: d.sha };
  } catch { return null; }
}

export async function saveNotes(token, owner, notes, folders = []) {
  let sha = null;
  try {
    const d = await ghFetch(token, `/repos/${owner}/${REPO}/contents/notes.json`);
    sha = d.sha;
  } catch {}
  const body = {
    message: sha ? 'Update notes' : 'Create notes',
    content: encodeB64({ notes, folders, updatedAt: new Date().toISOString() }),
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(token, `/repos/${owner}/${REPO}/contents/notes.json`, {
    method: 'PUT', body: JSON.stringify(body),
  });
  return res.content.sha;
}

export async function initGitHub(token) {
  const user = await getUser(token);
  const owner = user.login;
  try { await ghFetch(token, `/repos/${owner}/${REPO}`); }
  catch {
    await ghFetch(token, '/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: REPO, private: true, description: 'My Second Brain notes', auto_init: true }),
    });
    await new Promise(r => setTimeout(r, 1500));
  }
  const existing = await loadNotes(token, owner);
  if (existing) return { user, notes: existing.notes, folders: existing.folders };
  await saveNotes(token, owner, [], []);
  return { user, notes: [], folders: [] };
}
