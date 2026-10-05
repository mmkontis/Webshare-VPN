export async function authorizedSender(sender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  let url;
  try {url = new URL(sender.url);} catch {return false;}
  const own = new URL(chrome.runtime.getURL('popup.html'));
  if (url.protocol !== own.protocol || url.host !== own.host || url.pathname !== own.pathname) return false;
  if (!sender.tab) return !url.searchParams.has('panelToken');
  const key = `panel:${sender.tab.id}`;
  const record = (await chrome.storage.session.get(key))[key];
  return !!(record && url.searchParams.get('panelToken') === record.token);
}
export async function openRoundedPanel() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open a regular website, then open the rounded panel.');
  const token = crypto.randomUUID();
  const url = new URL(chrome.runtime.getURL('popup.html'));
  url.searchParams.set('panelToken',token);
  await chrome.storage.session.set({[`panel:${tab.id}`]:{token}});
  try {
    await chrome.scripting.executeScript({
      target:{tabId:tab.id},
      func: mountRoundedPanel,
      args:[url.toString()]
    });
  } catch {
    await chrome.storage.session.remove(`panel:${tab.id}`);
    throw new Error('Chrome cannot display the panel on this page. Try ChatGPT or another regular website.');
  }
  return {opened:true};
}
export function mountRoundedPanel(url) {
  globalThis.__chatgptMeterPanel?.remove();
  const host=document.createElement('div');
  globalThis.__chatgptMeterPanel=host;
  host.setAttribute('aria-label','Webshare VPN floating panel');
  Object.assign(host.style,{all:'initial',position:'fixed',top:'16px',right:'16px',width:'396px',height:'576px',maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100vh - 32px)',zIndex:'2147483647'});
  const shadow=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=':host{color-scheme:dark}.frame{position:absolute;inset:0;overflow:hidden;border-radius:26px;box-shadow:0 12px 64px #0009;border:1px solid #3a5142;background:#080e0b}iframe{display:block;width:100%;height:100%;border:0}button{position:absolute;right:10px;top:10px;width:25px;height:25px;border:0;border-radius:50%;background:#21382b;color:#cbe7d5;font:19px Arial;cursor:pointer;z-index:2}button:focus-visible{outline:2px solid #63dba8}';
  const frame=document.createElement('div');frame.className='frame';
  const iframe=document.createElement('iframe');iframe.src=url;iframe.title='Webshare VPN';
  const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Close proxy meter panel');close.addEventListener('click',()=>host.remove());
  frame.append(iframe,close);shadow.append(style,frame);
  (document.body || document.documentElement).append(host);
}
