// ─── GitHub API Service ──────────────────────────────────────────────────────
// All notes are stored in a single `notes.json` file inside a private repo
// called `second-brain-notes` on the user's GitHub account.
//
// File structure in the repo:
//   notes.json   → { notes: [...], updatedAt: "ISO" }

const BASE        = 'https://api.github.com';
export const REPO = 'second-brain-notes';

// ── Low-level request helper ─────────────────────────────────────────────────
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
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

// ── Encode / Decode helpers ───────────────────────────────────────────────────
export function encodeContent(obj) {
  // JSON → base64 (handles Unicode)
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
}

export function decodeContent(base64) {
  // base64 → JSON
  return JSON.parse(decodeURIComponent(escape(atob(base64.replace(/\n/g, '')))));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the authenticated GitHub user.
 */
export async function getUser(token) {
  return ghFetch(token, '/user');
}

/**
 * Check whether the notes repo already exists.
 * Returns the repo object or null.
 */
export async function getNotesRepo(token, owner) {
  try {
    return await ghFetch(token, `/repos/${owner}/${REPO}`);
  } catch {
    return null;
  }
}

/**
 * Create the private notes repo (with a README so it has a default branch).
 */
export async function createNotesRepo(token) {
  return ghFetch(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: REPO,
      private: true,
      description: 'My Second Brain — personal knowledge base',
      auto_init: true,
    }),
  });
}

/**
 * Load notes.json from the repo.
 * Returns { notes, sha } or null if the file doesn't exist yet.
 */
export async function loadNotes(token, owner) {
  try {
    const data = await ghFetch(token, `/repos/${owner}/${REPO}/contents/notes.json`);
    const parsed = decodeContent(data.content);
    return { notes: parsed.notes || [], sha: data.sha };
  } catch {
    return null; // File doesn't exist yet — first time
  }
}

/**
 * Save notes.json to the repo.
 * Pass sha=null to create, or the existing sha to update.
 * Returns the new sha.
 */
export async function saveNotes(token, owner, notes, sha = null) {
  const body = {
    message: sha ? 'Update notes' : 'Create notes',
    content: encodeContent({ notes, updatedAt: new Date().toISOString() }),
  };
  if (sha) body.sha = sha;

  const res = await ghFetch(token, `/repos/${owner}/${REPO}/contents/notes.json`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  return res.content.sha; // return the new SHA
}

/**
 * Full initialisation flow:
 *  1. Get user
 *  2. Ensure repo exists (create if not)
 *  3. Load notes.json (create if not)
 * Returns { user, notes, sha }
 */
export async function initGitHub(token) {
  const user = await getUser(token);
  const owner = user.login;

  let repo = await getNotesRepo(token, owner);
  if (!repo) {
    repo = await createNotesRepo(token);
    // Give GitHub a moment to initialise the repo
    await new Promise(r => setTimeout(r, 1500));
  }

  const existing = await loadNotes(token, owner);
  if (existing) {
    return { user, notes: existing.notes, sha: existing.sha };
  }

  // First run — bootstrap with an empty array (caller will add today's daily note)
  const newSha = await saveNotes(token, owner, []);
  return { user, notes: [], sha: newSha };
}
