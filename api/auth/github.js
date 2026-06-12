// api/auth/github.js
// Redirects the user to GitHub OAuth consent screen.
// Required env vars: GITHUB_CLIENT_ID, APP_URL

export default function handler(req, res) {
  const { GITHUB_CLIENT_ID, APP_URL } = process.env;

  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' });
  }

  const params = new URLSearchParams({
    client_id:    GITHUB_CLIENT_ID,
    scope:        'repo',                      // private repo access
    redirect_uri: `${APP_URL}/api/auth/callback`,
    state:        Math.random().toString(36).slice(2), // CSRF token (basic)
  });

  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
