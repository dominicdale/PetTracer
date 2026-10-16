import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks, issuer;
export async function onRequest({ request, env, next }) {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return Response.json({ error: 'Shared archive is not configured. Use the local archive or configure Cloudflare Access.' }, { status: 503 });
  const expectedIssuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) return new Response('Invalid Access configuration', { status: 503 });
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return new Response('Sign in through Cloudflare Access.', { status: 401 });
  try {
    if (!jwks || issuer !== expectedIssuer) {
      issuer = expectedIssuer;
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    }
    await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'] });
  } catch {
    return new Response('Authentication failed.', { status: 401 });
  }
  if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 });
  if (!env.DB) return new Response('Archive database is not configured.', { status: 503 });
  const response = await next();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
