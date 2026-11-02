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
  await check('DAW workspace, playlist and audio diagnostics load', async () => {
    await page.getByRole('heading', { name: 'Arranjo vazio' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Reproduzir', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: /ARRANJO/ }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#audio-device option').count() >= 1, true);
    assert.equal(await page.locator('#project-state').textContent(), 'SALVO');
    await page.locator('#song-name').focus(); await page.locator('#song-name').blur();
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await page.getByRole('button', { name: 'Ajuda' }).click();
    await page.getByRole('button', { name: 'Mostrar atalhos' }).click();
    assert.equal(await page.locator('#shortcuts-dialog').getAttribute('open'), '');
    await page.getByRole('button', { name: 'Fechar atalhos' }).click();
    await page.getByRole('button', { name: 'Testar áudio' }).click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Tom de teste'));
    await page.screenshot({ path: resolve(output, 'empty-session.png'), fullPage: true });
    const splashPage = await browser.newPage({ viewport: { width: 620, height: 340 } });
    await splashPage.goto(origin + '/splash.html');
    await splashPage.getByText('PALCO', { exact: true }).waitFor();
    await splashPage.screenshot({ path: resolve(output, 'splash.png') });
    await splashPage.close();
  });
  await check('Sample-accurate shared clock, volume, mute, solo and pan with rendered audio', async () => {
    const values = await page.evaluate(async () => {
      const { AudioEngine } = await import('/audio-engine.mjs');
      const outcomes = [];
      for (const mode of ['all', 'mute', 'solo', 'mute-solo', 'volume', 'pan']) {
        const ctx = new OfflineAudioContext(2, 4800, 48000), engine = new AudioEngine(ctx);
        const a = ctx.createBuffer(1, 2400, 48000), b = ctx.createBuffer(1, 2400, 48000);
        a.getChannelData(0)[12] = 0.25; b.getChannelData(0)[12] = 0.5;
        const first = engine.add(a, 'A'), second = engine.add(b, 'B');
        if (mode === 'mute') first.muted = true;
        if (mode === 'solo' || mode === 'mute-solo') first.solo = true;
        if (mode === 'mute-solo') first.muted = true;
        if (mode === 'volume') { first.volume = 0.5; second.volume = 0.25; }
        if (mode === 'pan') { first.pan = -1; second.pan = 1; }
        engine.schedule(0.01);
        const rendered = await ctx.startRendering();
        const left = rendered.getChannelData(0), right = rendered.getChannelData(1);
        const index = [...left].findIndex((value, sample) => Math.abs(value) > 0.00001 || Math.abs(right[sample]) > 0.00001);
        outcomes.push({ mode, index, left: index < 0 ? 0 : left[index], right: index < 0 ? 0 : right[index] });
      }
      return outcomes;
    });
    for (const result of values.slice(0, 5)) {
      if (result.mode === 'mute-solo') { assert.equal(result.index, -1); continue; }
      assert.equal(result.index, 492);
      assert.ok(Math.abs(result.left - result.right) < 0.00001);
      assert.ok(result.left > 0);
    }
    const panned = values.at(-1);
    assert.equal(panned.index, 492);
    assert.ok(Math.abs(panned.left - 0.2) < 0.00001);
    assert.ok(Math.abs(panned.right - 0.4) < 0.00001);
  });
  await check('Stop cancels a pending asynchronous audio start', async () => {
    const result = await page.evaluate(async () => {
      const { AudioEngine } = await import('/audio-engine.mjs');
      const ctx = new AudioContext(), engine = new AudioEngine(ctx);
      engine.add(ctx.createBuffer(1, 4800, 48000), 'A');
      let release;
      engine.ensureReady = () => new Promise(done => { release = done; });
      const pending = engine.play(); engine.stop(); release(); await pending;
      const result = { playing: engine.playing, sources: engine.sources.length }; await ctx.close(); return result;
    });
    assert.deepEqual(result, { playing: false, sources: 0 });
  });
  await check('Metronome keeps a bounded lookahead queue', async () => {
    const count = await page.evaluate(async () => {
      const { AudioEngine } = await import('/audio-engine.mjs');
      const ctx = new AudioContext(), engine = new AudioEngine(ctx);
      engine.add(ctx.createBuffer(1, 3000 * 600, 3000), 'Longa');
      engine.setTempo(300, true); engine.schedule(ctx.currentTime + 0.01);
      const count = engine.clicks.length; engine.pause(); await ctx.close(); return count;
    });
    assert.ok(count > 0 && count < 20, `fila do metrônomo fora do limite: ${count}`);
  });
  await check('Import two WAVs, draw waveforms and display safe filenames', async () => {
    await page.locator('#files').setInputFiles([
      { name: '01 - Base.wav', mimeType: 'audio/wav', buffer: wav(440) },
      { name: '02 - Guia <teste>.wav', mimeType: 'audio/wav', buffer: wav(880) }
    ]);
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('2 faixa(s) importada(s)'));
    assert.equal(await page.locator('.track').count(), 2);
    assert.equal(await page.locator('.track-name').nth(1).textContent(), '02 - Guia <teste>.wav');
    assert.ok(await page.locator('canvas').first().evaluate(c => c.width > 0));
    assert.match(await page.locator('#total').textContent(), /00:04.000/);
    assert.equal(await page.locator('#project-state').textContent(), 'NÃO SALVO');
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
    await first.locator('[data-control=volume]').fill('0.35');
    assert.equal(await first.locator('[data-value=volume]').textContent(), '35%');
    await first.locator('[data-control=pan]').fill('-1');
    assert.equal(await first.locator('[data-value=pan]').textContent(), 'L100');
    assert.equal(await page.locator('.mixer-strip').first().locator('[data-control=pan]').inputValue(), '-1');
    await page.locator('#master').fill('0.6'); assert.equal(await page.locator('#master-value').textContent(), '60%');
  });
  await check('Track rename is mirrored in the mixer and can be undone', async () => {
    const name = page.locator('.track-name').first();
    await name.fill('Voz principal'); await name.press('Enter');
    assert.equal(await page.locator('.mixer-strip .strip-name').first().textContent(), 'Voz principal');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.track-name').first().textContent(), '01 - Base.wav');
  });
  await check('Timeline start, markers, tempo, metronome, undo and project export work', async () => {
    const start = page.locator('.track').first().locator('[data-control=start]');
    await start.fill('1'); await start.press('Enter');
    await page.locator('#undo').focus();
    assert.match(await page.locator('#total').textContent(), /00:05.000/);
    assert.equal(await start.inputValue(), '1.00');
    await page.locator('#undo').click();
    assert.match(await page.locator('#total').textContent(), /00:04.000/);
    assert.equal(await page.locator('.track').first().locator('[data-control=start]').inputValue(), '0.00');

    await page.locator('#add-marker').click();
    assert.equal(await page.locator('.marker').count(), 1);
    await page.locator('#undo').click();
    assert.equal(await page.locator('.marker').count(), 0);

    await page.locator('#tempo').fill('132'); await page.locator('#tempo').press('Enter');
    await page.locator('#metronome').click();
    assert.equal(await page.locator('#tempo').inputValue(), '132');
    assert.equal(await page.locator('#metronome').getAttribute('aria-pressed'), 'true');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-project').click();
    const download = await downloadPromise;
    const project = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(project.format, 'palco-project');
    assert.equal(project.version, 1);
    assert.equal(project.songs[0].tracks.length, 2);
    assert.ok(project.songs[0].tracks[0].audioBase64.length > 1000);
    assert.equal(await page.locator('#project-state').textContent(), 'SALVO');

    await page.locator('#song-name').fill('Alterado depois de salvar'); await page.locator('#song-name').press('Enter');
    await page.locator('#song-name').blur();
    assert.equal(await page.locator('#project-state').textContent(), 'NÃO SALVO');
    await page.locator('#project-file').setInputFiles({
      name: 'restaurado.palco.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project))
    });
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Projeto aberto'));
    assert.equal(await page.locator('#song-name').inputValue(), 'Música 1');
    assert.equal(await page.locator('.track').count(), 2);
    assert.equal(await page.locator('#project-state').textContent(), 'SALVO');
  });
  await check('Seek and natural end stop without automatically starting another song', async () => {
    await page.locator('#seek').fill('3.7');
    await page.getByRole('button', { name: 'Reproduzir', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.startsWith('Fim de'));
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
  await check('Playlist keeps separate songs and opens their arrangements', async () => {
    await page.getByRole('button', { name: /PLAYLIST/ }).click();
    assert.equal(await page.locator('.playlist-row').count(), 1);
    assert.match(await page.locator('.playlist-row').first().locator('.playlist-tracks').textContent(), /2 faixas/);
    await page.getByRole('button', { name: 'Adicionar música' }).click();
    assert.equal(await page.locator('.playlist-row').count(), 2);
    await page.locator('.playlist-row.selected').getByRole('button', { name: 'Abrir' }).click();
    assert.equal(await page.locator('.track').count(), 0);
    await page.locator('#files').setInputFiles({ name: 'Nova Música.wav', mimeType: 'audio/wav', buffer: wav(220) });
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('1 faixa(s) importada(s)'));
    await page.getByRole('button', { name: /PLAYLIST/ }).click();
    assert.match(await page.locator('.playlist-row').nth(1).locator('.playlist-tracks').textContent(), /1 faixa/);
    await page.screenshot({ path: resolve(output, 'playlist.png'), fullPage: true });
    await page.locator('.playlist-row').first().getByRole('button', { name: 'Abrir' }).click();
    assert.equal(await page.locator('.track').count(), 2);
  });
  await check('Remove all tracks restores the empty session', async () => {
    await page.locator('.remove').first().click(); await page.locator('.remove').first().click();
    assert.equal(await page.locator('.track').count(), 0);
    assert.equal(await page.locator('#empty').isVisible(), true);
    assert.equal(await page.locator('#play').isDisabled(), true);
  });
  await check('Unsaved project is not discarded when confirmation is canceled', async () => {
    assert.equal(await page.locator('#project-state').textContent(), 'NÃO SALVO');
    const count = await page.locator('#song-count').textContent();
    await page.evaluate(() => { window.confirm = () => false; });
    await page.locator('#new-project').click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('cancelado'));
    assert.equal(await page.locator('#song-count').textContent(), count);
    assert.deepEqual(errors, []);
  });
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ browser: await browser.version(), results }, null, 2));
  console.log(`${results.length} checks passed.`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser?.close(); await new Promise(done => server.close(done)); }
