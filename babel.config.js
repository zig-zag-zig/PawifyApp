const { loadAppEnv } = require('./scripts/load-env.cjs');

module.exports = function(api) {
  api.cache(false);
  loadAppEnv({ projectRoot: __dirname, silent: true, override: true });

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin',
    ],
  };
};
