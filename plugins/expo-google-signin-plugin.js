const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const GOOGLE_SIGNIN_PACKAGE = 'vip.pawify.googlesignin.GoogleAccountPackage';
const LEGACY_GOOGLE_SIGNIN_DEPENDENCY_PATTERN =
    /\n\s*implementation ['"]com\.google\.android\.gms:play-services-auth:[^'"]+['"]/g;
const GOOGLE_SIGNIN_DEPENDENCIES = [
    "implementation 'androidx.credentials:credentials:1.6.0'",
    "implementation 'androidx.credentials:credentials-play-services-auth:1.6.0'",
    "implementation 'com.google.android.libraries.identity.googleid:googleid:1.2.0'",
];

function copyTemplateFiles(projectRoot) {
    const templateDir = path.join(projectRoot, 'plugins', 'android-template');
    const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'vip', 'pawify', 'googlesignin');

    fs.mkdirSync(destDir, { recursive: true });

    for (const fileName of fs.readdirSync(templateDir)) {
        fs.copyFileSync(
            path.join(templateDir, fileName),
            path.join(destDir, fileName),
        );
    }
}

function insertImport(source) {
    if (source.includes(GOOGLE_SIGNIN_PACKAGE)) {
        return source;
    }

    const importMarkers = [
        'import expo.modules.ExpoReactHostFactory',
        'import expo.modules.ReactNativeHostWrapper',
        'import expo.modules.ApplicationLifecycleDispatcher',
    ];

    for (const marker of importMarkers) {
        if (source.includes(marker)) {
            return source.replace(marker, `${marker}\nimport ${GOOGLE_SIGNIN_PACKAGE}`);
        }
    }

    return source.replace(
        /(import [^\n]+\n)(?!import)/,
        `$1import ${GOOGLE_SIGNIN_PACKAGE}\n`,
    );
}

function insertPackageRegistration(source) {
    if (source.includes('GoogleAccountPackage()')) {
        return source;
    }

    if (source.includes('// add(MyReactNativePackage())')) {
        return source.replace(
            '// add(MyReactNativePackage())',
            '// add(MyReactNativePackage())\n          add(GoogleAccountPackage())',
        );
    }

    if (source.includes('// packages.add(MyReactNativePackage())')) {
        return source.replace(
            '// packages.add(MyReactNativePackage())',
            '// packages.add(MyReactNativePackage())\n            packages.add(GoogleAccountPackage())',
        );
    }

    if (source.includes('PackageList(this).packages.apply {')) {
        return source.replace(
            'PackageList(this).packages.apply {',
            'PackageList(this).packages.apply {\n          add(GoogleAccountPackage())',
        );
    }

    return source.replace(
        /(\s*)return packages/,
        '$1packages.add(GoogleAccountPackage())\n$1return packages',
    );
}

function findGeneratedMainApplication(projectRoot) {
    const javaRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java');
    if (!fs.existsSync(javaRoot)) {
        return null;
    }

    const pending = [javaRoot];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                pending.push(entryPath);
            } else if (entry.name === 'MainApplication.kt') {
                return entryPath;
            }
        }
    }

    return null;
}

function getMainApplicationPath(projectRoot, androidPackage) {
    const packagePath = String(androidPackage || 'vip.chi_chi.pawify')
        .split('.')
        .filter(Boolean);
    const expectedPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packagePath,
        'MainApplication.kt',
    );

    if (fs.existsSync(expectedPath)) {
        return expectedPath;
    }

    const generatedPath = findGeneratedMainApplication(projectRoot);
    if (generatedPath) {
        return generatedPath;
    }

    return expectedPath;
}

function patchMainApplication(projectRoot, androidPackage) {
    const mainAppPath = getMainApplicationPath(projectRoot, androidPackage);
    const mainApplication = fs.readFileSync(mainAppPath, 'utf8');
    const patched = insertPackageRegistration(insertImport(mainApplication));

    fs.writeFileSync(mainAppPath, patched, 'utf8');
}

function withGoogleSignin(config) {
    config = withAppBuildGradle(config, config => {
        config.modResults.contents = config.modResults.contents.replace(
            LEGACY_GOOGLE_SIGNIN_DEPENDENCY_PATTERN,
            '',
        );

        const missingDependencies = GOOGLE_SIGNIN_DEPENDENCIES.filter(dependency => {
            const coordinate = dependency.match(/['"]([^:'"]+:[^:'"]+):/)?.[1];
            return coordinate && !config.modResults.contents.includes(coordinate);
        });

        if (missingDependencies.length > 0) {
            config.modResults.contents = config.modResults.contents.replace(
                /dependencies\s*\{/,
                match => `${match}\n    ${missingDependencies.join('\n    ')}`,
            );
        }

        return config;
    });

    return withDangerousMod(config, [
        'android',
        config => {
            const projectRoot = config.modRequest.projectRoot;
            copyTemplateFiles(projectRoot);
            patchMainApplication(projectRoot, config.android?.package);

            return config;
        },
    ]);
}

module.exports = withGoogleSignin;
module.exports.plugin = withGoogleSignin;
