# Security

Haii Trips is a local prototype. It is built to run on your own machine, for one person.

## What the local app does with your data

* The server listens on `127.0.0.1` only. It is not reachable from other machines.
* There is no login. The API refuses a request that the browser marks as sent by another website, and a request whose `Host` header is not `localhost`, `127.0.0.1` or `[::1]`. Any program running on your own machine can still call it. Do not put it on a public host as it is.
* Your Claude API key is read from the `ANTHROPIC_API_KEY` environment variable or from `.env`. The server never logs it and never sends it to the page. It sends it only to `api.anthropic.com`.
* With a key, the conversation you paste or dictate is sent to the Claude API. So is any question you type in the ask box, together with your accepted plan and the quoted wants. Without a key, none of this leaves your machine.
* Weather lookups send the coordinates of the places in your accepted plan to Open-Meteo, with or without a key.
* The trip, including the conversation you pasted, is stored as plain JSON in `data/trip.json` on your disk.
* The page stores one flag in your browser's local storage, which records that you have seen the intro.
* On Windows, `Haii Trips.cmd` opens the app in its own browser profile at `%LOCALAPPDATA%\HaiiTrips\profile`, so the browser keeps that window's local storage, cache and history there. Delete the `HaiiTrips` folder to remove it.
* Dictation uses the browser's own speech recognition. In Chrome and Edge that is a network service run by the browser maker, so your voice leaves your machine while you dictate.
* Bookings and rides are simulated. No vendor is contacted and no money moves.

## The hosted demo

* The live demo is `haii-trips-demo.html`, a single static page with both built-in trips baked in.
* It makes no network calls of its own. Every API call is answered inside the page, and the weather it shows is a snapshot taken when the page was built.
* It keeps the trip in memory only, so a reload starts over. The one thing it stores is the same intro flag in local storage.
* Dictation, if you use it there, still goes through the browser's speech service.

## Reporting a vulnerability

Report it privately at <https://github.com/ardaasaroglu/haii-trips/security/advisories/new>. Please do not open a public issue for a security problem.

That form exists only while private vulnerability reporting is enabled in this repository's settings. If the link does not open a form, open an issue that asks for a private contact and leave out every detail of the problem.
