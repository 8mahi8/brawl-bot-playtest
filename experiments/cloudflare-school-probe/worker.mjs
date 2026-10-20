// BRAWL cloud-school transport feasibility test ONLY.
// Cloudflare Workers standard WebSocketPair API; no Durable Objects needed yet.
// No room state, Firebase, identity, persistence, broadcast, or gameplay.
const JSON_HEADERS={
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex, nofollow"
};
const reply=(object,status=200)=>new Response(JSON.stringify(object),
  {status,headers:JSON_HEADERS});
export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==="/health") {
      if(request.method==="OPTIONS")return new Response(null,{status:204,headers:JSON_HEADERS});
      if(request.method!=="GET")return reply({error:"method_not_allowed"},405);
      return reply({probe:"brawl-cf-connect",version:1,status:"ok"});
    }
    if(url.pathname!=="/ws")return reply({probe:"brawl-cf-connect",status:"ready",
      endpoints:["/health","/ws"]},200);
    if(request.method!=="GET")return reply({error:"method_not_allowed"},405);
    if((request.headers.get("Upgrade")||"").toLowerCase()!=="websocket")
      return reply({error:"websocket_upgrade_required"},426);
    const [client,server]=Object.values(new WebSocketPair());
    server.accept();
    let count=0;
    server.addEventListener("message",event=>{
      if(typeof event.data!=="string"||event.data.length>512||++count>12){
        server.close(1008,"probe_limit");return;
      }
      let data;
      try{data=JSON.parse(event.data);}catch(_){
        server.close(1008,"invalid_json");return;
      }
      if(!data||data.type!=="ping"||
         !Number.isInteger(data.seq)||data.seq<0||data.seq>=5||
         typeof data.nonce!=="string"||data.nonce.length<8||
         data.nonce.length>48||!/^[A-Za-z0-9_-]+$/.test(data.nonce)){
        server.close(1008,"invalid_probe");return;
      }
      server.send(JSON.stringify({type:"pong",seq:data.seq,nonce:data.nonce}));
    });
    return new Response(null,{status:101,webSocket:client});
  }
};
