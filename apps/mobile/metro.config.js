// Monorepo Metro config: lets the mobile app resolve the shared @neato/core package
// (which lives at ../../packages/core) without npm workspaces. Watches the core
// package so edits hot-reload, and aliases the bare import to its source.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..", "..");
const corePath = path.resolve(monorepoRoot, "packages", "core");

const config = getDefaultConfig(projectRoot);

// Watch the shared package so changes to @neato/core hot-reload in the app.
config.watchFolders = [corePath];

// Resolve the bare "@neato/core" import to the package source.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@neato/core": path.resolve(corePath, "src"),
};

module.exports = config;
