export const ROUTES = [
  {id: 'frankfurt', label: '🇩🇪 Frankfurt', host: '31.58.9.4', port: 6077},
  {id: 'warsaw', label: '🇵🇱 Warsaw', host: '84.247.60.125', port: 6095},
  {id: 'madrid', label: '🇪🇸 Madrid', host: '64.137.96.74', port: 6641},
  {id: 'london1', label: '🇬🇧 London 1', host: '31.59.20.176', port: 6754},
  {id: 'london2', label: '🇬🇧 London 2', host: '45.38.107.97', port: 6014},
  {id: 'la3', label: '🇺🇸 Los Angeles 3', host: '198.46.161.42', port: 5092},
  {id: 'la2', label: '🇺🇸 Los Angeles 2', host: '191.96.254.138', port: 6185},
  {id: 'tokyo', label: '🇯🇵 Tokyo', host: '142.111.67.146', port: 5611},
  {id: 'la1', label: '🇺🇸 Los Angeles 1', host: '198.23.243.226', port: 6361},
  {id: 'piscataway', label: '🇺🇸 Piscataway', host: '38.154.185.97', port: 6370}
];
export const DEFAULT_SITES = [
  {domain: 'chatgpt.com', enabled: true},
  {domain: 'google.com', enabled: false},
  {domain: 'youtube.com', enabled: false},
  {domain: 'github.com', enabled: false}
];
export const SITE_NAMES = {'chatgpt.com': 'ChatGPT', 'google.com': 'Google', 'youtube.com': 'YouTube', 'github.com': 'GitHub'};
export const DEFAULTS = {enabled: false, routeId: 'frankfurt', username: '', password: '', allSites: false, sites: DEFAULT_SITES};
export function normalizeSite(value) {
  const input = String(value).trim();
  let url;
  try { url = new URL(input.includes('://') ? input : 'https://' + input); }
  catch { throw new Error('Enter a valid website domain.'); }
  const domain = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      domain.length > 253 || !/[a-z]/i.test(domain) ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain) ||
      domain.endsWith('.local') || domain.endsWith('.localhost')) throw new Error('Use a public website domain, without a port or credentials.');
  return domain;
}
export function normalizeSites(sites) {
  if (!Array.isArray(sites) || sites.length > 50) throw new Error('Choose up to 50 websites.');
  const result = new Map();
  for (const site of sites) result.set(normalizeSite(site.domain), {domain: normalizeSite(site.domain), enabled: !!site.enabled});
  return [...result.values()];
}
export function routingOrigins(settings) {
  if (settings.allSites) return ['http://*/*', 'https://*/*'];
  return (settings.sites || DEFAULT_SITES).filter(s => s.enabled).flatMap(s => [`http://*.${s.domain}/*`, `https://*.${s.domain}/*`]);
}
export function selectedRoute(settings) { return ROUTES.find(r => r.id === settings.routeId) || ROUTES[0]; }
export function makePac(route, settings = DEFAULTS) {
  const domains = (settings.sites || DEFAULT_SITES).filter(s => s.enabled).map(s => s.domain);
  const chatgpt = domains.includes('chatgpt.com');
  if (chatgpt) domains.push('oaistatic.com', 'oaiusercontent.com');
  const exact = ['speed.cloudflare.com', 'ipv4.webshare.io'];
  if (chatgpt) exact.push('auth.openai.com');
  return `function FindProxyForURL(url, host) {
    host = host.toLowerCase();
    if (host === 'localhost' || host === '[::1]' || host === '::1' ||
        host.indexOf('.') === -1 || dnsDomainIs(host, '.localhost') || dnsDomainIs(host, '.local') ||
        /^(127\\.|10\\.|192\\.168\\.|169\\.254\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)/.test(host)) return 'DIRECT';
    if (${!!settings.allSites}) return 'PROXY ${route.host}:${route.port}';
    var domains = ${JSON.stringify(domains)};
    var exact = ${JSON.stringify(exact)};
    for (var i = 0; i < domains.length; i++) {
      if (host === domains[i] || dnsDomainIs(host, '.' + domains[i])) return 'PROXY ${route.host}:${route.port}';
    }
    for (var j = 0; j < exact.length; j++) {
      if (host === exact[j]) return 'PROXY ${route.host}:${route.port}';
    }
    return 'DIRECT';
  }`;
}
export function controlsRoute(config, settings) {
  return settings.enabled && config.levelOfControl === 'controlled_by_this_extension' &&
    config.value?.mode === 'pac_script' && config.value.pacScript?.data === makePac(selectedRoute(settings), settings);
}
export function isOwnChallenge(details, settings) {
  const route = selectedRoute(settings);
  return !!(settings.enabled && settings.username && settings.password && details.isProxy &&
    details.challenger?.host === route.host && details.challenger?.port === route.port);
}
export function mbps(bytes, milliseconds) {
  if (!Number.isFinite(bytes) || !Number.isFinite(milliseconds) || bytes <= 0 || milliseconds <= 0) return null;
  return bytes * 8 / (milliseconds * 1000);
}
export function formatSpeed(value) { return Number.isFinite(value) && value >= 0 ? value.toFixed(1) : '—'; }
export function sameRoute(a, b) { return a.enabled === b.enabled && a.routeId === b.routeId; }
