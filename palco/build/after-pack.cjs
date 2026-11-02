const fs = require('node:fs/promises');
const path = require('node:path');

// List only distributed files for uninstall; preserve files a user may add later.
module.exports = async ({ appOutDir, packager }) => {
  const files = [], directories = [];
  async function walk(directory, relative = '') {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, item.name);
      if (item.isDirectory()) { await walk(path.join(directory, item.name), name); directories.push(name); }
      else files.push(name);
    }
  }
  await walk(appOutDir);
  const escape = value => value.replaceAll('$', '$$').replaceAll('"', '$\\"').replaceAll('/', '\\');
  const lines = [
    ...files.sort().map(file => `Delete "$INSTDIR\\${escape(file)}"`),
    ...directories.sort((a, b) => b.length - a.length).map(dir => `RMDir "$INSTDIR\\${escape(dir)}"`)
  ];
  await fs.writeFile(path.join(packager.projectDir, 'build/generated-uninstall.nsh'), lines.join('\n') + '\n');
};
