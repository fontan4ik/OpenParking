import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


CITY_BBOXES = {
    # south, west, north, east
    "sf": (37.7047, -122.5270, 37.8324, -122.3482),
    "miami": (25.7090, -80.3198, 25.8558, -80.1395),
    "nyc_manhattan": (40.7000, -74.0250, 40.8820, -73.9100),
    "la_dt": (33.9900, -118.3000, 34.0900, -118.1500),
    "chicago_loop": (41.8500, -87.6600, 41.9100, -87.6000),
}


def build_query(bbox):
    south, west, north, east = bbox
    return f"""
[out:json][timeout:120];
(
  node["amenity"~"^parking"]({south},{west},{north},{east});
  way["amenity"~"^parking"]({south},{west},{north},{east});
  relation["amenity"~"^parking"]({south},{west},{north},{east});
  node["parking"]({south},{west},{north},{east});
  way["parking"]({south},{west},{north},{east});
  relation["parking"]({south},{west},{north},{east});
);
out tags geom center;
"""


def split_bbox(bbox, rows=2, cols=2):
    south, west, north, east = bbox
    lat_step = (north - south) / rows
    lon_step = (east - west) / cols
    for row in range(rows):
        for col in range(cols):
            yield (
                south + lat_step * row,
                west + lon_step * col,
                south + lat_step * (row + 1),
                west + lon_step * (col + 1),
            )


def bbox_label(bbox):
    south, west, north, east = bbox
    return f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}"


def parse_bbox(value):
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be south,west,north,east")
    try:
        south, west, north, east = (float(part) for part in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("bbox values must be numbers") from exc
    if south >= north or west >= east:
        raise argparse.ArgumentTypeError("bbox must satisfy south<north and west<east")
    return south, west, north, east


def fetch_overpass(query):
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error = None
    for url in OVERPASS_URLS:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "User-Agent": "ParkingUSA research PoC (contact: local-prototype)",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    raise last_error


def fetch_bbox_with_subdivision(bbox, max_depth, depth=0):
    try:
        return fetch_overpass(build_query(bbox)).get("elements", [])
    except Exception as exc:
        if depth >= max_depth:
            print(
                f"Skipping bbox {bbox_label(bbox)} after {depth + 1} attempts: {exc}",
                flush=True,
            )
            return []

        print(
            f"Retrying bbox {bbox_label(bbox)} as 2x2 subtiles after error: {exc}",
            flush=True,
        )
        elements = []
        for child_bbox in split_bbox(bbox, rows=2, cols=2):
            elements.extend(fetch_bbox_with_subdivision(child_bbox, max_depth, depth + 1))
        return elements


def geometry_from_element(el):
    geometry = el.get("geometry") or []
    tags = el.get("tags", {})
    parking_type = tags.get("parking", "")

    if el.get("type") == "way" and len(geometry) >= 2:
        coords = [[p["lon"], p["lat"]] for p in geometry if "lon" in p and "lat" in p]
        if len(coords) >= 4 and coords[0] == coords[-1] and parking_type != "street_side":
            return {"type": "Polygon", "coordinates": [coords]}, "osm_polygon"
        if len(coords) >= 2:
            return {"type": "LineString", "coordinates": coords}, "osm_line"

    lat = el.get("lat") or el.get("center", {}).get("lat")
    lon = el.get("lon") or el.get("center", {}).get("lon")
    if lat is None or lon is None:
        return None, "osm_missing_geometry"

    quality = "osm_point" if el.get("type") == "node" else "osm_center_fallback"
    return {"type": "Point", "coordinates": [lon, lat]}, quality


def element_to_feature(el):
    tags = el.get("tags", {})
    geometry, geometry_quality = geometry_from_element(el)
    if geometry is None:
        return None

    name = tags.get("name") or tags.get("operator") or tags.get("brand") or "Unnamed parking"
    facility_type = tags.get("parking") or tags.get("amenity") or "parking"
    fee = tags.get("fee", "unknown")
    capacity = tags.get("capacity", "")
    source_id = f"osm:{el.get('type')}:{el.get('id')}"
    source_url = f"https://www.openstreetmap.org/{el.get('type')}/{el.get('id')}"
    has_price = fee not in ("", "unknown") or bool(tags.get("charge"))
    has_rules = bool(tags.get("opening_hours") or tags.get("parking:condition") or tags.get("parking:condition:right") or tags.get("parking:condition:left"))

    props = {
        "source_id": source_id,
        "source_name": "OpenStreetMap via Overpass",
        "name": name,
        "facility_type": facility_type,
        "fee": fee,
        "capacity": capacity,
        "operator": tags.get("operator", ""),
        "access": tags.get("access", ""),
        "opening_hours": tags.get("opening_hours", ""),
        "charge": tags.get("charge", ""),
        "website": tags.get("website", ""),
        "phone": tags.get("phone", ""),
        "source_url": source_url,
        "api_url": "https://overpass-api.de/api/interpreter",
        "evidence_url": source_url,
        "payment_url": "",
        "booking_url": "",
        "osm_type": el.get("type"),
        "osm_id": el.get("id"),
        "geometry_quality": geometry_quality,
        "existence_status": "candidate",
        "price_status": "known_priced" if has_price else "known_unpriced",
        "rule_status": "partial" if has_rules else "unknown",
        "enrichment_status": "needs_payment_link" if has_price else "needs_price",
        "needs_enrichment": True,
        "confidence": 0.55 if fee == "unknown" else 0.65,
        "last_verified_source": "OpenStreetMap via Overpass",
        "raw_tags": tags,
    }
    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": props,
    }


def write_geojson(out_path, args, features, started, complete=False):
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "city": args.city,
            "source": "OpenStreetMap Overpass",
            "coverage_role": "candidate_coverage_baseline",
            "complete": complete,
            "generated_at_unix": int(time.time()),
            "count": len(features),
            "point_count": sum(1 for f in features if f["geometry"]["type"] == "Point"),
            "line_count": sum(1 for f in features if f["geometry"]["type"] in ("LineString", "MultiLineString")),
            "polygon_count": sum(1 for f in features if f["geometry"]["type"] in ("Polygon", "MultiPolygon")),
            "duration_seconds": round(time.time() - started, 2),
        },
        "features": features,
    }
    out_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    return geojson


def main():
    parser = argparse.ArgumentParser(description="Fetch parking candidates from OpenStreetMap Overpass.")
    parser.add_argument("--city", choices=sorted(CITY_BBOXES), default="sf")
    parser.add_argument("--output", default=None)
    parser.add_argument("--rows", type=int, default=3)
    parser.add_argument("--cols", type=int, default=3)
    parser.add_argument("--max-subdivide-depth", type=int, default=2)
    parser.add_argument("--max-tiles", type=int, default=0, help="Optional smoke-test limit for top-level tiles.")
    parser.add_argument("--bbox", type=parse_bbox, default=None, help="Optional south,west,north,east override.")
    args = parser.parse_args()

    out_path = Path(args.output or f"data/{args.city}_parking_osm.geojson")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    started = time.time()
    features = []
    seen = set()
    bboxes = list(split_bbox(args.bbox or CITY_BBOXES[args.city], rows=args.rows, cols=args.cols))
    if args.max_tiles > 0:
        bboxes = bboxes[: args.max_tiles]

    for idx, bbox in enumerate(bboxes, start=1):
        query = build_query(bbox)
        print(f"Fetching tile {idx}/{len(bboxes)}...", flush=True)
        for el in fetch_bbox_with_subdivision(bbox, args.max_subdivide_depth):
            feature = element_to_feature(el)
            if not feature:
                continue
            key = feature["properties"]["source_id"]
            if key in seen:
                continue
            seen.add(key)
            features.append(feature)
        time.sleep(1)
        checkpoint = write_geojson(out_path, args, features, started, complete=False)
        print(
            f"Checkpoint after tile {idx}/{len(bboxes)}: {checkpoint['metadata']['count']} features",
            flush=True,
        )

    geojson = write_geojson(out_path, args, features, started, complete=True)
    print(json.dumps(geojson["metadata"], ensure_ascii=False, indent=2))
    print(str(out_path.resolve()))


if __name__ == "__main__":
    main()
