const { withAppBuildGradle } = require('expo/config-plugins');

function getOptionalEnvValue(name) {
    const value = process.env[name]?.trim();
    return value || null;
}

function replaceBuildType(source, buildType, updateBody) {
    const buildTypePattern = new RegExp(`(\\n\\s*buildTypes\\s*\\{[\\s\\S]*?\\n\\s*${buildType}\\s*\\{)([\\s\\S]*?)(\\n\\s*\\})`);

    if (!buildTypePattern.test(source)) {
        throw new Error(`Unable to find Android ${buildType} buildType`);
    }

    return source.replace(buildTypePattern, (match, start, body, end) => {
        const nextBody = updateBody(body);
        return `${start}${nextBody.startsWith('\n') || nextBody.length === 0 ? nextBody : `\n${nextBody}`}${end}`;
    });
}

function removeBuildTypeProperty(source, buildType, propertyName) {
    const propertyPattern = new RegExp(`\\n\\s*${propertyName}\\s*(?:=\\s*)?["'][^"']*["']\\s*`, 'm');
    return replaceBuildType(source, buildType, body => body.replace(propertyPattern, ''));
}

function upsertBuildTypeProperty(source, buildType, propertyName, propertyValue) {
    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?["'][^"']*["']\\s*$`, 'm');
    const propertyLine = `            ${propertyName} = "${propertyValue}"`;

    return replaceBuildType(source, buildType, body => {
        if (propertyPattern.test(body)) {
            return body.replace(propertyPattern, propertyLine);
        }

        return `${body.replace(/\s*$/, '')}\n${propertyLine}`;
    });
}

function upsertBuildTypeRawProperty(source, buildType, propertyName, propertyValue) {
    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?.*$`, 'm');
    const propertyLine = `            ${propertyName} = ${propertyValue}`;

    return replaceBuildType(source, buildType, body => {
        if (propertyPattern.test(body)) {
            return body.replace(propertyPattern, propertyLine);
        }

        return `${body.replace(/\s*$/, '')}\n${propertyLine}`;
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
