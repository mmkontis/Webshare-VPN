import {authorizedSender, openRoundedPanel} from './panel.js';
import {measureLatency} from './network.js';
import {DEFAULTS, ROUTES, normalizeSites, routingOrigins, selectedRoute, makePac, controlsRoute, isOwnChallenge, mbps, formatSpeed, sameRoute} from './core.js';
let testRunning = false;
let batchRunning = false;
let mutation = Promise.resolve();
const serial = fn => { const next = mutation.then(fn, fn); mutation = next.catch(() => {}); return next; };
async function settings() { return {...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings}; }
async function status() {
  const s = await settings();
  const config = await chrome.proxy.settings.get({incognito: false});
  const {measurement, verification, batch} = await chrome.storage.local.get(['measurement', 'verification', 'batch']);
  const active = controlsRoute(config, s);
  return {enabled: s.enabled, routeId: s.routeId, username: s.username, hasPassword: !!s.password,
    allSites: s.allSites, sites: s.sites, active, conflict: s.enabled && !active, testing: testRunning || batchRunning, batch: batch || null, conflictReason: s.enabled && !active ? config.levelOfControl === 'controlled_by_other_extensions' ? 'Another extension controls the proxy. Turn it off before enabling this one.' : config.levelOfControl === 'not_controllable' ? 'Chrome policy controls the proxy.' : 'Saved routing needs to be reapplied. Turn the proxy off and on.' : '',
    measurement: measurement && sameRoute(measurement, s) ? measurement : null,
    verification: verification && sameRoute(verification, s) ? verification : null};
}
async function paint() {
  const s = await status();
  const failed = s.active && s.verification && !s.verification.ok;
  const state = s.conflict || failed ? 'error' : s.active ? 'on' : 'off';
  await chrome.action.setIcon({path: {16: `icons/${state}-16.png`, 32: `icons/${state}-32.png`}});
  await chrome.action.setBadgeBackgroundColor({color: state === 'on' ? '#16a877' : state === 'error' ? '#d65b4a' : '#657080'});
  await chrome.action.setBadgeTextColor({color: '#ffffff'});
  await chrome.action.setBadgeText({text: s.conflict || failed ? '!' : s.testing ? '…' : s.measurement ? formatSpeed(s.measurement.mbps) : s.active ? 'ON' : ''});
  await chrome.action.setTitle({title: `Webshare VPN · ${s.active ? selectedRoute(s).label : 'Proxy off'}${s.measurement ? ' · ' + formatSpeed(s.measurement.mbps) + ' Mbps' : ''}${failed ? ' · Connection check failed' : ''}`});
}
async function clearAuthAttempts() {
  const data = await chrome.storage.session.get(null);
  await chrome.storage.session.remove(Object.keys(data).filter(key => key.startsWith('auth:')));
}
async function update(input, internal = false) {
  if (testRunning || (batchRunning && !internal)) throw new Error('Wait for the speed test to finish before changing routes.');
  const old = await settings();
  const next = {...old};
  if ('routeId' in input) {
    const route = selectedRoute({routeId: input.routeId});
    if (route.id !== input.routeId) throw new Error('Unknown proxy.');
    next.routeId = input.routeId;
  }
  if ('username' in input) next.username = String(input.username).trim();
  if ('password' in input && input.password !== '') next.password = String(input.password);
  if ('enabled' in input) next.enabled = !!input.enabled;
  if ('allSites' in input) next.allSites = !!input.allSites;
  if ('sites' in input) next.sites = normalizeSites(input.sites);
  if (next.enabled || 'sites' in input || 'allSites' in input) {
    const origins = routingOrigins(next);
    if (origins.length && !(await chrome.permissions.contains({origins}))) throw new Error('Allow the selected websites in Chrome before applying these settings.');
  }
  if (next.enabled && (!next.username || !next.password)) throw new Error('Enter your proxy username and password first.');
  const config = await chrome.proxy.settings.get({incognito: false});
  if (next.enabled && !['controllable_by_this_extension', 'controlled_by_this_extension'].includes(config.levelOfControl)) {
    throw new Error('Another extension or Chrome policy controls the proxy.');
  }
  // Auth callbacks must see the new credentials before Chrome uses the new PAC.
  await chrome.storage.local.set({settings: next});
  try {
    if (next.enabled) await chrome.proxy.settings.set({value: {mode: 'pac_script', pacScript: {data: makePac(selectedRoute(next), next), mandatory: true}}, scope: 'regular'});
    else await chrome.proxy.settings.clear({scope: 'regular'});
  } catch (e) { await chrome.storage.local.set({settings: old}); throw e; }
  if (!sameRoute(old, next) || old.username !== next.username || old.password !== next.password) {
    await chrome.storage.local.remove(['measurement', 'verification']);
    await clearAuthAttempts();
  }
  await paint();
  return status();
}
async function verify(s) {
  const response = await fetch(`https://ipv4.webshare.io/?t=${Date.now()}`, {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`Exit IP check returned HTTP ${response.status}.`);
  const ip = (await response.text()).trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('Exit IP check returned an unexpected response.');
  const ok = !s.enabled || ip === selectedRoute(s).host;
  const result = {enabled: s.enabled, routeId: s.routeId, ip, ok, at: Date.now()};
  await chrome.storage.local.set({verification: result});
  if (!ok) throw new Error('Exit IP does not match the selected proxy.');
  return result;
}
async function test() {
  if (testRunning) throw new Error('A speed test is already running.');
  testRunning = true;
  const s = await settings();
  let reader;
  try {
    if (s.enabled && !(await status()).active) throw new Error('The selected proxy is not active in Chrome.');
    await paint();
    await verify(s);
    let latency, latencyError;
    try {latency = await measureLatency();} catch (e) {latencyError = e.message;}
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let bytes = 0, firstByte = null, lastByte = null, partial = false;
    const start = performance.now();
    try {
      const response = await fetch(`https://speed.cloudflare.com/__down?bytes=5000000&t=${Date.now()}`, {cache: 'no-store', credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw new Error(`Speed test returned HTTP ${response.status}.`);
      const type = response.headers.get('content-type') || '';
      if (/html|json/i.test(type)) throw new Error('Speed test received a challenge or error page.');
      reader = response.body.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const now = performance.now();
        if (firstByte === null) firstByte = now;
        lastByte = now;
        bytes += chunk.value.byteLength;
      }
    } catch (e) {
      if (controller.signal.aborted && bytes >= 65536) partial = true;
      else throw e;
    } finally { clearTimeout(timeout); reader?.releaseLock(); }
    // Full request duration includes connection setup and transfer, never browser cache.
    const ended = lastByte ?? performance.now();
    const rate = mbps(bytes, ended - start);
    if (rate === null) throw new Error('No usable data was received.');
    if (!(await status()).active && s.enabled) throw new Error('Proxy settings changed during the speed test.');
    const result = {enabled: s.enabled, routeId: s.routeId, mbps: rate, bytes, partial,
      latencyMs: latency?.latencyMs ?? null, latencySamplesMs: latency?.latencySamplesMs || [], latencyError: latencyError || null, ttfbMs: firstByte === null ? null : firstByte - start, durationMs: ended - start, at: Date.now()};
    await chrome.storage.local.set({measurement: result});
    return result;
  } catch (e) {
    await chrome.storage.local.remove('measurement');
    if (s.enabled) await chrome.storage.local.set({verification: {enabled: s.enabled, routeId: s.routeId, ok: false, at: Date.now(), error: e.message}});
    throw new Error(e.name === 'AbortError' || e.name === 'TimeoutError' ? 'Connection timed out. Try another proxy.' : e.message);
  } finally { testRunning = false; await paint(); }
}
async function restoreSample(original, sample) {
  await update({enabled: original.enabled, routeId: original.routeId}, true);
  if (sample?.measurement) await chrome.storage.local.set({measurement: sample.measurement});
  if (sample?.verification) await chrome.storage.local.set({verification: sample.verification});
}
async function testAll() {
  if (testRunning || batchRunning) throw new Error('A speed test is already running.');
  const original = await settings();
  if (!original.username || !original.password) throw new Error('Save your proxy username and password before testing all proxies.');
  const config = await chrome.proxy.settings.get({incognito: false});
  if (!['controllable_by_this_extension', 'controlled_by_this_extension'].includes(config.levelOfControl)) throw new Error('Another extension or Chrome policy controls the proxy.');
  const originalSample = await chrome.storage.local.get(['measurement', 'verification']);
  const recovery = {enabled: original.enabled, routeId: original.routeId, ...originalSample};
  await chrome.storage.local.set({batchRecovery: recovery});
  batchRunning = true;
  const batch = {running: true, startedAt: Date.now(), total: ROUTES.length + 1, completed: 0, current: '', results: [], restored: false};
  const save = () => chrome.storage.local.set({batch: structuredClone(batch)});
  await save();
  const batchDeadline = performance.now() + 240000;
  try {
    const jobs = [{id: 'browser-default', label: 'Browser default', enabled: false, routeId: original.routeId},
      ...ROUTES.map(r => ({id: r.id, label: r.label, enabled: true, routeId: r.id}))];
    for (const job of jobs) {
      batch.current = job.label;
      await save();
      let result;
      try {
        if (performance.now() > batchDeadline - 40000) throw new Error('Comparison time limit reached. Run this route individually.');
        await update({enabled: job.enabled, routeId: job.routeId}, true);
        const measurement = await test();
        const {verification} = await chrome.storage.local.get('verification');
        result = {...job, ok: true, measurement, verification};
      } catch (e) {
        const {verification} = await chrome.storage.local.get('verification');
        result = {...job, ok: false, error: e.message, verification: verification && sameRoute(verification, job) ? verification : null};
      }
      batch.results.push(result);
      batch.completed++;
      await save();
    }
  } finally {
    batch.current = 'Restoring your route';
    await save();
    try {
      const sample = batch.results.find(r => r.enabled === original.enabled && r.routeId === original.routeId);
      await restoreSample(original, sample || originalSample);
      batch.restored = true;
      await chrome.storage.local.remove('batchRecovery');
    } catch (e) { batch.restoreError = e.message; }
    batch.running = false;
    batch.endedAt = Date.now();
    batch.current = '';
    batchRunning = false;
    await save();
    await paint();
  }
  if (!batch.restored) throw new Error('Tests finished, but restoring the original route failed: ' + batch.restoreError);
  return batch;
}
async function recoverInterruptedBatch() {
  const {batchRecovery, batch} = await chrome.storage.local.get(['batchRecovery', 'batch']);
  if (!batchRecovery) return;
  try {
    await restoreSample(batchRecovery, batchRecovery);
    await chrome.storage.local.set({batch: {...batch, running: false, current: '', interrupted: true, restored: true, endedAt: Date.now()}});
    await chrome.storage.local.remove('batchRecovery');
    await paint();
  } catch (e) {
    await chrome.storage.local.set({batch: {...batch, running: false, interrupted: true, restored: false, restoreError: e.message}});
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const work = ready.then(async () => {
    if (!(await authorizedSender(sender))) throw new Error('This extension view is not authorized.');
    return message.type === 'status' ? status() : message.type === 'update' ? serial(() => update(message.input || {})) : message.type === 'test' ? serial(() => test()) : message.type === 'testAll' ? serial(() => testAll()) : message.type === 'openPanel' ? openRoundedPanel() : Promise.reject(new Error('Unknown action.'));
  });
  work.then(result => reply({ok: true, result}), error => reply({ok: false, error: error.message}));
  return true;
});
chrome.webRequest.onAuthRequired.addListener((details, callback) => {
  (async () => {
    const s = await settings();
    if (!isOwnChallenge(details, s) || !(await status()).active) return callback({});
    const key = `auth:${details.requestId}`;
    const tried = (await chrome.storage.session.get(key))[key];
    if (tried) return callback({cancel: true});
    await chrome.storage.session.set({[key]: true});
    callback({authCredentials: {username: s.username, password: s.password}});
  })().catch(() => callback({cancel: true}));
}, {urls: ['<all_urls>']}, ['asyncBlocking']);
const cleanAuth = details => chrome.storage.session.remove(`auth:${details.requestId}`).catch(() => {});
chrome.webRequest.onCompleted.addListener(cleanAuth, {urls: ['<all_urls>']});
chrome.webRequest.onErrorOccurred.addListener(cleanAuth, {urls: ['<all_urls>']});
chrome.proxy.settings.onChange.addListener(() => { paint().catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).then(() => ready).then(() => serial(async () => {
    const s = await settings();
    if (s.enabled) {try {await update({});} catch {await paint();}} else await paint();
  })).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => { paint().catch(() => {}); });

const ready = recoverInterruptedBatch();

chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove(`panel:${tabId}`).catch(() => {}); });
