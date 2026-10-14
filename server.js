/* Haii Trips · local prototype server.
 *
 * ZERO DEPENDENCIES on purpose. Node's own http + global fetch, nothing installed.
 *
 * Storage is a JSON file. No database, no migrations. A prototype should not be able to
 * corrupt anything.
 *
 * Extraction runs live against Anthropic when ANTHROPIC_API_KEY is present, and falls back to a
 * built-in trip when it is not, so the demo works with zero setup.
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, "data");
const TRIP = join(DATA, "trip.json");
const PORT = Number(process.env.PORT || 4830);

if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true });

/* ---------- the key, without printing it anywhere ---------- */
function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  const envFile = join(ROOT, ".env");
  if (existsSync(envFile)) {
    // Some Windows editors put a byte order mark first, which would hide a key written on line one.
    // Only spaces and tabs around "=", so an empty key line cannot take the next line as its value.
    const m = readFileSync(envFile, "utf8").replace(/^\uFEFF/, "").match(/^ANTHROPIC_API_KEY[ \t]*=[ \t]*(\S.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
/* ---------- safety briefings ----------
 * HANDWRITTEN, exactly like the two built-in trips are handwritten, and stamped demo:true on every
 * response.
 *
 * This is the one simulated thing in the app where the demo stamp is not a formality. A fake
 * booking wastes nobody's afternoon; safety copy that somebody acts on is a different category.
 * So the stamp is rendered on screen, in the sheet, and returned in the payload, and the fallback
 * for an unknown destination says plainly that nothing is connected rather than inventing calm.
 */
const BRIEFS = {
  tokyo: {
    name: "Tokyo", country: "Japan", grade: "A-", mood: "Calm overall", tint: "city",
    summary: "Conditions are calm across most of the city.",
    summarySub: "Keep an eye on crowded areas.",
    headline: "Watch your phone in crowds",
    detail: "Pickpocketing reported in Shibuya and Harajuku.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Calm", sub: "Low activity", tone: "good" },
      { icon: "crowd", label: "Crowds", value: "Busy", sub: "Popular areas", tone: "warn" },
      { icon: "shield", label: "Police presence", value: "Visible", sub: "In major areas", tone: "blue" }
    ]
  },
  paris: {
    name: "Paris", country: "France", grade: "B+", mood: "Mostly calm", tint: "city",
    summary: "Calm across most of the city.",
    summarySub: "Pickpocketing is the one thing to watch.",
    headline: "Keep bags closed on the Metro",
    detail: "Reported around Gare du Nord and Chatelet.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Calm", sub: "Low activity", tone: "good" },
      { icon: "crowd", label: "Crowds", value: "Heavy", sub: "Tourist sites", tone: "warn" },
      { icon: "transit", label: "Transport", value: "Running", sub: "Minor delays", tone: "blue" }
    ]
  },
  "new york": {
    name: "New York", country: "United States", grade: "B+", mood: "Calm overall", tint: "city",
    summary: "Calm across most of Manhattan and Brooklyn.",
    summarySub: "Normal city awareness after dark.",
    headline: "Stay where people are late at night",
    detail: "Platforms get quiet after midnight.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Calm", sub: "Low activity", tone: "good" },
      { icon: "crowd", label: "Crowds", value: "Busy", sub: "Midtown", tone: "warn" },
      { icon: "transit", label: "Transport", value: "Running", sub: "Weekend works", tone: "blue" }
    ]
  },
  bangkok: {
    name: "Bangkok", country: "Thailand", grade: "B", mood: "Calm, watch traffic", tint: "temple",
    summary: "Calm across the central districts.",
    summarySub: "Traffic and heat are the real risks here.",
    headline: "Agree the fare before you get in",
    detail: "Tuk tuk overcharging around Khao San and the Grand Palace.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Hot", sub: "33 and humid", tone: "warn" },
      { icon: "crowd", label: "Crowds", value: "Busy", sub: "Markets", tone: "warn" },
      { icon: "car", label: "Traffic", value: "Heavy", sub: "Most of the day", tone: "blue" }
    ]
  },
  thailand: {
    name: "Thailand", country: "", grade: "A-", mood: "Calm overall", tint: "water",
    summary: "Calm across the places on your plan.",
    summarySub: "Wet season, so the risk is weather rather than people.",
    headline: "Storms build in the afternoon",
    detail: "Waterfall pools run fast after heavy rain.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Warm", sub: "26 to 31", tone: "good" },
      { icon: "rain", label: "Rain", value: "Likely", sub: "Most afternoons", tone: "warn" },
      { icon: "crowd", label: "Crowds", value: "Moderate", sub: "Falls fill after noon", tone: "blue" }
    ]
  },
  utah: {
    name: "Utah", country: "United States", grade: "A", mood: "Calm overall", tint: "mountain",
    summary: "Calm. This is remote country rather than risky country.",
    summarySub: "The hazard out here is distance, not people.",
    headline: "Tell someone your route before you go",
    detail: "No mobile signal on Byway 12 or at Natural Bridges.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Hot", sub: "36 to 38", tone: "warn" },
      { icon: "signal", label: "Signal", value: "None", sub: "Most of the route", tone: "warn" },
      { icon: "drop", label: "Water", value: "Carry more", sub: "No refill for 90km", tone: "blue" }
    ]
  }
};
// Unknown destination. Says nothing is connected rather than inventing a calm city, because a
// confident "all clear" for a place with no data is the one output that could actually hurt.
function briefFor(q) {
  const key = String(q || "").trim().toLowerCase();
  if (BRIEFS[key]) return { ...BRIEFS[key], demo: true, known: true };
  const hit = Object.keys(BRIEFS).find((k) => key.includes(k) || k.includes(key));
  if (key && hit) return { ...BRIEFS[hit], demo: true, known: true };
  return {
    name: String(q || "").trim() || "Nowhere yet", country: "", grade: "?", mood: "No sources", tint: "city",
    summary: "No live sources are connected for this destination.",
    summarySub: "The prototype ships briefings for a short list of places.",
    headline: "Nothing to flag, because nothing is connected",
    detail: "Wire a real advisory source to make this live.",
    tiles: [
      { icon: "sun", label: "Daytime", value: "Unknown", sub: "No source", tone: "mute" },
      { icon: "crowd", label: "Crowds", value: "Unknown", sub: "No source", tone: "mute" },
      { icon: "shield", label: "Alerts", value: "Off", sub: "Nothing connected", tone: "mute" }
    ],
    demo: true, known: false
  };
}


/* ---------- state ---------- */
const EMPTY = { title: "", destination: "", days: 0, people: [], wants: [], cards: [], source: "", mode: "", partnerDone: false, live: false, liveDay: 1 };
function load() {
  try { return { ...EMPTY, ...JSON.parse(readFileSync(TRIP, "utf8")) }; } catch { return { ...EMPTY }; }
}
function save(t) { writeFileSync(TRIP, JSON.stringify(t, null, 2)); return t; }

/* ---------- the sample conversation ---------- */
const SAMPLE = `Maya: Okay so Thailand. I've been thinking about this for months.
Tom: Same. How long do we have, realistically?
Maya: Eight days if we fly out on the Monday. I don't want to be rushing between cities the whole time though.
Tom: Agreed. I really don't want to spend the whole trip in transit.
Maya: I want to see the waterfalls. That's my one non negotiable. Erawan or the ones near Chiang Mai, I don't mind which.
Tom: Fine by me. I want to eat properly though, not tourist stuff. Street food, night markets, the places locals actually go.
Maya: Obviously. And I'd love one really nice dinner somewhere, just one, we can splurge on that.
Tom: Deal. One thing, I've got a work call on the Wednesday, so I need decent wifi and a quiet hour that morning.
Maya: We can work around that. Wednesday is a slow day then.
Tom: I also heard there's a proper old temple complex up north that's worth the trip. Someone at the hotel mentioned it.
Maya: Ooh. And I want to do a cooking class, I've always wanted to learn to make a proper green curry.
Tom: That's a good shout. What about the beach, are we doing beach?
Maya: A couple of days at the end. Somewhere quiet though, not a party island. I want to actually relax before we fly back.
Tom: Quiet beach, yes. And can we not book anything before ten in the morning? I'm not doing 6am starts on holiday.
Maya: Absolutely not doing 6am starts. Budget wise, what are we thinking?
Tom: Mid range. Nice but not stupid. Maybe two thousand each all in.
Maya: That works. Oh and I want an elephant sanctuary, an ethical one, not the riding places.`;

/* ---------- the fallback trip, used when there is no API key ---------- */
const FALLBACK = {
  title: "Thailand, eight days",
  destination: "Thailand",
  days: 8,
  people: ["Maya", "Tom"],
  mode: "sample",
  partner: { name: "Maya", picks: ["c0","c1","c2","c3","c4","c5","c6"], skips: ["c7","c8","c9"] },
  wants: [
    { text: "See the waterfalls", who: "Maya", quote: "I want to see the waterfalls. That's my one non negotiable.", firm: true },
    { text: "Eat where locals eat, not tourist food", who: "Tom", quote: "Street food, night markets, the places locals actually go.", firm: true },
    { text: "One splurge dinner", who: "Maya", quote: "I'd love one really nice dinner somewhere, just one", firm: false },
    { text: "Not a trip spent in transit", who: "Tom", quote: "I really don't want to spend the whole trip in transit.", firm: true },
    { text: "Quiet Wednesday morning for a work call", who: "Tom", quote: "I've got a work call on the Wednesday, so I need decent wifi and a quiet hour", firm: true },
    { text: "A cooking class, green curry", who: "Maya", quote: "I want to do a cooking class, I've always wanted to learn to make a proper green curry.", firm: false },
    { text: "An old temple complex up north", who: "Tom", quote: "there's a proper old temple complex up north that's worth the trip", firm: false },
    { text: "Quiet beach at the end, not a party island", who: "Maya", quote: "Somewhere quiet though, not a party island. I want to actually relax", firm: true },
    { text: "Nothing before 10am", who: "Tom", quote: "can we not book anything before ten in the morning? I'm not doing 6am starts on holiday.", firm: true },
    { text: "Ethical elephant sanctuary", who: "Maya", quote: "I want an elephant sanctuary, an ethical one, not the riding places.", firm: true },
    { text: "Mid range budget, about two thousand each", who: "Tom", quote: "Mid range. Nice but not stupid. Maybe two thousand each all in.", firm: false },
  ],
  cards: [
    { kind: "do", title: "Erawan Falls", lat: 14.37, lng: 99.14, scene: "water", where: "Kanchanaburi", day: 2, time: "10:30", cost: "$9", why: "Maya said the waterfalls were her one non negotiable", quote: "I want to see the waterfalls. That's my one non negotiable.", note: "Seven tiers, emerald pools you can swim in. Go early-ish, it fills up after noon.", book: "Viator", ride: "Taxi", rideCost: "$14" },
    { kind: "food", title: "Chang Phueak night market", lat: 18.8, lng: 98.98, scene: "food", where: "Chiang Mai", day: 3, time: "19:00", cost: "$6", why: "Tom wanted the places locals actually go", quote: "Street food, night markets, the places locals actually go.", note: "The cowboy hat lady's khao kha moo is the one worth queueing for.", book: "", ride: "Grab", rideCost: "$3" },
    { kind: "do", title: "Elephant Nature Park", lat: 19.19, lng: 98.85, scene: "wild", where: "Chiang Mai", day: 4, time: "10:00", cost: "$80", why: "Maya asked for ethical, no riding", quote: "an ethical one, not the riding places", note: "Rescue sanctuary, no riding, no bathing. Full day including transfer.", book: "GetYourGuide", ride: "Transfer", rideCost: "free" },
    { kind: "do", title: "Thai cooking class, half day", lat: 18.79, lng: 98.99, scene: "food", where: "Chiang Mai", day: 5, time: "10:00", cost: "$35", why: "Maya wanted to learn green curry", quote: "I've always wanted to learn to make a proper green curry.", note: "Market tour first, then six dishes. Green curry is on the standard menu.", book: "GetYourGuide", ride: "Grab", rideCost: "$4" },
    { kind: "place", title: "Wat Phra That Doi Suthep", lat: 18.8, lng: 98.92, scene: "temple", where: "Chiang Mai", day: 5, time: "16:30", cost: "$2", why: "Tom heard about an old temple complex up north", quote: "there's a proper old temple complex up north that's worth the trip", note: "306 steps up. Late afternoon light over the city is the reason to go then.", book: "", ride: "Songthaew", rideCost: "$6" },
    { kind: "stay", title: "Quiet beach base, Koh Lanta", lat: 7.62, lng: 99.04, scene: "beach", where: "Krabi", day: 6, time: "", cost: "$95/night", why: "Maya wanted quiet, explicitly not a party island", quote: "Somewhere quiet though, not a party island.", note: "Long beaches, low rise, no full moon party. The calm alternative to Phi Phi.", book: "Booking.com", ride: "Ferry", rideCost: "$22" },
    { kind: "food", title: "Dinner at Le Du", lat: 13.72, lng: 100.53, scene: "food", where: "Bangkok", day: 7, time: "19:30", cost: "$110pp", why: "The one splurge dinner Maya asked for", quote: "I'd love one really nice dinner somewhere, just one, we can splurge on that.", note: "Michelin starred, modern Thai. Book well ahead, it goes.", book: "OpenTable", ride: "Grab", rideCost: "$5" },
    { kind: "move", title: "Keep Wednesday morning clear", lat: 18.79, lng: 98.98, scene: "hold", where: "wherever you are", day: 3, time: "09:00", cost: "free", why: "Tom has a work call and asked for a quiet hour", quote: "I've got a work call on the Wednesday, so I need decent wifi", note: "Nothing scheduled before 12:00. Check the hotel wifi before you book.", book: "", ride: "", rideCost: "" },
    { kind: "place", title: "Pai, two nights", lat: 19.36, lng: 98.44, scene: "mountain", where: "Mae Hong Son", day: 6, time: "", cost: "$40/night", why: "Nobody asked for this one", quote: "", note: "762 curves to get there and it is a full day of transit each way.", note2: "conflict", book: "Booking.com", ride: "Minibus", rideCost: "$9" },
    { kind: "do", title: "Full Moon Party, Koh Phangan", lat: 9.73, lng: 100.01, scene: "beach", where: "Koh Phangan", day: 7, time: "22:00", cost: "$30", why: "Nobody asked for this one", quote: "", note: "This is the opposite of what Maya asked for. It is here so you have something to swipe away.", note2: "conflict", book: "Viator", ride: "Ferry", rideCost: "$18" },
  ],
};


/* A second built-in trip with a different shape from Thailand: free campsites, service roads,
 * bear mace, a temperature-rated sleeping bag from REI, stargazing. */
const SAMPLE2 = `Maya: Right, the road trip. I want to actually disconnect on this one.
Priya: Same. How long are we out for?
Maya: Five days. Utah and back. I don't want to book hotels, I want to car camp.
Priya: Free sites? I've done the service road thing before, it's fine if you know where to look.
Maya: Exactly, free campsites and service roads. No campgrounds with a check-in desk.
Priya: We'll need to be careful about bears depending where we end up.
Maya: Bear mace, yes. Put that on the list. And I need a proper sleeping bag, it's going to be near freezing at altitude.
Priya: REI will sort you out. Temperature rated, not a summer bag.
Maya: One night I want to be somewhere with genuinely no light pollution. Stargazing is the whole point for me.
Priya: Dark sky park then. There are a few out that way.
Maya: And a real hike. Not a walk, a hike. Half a day at least.
Priya: Good. Can we do one proper meal though? Five days of camp food is a lot.
Maya: One town dinner, agreed. And no driving more than four hours in a day, I don't want to just sit in the car.
Priya: Four hours max. And I'd like a shower at some point, let's be honest.`;

const FALLBACK2 = {
  title: "Utah, five days off grid",
  destination: "Utah",
  days: 5,
  people: ["Priya", "Maya"],
  mode: "sample",
  partner: { name: "Priya", picks: ["c0","c1","c2","c3","c5","c6","c7"], skips: ["c4","c8","c9"] },
  wants: [
    { text: "Car camp, no hotels", who: "Maya", quote: "I don't want to book hotels, I want to car camp.", firm: true },
    { text: "Free campsites and service roads only", who: "Maya", quote: "free campsites and service roads. No campgrounds with a check-in desk.", firm: true },
    { text: "Bear mace on the kit list", who: "Maya", quote: "Bear mace, yes. Put that on the list.", firm: true },
    { text: "A temperature rated sleeping bag", who: "Maya", quote: "I need a proper sleeping bag, it's going to be near freezing at altitude.", firm: true },
    { text: "One night with no light pollution", who: "Maya", quote: "somewhere with genuinely no light pollution. Stargazing is the whole point for me.", firm: true },
    { text: "A real hike, half a day", who: "Maya", quote: "a real hike. Not a walk, a hike. Half a day at least.", firm: false },
    { text: "One proper meal in a town", who: "Priya", quote: "Can we do one proper meal though? Five days of camp food is a lot.", firm: false },
    { text: "No more than four hours driving a day", who: "Maya", quote: "no driving more than four hours in a day, I don't want to just sit in the car.", firm: true },
    { text: "A shower at some point", who: "Priya", quote: "I'd like a shower at some point, let's be honest.", firm: false },
  ],
  cards: [
    { kind: "stay", title: "Dispersed camping, Dixie National Forest", lat: 37.72, lng: -112.72, scene: "mountain", ride: "Drive", rideCost: "free", where: "Utah", day: 1, time: "17:00", cost: "free", why: "Maya wanted free sites, no check-in desk", quote: "free campsites and service roads. No campgrounds with a check-in desk.", note: "Forest service roads, 14 day limit, no permit needed. Arrive before dark to find a flat pitch.", note2: "", book: "" },
    { kind: "do", title: "REI Salt Lake City, kit stop", lat: 40.76, lng: -111.9, scene: "city", ride: "Drive", rideCost: "free", where: "Salt Lake City", day: 1, time: "10:00", cost: "$180", why: "Maya needs a bag rated for altitude, and the bear mace", quote: "I need a proper sleeping bag, it's going to be near freezing at altitude.", note: "20F rated bag, bear spray, and a spare gas canister.", note2: "", book: "" },
    { kind: "place", title: "Natural Bridges Dark Sky Park", lat: 37.6, lng: -110.01, scene: "mountain", ride: "Drive", rideCost: "free", where: "Utah", day: 4, time: "21:30", cost: "$20", why: "Maya said stargazing was the whole point", quote: "somewhere with genuinely no light pollution. Stargazing is the whole point for me.", note: "First place on earth certified dark sky. New moon week is the one to aim for.", note2: "", book: "" },
    { kind: "do", title: "Angels Landing, half day", lat: 37.27, lng: -112.95, scene: "mountain", ride: "Shuttle", rideCost: "$3", where: "Zion", day: 2, time: "10:00", cost: "$6", why: "Maya asked for a hike, not a walk", quote: "a real hike. Not a walk, a hike. Half a day at least.", note: "Permit by lottery, chains on the final half mile. Five hours round trip.", note2: "", book: "Recreation.gov" },
    { kind: "stay", title: "Under Canvas Moab, one night", lat: 38.57, lng: -109.55, scene: "mountain", ride: "Drive", rideCost: "free", where: "Moab", day: 4, time: "16:00", cost: "$249", why: "Nobody asked for this one", quote: "", note: "Glamping with a check-in desk, which is the exact thing Maya ruled out.", note2: "conflict", book: "Booking.com" },
    { kind: "food", title: "Hell's Backbone Grill", lat: 37.79, lng: -111.42, scene: "food", ride: "Drive", rideCost: "free", where: "Boulder, Utah", day: 3, time: "18:30", cost: "$42", why: "Priya wanted one proper meal", quote: "Can we do one proper meal though? Five days of camp food is a lot.", note: "Farm to table in the middle of nowhere. Book ahead, it is the only good food for an hour.", note2: "", book: "OpenTable" },
    { kind: "move", title: "Shower stop, Moab rec centre", lat: 38.57, lng: -109.55, scene: "city", ride: "Drive", rideCost: "free", where: "Moab", day: 5, time: "12:00", cost: "$7", why: "Priya asked for a shower, honestly", quote: "I'd like a shower at some point, let's be honest.", note: "Day pass gets you a hot shower and a pool. The unglamorous one that saves the trip.", note2: "", book: "" },
    { kind: "place", title: "Scenic Byway 12, driving day", lat: 37.85, lng: -111.6, scene: "mountain", ride: "Drive", rideCost: "free", where: "Utah", day: 3, time: "13:00", cost: "free", why: "Keeps the day inside Maya's four hour limit", quote: "no driving more than four hours in a day, I don't want to just sit in the car.", note: "Three and a half hours with stops. One of the best drives in the country.", note2: "", book: "" },
    { kind: "do", title: "Antelope Canyon guided tour", lat: 36.86, lng: -111.37, scene: "wild", ride: "Drive", rideCost: "free", where: "Page, Arizona", day: 5, time: "08:00", cost: "$90", why: "Nobody asked for this one", quote: "", note: "A six hour detour, which breaks Maya's four hour driving limit.", note2: "conflict", book: "GetYourGuide" },
    { kind: "food", title: "Camp cook kit, five dinners", lat: 40.76, lng: -111.9, scene: "food", ride: "", rideCost: "", where: "bought in SLC", day: 1, time: "11:00", cost: "$60", why: "Five days off grid needs feeding", quote: "I don't want to book hotels, I want to car camp.", note: "Dry bags, one pot meals, and coffee that does not taste like sadness.", note2: "", book: "" },
  ],
};


/* ---------- weather: real, free, no key ----------
 *
 * Open-Meteo needs no API key and no account, so the weather works with zero setup. It is also the
 * one live signal that makes an in-trip screen feel like it is actually happening rather than mocked.
 *
 * The trip's days are 1..N with no real dates, so they are mapped onto the next N days from today.
 * That is honest for a prototype and it means the forecast on screen is genuinely today's forecast
 * for that place.
 */
const WX_CACHE = new Map();
const WX_TTL_MS = 30 * 60_000;

/** WMO weather codes, collapsed to what a traveller actually needs to decide something. */
function wxLabel(code) {
  if (code === 0) return { text: "Clear", icon: "sun", wet: false };
  if (code <= 2) return { text: "Mostly sunny", icon: "sun", wet: false };
  if (code === 3) return { text: "Overcast", icon: "cloud", wet: false };
  if (code <= 48) return { text: "Fog", icon: "cloud", wet: false };
  if (code <= 57) return { text: "Drizzle", icon: "rain", wet: true };
  if (code <= 67) return { text: "Rain", icon: "rain", wet: true };
  if (code <= 77) return { text: "Snow", icon: "snow", wet: true };
  if (code <= 82) return { text: "Rain showers", icon: "rain", wet: true };
  if (code <= 86) return { text: "Snow showers", icon: "snow", wet: true };
  return { text: "Thunderstorms", icon: "storm", wet: true };
}

async function forecast(lat, lng, days) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${days}`;
  const hit = WX_CACHE.get(key);
  if (hit && Date.now() - hit.at < WX_TTL_MS) return hit.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=${Math.min(16, Math.max(1, days))}&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const j = await res.json();
  const d = j.daily || {};
  const data = (d.time || []).map((date, i) => ({
    date,
    code: d.weather_code?.[i] ?? 0,
    max: Math.round(d.temperature_2m_max?.[i] ?? 0),
    min: Math.round(d.temperature_2m_min?.[i] ?? 0),
    rain: d.precipitation_probability_max?.[i] ?? 0,
    ...wxLabel(d.weather_code?.[i] ?? 0),
  }));
  WX_CACHE.set(key, { at: Date.now(), data });
  return data;
}

/* ---------- live extraction ---------- */
const SYSTEM = `You turn a conversation between people planning a trip into a swipeable deck.

You extract WANTS, not tasks. A want is something a person said they would like, need, or refuse.
Every want and every card must carry a VERBATIM quote from the conversation. Never invent a quote.
If you cannot quote it, do not claim it.

Rules:
- Wants marked firm are constraints (budget, timing, "not a party island", accessibility). Soft wants are preferences.
- Produce 8 to 12 cards. Each is ONE thing on ONE day: a place, a meal, an activity, a stay, or a hold in the calendar.
- Real, specific, named places. Never "a nice restaurant". If you are not confident a place exists, describe the type and say where.
- Respect the firm constraints. If someone says nothing before 10am, no card starts before 10am.
- Include one or two cards that DELIBERATELY conflict with a stated want, marked note2:"conflict", so the person has something real to swipe away. Their why is "Nobody asked for this one".
- kind is one of: place, food, do, stay, move. scene is the visual mood: water, food, wild, temple, beach, mountain, city, hold.
- lat and lng must be the real coordinates of the place, so it can be drawn on a map.
- book is the vendor a person would really book this through: Viator, GetYourGuide, Booking.com, OpenTable, or empty for free things. ride is how you get there.
- cost is the price for ONE person, written as a currency symbol and a number and nothing else, like $12 or €12, in the currency the travellers talk in. Write free when it costs nothing. rideCost is written the same way.
- time is the start time on a 24 hour clock, written HH:MM like 09:30 or 19:00 and nothing else. Leave it empty when the card has no set time.`;

const TRIP_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" }, destination: { type: "string" }, days: { type: "integer" },
    people: { type: "array", items: { type: "string" } },
    wants: { type: "array", items: { type: "object", properties: {
      text: { type: "string" }, who: { type: "string" }, quote: { type: "string" }, firm: { type: "boolean" },
    }, required: ["text", "who", "quote", "firm"], additionalProperties: false } },
    cards: { type: "array", items: { type: "object", properties: {
      kind: { type: "string", enum: ["place", "food", "do", "stay", "move"] },
      lat: { type: "number" }, lng: { type: "number" },
      ride: { type: "string", description: "ONE short word for how you get there: Uber, Taxi, Ferry, Walk, Bus, Transfer, or empty" },
      rideCost: { type: "string", description: "rough cost of that journey, or empty" },
      scene: { type: "string", enum: ["water","food","wild","temple","beach","mountain","city","hold"] },
      title: { type: "string" }, where: { type: "string" }, day: { type: "integer" },
      time: { type: "string", description: "24 hour start time as HH:MM, like 09:30, or empty" },
      cost: { type: "string", description: "price for one person: a currency symbol and a number, like $12 or €12, or free" },
      why: { type: "string" },
      quote: { type: "string" }, note: { type: "string" }, note2: { type: "string" }, book: { type: "string" },
    }, required: ["kind", "lat", "lng", "scene", "ride", "rideCost", "title", "where", "day", "time", "cost", "why", "quote", "note", "note2", "book"], additionalProperties: false } },
  },
  required: ["title", "destination", "days", "people", "wants", "cards"],
  additionalProperties: false,
};

/* The trip comes back as JSON that already matches TRIP_SCHEMA (structured outputs), so there is
 * nothing to coax into shape and nothing to repair afterwards. Current models no longer accept a
 * forced tool call, which is how this used to get its JSON.
 *
 * Effort is low because this is extraction and a person is watching a screen while it runs.
 * max_tokens is generous because the model's thinking shares that budget with the reply. */
async function extractLive(transcript, key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000, system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: TRIP_SCHEMA } },
      messages: [{ role: "user", content: `CONVERSATION:\n\n${transcript}` }],
    }),
  });
  if (!res.ok) {
    // The API's own reason ("invalid x-api-key", "credit balance is too low") is what the person
    // needs to read. It never contains the key.
    let why = "";
    try { why = String((await res.json())?.error?.message || ""); } catch {}
    throw new Error(`Anthropic answered ${res.status}${why ? ": " + why.slice(0, 140) : ""}`);
  }
  const j = await res.json();
  // A decline and a cut-off reply are both HTTP 200, so they are checked before the content is read.
  if (j.stop_reason === "refusal") throw new Error("the model declined this conversation");
  if (j.stop_reason === "max_tokens") throw new Error("the reply was cut off");
  // By type, never by position: a reply can open with a thinking block.
  const text = (j.content || []).find((c) => c.type === "text");
  if (!text) throw new Error("no structured output");
  return { ...JSON.parse(text.text), mode: "live" };
}

/* ---------- http ---------- */
function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
const MAX_BODY = 1_000_000;
function body(req) {
  return new Promise((resolve) => {
    // Decode as text, so a character split across two chunks arrives whole.
    req.setEncoding("utf8");
    let b = "", over = false;
    req.on("data", (c) => { if (over) return; b += c; if (b.length > MAX_BODY) { over = true; b = ""; } });
    req.on("end", () => {
      if (over) return resolve({ tooLarge: true });
      // Always an object, so a body of null or a bare string cannot break the caller.
      try { const v = JSON.parse(b || "{}"); resolve(v && typeof v === "object" ? v : {}); } catch { resolve({}); }
    });
  });
}

/* The server only listens on this machine, but a page on any other site can still make the browser
 * send requests to it, and with a key set a planted /api/plan call spends the owner's money. So an
 * API call must name this machine as its host, and must not be marked by the browser as coming
 * from another site. Tools with no browser, like check.mjs, send neither header and pass. */
function fromThisApp(req) {
  const host = String(req.headers.host || "").toLowerCase();
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (name !== "localhost" && name !== "127.0.0.1" && name !== "::1") return false;
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host.toLowerCase() !== host) return false; } catch { return false; } }
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/") && !fromThisApp(req)) return json(res, 403, { error: "This request did not come from the app." });
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = readFileSync(join(ROOT, "public", "index.html"));
      // No framing. A framed copy would pass fromThisApp, because its own requests are same origin.
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'", "x-content-type-options": "nosniff",
      });
      return res.end(html);
    }
    if (url.pathname === "/manifest.webmanifest" || url.pathname === "/icon.svg") {
      const type = url.pathname.endsWith(".svg") ? "image/svg+xml" : "application/manifest+json";
      res.writeHead(200, { "content-type": type + "; charset=utf-8" });
      return res.end(readFileSync(join(ROOT, "public", url.pathname.slice(1))));
    }
    // Safety briefing. Handwritten content, stamped demo on every response. See BRIEFS above.
    if (url.pathname === "/api/brief") {
      const q = url.searchParams.get("dest") || load().destination || "";
      return json(res, 200, briefFor(q));
    }
    if (url.pathname === "/api/state") {
      const t = load();
      return json(res, 200, { ...t, hasKey: Boolean(apiKey()), sample: SAMPLE, samples: [{ id: "thailand", label: "Thailand, two of you", text: SAMPLE }, { id: "utah", label: "Utah road trip, off grid", text: SAMPLE2 }] });
    }
    if (url.pathname === "/api/plan" && req.method === "POST") {
      const { transcript, tooLarge } = await body(req);
      if (tooLarge) return json(res, 413, { error: "That is too long. Paste just the part about the trip." });
      const text = String(transcript || "").trim();
      if (text.length < 40) return json(res, 400, { error: "Say a bit more about the trip first." });
      const key = apiKey();
      let trip;
      if (key) {
        try { trip = await extractLive(text, key); }
        catch (e) { trip = { ...FALLBACK, mode: "sample-after-error", error: String(e.message || e) }; }
      } else {
        // Which built-in trip to show is decided by which sample was sent, so both demo paths work
        // with no key. Anything unrecognised gets the Thailand trip marked sample-no-key, so the page
        // can say it is not the person's own conversation.
        const head = text.slice(0, 60);
        trip = head === SAMPLE2.slice(0, 60) ? { ...FALLBACK2 }
          : head === SAMPLE.slice(0, 60) ? { ...FALLBACK }
          : { ...FALLBACK, mode: "sample-no-key" };
      }
      trip.source = text;
      trip.cards = (trip.cards || []).map((c, i) => ({ ...c, id: `c${i}`, decision: "" }));
      return json(res, 200, save(trip));
    }
    if (url.pathname === "/api/decide" && req.method === "POST") {
      const { id, decision, who } = await body(req);
      const t = load();
      const card = (t.cards || []).find((c) => c.id === id);
      const val = decision === "in" ? "in" : decision === "out" ? "out" : "";
      // `who` is "partner" for the second swiper, anything else for the trip owner. Both are stored,
      // because the whole point of the overlap screen is comparing two people's answers, and a page
      // refresh must not lose one of them.
      if (card) { if (who === "partner") card.partner = val; else card.decision = val; }
      return json(res, 200, save(t));
    }
    // Weather for the whole trip, one call per distinct place, mapped onto the next N days.
    if (url.pathname === "/api/weather") {
      const t = load();
      const inn = (t.cards || []).filter((c) => c.decision === "in" && (t.partner ? c.partner === "in" : true));
      if (!inn.length) return json(res, 200, { days: [] });
      const maxDay = Math.max(...inn.map((c) => Number(c.day) || 1));
      // One representative point per day, because a day happens in one place.
      const out = [];
      for (let day = 1; day <= maxDay; day++) {
        const card = inn.find((c) => Number(c.day) === day);
        if (!card || typeof card.lat !== "number") { out.push(null); continue; }
        try {
          const f = await forecast(card.lat, card.lng, maxDay + 1);
          // Open-Meteo forecasts 16 days at most. A later day gets no forecast, not today's.
          const w = f[day - 1] || null;
          out.push(w ? { ...w, where: card.where } : null);
        } catch (e) {
          out.push(null);
        }
      }
      return json(res, 200, { days: out });
    }

    // Start the trip: the plan becomes something happening rather than something written down.
    if (url.pathname === "/api/live" && req.method === "POST") {
      const { day } = await body(req);
      const t = load();
      t.live = true;
      if (Number(day) > 0) t.liveDay = Number(day);
      return json(res, 200, save(t));
    }

    // Move a card to another day. This is what an adaptation actually does when it is accepted.
    if (url.pathname === "/api/move" && req.method === "POST") {
      const { id, day } = await body(req);
      const t = load();
      const card = (t.cards || []).find((c) => c.id === id);
      if (card && Number(day) > 0) card.day = Number(day);
      return json(res, 200, save(t));
    }

    // Ask a question about YOUR trip. Answered from the trip itself, never the open internet: the
    // point of this product is that it knows what you said, not that it knows about Thailand.
    if (url.pathname === "/api/ask" && req.method === "POST") {
      const { q, tooLarge } = await body(req);
      if (tooLarge) return json(res, 413, { error: "That question is too long." });
      const question = String(q || "").trim().slice(0, 500);
      if (!question) return json(res, 400, { error: "Ask a question first." });
      const t = load();
      const key = apiKey();
      const inn = (t.cards || []).filter((c) => c.decision === "in" && (t.partner ? c.partner === "in" : true));
      const plan = inn.map((c) => `Day ${c.day} ${c.time || ""} ${c.title} (${c.where}, ${c.cost})`).join("\n");
      const wants = (t.wants || []).map((w) => `${w.who}: ${w.text} ("${w.quote}")`).join("\n");
      if (!key) {
        // No key: answer from the plan with simple matching. Honest and still useful in a demo.
        const ql = question.toLowerCase();
        const dayMatch = ql.match(/day (\d+)/);
        let answer;
        if (dayMatch) {
          const d = Number(dayMatch[1]);
          const items = inn.filter((c) => Number(c.day) === d);
          answer = items.length
            ? `Day ${d}: ` + items.map((c) => `${c.time || "any time"} ${c.title}`).join(", ") + "."
            : `Nothing is planned for day ${d} yet.`;
        } else if (/eat|food|dinner|lunch|restaurant/.test(ql)) {
          const f = inn.filter((c) => c.kind === "food");
          answer = f.length ? "Food on this trip: " + f.map((c) => `${c.title} on day ${c.day}`).join(", ") + "." : "No meals are planned yet.";
        } else if (/cost|budget|spend|money|how much/.test(ql)) {
          const heads = (t.people || []).length || 2;
          const total = inn.reduce((a, c) => a + (Number(String(c.cost).replace(/[^0-9.]/g, "")) || 0) * heads, 0);
          answer = `About $${Math.round(total)} for ${heads} of you, across ${inn.length} things.`;
        } else if (/rain|weather|snow/.test(ql)) {
          answer = "Check the weather strip at the top. I flag a day when rain lands on something outdoors.";
        } else {
          answer = `Your trip has ${inn.length} things across ${new Set(inn.map((c) => c.day)).size} days. Ask me about a specific day, the food, or the budget.`;
        }
        return json(res, 200, { answer, mode: "offline" });
      }
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            // Low effort keeps the model's thinking short; the budget covers that plus two sentences.
            model: MODEL, max_tokens: 2000, output_config: { effort: "low" },
            system: "You answer questions about THIS trip only, from the plan and the travellers' own stated wants below. " +
              "Two sentences maximum. If the answer is not in the plan, say so plainly rather than inventing it.",
            messages: [{ role: "user", content: `PLAN:\n${plan}\n\nWHAT THEY ASKED FOR:\n${wants}\n\nQUESTION: ${question}` }],
          }),
        });
        const j = await r.json();
        if (!r.ok) return json(res, 200, { answer: `The model did not answer (Anthropic answered ${r.status}).`, mode: "error" });
        const answer = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ").trim();
        return json(res, 200, { answer: answer || "I could not answer that one.", mode: "live" });
      } catch (e) {
        return json(res, 200, { answer: "I could not reach the model just then.", mode: "error" });
      }
    }

    // SIMULATED booking. No vendor is contacted and no money moves. It exists so the demo can show
    // the whole path without a single vendor integration. Every response is stamped demo:true and
    // the UI says so on screen.
    if (url.pathname === "/api/book" && req.method === "POST") {
      const { id } = await body(req);
      const t = load();
      const card = (t.cards || []).find((c) => c.id === id);
      if (!card) return json(res, 404, { error: "no such card" });
      const stamp = Math.abs([...String(card.title)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7));
      card.booked = {
        ref: (card.book || "HAII").slice(0, 3).toUpperCase() + "-" + String(stamp % 900000 + 100000),
        at: new Date().toISOString(),
        demo: true,
      };
      return json(res, 200, save(t));
    }
    if (url.pathname === "/api/partner-done" && req.method === "POST") {
      const t = load();
      t.partnerDone = true;
      return json(res, 200, save(t));
    }
    if (url.pathname === "/api/reset" && req.method === "POST") return json(res, 200, save({ ...EMPTY }));
    res.writeHead(404).end("not found");
  } catch (e) {
    if (res.headersSent) res.end(); else json(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Haii Trips prototype on http://localhost:${PORT}`);
  console.log(apiKey() ? `live extraction on (${MODEL})` : "no ANTHROPIC_API_KEY, using the two built-in trips");
});
