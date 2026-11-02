const fs = require('node:fs/promises');
const path = require('node:path');
const { version } = require('../package.json');

const projectDirectory = path.join(__dirname, '..');
const source = path.join(
  projectDirectory,
  'release',
  `Palco-Multitracks-${version}-Windows-x64-Setup.exe`
);
const destination = path.join(
  projectDirectory,
  '..',
  `Palco-Multitracks-${version}-Windows-x64-Setup.exe`
);

async function main() {
  await fs.copyFile(source, destination);
  console.log(`Instalador principal atualizado: ${destination}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
