'use strict';
// Dependency Verification
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const minimatchEntries = Object.entries(lock.packages)
  .filter(([name]) => name === 'node_modules/minimatch' || name.endsWith('/node_modules/minimatch'));
const failures = [];
if (project.dependencies?.minimatch || project.optionalDependencies?.minimatch) {
  failures.push('minimatch is declared as a production dependency');
}
if (!project.build || project.build.asar !== true || !Array.isArray(project.build.files)) {
  failures.push('application payload must have an explicit ASAR file allowlist');
} else if (project.build.files.some(entry => typeof entry !== 'string' || entry.includes('node_modules') || entry === '**/*' || entry === '*')) {
  failures.push('application payload file allowlist is too broad');
}
for (const [name, entry] of minimatchEntries) {
  if (entry.dev !== true) failures.push(`${name} is not classified as development-only`);
}
const sourceDirs = ['lib', 'src'];
const sourceFiles = ['main.js', 'preload.js'];
for (const dir of sourceDirs) {
  const visit = location => {
    for (const item of fs.readdirSync(location, { withFileTypes: true })) {
      const target = path.join(location, item.name);
      if (item.isDirectory()) visit(target);
      else if (/\.(?:cjs|mjs|js)$/.test(item.name)) sourceFiles.push(path.relative(root, target));
    }
  };
  visit(path.join(root, dir));
}
for (const name of sourceFiles) {
  const contents = fs.readFileSync(path.join(root, name), 'utf8');
  if (/\brequire\s*\(\s*['"]minimatch['"]\s*\)|\bfrom\s*['"]minimatch['"]|\bimport\s*\(\s*['"]minimatch['"]\s*\)/.test(contents)) {
    failures.push(`${name} imports minimatch at application runtime`);
  }
}
for (const [name, entry] of minimatchEntries) {
  process.stdout.write(`${name}: ${entry.version} (${entry.dev === true ? 'dev-only' : 'not dev-only'})\n`);
}
if (failures.length) {
  for (const failure of failures) process.stderr.write(`ERROR: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Development-only boundary verified. Vulnerability remediation is NOT verified.\n');
}
