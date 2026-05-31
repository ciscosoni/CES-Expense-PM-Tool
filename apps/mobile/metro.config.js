// Metro config for the pnpm monorepo. Teaches Metro to watch the workspace root
// and resolve both the app's and the hoisted root node_modules — without this,
// `expo export` / the bundler can't resolve workspace + symlinked deps.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpm symlinks the store; let Metro follow them. Keep hierarchical lookup ON
// so transitive deps resolve from the hoisted root node_modules too.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
