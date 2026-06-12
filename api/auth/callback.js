// api/auth/callback.js
// Exchanges the OAuth code for an access token, then redirects back to the app.
// Required env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL

export default async function handler(req, res) {
  const { code, error } = req.query;
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = process.env;

  if (error) {
    return res.redirect(`${APP_URL}/?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id:     GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const data = await tokenRes.json();

    if (data.error) {
      return res.redirect(`${APP_URL}/?auth_error=${encodeURIComponent(data.error_description || data.error)}`);
    }

    // Pass the token back to the frontend via the URL hash
    // (hash is never sent to servers — more secure than query param)
    res.redirect(302, `${APP_URL}/#token=${data.access_token}`);
  } catch (err) {
    res.redirect(`${APP_URL}/?auth_error=${encodeURIComponent('Failed to exchange token')}`);
  }
}
