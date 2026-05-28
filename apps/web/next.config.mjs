/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspaces ship raw TS; let Next transpile them.
  transpilePackages: ['@ces/domain'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
