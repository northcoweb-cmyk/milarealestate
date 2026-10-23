/**
 * When Google place search is not available (no key, or the key's project doesn't have Places switched on), typing a city still suggests
 * real places from this built-in list of US cities and counties, so onboarding never has a dead end. Picking one gives city, state and time zone.
 */
const BY_STATE: Record<string, string[]> = {
  MD: ["Gaithersburg", "Rockville", "Bethesda", "Silver Spring", "Germantown", "Potomac", "Frederick", "Baltimore", "Columbia", "Annapolis", "Bowie", "Laurel", "Olney", "Clarksburg", "Damascus", "Kensington", "Chevy Chase", "Takoma Park", "College Park", "Towson", "Ellicott City", "Hyattsville", "Wheaton", "Montgomery County", "Prince George's County", "Howard County", "Frederick County", "Anne Arundel County", "Baltimore County"],
  DC: ["Washington"], VA: ["Arlington", "Alexandria", "Fairfax", "Reston", "McLean", "Vienna", "Leesburg", "Ashburn", "Richmond", "Virginia Beach", "Norfolk", "Chesapeake", "Manassas", "Herndon", "Falls Church", "Loudoun County", "Fairfax County"],
  PA: ["Philadelphia", "Pittsburgh", "Harrisburg", "Allentown", "Erie", "Lancaster", "Scranton", "Reading"], NJ: ["Newark", "Jersey City", "Princeton", "Hoboken", "Trenton", "Cherry Hill", "Paterson"], NY: ["New York", "Brooklyn", "Buffalo", "Rochester", "Albany", "Syracuse", "Yonkers", "White Plains"],
  DE: ["Wilmington", "Dover", "Newark"], NC: ["Charlotte", "Raleigh", "Durham", "Greensboro", "Asheville", "Wilmington", "Cary"], SC: ["Charleston", "Columbia", "Greenville", "Myrtle Beach"], GA: ["Atlanta", "Savannah", "Augusta", "Alpharetta", "Marietta", "Roswell"],
  FL: ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "St. Petersburg", "Naples", "Sarasota", "Boca Raton", "West Palm Beach", "Tallahassee", "Fort Myers"], AL: ["Birmingham", "Huntsville", "Mobile", "Montgomery"], TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Franklin"], KY: ["Louisville", "Lexington"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Dayton", "Toledo", "Akron"], MI: ["Detroit", "Grand Rapids", "Ann Arbor", "Lansing"], IN: ["Indianapolis", "Fort Wayne", "Carmel"], IL: ["Chicago", "Naperville", "Springfield", "Evanston"], WI: ["Milwaukee", "Madison"], MN: ["Minneapolis", "St. Paul", "Rochester"], IA: ["Des Moines"], MO: ["St. Louis", "Kansas City", "Springfield"],
  TX: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "Plano", "Frisco", "El Paso", "Arlington", "Round Rock", "The Woodlands", "Sugar Land"], OK: ["Oklahoma City", "Tulsa"], LA: ["New Orleans", "Baton Rouge"], AR: ["Little Rock"], MS: ["Jackson"],
  CO: ["Denver", "Colorado Springs", "Boulder", "Fort Collins", "Aurora"], UT: ["Salt Lake City", "Provo", "Park City"], AZ: ["Phoenix", "Scottsdale", "Tucson", "Mesa", "Chandler", "Tempe", "Gilbert"], NM: ["Albuquerque", "Santa Fe"], NV: ["Las Vegas", "Reno", "Henderson"],
  CA: ["Los Angeles", "San Diego", "San Francisco", "San Jose", "Sacramento", "Oakland", "Irvine", "Pasadena", "Santa Monica", "Long Beach", "Fresno", "Santa Barbara", "Palo Alto"], OR: ["Portland", "Eugene", "Salem", "Bend"], WA: ["Seattle", "Bellevue", "Tacoma", "Spokane", "Kirkland", "Redmond"], ID: ["Boise"], MT: ["Billings", "Bozeman"], WY: ["Cheyenne"], AK: ["Anchorage"], HI: ["Honolulu"],
  MA: ["Boston", "Cambridge", "Worcester", "Springfield"], CT: ["Hartford", "Stamford", "New Haven", "Greenwich"], RI: ["Providence"], NH: ["Manchester", "Nashua"], VT: ["Burlington"], ME: ["Portland"], WV: ["Charleston"], KS: ["Wichita", "Overland Park"], NE: ["Omaha", "Lincoln"], SD: ["Sioux Falls"], ND: ["Fargo"],
};
const TZ: Record<string, string> = {
  CA: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles", NV: "America/Los_Angeles", AZ: "America/Phoenix", UT: "America/Denver", CO: "America/Denver", NM: "America/Denver", ID: "America/Boise", MT: "America/Denver", WY: "America/Denver",
  TX: "America/Chicago", OK: "America/Chicago", KS: "America/Chicago", NE: "America/Chicago", SD: "America/Chicago", ND: "America/Chicago", MN: "America/Chicago", IA: "America/Chicago", MO: "America/Chicago", AR: "America/Chicago", LA: "America/Chicago", MS: "America/Chicago", AL: "America/Chicago", WI: "America/Chicago", IL: "America/Chicago", TN: "America/Chicago",
  AK: "America/Anchorage", HI: "Pacific/Honolulu",
};
export const stateTimezone = (st: string) => TZ[st.toUpperCase()] ?? "America/New_York";

const ALL: string[] = Object.entries(BY_STATE).flatMap(([st, cities]) => cities.map((c) => `${c}, ${st}`));

export interface FallbackSuggestion { id: string; main: string; secondary: string; text: string }
/** City suggestions for what has been typed so far: names that start with it first, then names with a word that starts with it. */
export function fallbackCities(q: string, limit = 6): FallbackSuggestion[] {
  const t = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length < 2) return [];
  const starts = ALL.filter((x) => x.toLowerCase().startsWith(t));
  const words = ALL.filter((x) => !x.toLowerCase().startsWith(t) && x.toLowerCase().split(/[\s,]+/).some((w) => w.startsWith(t)));
  return [...starts, ...words].slice(0, limit).map((text) => { const [main, st] = text.split(", "); return { id: `static:${text}`, main, secondary: `${st}, United States`, text }; });
}
export function fallbackPlace(id: string) {
  const text = id.replace(/^static:/, "");
  const m = /^(.+), ([A-Z]{2})$/.exec(text);
  if (!m || !ALL.includes(text)) return null;
  return { id, name: m[1], address: text, city: m[1], state: m[2], cityState: text, lat: null, lng: null, timezone: stateTimezone(m[2]) };
}
