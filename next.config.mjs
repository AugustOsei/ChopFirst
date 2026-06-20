// Stamp every build with an id so the client can tell when it's running stale,
// pre-deploy code. On Vercel the commit sha changes per deploy; locally a
// build timestamp does. NEXT_PUBLIC_ is inlined into both the browser bundle
// and the server, so /api/version reports the *live* deployment's id while a
// stale tab still carries the id it was served with — a mismatch means refresh.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
};

export default nextConfig;
