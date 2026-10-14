/* Self-check for the built-in trips. Run: node check.mjs   (server must be running, with no API key)
 *
 * The product's whole claim is that every card quotes something a person actually said. A quote
 * that cannot be found verbatim in the source is the one defect that breaks that claim, and it is
 * invisible on screen because a plausible sentence in italics looks exactly like a real one.
 * Live extraction is told to quote verbatim but is not checked here. The built-in trips are
 * handwritten, so here every quote must match.
 */
// Same port rule as server.js and build-standalone.js. BASE, when set, wins over PORT.
const B = process.env.BASE || `http://127.0.0.1:${Number(process.env.PORT || 4830)}`;
const j = async (p, o) => (await fetch(B + p, o)).json();
const post = (p, b) => j(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) });

let fails = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? "ok" : "FAIL"} · ${name}`);
  if (!pass) { if (detail) console.log("   " + detail); fails++; }
};

// With a key the server sends even the built-in conversations to the model, so this would test model
// output on that key instead of the built-in trips. Refuse before anything is reset or planned.
const KEY_SET = "A Claude API key is set. These run on the built-in trips only: start the server without the key and try again.";
const state = await j("/api/state");
if (state.hasKey) {
  console.log(KEY_SET);
  process.exitCode = 1;
} else {
  ok("both sample trips are offered", (state.samples || []).length === 2,
     "got " + (state.samples || []).length);

  for (const smp of state.samples || []) {
    console.log(`\n--- ${smp.id} ---`);
    await post("/api/reset");
    const t = await post("/api/plan", { transcript: smp.text });

    ok("has a title and people", Boolean(t.title) && (t.people || []).length >= 2);
    ok("8 to 12 cards", t.cards.length >= 8 && t.cards.length <= 12, `${t.cards.length} cards`);
    ok("has wants", (t.wants || []).length >= 6, `${(t.wants || []).length} wants`);

    const badCards = t.cards.filter((c) => c.quote && !t.source.includes(c.quote));
    ok("every card quote is verbatim in the source", badCards.length === 0,
       badCards.map((c) => `${c.title}: ${JSON.stringify(c.quote)}`).join("\n   "));

    const badWants = (t.wants || []).filter((w) => !t.source.includes(w.quote));
    ok("every want quote is verbatim in the source", badWants.length === 0,
       badWants.map((w) => `${w.text}: ${JSON.stringify(w.quote)}`).join("\n   "));

    ok("every card has coordinates", t.cards.every((c) => typeof c.lat === "number" && typeof c.lng === "number"));
    ok("every card has a day", t.cards.every((c) => Number(c.day) > 0));
    ok("conflict cards exist so there is something to swipe away",
       t.cards.filter((c) => c.note2 === "conflict").length >= 1);
    ok("conflict cards carry no quote, because nobody said them",
       t.cards.filter((c) => c.note2 === "conflict").every((c) => !c.quote));
    ok("ride labels are one short word", t.cards.every((c) => !c.ride || c.ride.split(" ").length === 1),
       t.cards.filter((c) => c.ride && c.ride.split(" ").length > 1).map((c) => c.ride).join(", "));
    ok("partner picks reference real cards",
       (t.partner.picks || []).every((id) => t.cards.some((c) => c.id === id)));
    ok("at least one bookable card", t.cards.filter((c) => c.book).length >= 1);

    // the booking handoff
    const target = t.cards.find((c) => c.book);
    const after = await post("/api/book", { id: target.id });
    const booked = after.cards.find((c) => c.id === target.id);
    ok("booking returns a reference and is flagged demo",
       Boolean(booked.booked && booked.booked.ref) && booked.booked.demo === true);
  }

  await post("/api/reset");
  console.log(`\n${fails === 0 ? "all passed" : fails + " FAILED"}`);
  // process.exitCode, not process.exit(): exiting hard while fetch keepalive sockets are still open
  // trips a libuv assertion on Windows and prints a scary line after a clean pass.
  process.exitCode = fails === 0 ? 0 : 1;
}
