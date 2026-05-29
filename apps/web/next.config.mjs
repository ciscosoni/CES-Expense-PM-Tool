/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspaces ship raw TS; let Next transpile them.
  transpilePackages: ['@ces/domain'],
  // Self-contained runtime — produces .next/standalone with a node server
  // entry that bundles only the deps Next traced as reachable. The production
  // Dockerfile copies that folder; without standalone output the image would
  // need the entire monorepo.
  output: 'standalone',
  // Workspace-root tracing — required for pnpm monorepo standalone output to
  // include the shared packages/ symlinks correctly.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
