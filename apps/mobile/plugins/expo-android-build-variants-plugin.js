const { withAppBuildGradle } = require('expo/config-plugins');

function getOptionalEnvValue(name) {
    const value = process.env[name]?.trim();
    return value || null;
}

function findBlock(source, blockName, startIndex = 0, endIndex = source.length) {
    const blockPattern = new RegExp(`\\b${blockName}\\s*\\{`, 'g');
    blockPattern.lastIndex = startIndex;
    const match = blockPattern.exec(source);
    if (!match || match.index >= endIndex) {
        throw new Error(`Unable to find Android ${blockName} block`);
    }

    const openBrace = source.indexOf('{', match.index);
    let depth = 0;
    for (let index = openBrace; index < endIndex; index += 1) {
        if (source[index] === '{') {
            depth += 1;
        } else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) {
                return { openBrace, closeBrace: index };
            }
        }
    }

    throw new Error(`Unable to find end of Android ${blockName} block`);
}

function replaceBuildType(source, buildType, updateBody) {
    const buildTypesBlock = findBlock(source, 'buildTypes');
    const buildTypeBlock = findBlock(
        source,
        buildType,
        buildTypesBlock.openBrace + 1,
        buildTypesBlock.closeBrace,
    );
    const body = source.slice(buildTypeBlock.openBrace + 1, buildTypeBlock.closeBrace);
    const nextBody = updateBody(body);
    const normalizedBody = nextBody.startsWith('\n') || nextBody.length === 0
        ? nextBody
        : `\n${nextBody}`;

    return `${source.slice(0, buildTypeBlock.openBrace + 1)}${normalizedBody}${source.slice(buildTypeBlock.closeBrace)}`;
}

function removeBuildTypeProperty(source, buildType, propertyName) {
    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?["'][^"']*["']\\s*\\n?`, 'm');
    return replaceBuildType(source, buildType, body => body.replace(propertyPattern, ''));
}

function upsertBuildTypeProperty(source, buildType, propertyName, propertyValue) {
    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?["'][^"']*["']\\s*$`, 'm');
    const propertyLine = `            ${propertyName} = "${propertyValue}"`;

    return replaceBuildType(source, buildType, body => appendBuildTypeProperty(
        body.replace(propertyPattern, ''),
        propertyLine,
    ));
}

function upsertBuildTypeRawProperty(source, buildType, propertyName, propertyValue) {
    const propertyPattern = new RegExp(`^\\s*${propertyName}\\s*(?:=\\s*)?.*$`, 'm');
    const propertyLine = `            ${propertyName} = ${propertyValue}`;

    return replaceBuildType(source, buildType, body => appendBuildTypeProperty(
        body.replace(propertyPattern, ''),
        propertyLine,
    ));
}

function appendBuildTypeProperty(body, propertyLine) {
    const trailingWhitespace = body.match(/\s*$/)?.[0] ?? '';
    const closeIndentation = trailingWhitespace.includes('\n') ? trailingWhitespace : '\n';
    return `${body.replace(/\s*$/, '')}\n${propertyLine}${closeIndentation}`;
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
