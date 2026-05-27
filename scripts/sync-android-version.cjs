#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const appJsonPath = path.join(projectRoot, 'app.json');
const androidRootBuildGradlePath = path.join(projectRoot, 'android', 'build.gradle');
const androidBuildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');

function fail(message) {
  console.error(`[android-version] ${message}`);
  process.exit(1);
}

function readAppConfig() {
  try {
    return JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  } catch (error) {
    fail(`Failed to read app.json: ${error.message}`);
  }
}

function validateVersion(version) {
  if (typeof version !== 'string' || version.trim().length === 0) {
    fail('expo.version must be set in app.json');
  }

  const trimmed = version.trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed)) {
    fail(`expo.version must look like 1.0.0, got "${version}"`);
  }

  return trimmed;
}

function validateVersionCode(versionCode) {
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    fail('expo.android.versionCode must be a positive integer in app.json');
  }

  return versionCode;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    fail(`Could not find ${label} in android/app/build.gradle`);
  }

  return source.replace(pattern, replacement);
}

function patchRootBuildGradle() {
  if (!fs.existsSync(androidRootBuildGradlePath)) {
    fail('android/build.gradle does not exist. Run `npx expo prebuild --platform android` first.');
  }

  let buildGradle = fs.readFileSync(androidRootBuildGradlePath, 'utf8');
  buildGradle = buildGradle
    .replace(/url\(reactNativeAndroidDir\)/g, 'url = reactNativeAndroidDir')
    .replace(/maven \{ url ['"]https:\/\/www\.jitpack\.io['"] \}/g, "maven { url = uri('https://www.jitpack.io') }");

  fs.writeFileSync(androidRootBuildGradlePath, buildGradle, 'utf8');
}

function insertAfter(source, marker, insertion, label) {
  if (source.includes(insertion.trim())) {
    return source;
  }

  const index = source.indexOf(marker);
  if (index === -1) {
    fail(`Could not find ${label} in android/app/build.gradle`);
  }

  return `${source.slice(0, index + marker.length)}${insertion}${source.slice(index + marker.length)}`;
}

function patchAppBuildGradle(source) {
  const signingHelper = `

def getAndroidReleaseKeystore = {
    def credentialsJsonFile = rootProject.file("../credentials.json")
    if (!credentialsJsonFile.exists()) {
        return null
    }

    def credentials = new groovy.json.JsonSlurper().parse(credentialsJsonFile)
    return credentials?.android?.keystore
}

def androidReleaseKeystore = getAndroidReleaseKeystore()
def hasInjectedSigningCredentials = project.hasProperty("android.injected.signing.store.file")
def isReleaseBuild = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }
def resolveRepoFile = { filePath ->
    def resolvedPath = filePath?.toString()
    if (!resolvedPath) {
        return null
    }

    def candidate = new File(resolvedPath)
    if (candidate.isAbsolute()) {
        return candidate
    }

    return rootProject.file("../\${resolvedPath}")
}
`;

  source = insertAfter(
    source,
    'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
    signingHelper,
    'projectRoot declaration',
  );

  source = source
    .replace(/ndkVersion\s+rootProject\.ext\.ndkVersion/g, 'ndkVersion = rootProject.ext.ndkVersion')
    .replace(/buildToolsVersion\s+rootProject\.ext\.buildToolsVersion/g, 'buildToolsVersion = rootProject.ext.buildToolsVersion')
    .replace(/compileSdk\s+rootProject\.ext\.compileSdkVersion/g, 'compileSdk = rootProject.ext.compileSdkVersion')
    .replace(/namespace\s+['"]([^'"]+)['"]/g, "namespace = '$1'")
    .replace(/applicationId\s+['"]([^'"]+)['"]/g, "applicationId = '$1'")
    .replace(/minSdkVersion\s+rootProject\.ext\.minSdkVersion/g, 'minSdk = rootProject.ext.minSdkVersion')
    .replace(/targetSdkVersion\s+rootProject\.ext\.targetSdkVersion/g, 'targetSdk = rootProject.ext.targetSdkVersion')
    .replace(/versionCode\s*=?\s*\d+/g, 'versionCode = __VERSION_CODE__')
    .replace(/versionName\s*=?\s+["'][^"']+["']/g, 'versionName = "__VERSION_NAME__"')
    .replace(/storeFile\s+file\('debug\.keystore'\)/g, "storeFile = file('debug.keystore')")
    .replace(/storePassword\s+['"]android['"]/g, "storePassword = 'android'")
    .replace(/keyAlias\s+['"]androiddebugkey['"]/g, "keyAlias = 'androiddebugkey'")
    .replace(/keyPassword\s+['"]android['"]/g, "keyPassword = 'android'")
    .replace(/signingConfig\s+signingConfigs\.debug/g, 'signingConfig = signingConfigs.debug')
    .replace(/shrinkResources\s+\(findProperty\('android\.enableShrinkResourcesInReleaseBuilds'\)\?\.toBoolean\(\) \?: false\)/g, "shrinkResources = (findProperty('android.enableShrinkResourcesInReleaseBuilds')?.toBoolean() ?: false)")
    .replace(/shrinkResources\s+enableShrinkResources\.toBoolean\(\)/g, 'shrinkResources = enableShrinkResources.toBoolean()')
    .replace(/minifyEnabled\s+enableProguardInReleaseBuilds/g, 'minifyEnabled = enableProguardInReleaseBuilds')
    .replace(/minifyEnabled\s+enableMinifyInReleaseBuilds/g, 'minifyEnabled = enableMinifyInReleaseBuilds')
    .replace(/\n\s*crunchPngs\s*(?:=\s*)?\(findProperty\('android\.enablePngCrunchInReleaseBuilds'\)\?\.toBoolean\(\) \?: true\)/g, '')
    .replace(/crunchPngs\s+enablePngCrunchInRelease\.toBoolean\(\)/g, 'crunchPngs = enablePngCrunchInRelease.toBoolean()')
    .replace(/useLegacyPackaging\s+\(findProperty\('expo\.useLegacyPackaging'\)\?\.toBoolean\(\) \?: false\)/g, "useLegacyPackaging = (findProperty('expo.useLegacyPackaging')?.toBoolean() ?: false)")
    .replace(/useLegacyPackaging\s+enableLegacyPackaging\.toBoolean\(\)/g, 'useLegacyPackaging = enableLegacyPackaging.toBoolean()')
    .replace(/ignoreAssetsPattern\s+['"]([^'"]+)['"]/g, "ignoreAssetsPattern = '$1'")
    .replace(/implementation\s+jscFlavor/g, 'implementation(jscFlavor)');

  source = source.replace(
    /(\n\s+signingConfigs\s+\{\n\s+debug\s+\{\n\s+storeFile = file\('debug\.keystore'\)\n\s+storePassword = 'android'\n\s+keyAlias = 'androiddebugkey'\n\s+keyPassword = 'android')\n\s+signingConfig = signingConfigs\.debug(?=\n\s+\})/,
    '$1',
  );

  if (!source.includes('release {\n            if (androidReleaseKeystore != null) {')) {
    source = source.replace(
      /(\s+debug\s+\{\n\s+storeFile = file\('debug\.keystore'\)\n\s+storePassword = 'android'\n\s+keyAlias = 'androiddebugkey'\n\s+keyPassword = 'android'\n\s+\})/,
      `$1
        release {
            if (androidReleaseKeystore != null) {
                storeFile = resolveRepoFile(androidReleaseKeystore.keystorePath)
                storePassword = androidReleaseKeystore.keystorePassword
                keyAlias = androidReleaseKeystore.keyAlias
                keyPassword = androidReleaseKeystore.keyPassword
            }
        }`,
    );
  }

  if (!source.includes('Release signing credentials are missing.')) {
    source = source.replace(
      /(\s+release\s+\{\n)(\s+\/\/ Caution! In production, you need to generate your own keystore file\.\n\s+\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\n)?\s+signingConfig = signingConfigs\.debug\n/,
      `$1            if (androidReleaseKeystore != null) {
                signingConfig = signingConfigs.release
            } else if (!hasInjectedSigningCredentials && isReleaseBuild) {
                throw new GradleException("Release signing credentials are missing. Add credentials.json locally or use EAS remote credentials.")
            }
`,
    );
  }

  source = source.replace(
    /signingConfig\s*=\s*androidReleaseKeystore\s*!=\s*null\s*\?\s*signingConfigs\.release\s*:\s*signingConfigs\.debug/g,
    'signingConfig = signingConfigs.debug',
  );

  if (!source.includes('debug {\n            signingConfig = signingConfigs.debug')) {
    source = source.replace(
      /(\s+debug\s+\{\n)\s+signingConfig = signingConfigs\.debug\n(\s+\})/,
      `$1            signingConfig = signingConfigs.debug\n$2`,
    );
  }

  return source;
}

const appConfig = readAppConfig();
const versionName = validateVersion(appConfig.expo?.version);
const versionCode = validateVersionCode(appConfig.expo?.android?.versionCode);

if (!fs.existsSync(androidBuildGradlePath)) {
  fail('android/app/build.gradle does not exist. Run `npx expo prebuild --platform android` first.');
}

patchRootBuildGradle();

let buildGradle = patchAppBuildGradle(fs.readFileSync(androidBuildGradlePath, 'utf8'));
buildGradle = replaceRequired(
  buildGradle,
  /versionCode\s*=\s*(?:__VERSION_CODE__|\d+)/,
  `versionCode = ${versionCode}`,
  'versionCode',
);
buildGradle = replaceRequired(
  buildGradle,
  /versionName\s*=\s+["'](?:__VERSION_NAME__|[^"']+)["']/,
  `versionName = "${versionName}"`,
  'versionName',
);

fs.writeFileSync(androidBuildGradlePath, buildGradle, 'utf8');
console.log(`[android-version] Synced Android versionName=${versionName}, versionCode=${versionCode}, release signing, and Gradle syntax`);
