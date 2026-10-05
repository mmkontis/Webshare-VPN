import test from 'node:test';
import assert from 'node:assert/strict';
import {median,measureLatency} from '../network.js';
test('HTTP latency reports the median of three uncached header response times', async()=>{
 let times=[0,100,120,140,160,220];let urls=[];
 const result=await measureLatency(async(url,options)=>{
  urls.push(url);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');
  return new Response(new Uint8Array(1),{headers:{'content-type':'application/octet-stream'}});
 },()=>times.shift());
 assert.deepEqual(result.latencySamplesMs,[100,20,60]);assert.equal(result.latencyMs,60);
 assert.equal(urls.length,3);assert.ok(urls.every(u=>u.includes('bytes=1')));
 assert.equal(new Set(urls).size,3);
});
test('latency does not count security challenge or error responses as successful measurements',async()=>{
 await assert.rejects(measureLatency(async()=>new Response('no',{status:403})),/HTTP 403/);
 await assert.rejects(measureLatency(async()=>new Response('<html>challenge</html>',{headers:{'content-type':'text/html'}})),/challenge/);
 assert.equal(median([120,20,80]),80);assert.equal(median([20,40]),30);assert.equal(median([]),null);
});
