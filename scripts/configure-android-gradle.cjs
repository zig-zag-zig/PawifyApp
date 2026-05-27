#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const androidManifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');

function fail(message) {
  console.error(`[android-gradle] ${message}`);
  process.exit(1);
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`${path.relative(projectRoot, filePath)} does not exist. Run \`npx expo prebuild --platform android\` first.`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, before, after) {
  if (after === before) {
    return false;
  }

  fs.writeFileSync(filePath, after, 'utf8');
  return true;
}

function configureAndroidManifest() {
  const before = readRequired(androidManifestPath);
  const after = before.replace(
    /<activity android:name="\.MainActivity"(?![^>]*android:label=)/,
    '<activity android:name=".MainActivity" android:label="@string/app_name"',
  );

  return writeIfChanged(androidManifestPath, before, after);
}

const changed = [
  configureAndroidManifest(),
].some(Boolean);

console.log(changed
  ? '[android-gradle] Configured generated Android files'
  : '[android-gradle] Generated Android files already configured');
