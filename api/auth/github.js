export default function handler(req, res) {
  const { GITHUB_CLIENT_ID, APP_URL } = process.env;
  if (!GITHUB_CLIENT_ID) return res.status(500).send('GITHUB_CLIENT_ID not set');
  const p = new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: 'repo', redirect_uri: APP_URL + '/api/auth/callback' });
  res.redirect(302, 'https://github.com/login/oauth/authorize?' + p);
}
