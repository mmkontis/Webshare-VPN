export function median(values) {
  const sorted = values.filter(v => Number.isFinite(v) && v >= 0).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
export async function measureLatency(fetchFn = fetch, now = () => performance.now()) {
  const samples = [];
  for (let index=0; index<3; index++) {
    const start = now();
    const response = await fetchFn(`https://speed.cloudflare.com/__down?bytes=1&t=${Date.now()}&sample=${index}`, {
      cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(5000)
    });
    const headersAt = now();
    if (!response.ok) throw new Error(`Latency test returned HTTP ${response.status}.`);
    if (/html|json/i.test(response.headers.get('content-type') || '')) throw new Error('Latency test received a challenge or error page.');
    await response.arrayBuffer();
    samples.push(headersAt-start);
  }
  return {latencyMs:median(samples), latencySamplesMs:samples};
}
