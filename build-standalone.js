/* Build a single self-contained HTML file with BOTH built-in trips baked in.
 *
 * Why this exists: a standalone file opens on a phone and can be swiped with an actual thumb, with
 * no server and no install. It is also the file a static host such as GitHub Pages can serve.
 *
 * It takes its data from the RUNNING server rather than re-parsing server.js, so the baked trips are
 * exactly what the app produces and the two cannot drift. Start the server first, with no API key.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const base = `http://127.0.0.1:${Number(process.env.PORT || 4830)}`;
const j = async (p, o) => (await fetch(base + p, o)).json();
const post = (p, b) => j(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) });

// With a key the server sends even the built-in conversations to the model, so the build would bake
// model output into the demo. Refuse before anything is reset or planned.
const KEY_SET = "A Claude API key is set. These run on the built-in trips only: start the server without the key and try again.";
const state = await j("/api/state");
if (state.hasKey) {
  console.log(KEY_SET);
  // process.exitCode, not process.exit(), for the same Windows reason given at the end of check.mjs.
  process.exitCode = 1;
} else {
  await build(state);
}

async function build(state) {
  const samples = state.samples || [];
  const trips = {};
  for (const s of samples) {
    await post("/api/reset");
    const t = await post("/api/plan", { transcript: s.text });
    // Accept everything non-conflicting so /api/weather has a plan to forecast against, grab the
    // real forecast, then reset the decisions. The standalone then ships a genuine snapshot rather
    // than a blank in-trip screen.
    for (const c of t.cards) {
      if (c.note2 !== "conflict") await post("/api/decide", { id: c.id, decision: "in" });
      if (c.note2 !== "conflict") await post("/api/decide", { id: c.id, decision: "in", who: "partner" });
    }
    // The server forecasts a day from its first accepted card, when that card has a location. If
    // such a day comes back empty the forecast call failed, so try again rather than ship the demo
    // without its weather.
    const accepted = t.cards.filter((c) => c.note2 !== "conflict");
    const maxDay = Math.max(...accepted.map((c) => Number(c.day) || 1));
    const expected = [];
    for (let d = 1; d <= maxDay; d++) {
      const first = accepted.find((c) => Number(c.day) === d);
      if (first && typeof first.lat === "number") expected.push(d);
    }
    const missing = (w) => expected.filter((d) => !(w.days || [])[d - 1]);
    let wx = await j("/api/weather");
    for (let n = 0; n < 3 && missing(wx).length; n++) wx = await j("/api/weather");
    if (missing(wx).length) throw new Error(`no forecast for day ${missing(wx).join(", ")} of ${s.id}. Run the build again.`);
    t.weather = wx.days || [];
    t.cards = t.cards.map((c) => ({ ...c, decision: "", partner: undefined, booked: undefined }));
    t.partnerDone = false;
    trips[s.id] = t;
  }
  await post("/api/reset");

  // The date the forecast was saved, as YYYY-MM-DD on this machine's clock. The page shows it, so a
  // baked forecast is never presented as live.
  const now = new Date();
  const baked = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");

  // Safety briefings, baked so the standalone can answer /api/brief with no server behind it.
  const BRIEF_KEYS = ["tokyo", "paris", "new york", "bangkok", "thailand", "utah"];
  const briefs = {};
  for (const k of BRIEF_KEYS) briefs[k] = await j("/api/brief?dest=" + encodeURIComponent(k));
  const briefFallback = await j("/api/brief?dest=zzz-no-such-place");

  const stub = `
<script>
/* Standalone build. No server: fetch is stubbed and state lives in memory.
   Both built-in trips are baked in, so the road trip demo works offline too. */
window.HAII_TRIPS_STANDALONE = true;
(function(){
  var TRIPS = ${JSON.stringify(trips)};
  var SAMPLES = ${JSON.stringify(samples)};
  var BRIEFS = ${JSON.stringify(briefs)};
  var BRIEF_FALLBACK = ${JSON.stringify(briefFallback)};
  var BAKED = ${JSON.stringify(baked)};
  var blank = {title:"",destination:"",days:0,people:[],wants:[],cards:[],source:"",mode:"",partnerDone:false};
  var state = JSON.parse(JSON.stringify(blank));
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function reply(body){ return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(body); } }); }
  // Same rule as the server with no key: a built-in sample gets its own trip, anything else gets
  // the Thailand trip marked sample-no-key, so the page can say it is not the visitor's conversation.
  function pick(text){
    var best = SAMPLES[0], matched = false;
    for (var i=0;i<SAMPLES.length;i++){
      if (String(text||"").trim().slice(0,60) === SAMPLES[i].text.slice(0,60)) { best = SAMPLES[i]; matched = true; break; }
    }
    var t = clone(TRIPS[best.id]);
    if (!matched) t.mode = "sample-no-key";
    return t;
  }
  window.fetch = function(url, opts){
    var o = opts || {}, b = {};
    try { b = JSON.parse(o.body || "{}"); } catch(e) {}
    url = String(url);
    if (url.indexOf("/api/state") === 0)
      return reply(Object.assign({}, state, {hasKey:false, sample:SAMPLES[0].text, samples:SAMPLES}));
    if (url.indexOf("/api/plan") === 0) { state = pick(b.transcript); return reply(state); }
    if (url.indexOf("/api/decide") === 0) {
      var c = (state.cards||[]).find(function(x){ return x.id === b.id; });
      if (c) { if (b.who === "partner") c.partner = b.decision || ""; else c.decision = b.decision || ""; }
      return reply(state);
    }
    if (url.indexOf("/api/partner-done") === 0) { state.partnerDone = true; return reply(state); }
    if (url.indexOf("/api/book") === 0) {
      var d = (state.cards||[]).find(function(x){ return x.id === b.id; });
      if (d) {
        var stamp = 0, t = String(d.title);
        for (var k=0;k<t.length;k++) stamp = (stamp*31 + t.charCodeAt(k)) | 0;
        d.booked = { ref: (d.book||"HAII").slice(0,3).toUpperCase() + "-" + (Math.abs(stamp)%900000+100000), demo:true };
      }
      return reply(state);
    }
    // The forecast was saved at build time. baked carries that date so the page labels it a snapshot.
    if (url.indexOf("/api/weather") === 0) return reply({ days: state.weather || [], baked: BAKED });
    if (url.indexOf("/api/live") === 0) { state.live = true; if (b.day) state.liveDay = b.day; return reply(state); }
    if (url.indexOf("/api/move") === 0) {
      var mc = (state.cards||[]).find(function(x){ return x.id === b.id; });
      if (mc && b.day) mc.day = b.day;
      return reply(state);
    }
    if (url.indexOf("/api/ask") === 0) {
      var inn = (state.cards||[]).filter(function(c){ return c.decision === "in" && (state.partner ? c.partner === "in" : true); });
      var ql = String(b.q||"").toLowerCase(), ans;
      var dm = ql.match(/day ([0-9]+)/);
      if (dm) { var dd = Number(dm[1]); var its = inn.filter(function(c){ return Number(c.day) === dd; });
        ans = its.length ? "Day " + dd + ": " + its.map(function(c){ return (c.time||"any time") + " " + c.title; }).join(", ") + "." : "Nothing is planned for day " + dd + " yet."; }
      else if (/eat|food|dinner|lunch|restaurant/.test(ql)) { var f = inn.filter(function(c){ return c.kind === "food"; });
        ans = f.length ? "Food on this trip: " + f.map(function(c){ return c.title + " on day " + c.day; }).join(", ") + "." : "No meals are planned yet."; }
      else if (/cost|budget|spend|money|how much/.test(ql)) { var heads = (state.people||[]).length || 2;
        var tot = inn.reduce(function(a2,c){ return a2 + (Number(String(c.cost).replace(/[^0-9.]/g,"")) || 0) * heads; }, 0);
        ans = "About $" + Math.round(tot) + " for " + heads + " of you, across " + inn.length + " things."; }
      else { ans = "Your trip has " + inn.length + " things. Ask me about a specific day, the food, or the budget."; }
      return reply({ answer: ans, mode: "offline" });
    }
    // Briefings. Same matching order as briefFor() on the server: exact, then substring, then the
    // honest fallback. No regex and no escapes in here, because this whole block lives inside a
    // template literal and a stray backslash-b would become a backspace character.
    if (url.indexOf("/api/brief") === 0) {
      var raw = String(url).split("dest=")[1] || "";
      var q = "";
      try { q = decodeURIComponent(raw).trim().toLowerCase(); } catch (e) { q = raw.toLowerCase(); }
      if (BRIEFS[q]) return reply(BRIEFS[q]);
      var keys = Object.keys(BRIEFS), hit = "";
      for (var bi = 0; bi < keys.length; bi++) {
        if (q && (q.indexOf(keys[bi]) >= 0 || keys[bi].indexOf(q) >= 0)) { hit = keys[bi]; break; }
      }
      if (hit) return reply(BRIEFS[hit]);
      var fb = clone(BRIEF_FALLBACK);
      fb.name = q ? q.charAt(0).toUpperCase() + q.slice(1) : "Nowhere yet";
      return reply(fb);
    }
    if (url.indexOf("/api/reset") === 0) { state = clone(blank); return reply(state); }
    return reply({});
  };
})();
</script>`;

  // The single file has to stand alone: it may be opened from disk or served from a subpath, where
  // "/icon.svg" and "/manifest.webmanifest" do not exist. So the icon is inlined and the manifest
  // link, which only matters for installing the server-backed app, is dropped.
  const icon = readFileSync(join(ROOT, "public", "icon.svg"));
  const iconUri = "data:image/svg+xml;base64," + icon.toString("base64");
  const ICON_LINK = '<link rel="icon" href="/icon.svg">';
  const MANIFEST_LINK = '<link rel="manifest" href="/manifest.webmanifest">';
  const page = readFileSync(join(ROOT, "public", "index.html"), "utf8");
  if (!page.includes(ICON_LINK) || !page.includes(MANIFEST_LINK)) throw new Error("icon or manifest link not found in index.html");
  const html = page
    .replace(ICON_LINK, () => '<link rel="icon" href="' + iconUri + '">')
    .replace(MANIFEST_LINK, () => "");
  const out = join(ROOT, "haii-trips-demo.html");
  // A replacer function here too: the stub holds prices like "$9", and a string replacement would
  // read "$" patterns in it.
  writeFileSync(out, html.replace("<script>", () => stub + "\n<script>"));
  console.log(`wrote ${out}`);
  for (const id of Object.keys(trips)) {
    const t = trips[id];
    console.log(`  baked ${id}: ${t.title}, ${t.cards.length} cards, ${t.wants.length} wants, forecast saved ${baked}`);
  }
}
