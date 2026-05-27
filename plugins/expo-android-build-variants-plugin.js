const { withAppBuildGradle } = require('expo/config-plugins');

function getOptionalEnvValue(name) {
    const value = process.env[name]?.trim();
    return value || null;
}

function removeBuildTypeProperty(source, buildType, propertyName) {
    const buildTypePattern = new RegExp(`(\\n\\s*${buildType}\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`);

    if (!buildTypePattern.test(source)) {
        throw new Error(`Unable to find Android ${buildType} buildType`);
    }

    const propertyPattern = new RegExp(`\\n\\s*${propertyName}\\s*(?:=\\s*)?["'][^"']*["']\\s*`, 'm');
    return source.replace(buildTypePattern, (match, start, body, end) => {
        return `${start}${body.replace(propertyPattern, '')}${end}`;
    });
}

function upsertBuildTypeProperty(source, buildType, propertyName, propertyValue) {
    const buildTypePattern = new RegExp(`(\\n\\s*${buildType}\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`);

    if (!buildTypePattern.test(source)) {
        throw new Error(`Unable to find Android ${buildType} buildType`);
    }

    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?["'][^"']*["']\\s*$`, 'm');
    const propertyLine = `            ${propertyName} = "${propertyValue}"`;

    return source.replace(buildTypePattern, (match, start, body, end) => {
        if (propertyPattern.test(body)) {
            return `${start}${body.replace(propertyPattern, propertyLine)}${end}`;
        }

        return `${start}${body.replace(/\s*$/, '')}\n${propertyLine}${end}`;
    });
}

function upsertBuildTypeRawProperty(source, buildType, propertyName, propertyValue) {
    const buildTypePattern = new RegExp(`(\\n\\s*${buildType}\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`);

    if (!buildTypePattern.test(source)) {
        throw new Error(`Unable to find Android ${buildType} buildType`);
    }

    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?.*$`, 'm');
    const propertyLine = `            ${propertyName} = ${propertyValue}`;

    return source.replace(buildTypePattern, (match, start, body, end) => {
        if (propertyPattern.test(body)) {
            return `${start}${body.replace(propertyPattern, propertyLine)}${end}`;
        }

        return `${start}${body.replace(/\s*$/, '')}\n${propertyLine}${end}`;
    });
}

function withAndroidBuildVariants(config) {
    return withAppBuildGradle(config, config => {
        let contents = config.modResults.contents;
        const debugApplicationIdSuffix = getOptionalEnvValue('EXPO_ANDROID_DEBUG_APPLICATION_ID_SUFFIX');
        const debugVersionNameSuffix = getOptionalEnvValue('EXPO_ANDROID_DEBUG_VERSION_NAME_SUFFIX');

        contents = upsertBuildTypeRawProperty(contents, 'debug', 'signingConfig', 'signingConfigs.debug');
        contents = debugApplicationIdSuffix
            ? upsertBuildTypeProperty(contents, 'debug', 'applicationIdSuffix', debugApplicationIdSuffix)
            : removeBuildTypeProperty(contents, 'debug', 'applicationIdSuffix');
        contents = debugVersionNameSuffix
            ? upsertBuildTypeProperty(contents, 'debug', 'versionNameSuffix', debugVersionNameSuffix)
            : removeBuildTypeProperty(contents, 'debug', 'versionNameSuffix');

        config.modResults.contents = contents;
        return config;
    });
}

module.exports = withAndroidBuildVariants;
module.exports.plugin = withAndroidBuildVariants;
