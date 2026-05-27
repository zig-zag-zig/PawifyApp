#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const expected = {
  gradle: '9.3.1',
  androidGradlePlugin: '8.12.0',
  kotlin: '2.1.20',
};

function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function fail(message) {
  console.error(`[toolchain] ${message}`);
  process.exitCode = 1;
}

function assertEqual(name, actual, wanted) {
  if (actual !== wanted) {
    fail(`${name} must stay pinned to ${wanted}; found ${actual || '(missing)'}`);
    return;
  }

  console.log(`[toolchain] ${name}=${actual}`);
}

function getGradleWrapperVersion() {
  const properties = readText('android/gradle/wrapper/gradle-wrapper.properties');
  return properties.match(/gradle-([0-9.]+)-bin\.zip/)?.[1] ?? null;
}

function getReactNativeCatalogVersion(name) {
  const catalog = readText('node_modules/react-native/gradle/libs.versions.toml');
  return catalog.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null;
}

function assertGradleMajorIsSupported(version) {
  const major = Number.parseInt(version?.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major) || major >= 10) {
    fail(`Gradle ${version || '(missing)'} is not allowed yet. Wait for Expo/RN support before moving to Gradle 10.`);
  }
}

const gradleVersion = getGradleWrapperVersion();
assertEqual('Gradle wrapper', gradleVersion, expected.gradle);
assertGradleMajorIsSupported(gradleVersion);
assertEqual('Android Gradle Plugin', getReactNativeCatalogVersion('agp'), expected.androidGradlePlugin);
assertEqual('Kotlin', getReactNativeCatalogVersion('kotlin'), expected.kotlin);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[toolchain] Android toolchain pins are valid.');
