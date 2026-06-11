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
    "nyc_manhattan": (40.7000, -74.0250, 40.8820, -73.9100),
    "la_dt": (33.9900, -118.3000, 34.0900, -118.1500),
    "chicago_loop": (41.8500, -87.6600, 41.9100, -87.6000),
}


def build_query(bbox):
    south, west, north, east = bbox
    return f"""
[out:json][timeout:60];
(
  node["amenity"="parking"]({south},{west},{north},{east});
  way["amenity"="parking"]({south},{west},{north},{east});
  relation["amenity"="parking"]({south},{west},{north},{east});
  node["amenity"="parking_entrance"]({south},{west},{north},{east});
  node["parking"]({south},{west},{north},{east});
  way["parking"]({south},{west},{north},{east});
);
out center tags;
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
            with urllib.request.urlopen(req, timeout=90) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    raise last_error


def element_to_feature(el):
    tags = el.get("tags", {})
    lat = el.get("lat") or el.get("center", {}).get("lat")
    lon = el.get("lon") or el.get("center", {}).get("lon")
    if lat is None or lon is None:
        return None

    name = tags.get("name") or tags.get("operator") or tags.get("brand") or "Unnamed parking"
    facility_type = tags.get("parking") or tags.get("amenity") or "parking"
    fee = tags.get("fee", "unknown")
    capacity = tags.get("capacity", "")
    source_id = f"osm:{el.get('type')}:{el.get('id')}"

    props = {
        "source_id": source_id,
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
        "osm_type": el.get("type"),
        "osm_id": el.get("id"),
        "confidence": 0.55 if fee == "unknown" else 0.65,
        "last_verified_source": "OpenStreetMap via Overpass",
        "raw_tags": tags,
    }
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch parking candidates from OpenStreetMap Overpass.")
    parser.add_argument("--city", choices=sorted(CITY_BBOXES), default="sf")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    out_path = Path(args.output or f"data/{args.city}_parking_osm.geojson")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    started = time.time()
    features = []
    seen = set()
    for idx, bbox in enumerate(split_bbox(CITY_BBOXES[args.city], rows=3, cols=3), start=1):
        query = build_query(bbox)
        print(f"Fetching tile {idx}/9...", flush=True)
        data = fetch_overpass(query)
        for el in data.get("elements", []):
            feature = element_to_feature(el)
            if not feature:
                continue
            key = feature["properties"]["source_id"]
            if key in seen:
                continue
            seen.add(key)
            features.append(feature)
        time.sleep(1)

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "city": args.city,
            "source": "OpenStreetMap Overpass",
            "generated_at_unix": int(time.time()),
            "count": len(features),
            "duration_seconds": round(time.time() - started, 2),
        },
        "features": features,
    }
    out_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(geojson["metadata"], ensure_ascii=False, indent=2))
    print(str(out_path.resolve()))


if __name__ == "__main__":
    main()
