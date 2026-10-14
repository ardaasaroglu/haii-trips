# Working on Haii Trips

Notes for anyone changing this code with a coding agent. Every line under Traps prevented a real
mistake, most of them mistakes already made in this codebase.

---

## What this is

A conversation becomes a trip. Two people talk about where they want to go, Haii Trips extracts what
each of them actually asked for, hands them a deck to swipe, and the trip is what they both said yes
to.

**The input is a conversation, not a prompt box.** The app listens to the conversation people were
already having, and the design protects that. Do not put a chat box on the front door.

## Commands

```
npm run dev      # http://localhost:4830
npm run check    # checks both built-in trips. Server must be running with no key set.
node build-standalone.js   # bakes haii-trips-demo.html. Server must be running with no key set.
```

"No key set" means no `ANTHROPIC_API_KEY` in the environment and none in `.env`. With a key, the
server sends even the built-in conversations to the model, so the check would test model output
and the build would bake model output into the hosted demo. Both commands reset the stored
trip. After any change to `public/index.html`, `server.js` or `build-standalone.js`, rebuild and
commit `haii-trips-demo.html`. The demo bakes in all three: the page, the built-in trips and
briefings that `server.js` serves, and the stub in `build-standalone.js`. A change to any of them
leaves the hosted demo stale. CI cannot catch a stale copy because the build bakes in the forecast
of the day it runs.

On Windows, double-clicking `Haii Trips.cmd` starts the server AND opens a real app window (Chrome
or Edge in `--app` mode, own profile, no browser chrome), then stops the server when the window
closes. `start.cmd` is the plain version: it opens a tab in the default browser, then runs the
server in the `start.cmd` window until you close it. The tab can open a moment before the server
listens, so reload once if it shows an error.

## Invariants

**ZERO DEPENDENCIES, and this is not a preference.** Node's own `http` and global `fetch`, nothing
installed, no `node_modules`. No dependency upgrade can break it, and it runs wherever Node runs.

**Storage is a JSON file at `data/trip.json`.** No database, no migrations. A prototype must not be
able to corrupt anything.

**Every card carries a verbatim quote from the conversation, or it carries none and says so.** This
is the trust mechanism and the whole point. `npm run check` verifies that every quote in the
built-in trips appears verbatim in its source conversation, and they must pass at 100% because they
are handwritten. The check does not cover live extraction. The model is told to quote exactly, but a
model can return a quote that is close and not exact.

**The API refuses requests that another website makes the browser send.** `fromThisApp` in
`server.js` refuses a request another site made the browser send, and one whose `Host` is not this
machine, because with a key set a planted `/api/plan` call spends money on that key. Every `/api/*`
route is covered by it, so keep anything private under `/api/`. It is not a login: local tools with
no browser, like `check.mjs` and `build-standalone.js`, send neither `Sec-Fetch-Site` nor `Origin`
and are let through, and so is any other program on this machine.

**A failed live extraction says so on screen.** The server still returns the Thailand trip, marked
`sample-after-error` with the reason, and the page shows that until the next trip. A fallback must
never pass for the person's own conversation.

**Simulated things say they are simulated.** Every booking sheet is stamped Demo and says no vendor
is contacted and no money moves. Do not quietly remove that when the sheets get prettier.

## Traps

**A BACKTICK INSIDE A TEMPLATE LITERAL ENDS IT, and the wreckage still parses.** Writing a patch
script whose replacement string is a template literal containing the client's own backticks kills
the script; putting a backtick inside an HTML comment that sits inside an `innerHTML` template
produces valid JavaScript that throws at runtime. **Put any block containing backticks in a raw
`.txt` file and read it in.** Never inline it.

**`$$` in a `String.replace` replacement is an escape for one literal `$`.** Every `$${expr}` in a
patch collapsed to `${expr}` and the prices silently lost their currency symbol: "$44" rendered as
"44". **Use a replacer function** (`h.replace(from, () => to)`), because function returns are not
scanned for `$` patterns.

**Parsing is not running.** `new vm.Script(...)` proves a file parses. It cannot catch a
ReferenceError. Do not report a client change as verified on a parse check alone; drive it.

**A percentage height on an element inside a container that grows with its own content chases
itself.** The welcome hero was `height:62%` of a section sized by its content, so taller content made
a taller hero made taller content. On a 667px phone it put the primary button 57px below the fold.
Use viewport units for anything that must fit a screen.

**Check nothing else is already on port 4830 before believing a reload.** A server left running from
`Haii Trips.cmd` served stale code for an entire round of changes.

**Open-Meteo's condition code and its rain probability disagree.** It will report "Drizzle" with a 1%
chance of rain. Copy that names both produces "Drizzle today, 1% chance of rain", which reads as
nonsense. **Name whichever signal actually triggered the message**, never both. The same holds for
layout: a tile reading "Drizzle" beside a tile reading "Unlikely" looks broken even though both are
true. Status tiles show the number and no judgement word.

**An adaptation that fires on everything is noise, and noise gets switched off.** The first version
offered to move a *driving day* out of the rain. Cards are scored against what that specific weather
actually spoils: cloud ruins stargazing, rain ruins a hike, neither cancels a drive.

**Conversely, an adaptation that demands perfect conditions never fires at all.** Requiring a clear
night on a trip where every night is overcast is correct logic and a useless feature. "Better" means
meaningfully better than today.

**`/api/weather` only forecasts cards that BOTH swipers accepted** when the trip has a second
swiper. The standalone builder once set only one side and baked an empty forecast. If weather comes
back empty, check the partner decisions first.

**Safety copy is not a booking stamp.** The briefing screens are handwritten and marked demo, same
as everything else, but a fake booking costs nobody anything and a safety line somebody acts on can.
So: the stamp is rendered on the screen itself rather than only in the payload, an unknown
destination says **nothing is connected** instead of inventing a calm city, and **no sentence may
claim live safety data while the data is handwritten.** The weather line on the live screen keeps
its green dot and shows the time since the page fetched the forecast, because that one **is** a live
call. The server caches each forecast for up to 30 minutes, so the data itself can be that much
older than the time shown.

**Every new `/api/*` route needs a matching stub in `build-standalone.js`, or the single-file demo
breaks silently.** The standalone replaces `window.fetch` with a hard-coded switch. A route that
exists only on the server works in `npm run dev`, passes `npm run check`, and then dies in the one
build people open on a phone.

**The stub in `build-standalone.js` is itself a template literal, so nothing inside it may contain a
backtick or a backslash.** The template reads every backslash as an escape: `\b` becomes a backspace
character, `\n` becomes a real line break inside a string, and `\d` silently becomes `d`. Use plain
string methods and character classes such as `[0-9]` in stub code.

**A hidden or background browser tab throttles timers, so anything on a `setTimeout` chain stalls.**
The partner auto-swipe never completes when the page is not compositing, which reads as a hang and
is not one. Drive that state through the API instead, then reload and verify the render.
