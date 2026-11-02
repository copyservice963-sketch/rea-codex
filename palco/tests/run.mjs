import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const target = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!target.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    const path = target === root.slice(0, -1) ? resolve(root, 'index.html') : target;
    response.setHeader('Content-Type', ({'.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css'})[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
async function check(name, run) {
  await run(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
}
function wav(frequency) {
  const frames = 48000 * 4, buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48000, 24); buffer.writeUInt32LE(96000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) buffer.writeInt16LE(Math.round(Math.sin(i / 48000 * 2 * Math.PI * frequency) * 6000), 44 + i * 2);
  return buffer;
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/index.html');
  await check('Empty session and import controls', async () => {
    await page.getByRole('heading', { name: 'Pronto para o palco.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Reproduzir', exact: true }).isDisabled(), true);
    await page.screenshot({ path: resolve(output, 'empty-session.png'), fullPage: true });
  });
  await check('Sample-accurate shared clock, volume, mute and solo with real rendered audio', async () => {
    const values = await page.evaluate(async () => {
      const { AudioEngine } = await import('/audio-engine.mjs');
      const outcomes = [];
      for (const mode of ['all', 'mute', 'solo', 'mute-solo', 'volume']) {
        const ctx = new OfflineAudioContext(2, 4800, 48000), engine = new AudioEngine(ctx);
        const a = ctx.createBuffer(1, 2400, 48000), b = ctx.createBuffer(1, 2400, 48000);
        a.getChannelData(0)[12] = 0.25; b.getChannelData(0)[12] = 0.5;
        const first = engine.add(a, 'A'), second = engine.add(b, 'B');
        if (mode === 'mute') first.muted = true;
        if (mode === 'solo' || mode === 'mute-solo') first.solo = true;
        if (mode === 'mute-solo') first.muted = true;
        if (mode === 'volume') { first.volume = 0.5; second.volume = 0.25; }
        engine.schedule(0.01);
        const rendered = await ctx.startRendering();
        const samples = rendered.getChannelData(0);
        const nonzero = [...samples].map((value, index) => ({ value, index })).filter(s => Math.abs(s.value) > 0.00001);
        outcomes.push({ mode, nonzero });
      }
      return outcomes;
    });
    for (const [index, expected] of [0.6, 0.4, 0.2, 0, 0.2].entries()) {
      const actual = values[index].nonzero;
      if (!expected) assert.equal(actual.length, 0);
      else { assert.equal(actual.length, 1); assert.equal(actual[0].index, 492); assert.ok(Math.abs(actual[0].value - expected) < 0.00001); }
    }
  });
  await check('Stop cancels a pending asynchronous audio start', async () => {
    const result = await page.evaluate(async () => {
      const { AudioEngine } = await import('/audio-engine.mjs');
      const ctx = new AudioContext(), engine = new AudioEngine(ctx);
      engine.add(ctx.createBuffer(1, 4800, 48000), 'A');
      let release;
      ctx.resume = () => new Promise(done => { release = done; });
      const pending = engine.play(); engine.stop(); release(); await pending;
      const result = { playing: engine.playing, sources: engine.sources.length }; await ctx.close(); return result;
    });
    assert.deepEqual(result, { playing: false, sources: 0 });
  });
  await check('Import two WAVs, draw waveforms and display safe filenames', async () => {
    await page.locator('#files').setInputFiles([
      { name: '01 - Base.wav', mimeType: 'audio/wav', buffer: wav(440) },
      { name: '02 - Guia <teste>.wav', mimeType: 'audio/wav', buffer: wav(880) }
    ]);
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Pronto para tocar'));
    assert.equal(await page.locator('.track').count(), 2);
    assert.equal(await page.locator('.track-name').nth(1).textContent(), '02 - Guia <teste>.wav');
    assert.ok(await page.locator('canvas').first().evaluate(c => c.width > 0));
    assert.match(await page.locator('#total').textContent(), /00:04.000/);
    await page.screenshot({ path: resolve(output, 'loaded-session.png'), fullPage: true });
  });
  await check('Playback advances, pause holds position, resume continues, stop resets', async () => {
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#position').textContent >= '00:00.200');
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#play-state').textContent === 'PAUSADO');
    const position = await page.locator('#position').textContent();
    await page.waitForTimeout(200); assert.equal(await page.locator('#position').textContent(), position);
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(value => document.querySelector('#position').textContent > value, position);
    await page.getByRole('button', { name: 'Parar e voltar ao início' }).click();
    await page.waitForFunction(() => document.querySelector('#position').textContent === '00:00.000');
  });
  await check('Mute, solo and volume controls update independently', async () => {
    const first = page.locator('.track').first(), second = page.locator('.track').nth(1);
    await first.locator('[data-kind=solo]').click();
    assert.equal(await first.locator('[data-kind=solo]').getAttribute('aria-pressed'), 'true');
    assert.match(await second.getAttribute('class'), /muted/);
    await first.locator('[data-kind=muted]').click();
    assert.match(await first.getAttribute('class'), /muted/);
    await first.locator('[data-kind=muted]').click(); await first.locator('[data-kind=solo]').click();
    await first.locator('input').fill('0.35'); assert.equal(await first.locator('.volume-value').textContent(), '35%');
    await page.locator('#master').fill('0.6'); assert.equal(await page.locator('#master-value').textContent(), '60%');
  });
  await check('Seek and natural end stop without automatically starting another song', async () => {
    await page.locator('#seek').fill('3.7');
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.startsWith('Fim da música'));
    assert.equal(await page.locator('#position').textContent(), '00:00.000');
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#play-state').textContent === 'REPRODUZINDO');
    await page.locator('#seek').evaluate(input => { input.value = input.max; input.dispatchEvent(new Event('input')); });
    await page.waitForFunction(() => document.querySelector('#play-state').textContent === 'PAUSADO');
    assert.equal(await page.locator('#position').textContent(), '00:04.000');
    await page.getByRole('button', { name: 'Parar e voltar ao início' }).click();
  });
  await check('Invalid audio reports failure while preserving loaded tracks', async () => {
    await page.locator('#files').setInputFiles({ name: 'invalido.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') });
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Falha:'));
    assert.equal(await page.locator('.track').count(), 2);
  });
  await check('Remove all tracks restores the empty session', async () => {
    await page.locator('.remove').first().click(); await page.locator('.remove').first().click();
    assert.equal(await page.locator('.track').count(), 0);
    assert.equal(await page.locator('#empty').isVisible(), true);
    assert.equal(await page.locator('#play').isDisabled(), true);
    assert.deepEqual(errors, []);
  });
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ browser: await browser.version(), results }, null, 2));
  console.log(`${results.length} checks passed.`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser?.close(); await new Promise(done => server.close(done)); }
