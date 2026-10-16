// One room created and a second client joined for BOTH modes, with a non-network RTDB mock.
// The mock deliberately does not prove real Firebase transaction/rule behavior.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
function installMock(initial){
 const clone=o=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
 const store=clone(initial||{}),watchers=[];
 const split=p=>String(p||'').split('/').filter(Boolean);
 const get=p=>{
   if(p==='.info/serverTimeOffset')return 0;
   if(p==='.info/connected')return true;
   let x=store;for(const key of split(p))x=x?.[key];return clone(x??null);
 };
 const put=(p,value)=>{
   const parts=split(p);if(!parts.length)return;
   let node=store;for(const part of parts.slice(0,-1))node=node[part]??={};
   if(value===null)delete node[parts.at(-1)];else node[parts.at(-1)]=clone(value);
   queueMicrotask(()=>{for(const w of [...watchers]){
     if(w.event!=='value')continue;
     if(w.path===p||w.path.startsWith(p+'/')||p.startsWith(w.path+'/'))
       w.cb({key:split(w.path).at(-1)||null,val:()=>get(w.path),exists:()=>get(w.path)!==null});
   }});
 };
 let index=0;
 const at=p=>({
  key:split(p).at(-1)||null,
  child(sub){return at([p,sub].filter(Boolean).join('/'));},
  async once(event){return {key:split(p).at(-1)||null,val:()=>get(p),exists:()=>get(p)!==null};},
  on(event,cb){watchers.push({path:p,event,cb});queueMicrotask(()=>{if(event==='value')cb({key:split(p).at(-1),val:()=>get(p),exists:()=>get(p)!==null});});return cb;},
  off(event,cb){for(let i=watchers.length-1;i>=0;i--)if(watchers[i].path===p&&(!event||watchers[i].event===event)&&(!cb||watchers[i].cb===cb))watchers.splice(i,1);},
  async set(value){put(p,value);},
  async update(updates){for(const [key,value] of Object.entries(updates||{}))put([p,key].filter(Boolean).join('/'),value);},
  async remove(){put(p,null);},
  async transaction(updateFn){const old=get(p),next=updateFn(clone(old));if(next===undefined)return {committed:false,snapshot:{val:()=>old}};put(p,next);return {committed:true,snapshot:{val:()=>get(p)}};},
  push(){return at([p,'mock_'+(++index)].filter(Boolean).join('/'));},
  onDisconnect(){return {async set(){},async remove(){},async cancel(){},async update(){}};}
 });
 function database(){return {ref:at};}
 database.ServerValue={TIMESTAMP:Date.now()};
 window.firebase={apps:[],initializeApp(){this.apps.push({});},database};
 window.__mockRTDB={dump:()=>clone(store)};
}
async function open(browser,mode,initial){
 const context=await browser.newContext({viewport:{width:1220,height:800}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(installMock,initial);
 await page.goto('file://'+path.resolve(root,mode==='1v1'?'online/1v1-online-lab.html':'online/2v2-online-lab.html'));
 await page.locator('details.online-config summary').click();
 await page.locator('#onlineDbInput').fill('https://test-project-default-rtdb.firebaseio.com/');
 return {context,page,errors};
}
(async()=>{
 const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(fs.existsSync);
 if(!binary)throw Error('Chromium not installed');
 const browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const mode of ['1v1','2v2']){
   const host=await open(browser,mode,{});
   try{
    await host.page.locator('#createBtn').click();
    await host.page.waitForFunction(mode=>{
       const code=document.querySelector('#roomCode')?.textContent||'';
       return /^\d{5}$/.test(code) && (mode==='1v1'? !document.querySelector('#roomCodeWrap').classList.contains('hidden') : document.querySelector('#app').dataset.scene==='lobby');
    },mode,{timeout:12000});
    const code=(await host.page.locator('#roomCode').innerText()).trim();
    const state=await host.page.evaluate(()=>window.__mockRTDB.dump());
    const prefix=mode==='1v1'?'rooms':'rooms2v2';
    assert(state[prefix]?.[code],mode+' host created a room');
    const expectedProtocol=mode==='1v1'?30:3011;
    assert.equal(state[prefix][code].v,expectedProtocol);
    await host.page.waitForTimeout(300);
    assert.equal(host.errors.length,0,'host page errors: '+host.errors);
    const guest=await open(browser,mode,state);
    try{
     if(mode==='1v1')await guest.page.locator('#openJoinPanel').click();
     await guest.page.locator('#roomInput').fill(code);
     await guest.page.locator('#joinBtn').click();
     await guest.page.waitForFunction(mode=>{
       if(mode==='1v1')return document.getElementById('lobbyStatus').textContent.includes('接続できました');
       return document.getElementById('app').dataset.scene==='lobby' &&
         document.getElementById('roomCode').textContent!=='-----';
     },mode,{timeout:12000});
     const joined=await guest.page.evaluate(()=>window.__mockRTDB.dump());
     if(mode==='1v1')assert.equal(joined[prefix][code].players.guest.online,true);
     else assert(Object.values(joined[prefix][code].lobby.seats).length>=2);
     await guest.page.waitForTimeout(300);
     assert.equal(guest.errors.length,0,'guest page errors: '+guest.errors);
     console.log('PASS '+mode+' mock RTDB: host created '+code+', guest joined, no uncaught JS errors');
    }finally{await guest.context.close();}
   }finally{await host.context.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
