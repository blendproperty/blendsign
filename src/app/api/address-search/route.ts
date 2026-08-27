import { NextRequest, NextResponse } from "next/server";

type PhotonFeature = { properties?: { osm_id?: number; osm_type?: string; name?: string; housenumber?: string; street?: string; locality?: string; city?: string; district?: string; county?: string; state?: string; postcode?: string; country?: string } };
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET(request: NextRequest) {
  const query = clean(request.nextUrl.searchParams.get("q")).slice(0, 160);
  if (query.length < 4) return NextResponse.json({ results: [] });
  const typedHouseNumber = query.match(/^\s*(\d+[A-Za-z]?)(?:\s|,)/)?.[1] || "";
  const streetQuery = typedHouseNumber ? query.replace(/^\s*\d+[A-Za-z]?(?:\s|,)+/, "").trim() : query;
  if (streetQuery.length < 3) return NextResponse.json({ results: [], hint: "Keep typing the street name." });
  const endpoint = (process.env.PHOTON_API_URL || "https://photon.komoot.io").replace(/\/$/, "");
  const url = new URL(`${endpoint}/api`);
  url.searchParams.set("q", streetQuery);
  url.searchParams.set("countrycode", "ZA");
  url.searchParams.set("lang", "en");
  url.searchParams.set("limit", "10");
  url.searchParams.set("osm_tag", "highway");
  url.searchParams.set("lat", process.env.PHOTON_BIAS_LAT || "-26.1");
  url.searchParams.set("lon", process.env.PHOTON_BIAS_LON || "28.1");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "BlendSign/1.0 address-search" }, signal: AbortSignal.timeout(5_000), next: { revalidate: 86_400 } });
    if (!response.ok) throw new Error(`Address provider returned ${response.status}`);
    const body = await response.json() as { features?: PhotonFeature[] };
    const results = (body.features || []).map((feature, index) => {
      const properties = feature.properties || {};
      const street = clean(properties.street) || clean(properties.name);
      const address = [clean(properties.housenumber) || typedHouseNumber, street].filter(Boolean).join(" ");
      const locality = clean(properties.locality);
      const city = clean(properties.city) || locality || clean(properties.district) || clean(properties.county);
      const postalCode = clean(properties.postcode);
      const label = [address, locality && locality !== city ? locality : "", city, postalCode, clean(properties.state), clean(properties.country)].filter(Boolean).join(", ");
      return { id: `${properties.osm_type || "place"}-${properties.osm_id || index}`, label, address: address || label, city, postalCode };
    }).filter((result) => result.address && result.label).slice(0, 6);
    return NextResponse.json({ results, hint: results.length ? null : "Keep typing the street name or add the suburb or city." }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ results: [], warning: "Address search is temporarily unavailable. Enter the address manually." });
  }
}
