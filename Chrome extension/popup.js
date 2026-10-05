import {ROUTES, DEFAULT_SITES, SITE_NAMES, normalizeSite, routingOrigins, selectedRoute, formatSpeed} from './core.js';
const $ = id => document.getElementById(id);
let state;
let busy = false;
let siteDraft = null;
let sitesDirty = false;
let activeTab = 'overview';
function switchTab(name, focus = false) {
  activeTab = name;
  for (const tab of ['overview', 'settings']) {
    const selected = name === tab;
    $(`tab-${tab}`).setAttribute('aria-selected', String(selected));
    $(`tab-${tab}`).tabIndex = selected ? 0 : -1;
  }
  $('overview').hidden = name !== 'overview';
  $('settings-panel').hidden = name !== 'settings';
  $('message').hidden = true;
  document.querySelector('.popup-shell').scrollTop = 0;
  if (focus) $(`tab-${name}`).focus();
}
for (const name of ['overview', 'settings']) {
  $(`tab-${name}`).addEventListener('click', () => switchTab(name));
  $(`tab-${name}`).addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); switchTab(e.key === 'Home' ? 'overview' : e.key === 'End' ? 'settings' : name === 'overview' ? 'settings' : 'overview', true);
    }
  });
}
function renderSites() {
  if (!siteDraft) return;
  const pending = busy || state?.testing;
  $('scope-selected').checked = !siteDraft.allSites;
  $('scope-all').checked = siteDraft.allSites;
  $('scope-note').textContent = siteDraft.allSites ? 'All public websites use the proxy. Local addresses stay direct.' : 'Selected sites and their subdomains use the proxy.';
  $('site-list').hidden = siteDraft.allSites;
  $('add-site-form').hidden = siteDraft.allSites;
  $('site-list').replaceChildren();
  for (const site of siteDraft.sites) {
    const row = document.createElement('div'); row.className = 'site-row';
    const icon = document.createElement('img'); icon.width = 24; icon.height = 24; icon.alt = '';
    const favicon = new URL(chrome.runtime.getURL('/_favicon/'));
    favicon.searchParams.set('pageUrl', `https://${site.domain}/`); favicon.searchParams.set('size', '32');
    icon.src = favicon.toString();
    icon.addEventListener('error', () => { icon.src = chrome.runtime.getURL('icons/site-fallback.svg'); }, {once:true});
    const label = document.createElement('label'); label.className = 'site-label';
    const text = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = SITE_NAMES[site.domain] || site.domain;
    const domain = document.createElement('small'); domain.textContent = site.domain;
    text.append(name, domain);
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = site.enabled; toggle.disabled = pending; toggle.setAttribute('aria-label', `Use proxy for ${site.domain}`);
    toggle.addEventListener('change', () => {site.enabled = toggle.checked; sitesDirty = true;});
    label.append(icon, text, toggle);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-site'; remove.textContent = '×'; remove.disabled = pending; remove.setAttribute('aria-label', `Remove ${site.domain}`);
    remove.addEventListener('click', () => {siteDraft.sites = siteDraft.sites.filter(s => s.domain !== site.domain); sitesDirty = true; renderSites();});
    row.append(label, remove); $('site-list').append(row);
  }
  $('open-panel').addEventListener('click', async () => {
  try {await send('openPanel'); message('Rounded panel opened in the webpage.'); if (location.protocol === 'chrome-extension:') window.close();} catch (e) {message(e.message,true);}
});
if (new URL(location.href).searchParams.has('panelToken')) {
  document.documentElement.classList.add('floating-mode');
  document.querySelector('.panel-option').hidden = true;
}
for (const id of ['scope-selected','scope-all','new-site','save-sites']) $(id).disabled = pending;
  $('add-site-form').querySelector('button').disabled = pending;
}

for (const route of ROUTES) {
  const option = document.createElement('option'); option.value = route.id; option.textContent = route.label; $('route').append(option);
}
async function send(type, input) {
  const response = await chrome.runtime.sendMessage({type, input});
  if (!response?.ok) throw new Error(response?.error || 'The extension did not respond.');
  return response.result;
}
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; $('message').hidden = !text; }
function render(s) {
  state = s;
  const failed = s.active && s.verification && !s.verification.ok;
  $('status').title = s.conflictReason || ''; 
  $('status').className = 'status' + (s.conflict || failed ? ' error' : s.active ? ' active' : '');
  $('status-label').textContent = s.conflict ? 'Proxy conflict' : failed ? 'Connection failed' : s.active ? 'Active' : 'Proxy off';
  $('toggle').setAttribute('aria-checked', String(s.enabled));
  $('toggle').setAttribute('aria-label', s.enabled ? 'Disable proxy' : 'Enable proxy');
  $('route').value = s.routeId;
  $('endpoint').textContent = `${selectedRoute(s).host}:${selectedRoute(s).port}`;
  $('username').value = s.username;
  $('password').placeholder = s.hasPassword ? 'Saved. Enter to replace.' : 'Enter proxy password';
  $('credential-state').textContent = s.username && s.hasPassword ? 'Saved' : 'Setup needed';
  if (!sitesDirty) siteDraft = {allSites: !!s.allSites, sites: structuredClone(s.sites || DEFAULT_SITES)};
  renderSites();
  const enabledSites = (s.sites || DEFAULT_SITES).filter(site => site.enabled);
  $('routing-summary').textContent = s.allSites ? 'All sites' : enabledSites.length === 0 ? 'None selected' : enabledSites.length === 1 ? (SITE_NAMES[enabledSites[0].domain] || enabledSites[0].domain) : `${enabledSites.length} selected sites`;
  const m = s.measurement;
  $('speed').textContent = formatSpeed(m?.mbps);
  $('latency').textContent = formatSpeed(m?.latencyMs);
  $('latency').parentElement.title = m?.latencyError ? `Latency unavailable: ${m.latencyError}` : 'Median HTTPS response time, three requests';
  $('scale-fill').style.width = `${m ? Math.min(100, m.mbps) : 0}%`;
  $('measurement-note').textContent = m ? `${s.enabled ? 'Proxy route' : 'Current browser route'} · ${new Date(m.at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}${m.partial ? ' · Partial sample' : ''}` : 'Run a test to measure this route.';
  $('exit-ip').textContent = s.verification?.ip || 'Not checked';
  $('connection').textContent = s.verification ? s.verification.ok ? 'Verified' : 'Check failed' : 'Not checked';
  const pending = busy || s.testing;
  for (const id of ['toggle','route','username','password','test','test-all']) $(id).disabled = pending;
  $('credential-form').querySelector('button').disabled = pending;
  $('test').textContent = pending ? 'Measuring…' : 'Test speed and latency';
  $('test-all').textContent = s.batch?.running ? `Testing ${s.batch.completed + 1}/${s.batch.total}…` : 'Test all proxies';
  const batch = s.batch;
  $('batch-results').hidden = !batch;
  if (batch) {
    $('batch-progress').textContent = `${batch.completed || 0}/${batch.total || 11}`;
    const ranked = [...(batch.results || [])].sort((a,b) => Number(b.ok) - Number(a.ok) || (b.measurement?.mbps || 0) - (a.measurement?.mbps || 0));
    const best = ranked.find(r => r.ok);
    $('batch-summary').textContent = batch.running ? `Testing ${batch.current}…` : !batch.restored ? 'Original route could not be restored. Check the proxy switch.' : batch.interrupted ? 'Test interrupted. Original route restored.' : best ? `Fastest: ${best.label}. Original route restored.` : 'All tests failed. Original route restored.';
    $('results-list').replaceChildren();
    for (const result of ranked) {
      const row = document.createElement('div'); row.className = 'result-row' + (result === best ? ' best' : '');
      const name = document.createElement('span'); name.textContent = result.label;
      const speed = document.createElement('strong'); speed.textContent = result.ok ? `${formatSpeed(result.measurement.mbps)}${result.measurement.partial ? ' *' : ''}` : 'Failed';
      const latency = document.createElement('strong'); latency.textContent = result.ok ? formatSpeed(result.measurement.latencyMs) : '—';
      row.append(name, speed, latency); $('results-list').append(row);
      if (!result.ok) { const error = document.createElement('p'); error.className = 'result-error'; error.textContent = result.error; $('results-list').append(error); }
    }
  }
}
async function action(work) {
  if (busy) return;
  busy = true; render(state); message('');
  try { await work(); }
  catch (e) { message(e.message, true); }
  finally { busy = false; try { render(await send('status')); } catch (e) { message(e.message, true); } }
}
$('toggle').addEventListener('click', () => action(async () => {
  if (!state.enabled && (!state.username || !state.hasPassword)) {
    switchTab('settings'); message('Save the credentials from your proxy provider first.', true); return;
  }
  const wasEnabled = state.enabled;
  await send('update', {enabled: !wasEnabled});
  message(wasEnabled ? 'Proxy disabled. Previous Chrome settings restored.' : 'Proxy active. Reload ChatGPT to use the new route.');
}));
$('route').addEventListener('change', e => { const routeId = e.target.value; action(async () => {
  await send('update', {routeId}); message('Proxy selected. Reload ChatGPT after changing routes.');
}); });
$('credential-form').addEventListener('submit', e => { e.preventDefault();
  const username = $('username').value.trim(), password = $('password').value;
  action(async () => {
  if (!username || (!password && !state.hasPassword)) throw new Error('Enter both username and password.');
  await send('update', {username, password}); $('password').value = ''; message('Credentials saved locally.'); 
}); });
$('test').addEventListener('click', () => action(async () => {
  message('Checking exit IP, latency and download speed…'); await send('test'); message('');
}));
$('test-all').addEventListener('click', () => action(async () => {
  if (!state.username || !state.hasPassword) {
    switchTab('settings'); message('Save your proxy credentials before testing all proxies.', true); return;
  }
  message('Testing all proxies. You can close this popup and reopen it to see progress.');
  await send('testAll'); message('');
}));
$('open-panel').addEventListener('click', async () => {
  try {await send('openPanel'); message('Rounded panel opened in the webpage.'); if (location.protocol === 'chrome-extension:') window.close();} catch (e) {message(e.message,true);}
});
if (new URL(location.href).searchParams.has('panelToken')) {
  document.documentElement.classList.add('floating-mode');
  document.querySelector('.panel-option').hidden = true;
}
for (const id of ['scope-selected', 'scope-all']) $(id).addEventListener('change', () => {
  siteDraft.allSites = $('scope-all').checked; sitesDirty = true; renderSites();
});
$('add-site-form').addEventListener('submit', e => {
  e.preventDefault();
  if (busy || state?.testing) return;
  try {
    const domain = normalizeSite($('new-site').value);
    if (siteDraft.sites.some(s => s.domain === domain)) throw new Error('This website is already listed.');
    if (siteDraft.sites.length >= 50) throw new Error('Choose up to 50 websites.');
    siteDraft.sites.push({domain, enabled:true}); sitesDirty = true; $('new-site').value = ''; renderSites(); message('Click Save site settings to apply your selection.');
  } catch (e) {message(e.message,true);}
});
$('save-sites').addEventListener('click', () => {
  if (busy || state?.testing || !siteDraft) return;
  const draft = structuredClone(siteDraft);
  const origins = routingOrigins(draft);
  // Start the permission request inside the user's click, before any asynchronous work.
  let permission;
  try {permission = origins.length ? chrome.permissions.request({origins}) : Promise.resolve(true);}
  catch (e) {message(e.message, true); return;}
  action(async () => {
    if (!(await permission)) throw new Error('Website access was not granted. Your previous settings are unchanged.');
    await send('update', draft); sitesDirty = false; message('Site settings saved. Reload open websites to use the new routing.');
  });
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') send('status').then(render).catch(e => message(e.message, true));
});
send('status').then(render).catch(e => {
  message(e.message, true); for (const id of ['toggle','route','test','test-all']) $(id).disabled = true;
});
