export default async function handler(req, res) {
  const { code, error } = req.query;
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = process.env;
  if (error) return res.redirect(APP_URL + '/?auth_error=' + encodeURIComponent(error));
  if (!code)  return res.status(400).send('Missing code');
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });
    const data = await r.json();
    if (data.error) return res.redirect(APP_URL + '/?auth_error=' + encodeURIComponent(data.error));
    res.redirect(302, APP_URL + '/#token=' + data.access_token);
  } catch { res.redirect(APP_URL + '/?auth_error=exchange_failed'); }
}
