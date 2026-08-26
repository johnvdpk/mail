export type PlatformDef = {
  id: string;
  label: string;
  patterns: RegExp[];
  expensive?: boolean;
};

export type PatternLabel = {
  re: RegExp;
  label: string;
};

export const BOOKING_PLATFORMS: PlatformDef[] = [
  {
    id: "tommy",
    label: "Tommy",
    patterns: [/tommybooking/i, /tommybookingsupport/i, /tommy-booking/i],
    expensive: true,
  },
  {
    id: "recranet",
    label: "Recranet",
    patterns: [/recranet/i],
    expensive: true,
  },
  {
    id: "campingcare",
    label: "Camping.care",
    patterns: [/camping\.care/i, /campingcare/i],
    expensive: true,
  },
  {
    id: "cubilis",
    label: "Cubilis",
    patterns: [/cubilis/i],
    expensive: true,
  },
  {
    id: "123boeking",
    label: "123Boeking",
    patterns: [/123boeking/i],
  },
  {
    id: "ezyres",
    label: "EzyRes",
    patterns: [/ezyres/i],
  },
  {
    id: "guestline",
    label: "Guestline",
    patterns: [/guestline/i],
    expensive: true,
  },
  {
    id: "bookingcom",
    label: "Booking.com",
    patterns: [/booking\.com\/hotel/i, /bstatic\.com/i],
  },
];

export const CHAIN_BRANDS: { id: string; label: string; patterns: RegExp[] }[] = [
  { id: "roompot", label: "Roompot", patterns: [/roompot/i] },
  { id: "landal", label: "Landal", patterns: [/landalgreenparks/i, /\blandal\b/i] },
  { id: "europarcs", label: "Europarcs", patterns: [/europarcs/i] },
  { id: "topparken", label: "TopParken", patterns: [/topparken/i] },
  { id: "centerparcs", label: "Center Parcs", patterns: [/center\s*parcs/i] },
  { id: "vakantieparknl", label: "Vakantiepark keten", patterns: [/vakantieparken/i] },
];

export const MULTI_LOCATION_PATTERNS: PatternLabel[] = [
  { re: /onze\s+locaties/i, label: "onze locaties" },
  { re: /onze\s+parken/i, label: "onze parken" },
  { re: /kies\s+(je|uw|jouw)\s+(park|camping|locatie)/i, label: "kies je park/locatie" },
  { re: /alle\s+(onze\s+)?(parken|campings|locaties)/i, label: "alle parken/campings" },
  { re: /\bvestigingen\b/i, label: "vestigingen" },
  { re: /meerdere\s+(parken|campings|locaties)/i, label: "meerdere locaties" },
  { re: /park\s+kiezen/i, label: "park kiezen" },
  { re: /select\s+(your\s+)?(park|resort|location)/i, label: "select park" },
];

export const HOOK_KEYWORDS: PatternLabel[] = [
  { re: /\baan\s+(het|de)\s+(water|meer|rivier|plas|zee)\b/i, label: "aan het water" },
  { re: /\bhonden?\s*(welkom|toegestaan)|hondvriendelijk\b/i, label: "honden welkom" },
  { re: /\bkleinschalig\b/i, label: "kleinschalig" },
  { re: /\bfamiliecamping\b/i, label: "familiecamping" },
  { re: /\bnatuurcamping\b|\bin\s+de\s+natuur\b/i, label: "in de natuur" },
  { re: /\bsafari\s*tent/i, label: "safaritenten" },
  { re: /\bcamperplaats/i, label: "camperplaatsen" },
  { re: /\bseizoensplaats/i, label: "seizoensplaatsen" },
];

export const EMBED_HINT_RE = /tommy|recranet|camping\.?care|cubilis|boeking|booking|ezyres/i;
export const HOOK_HEADING_RE = /camping|kampeer|natuur|bos|meer|strand|rust/i;
export const EXPENSIVE_PLATFORM_IDS = ["tommy", "recranet", "campingcare", "cubilis", "guestline"];
