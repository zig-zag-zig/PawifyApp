const { withGradleProperties, withSettingsGradle } = require('expo/config-plugins');

const GLOBAL_GRADLE_PROPERTY_KEYS = new Set([
    'org.gradle.jvmargs',
    'kotlin.daemon.jvmargs',
    'org.gradle.parallel',
    'org.gradle.workers.max',
]);
const REQUIRED_GRADLE_PROPERTIES = [
    {
        type: 'property',
        key: 'org.gradle.jvmargs',
        value: '-Xmx4g -XX:MaxMetaspaceSize=2g -Dfile.encoding=UTF-8',
    },
    {
        type: 'property',
        key: 'kotlin.daemon.jvmargs',
        value: '-Xmx2g -XX:MaxMetaspaceSize=1g -XX:ReservedCodeCacheSize=512m',
    },
    {
        type: 'property',
        key: 'org.gradle.workers.max',
        value: '1',
    },
];
const DEV_CLIENT_AUTOLINKING_BLOCK_START = '// @generated begin pawify-prod-dev-client-exclude';
const DEV_CLIENT_AUTOLINKING_BLOCK_END = '// @generated end pawify-prod-dev-client-exclude';
const DEV_CLIENT_AUTOLINKING_BLOCK = `${DEV_CLIENT_AUTOLINKING_BLOCK_START}
def pawifyAppEnv = System.getenv('APP_ENV') ?: System.getenv('NODE_ENV')
if (pawifyAppEnv == 'production') {
  def pawifyDevClientAutolinkingExcludes = [
    'expo-dev-client',
    'expo-dev-launcher',
    'expo-dev-menu',
    'expo-dev-menu-interface',
  ]
  expoAutolinking.exclude = ((expoAutolinking.exclude ?: []) + pawifyDevClientAutolinkingExcludes).unique()
}
${DEV_CLIENT_AUTOLINKING_BLOCK_END}`;

function withProductionDevClientAutolinkingExcludes(config) {
    return withSettingsGradle(config, config => {
        const generatedBlockPattern = new RegExp(
            `\\n?${DEV_CLIENT_AUTOLINKING_BLOCK_START}[\\s\\S]*?${DEV_CLIENT_AUTOLINKING_BLOCK_END}\\n?`,
            'g',
        );
        const contents = config.modResults.contents.replace(generatedBlockPattern, '\n');

        if (!contents.includes('expoAutolinking.useExpoModules()')) {
            config.modResults.contents = contents;
            return config;
        }

        config.modResults.contents = contents.replace(
            'expoAutolinking.useExpoModules()',
            `${DEV_CLIENT_AUTOLINKING_BLOCK}\nexpoAutolinking.useExpoModules()`,
        );

        return config;
    });
}

function withGradleJvm(config) {
    config = withGradleProperties(config, config => {
        const properties = config.modResults.filter(
            property => !GLOBAL_GRADLE_PROPERTY_KEYS.has(property.key),
        );

        config.modResults = [
            ...properties,
            ...REQUIRED_GRADLE_PROPERTIES,
        ];
        return config;
    });

    return withProductionDevClientAutolinkingExcludes(config);
}

module.exports = withGradleJvm;
module.exports.plugin = withGradleJvm;
