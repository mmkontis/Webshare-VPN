import test from 'node:test';
import assert from 'node:assert/strict';
import {makePac, ROUTES} from '../core.js';
const event = () => ({listeners: [], addListener(fn) { this.listeners.push(fn); }});
const localData = {}, sessionData = {};
const store = data => ({
  async get(keys) { if (keys === null) keys = Object.keys(data); if (typeof keys === 'string') keys = [keys]; return Object.fromEntries(keys.filter(k => k in data).map(k => [k,data[k]])); },
  async set(value) { Object.assign(data, value); },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
  async clear() { for (const key of Object.keys(data)) delete data[key]; },
  async setAccessLevel() {}
});
let config = {levelOfControl: 'controllable_by_this_extension', value: {mode: 'system'}};
let clearCalls = 0;
const calls = [];
globalThis.chrome = {
  runtime: {id: 'test-extension', getURL: p => `chrome-extension://test-extension/${p}`, onMessage: event(), onInstalled: event(), onStartup: event()},
  storage: {local: store(localData), session: store(sessionData)},
  proxy: {settings: {async get() {return config;}, async set({value}) {config = {levelOfControl: 'controlled_by_this_extension', value};}, async clear() {clearCalls++; config = {levelOfControl:'controllable_by_this_extension',value:{mode:'system'}};}, onChange: event()}},
  tabs:{onRemoved:event()},
  permissions: {async contains() {return true;}},
  action: Object.fromEntries(['setIcon','setBadgeText','setBadgeBackgroundColor','setBadgeTextColor','setTitle'].map(name => [name,async input => calls.push([name,input])])),
  webRequest: {onAuthRequired: event(), onCompleted: event(), onErrorOccurred: event()}
};
await import('../background.js');
const sender = {id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html')};
const message = (type, input) => new Promise(resolve => chrome.runtime.onMessage.listeners[0]({type,input}, sender, resolve));
const auth = details => new Promise(resolve => chrome.webRequest.onAuthRequired.listeners[0](details, resolve));
test('activation, auth retry protection, ownership conflict, measurement and releasing settings', async () => {
  let response = await message('update', {enabled: true});
  assert.equal(response.ok, false);
  assert.match(response.error, /username and password/);
  assert.equal(localData.settings, undefined);
  response = await message('update', {username: 'test-user', password: 'test-secret', enabled: true});
  assert.equal(response.ok, true);
  assert.equal(response.result.active, true);
  assert.equal(response.result.hasPassword, true);
  assert.equal(response.result.password, undefined);
  assert.equal(config.value.pacScript.data, makePac(ROUTES[0]));
  assert.ok(calls.some(([n,v]) => n === 'setIcon' && v.path[16] === 'icons/on-16.png'));
  const challenge = {requestId:'request1',isProxy:true,challenger:{host:'31.58.9.4',port:6077}};
  assert.deepEqual(await auth({...challenge,isProxy:false}), {});
  assert.deepEqual(await auth(challenge), {authCredentials:{username:'test-user',password:'test-secret'}});
  assert.deepEqual(await auth(challenge), {cancel:true});
  chrome.webRequest.onCompleted.listeners[0](challenge);
  await Promise.resolve();
  assert.deepEqual(await auth(challenge), {authCredentials:{username:'test-user',password:'test-secret'}});
  config.levelOfControl = 'controlled_by_other_extensions';
  response = await message('status');
  assert.equal(response.result.active, false);
  assert.equal(response.result.conflict, true);
  assert.deepEqual(await auth({...challenge,requestId:'request2'}), {});
  assert.equal((await message('update', {routeId:'warsaw'})).ok, false);
  config.levelOfControl = 'controlled_by_this_extension';
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async url => {
    fetchCount++;
    assert.ok(url.startsWith('https://'));
    if (url.includes('webshare.io')) return new Response('31.58.9.4');
    return new Response(new ReadableStream({start(controller) {
      controller.enqueue(new Uint8Array(100000));
      setTimeout(() => {controller.enqueue(new Uint8Array(100000));controller.close();}, 20);
    }}), {headers:{'content-type':'application/octet-stream'}});
  };
  try {
    response = await message('test');
    assert.equal(response.ok, true);
    assert.equal(response.result.bytes, 200000);
    assert.ok(response.result.mbps > 0);
    assert.equal(localData.verification.ok, true);
    assert.equal(fetchCount, 5);
    assert.ok(calls.some(([n,v]) => n === 'setBadgeText' && /^\d+\.\d$/.test(v.text)));
    await message('update', {routeId:'warsaw'});
    assert.equal(localData.measurement, undefined);
    assert.equal(localData.verification, undefined);
    response = await message('test');
    assert.equal(response.ok, false);
    assert.match(response.error, /does not match/);
    assert.equal(localData.measurement, undefined);
    assert.equal(localData.verification.ok, false);
    assert.ok(calls.some(([n,v]) => n === 'setIcon' && v.path[16] === 'icons/error-16.png'));
  } finally {globalThis.fetch = originalFetch;}
  response = await message('update', {enabled:false});
  assert.equal(response.ok, true);
  assert.equal(clearCalls, 1);
  assert.equal(config.value.mode, 'system');
  assert.equal((await message('status')).result.active, false);
});
test('test all continues after a failed proxy and restores both enabled and disabled starting routes', async () => {
  await message('update', {enabled:true,routeId:'warsaw',username:'test-user',password:'test-secret'});
  const originalFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async url => {
    count++;
    const current = localData.settings;
    const route = ROUTES.find(r => r.id === current.routeId);
    if (url.includes('webshare.io')) return new Response(current.enabled ? route.host : '203.0.113.1');
    if (current.enabled && current.routeId === 'madrid') return new Response('failure',{status:500});
    return new Response(new Uint8Array(250000),{headers:{'content-type':'application/octet-stream'}});
  };
  try {
    let response = await message('testAll');
    assert.equal(response.ok,true);
    let batch = response.result;
    assert.equal(batch.completed,11);
    assert.equal(batch.results.length,11);
    assert.equal(batch.running,false);
    assert.equal(batch.restored,true);
    assert.equal(batch.results.filter(r=>r.ok).length,10);
    assert.equal(batch.results.find(r=>r.routeId==='madrid' && r.enabled).ok,false);
    assert.equal(batch.results.at(-1).id,'piscataway');
    assert.equal(localData.settings.routeId,'warsaw');
    assert.equal(localData.settings.enabled,true);
    assert.equal(config.value.pacScript.data,makePac(ROUTES[1]));
    assert.equal(localData.measurement.routeId,'warsaw');
    assert.equal(localData.verification.ip,ROUTES[1].host);
    assert.equal(localData.batchRecovery,undefined);
    assert.ok(!JSON.stringify(batch).includes('test-secret'));
    assert.equal(count,53);
    await message('update',{enabled:false,routeId:'tokyo'});
    response = await message('testAll');
    assert.equal(response.ok,true);
    batch=response.result;
    assert.equal(batch.completed,11);
    assert.equal(localData.settings.enabled,false);
    assert.equal(localData.settings.routeId,'tokyo');
    assert.equal(config.value.mode,'system');
    assert.equal(localData.measurement.enabled,false);
    assert.equal(localData.verification.ip,'203.0.113.1');
  } finally {globalThis.fetch=originalFetch;}
});
test('worker restart restores a route left behind by an interrupted batch', async () => {
  localData.batchRecovery={enabled:false,routeId:'frankfurt'};
  localData.batch={running:true,completed:3,total:11,results:[]};
  await message('update',{enabled:true,routeId:'tokyo'});
  await import('../background.js?recovery-test');
  const response=await new Promise(resolve=>chrome.runtime.onMessage.listeners.at(-1)({type:'status'},sender,resolve));
  assert.equal(response.ok,true);
  assert.equal(localData.settings.enabled,false);
  assert.equal(localData.settings.routeId,'frankfurt');
  assert.equal(config.value.mode,'system');
  assert.equal(response.result.batch.running,false);
  assert.equal(response.result.batch.interrupted,true);
  assert.equal(response.result.batch.restored,true);
  assert.equal(localData.batchRecovery,undefined);
});
test('site settings require granted permissions and update the active PAC without exposing credentials', async () => {
  const sendLast=(type,input)=>new Promise(resolve=>chrome.runtime.onMessage.listeners.at(-1)({type,input},sender,resolve));
  const originalContains=chrome.permissions.contains;
  const before=structuredClone(localData.settings);
  chrome.permissions.contains=async()=>false;
  let response=await sendLast('update',{allSites:true});
  assert.equal(response.ok,false);assert.deepEqual(localData.settings,before);
  chrome.permissions.contains=originalContains;
  response=await sendLast('update',{enabled:true,allSites:false,sites:[{domain:'example.com',enabled:true},{domain:'chatgpt.com',enabled:false}]});
  assert.equal(response.ok,true);assert.equal(response.result.active,true);
  assert.deepEqual(response.result.sites,[{domain:'example.com',enabled:true},{domain:'chatgpt.com',enabled:false}]);
  assert.ok(config.value.pacScript.data.includes('example.com'));
  assert.ok(!config.value.pacScript.data.includes('oaistatic.com'));
  response=await sendLast('update',{allSites:true});
  assert.equal(response.ok,true);assert.equal(response.result.active,true);
  assert.ok(config.value.pacScript.data.includes('if (true)'));
  assert.equal(response.result.password,undefined);
});
test('upgrade refreshes this extension routing and keeps a competing extension in control',async()=>{
 const installed=chrome.runtime.onInstalled.listeners.at(-1);
 await new Promise(resolve=>chrome.runtime.onMessage.listeners.at(-1)({type:'update',input:{enabled:true,allSites:false,sites:[{domain:'chatgpt.com',enabled:true}]}},sender,resolve));
 config.value.pacScript.data='old configuration';
 installed();
 await new Promise(r=>setTimeout(r,20));
 assert.equal(config.value.pacScript.data,makePac(ROUTES[0],localData.settings));
 config={levelOfControl:'controlled_by_other_extensions',value:{mode:'fixed_servers'}};
 installed();
 await new Promise(r=>setTimeout(r,20));
 assert.equal(config.levelOfControl,'controlled_by_other_extensions');
 assert.equal(config.value.mode,'fixed_servers');
});
test('changing routes clears auth retries but preserves the floating panel token',async()=>{
 sessionData['panel:123']={token:'panel-token'};sessionData['auth:old-request']=true;
 config={levelOfControl:'controlled_by_this_extension',value:{mode:'pac_script',pacScript:{data:makePac(ROUTES[0],localData.settings)}}};
 const response=await new Promise(resolve=>chrome.runtime.onMessage.listeners.at(-1)({type:'update',input:{routeId:'tokyo'}},sender,resolve));
 assert.equal(response.ok,true);assert.deepEqual(sessionData['panel:123'],{token:'panel-token'});assert.equal(sessionData['auth:old-request'],undefined);
});
