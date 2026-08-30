const path = require('path');

function createE2EResolveRequest(projectRoot) {
  return (context, moduleName, platform) => {
    if (
      moduleName.endsWith('/firebaseAuth')
      && context.originModulePath.includes(`${path.sep}src${path.sep}`)
    ) {
      return {
        type: 'sourceFile',
        filePath: path.join(projectRoot, 'tests/e2e/firebaseAuth.ts'),
      };
    }

    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = {
  createE2EResolveRequest,
};
