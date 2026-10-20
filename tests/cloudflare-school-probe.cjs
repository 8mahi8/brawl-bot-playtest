'use strict';
// Offline deterministic tests: no Cloudflare account, no outside network.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../experiments/cloudflare-school-probe');
const html=fs.readFileSync(path.join(dir,'GoogleSites_Embed_Code.txt'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert(script,'single standalone inline JavaScript is required');
new vm.Script(script,{filename:'GoogleSites_Embed_Code.txt'});
assert(html.includes('<style>')&&html.includes('<meta name="viewport"'),'embed must be complete single file');
assert(!/https:\/\/mygame-|firebaseio\.com|firebasedatabase\.app/.test(html),
 'probe is independent from BRAWL live Firebase');
assert(!/localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest/.test(html),
 'no persistence, identifiers or telemetry');
assert(html.includes('id="base"')&&html.includes('id="test"'),
 'user must explicitly supply endpoint and initiate probe');
assert(!html.includes('<iframe'),'Google Sites embeds this document itself');

// Emulate Cloudflare Worker endpoint in memory, including WS event handlers.
// For the WebSocket 101 response Node's standard Response rejects 101, so fake it.
class FakeResponse{
 constructor(body,{status=200,headers={},webSocket=null}={}){
  this.body=body;this.status=status;this.headers=headers;this.webSocket=webSocket;
 }
}
class FakeSocket{
 constructor(){this.handlers={};this.received=[];this.closed=false;this.readyState=1;}
 accept(){this.accepted=true;}
 addEventListener(type,fn){this.handlers[type]=fn;}
 send(data){this.partner.received.push(data);}
 close(code,reason){this.closed=true;this.closeCode=code;this.closeReason=reason;this.readyState=3;}
 incoming(data){this.handlers.message?.({data});}
}
const sockets=[];
class FakePair{
 constructor(){
  const a=new FakeSocket(),b=new FakeSocket();a.partner=b;b.partner=a;
  this[0]=a;this[1]=b;sockets.push([a,b]);
 }
}
async function checkWorker(){
 global.WebSocketPair=FakePair;global.Response=FakeResponse;
 const {default:worker}=await import(path.join(dir,'worker.mjs'));
 const req=(route,options={})=>worker.fetch(new Request('https://unit-test.workers.dev'+route,options));
 let r=await req('/health');
 assert.equal(r.status,200);
 assert.deepEqual(JSON.parse(r.body),{probe:'brawl-cf-connect',version:1,status:'ok'});
 assert.equal(r.headers['Access-Control-Allow-Origin'],'*','health fetch must work from Google Sites iframe');
 r=await req('/health',{method:'OPTIONS'});
 assert.equal(r.status,204);
 r=await req('/ws');
 assert.equal(r.status,426,'no upgrade must not return 101');
 r=await req('/ws',{headers:{Upgrade:'websocket'}});
 assert.equal(r.status,101);
 const [client,server]=sockets.at(-1);
 assert.equal(r.webSocket,client);
 assert.equal(server.accepted,true);
 server.incoming(JSON.stringify({type:'ping',seq:0,nonce:'browser_nonce_001'}));
 assert.deepEqual(JSON.parse(client.received.at(-1)),
  {type:'pong',seq:0,nonce:'browser_nonce_001'});
 server.incoming(JSON.stringify({type:'ping',seq:4,nonce:'browser_nonce_001'}));
 assert.equal(client.received.length,2);
 server.incoming(JSON.stringify({type:'ping',seq:5,nonce:'browser_nonce_001'}));
 assert.equal(server.closed,true,'invalid sequence closes rather than echo arbitrary content');
 r=await req('/ws',{headers:{Upgrade:'websocket'}});
 const [c2,s2]=sockets.at(-1);
 s2.incoming('a'.repeat(513));
 assert.equal(s2.closeCode,1008);
 assert.equal(c2.received.length,0,'oversized message is never reflected');
 r=await req('/ws',{headers:{Upgrade:'websocket'}});
 const [,s3]=sockets.at(-1);
 for(let i=0;i<13;i++)s3.incoming(JSON.stringify({type:'ping',seq:0,nonce:'browser_nonce_001'}));
 assert.equal(s3.closed,true,'public endpoint enforces message budget');
 return worker;
}
function makeDom(){
 const handlers=new Map();
 const nodes={};
 for(const k of ['base','test','copy','result','http','socket','echo','details']){
  nodes[k]={id:k,value:'',textContent:'',disabled:false,className:'',
   addEventListener(type,fn){handlers.set(k+':'+type,fn);},
   focus(){this.focused=true;},select(){this.selected=true;}};
 }
 nodes.base.value='https://unit-test.workers.dev';
 return {handlers,nodes,getElementById:id=>nodes[id]};
}
async function checkBrowser(allowHttp=true,allowSocket=true){
 const dom=makeDom(),copied=[],endpoints=[],messages=[];
 class Socket{
  constructor(url){
   endpoints.push(url);this.readyState=0;
   queueMicrotask(()=>{
    if(allowSocket){this.readyState=1;this.onopen?.();}
    else{this.readyState=3;this.onerror?.({});}
   });
  }
  send(raw){
   const msg=JSON.parse(raw);messages.push(msg);
   queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({
    type:'pong',seq:msg.seq,nonce:msg.nonce})}));
  }
  close(){this.readyState=3;}
 }
 const context={document:dom,navigator:{clipboard:{writeText:async s=>copied.push(s)}},
  URL,AbortController,WebSocket:Socket,Date,Math,Promise,
  performance:{now:(()=>{let t=400;return ()=>t+=3.5;})()},
  setTimeout,clearTimeout,fetch:async u=>{
   endpoints.push(u);
   if(!allowHttp)throw Error('mock network reject');
   return {ok:true,json:async()=>({probe:'brawl-cf-connect',status:'ok',version:1})};
  }};
 vm.createContext(context);vm.runInContext(script,context);
 assert.deepEqual(endpoints,[],'no calls before user starts');
 await dom.handlers.get('test:click')();
 assert(dom.nodes.result.value.includes('往復メッセージ：'+(allowSocket?'5':'0')+'/5'));
 assert(dom.nodes.result.value.includes('URL・ルーム番号・個人識別子は含みません'));
 assert(!dom.nodes.result.value.includes('unit-test.workers.dev'),
  'report should not expose Cloudflare account URL');
 assert.equal(dom.nodes.test.disabled,false);
 if(allowHttp)assert.equal(dom.nodes.http.textContent.startsWith('成功'),true);
 if(allowSocket) {
  assert.equal(messages.length,5);
  assert.equal(dom.nodes.socket.textContent,'接続成功');
  assert.equal(dom.nodes.echo.textContent,'5/5 応答あり');
 } else {
  assert.equal(dom.nodes.socket.textContent,'接続失敗');
  assert.equal(dom.nodes.echo.textContent,'完了せず');
 }
 await dom.handlers.get('copy:click')();
 assert.equal(copied[0],dom.nodes.result.value);
 return {dom,endpoints};
}
async function main(){
 await checkWorker();
 await checkBrowser(true,true);
 await checkBrowser(true,false);
 await checkBrowser(false,true);
 const {dom,endpoints}=await checkBrowser(true,true);
 dom.nodes.base.value='http://not-allowed.example';
 const count=endpoints.length;
 await dom.handlers.get('test:click')();
 assert.equal(endpoints.length,count,'insecure or invalid URL must not trigger request');
 assert(dom.nodes.details.textContent.includes('https://'));
 console.log('PASS Cloudflare Worker health CORS/WS ping bounds and Safari embed explicit success/failure/RTT/copy/no leaked URLs');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
