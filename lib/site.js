// Canonical public origin, used for metadata, Open Graph image URLs, robots, and
// the sitemap. Override with NEXT_PUBLIC_SITE_URL once a custom domain (e.g.
// chopfirst.com) points at the app; defaults to the current Vercel deployment.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://chop-first.vercel.app").replace(/\/$/, "");
