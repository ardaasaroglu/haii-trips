# Contributing

Small, focused changes are welcome. Four rules keep this prototype what it is.

1. **Zero dependencies.** Node's own `http` and `fetch`. No `npm install`, and the app runs without a build step.
2. **Every quote is verbatim.** A card quotes the conversation exactly, or it carries no quote and says so.
3. **Simulated things say they are simulated.** Do not remove a Demo stamp or a Simulated label.
4. **The front door is a conversation.** No prompt box as the first screen.

Before opening a pull request:

* Start the server with no Claude key set, then run `npm run check`. Every check must pass. With a key set, the server sends even the built-in conversations to the Claude API, so the check would test model output instead of the built-in trips. A key in `.env` counts, so move that file aside while you check.
* Drive the change in a browser. A file that parses is not a change that works.
* If you changed `public/index.html`, `server.js` or `build-standalone.js`, rebuild the hosted demo. With the same keyless server running, run `node build-standalone.js` and commit the new `haii-trips-demo.html`. CI cannot check this for you, because the build bakes in the weather forecast of the day it runs.
* If you add an `/api/*` route, add its stub to `build-standalone.js` and rebuild the demo the same way.

Both `npm run check` and `node build-standalone.js` reset the trip stored by the server they run against.

`CLAUDE.md` lists the traps already hit in this codebase. Read it first.
