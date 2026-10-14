# Changelog

## 0.1.0

First public release.

* Two built-in trips, Thailand and a Utah road trip, that run with no setup and no key.
* With your own Claude API key, a deck built from any conversation you paste or dictate.
* A screen that shows what it heard: one line per want, with who said it and their words.
* A swipeable deck. Each card shows the words that caused it, and a card nobody asked for carries no quote and says so.
* The overlap of two swipers, in the two built-in trips only, where the second person's swipes are scripted. A trip from your own conversation has one swiper and goes straight to the plan.
* A day by day plan on a map, and an in-trip view with a real Open-Meteo forecast that offers to move an outdoor stop to a drier day.
* An ask box that answers from the plan, using the Claude API when a key is set.
* Simulated bookings and rides, and handwritten safety briefings for six destinations. All are marked as a demo on screen.
* `npm run check`, run in CI against the built-in trips.
* `haii-trips-demo.html`, a single static page with both built-in trips baked in, for the hosted demo.
* `Haii Trips.cmd`, a Windows launcher that starts the server and opens the app in its own Chrome or Edge window.
