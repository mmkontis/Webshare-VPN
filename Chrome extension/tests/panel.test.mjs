import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedSender,openRoundedPanel} from '../panel.js';
let session={};let scripts=[];
globalThis.chrome={runtime:{id:'own',getURL:p=>`chrome-extension://own/${p}`},storage:{session:{async get(k){return {[k]:session[k]};},async set(value){Object.assign(session,value);},async remove(k){delete session[k];}}},tabs:{async query(){return [{id:123,url:'https://chatgpt.com/'}];}},scripting:{async executeScript(script){scripts.push(script);}}};
test('only native popup or its token-bound webpage iframe can issue extension commands',async()=>{
 assert.equal(await authorizedSender({id:'own',url:'chrome-extension://own/popup.html'}),true);
 assert.equal(await authorizedSender({id:'own',url:'https://evil.example/popup.html'}),false);
 assert.equal(await authorizedSender({id:'other',url:'chrome-extension://own/popup.html'}),false);
 assert.equal(await authorizedSender({id:'own',url:'chrome-extension://own/popup.html',tab:{id:123}}),false);
 assert.equal(await authorizedSender({id:'own',url:'chrome-extension://own/popup.html?panelToken=x'}),false);
 await openRoundedPanel();
 assert.equal(scripts.length,1);assert.equal(scripts[0].target.tabId,123);
 const panelUrl=scripts[0].args[0];
 assert.equal(await authorizedSender({id:'own',url:panelUrl,tab:{id:123}}),true);
 assert.equal(await authorizedSender({id:'own',url:panelUrl,tab:{id:456}}),false);
 assert.equal(await authorizedSender({id:'own',url:panelUrl.replace(session['panel:123'].token,'bad'),tab:{id:123}}),false);
});
test('rounded panel does not try to run on Chrome internal pages',async()=>{
 const query=chrome.tabs.query;chrome.tabs.query=async()=>[{id:456,url:'chrome://extensions/'}];
 try{await assert.rejects(openRoundedPanel(),/regular website/);assert.equal(scripts.length,1);}finally{chrome.tabs.query=query;}
});
