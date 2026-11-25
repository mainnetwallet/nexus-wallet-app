const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const coreIndex = path.resolve(workspaceRoot, 'core/src/index.ts');

/**
 * Monorepo resolver:
 * - `@nexus/core` maps to TS sources so no prebuild is needed for Metro;
 * - core uses Node-style `./x.js` specifiers, retried as `.ts`/`.tsx`.
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
    resolveRequest(context, moduleName, platform) {
      if (moduleName === '@nexus/core') {
        return { type: 'sourceFile', filePath: coreIndex };
      }
      if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
        try {
          return context.resolveRequest(context, moduleName.slice(0, -3), platform);
        } catch {
          /* fall through to default */
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
