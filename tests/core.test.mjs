import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ROUTES, makePac, controlsRoute, isOwnChallenge, mbps, formatSpeed} from '../core.js';
test('PAC sends only ChatGPT, its assets/auth and test hosts through the selected endpoint', () => {
  for (const route of ROUTES) {
    const context = {dnsDomainIs: (host, suffix) => host.endsWith(suffix)};
    vm.createContext(context); vm.runInContext(makePac(route), context);
    for (const host of ['chatgpt.com','www.chatgpt.com','ab.chatgpt.com','cdn.oaistatic.com','oaiusercontent.com','files.oaiusercontent.com','auth.openai.com','speed.cloudflare.com','ipv4.webshare.io']) {
      assert.equal(context.FindProxyForURL(`https://${host}/`, host), `PROXY ${route.host}:${route.port}`);
    }
    for (const host of ['example.com','evilchatgpt.com','chatgpt.com.evil.com','api.openai.com','localhost','speed.cloudflare.com.evil.com','example.oaistatic.com.evil.com']) {
      assert.equal(context.FindProxyForURL(`https://${host}/`, host), 'DIRECT');
    }
  }
});
test('green active state requires this extension to own its exact selected PAC', () => {
  const settings = {enabled: true, routeId: 'frankfurt'};
  const config = {levelOfControl: 'controlled_by_this_extension', value: {mode: 'pac_script', pacScript: {data: makePac(ROUTES[0])}}};
  assert.equal(controlsRoute(config, settings), true);
  assert.equal(controlsRoute({...config, levelOfControl: 'controlled_by_other_extensions'}, settings), false);
  assert.equal(controlsRoute(config, {...settings, enabled: false}), false);
  assert.equal(controlsRoute(config, {...settings, routeId: 'warsaw'}), false);
  assert.equal(controlsRoute({...config, value: {mode: 'direct'}}, settings), false);
});
test('credentials are restricted to the selected proxy authentication challenge', () => {
  const settings = {enabled: true, routeId: 'frankfurt', username: 'test-user', password: 'test-secret'};
  const details = {isProxy: true, challenger: {host: '31.58.9.4', port: 6077}};
  assert.equal(isOwnChallenge(details, settings), true);
  assert.equal(isOwnChallenge({...details, isProxy: false}, settings), false);
  assert.equal(isOwnChallenge({...details, challenger: {host: 'evil.com', port: 6077}}, settings), false);
  assert.equal(isOwnChallenge({...details, challenger: {host: '31.58.9.4', port: 80}}, settings), false);
  assert.equal(isOwnChallenge(details, {...settings, enabled: false}), false);
  assert.equal(isOwnChallenge(details, {...settings, password: ''}), false);
  assert.ok(!makePac(ROUTES[0]).includes(settings.password));
});
test('Mbps uses bits, elapsed milliseconds, one decimal and no artificial cap', () => {
  assert.equal(mbps(12500000, 1000), 100);
  assert.equal(formatSpeed(mbps(12500, 1000)), '0.1');
  assert.equal(formatSpeed(100.14), '100.1');
  assert.equal(formatSpeed(321.57), '321.6');
  assert.equal(mbps(0, 1000), null);
  assert.equal(mbps(1000, 0), null);
  assert.equal(mbps(Infinity, 1000), null);
  assert.equal(formatSpeed(null), '—');
});
test('selected site routing includes subdomains, excludes lookalike hosts, and keeps ChatGPT dependencies optional', () => {
  const route=ROUTES[0];
  const context={dnsDomainIs:(host,suffix)=>host.endsWith(suffix)};
  vm.createContext(context);
  vm.runInContext(makePac(route,{sites:[{domain:'example.com',enabled:true},{domain:'chatgpt.com',enabled:false}]}),context);
  assert.equal(context.FindProxyForURL('https://www.example.com','www.example.com'),`PROXY ${route.host}:${route.port}`);
  for(const host of ['evil-example.com','example.com.evil.com','chatgpt.com','cdn.oaistatic.com','auth.openai.com']) assert.equal(context.FindProxyForURL(`https://${host}`,host),'DIRECT');
  assert.equal(context.FindProxyForURL('https://speed.cloudflare.com','speed.cloudflare.com'),`PROXY ${route.host}:${route.port}`);
});
test('all sites routes public websites while preserving local addresses', () => {
  const route=ROUTES[0];const context={dnsDomainIs:(host,suffix)=>host.endsWith(suffix)};
  vm.createContext(context);vm.runInContext(makePac(route,{allSites:true,sites:[]}),context);
  for(const host of ['example.com','news.example.org','google.com','chatgpt.com','172.40.1.2']) assert.equal(context.FindProxyForURL(`https://${host}`,host),`PROXY ${route.host}:${route.port}`);
  for(const host of ['localhost','dev.localhost','printer.local','127.0.0.1','10.0.0.2','192.168.1.1','172.16.0.1','172.31.255.1','169.254.10.1','[::1]']) assert.equal(context.FindProxyForURL(`http://${host}`,host),'DIRECT');
});
test('website input normalizes domains and rejects unsafe or local entries', async () => {
  const {normalizeSite,normalizeSites,routingOrigins}=await import('../core.js');
  assert.equal(normalizeSite('https://www.Example.com/path?q=1'),'example.com');
  for(const value of ['javascript:alert(1)','https://user:password@example.com','localhost','127.0.0.1','example.com:8443','foo.local','x;example.com']) assert.throws(()=>normalizeSite(value));
  assert.deepEqual(normalizeSites([{domain:'www.example.com',enabled:true},{domain:'example.com',enabled:false}]),[{domain:'example.com',enabled:false}]);
  assert.deepEqual(routingOrigins({allSites:true}),['http://*/*','https://*/*']);
  assert.deepEqual(routingOrigins({sites:[{domain:'example.com',enabled:true},{domain:'google.com',enabled:false}]}),['http://*.example.com/*','https://*.example.com/*']);
});
