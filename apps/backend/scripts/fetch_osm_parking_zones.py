import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


BBOXES = {
    # south, west, north, east
    "sf_downtown": (37.7650, -122.4250, 37.8050, -122.3850),
    "sf": (37.7047, -122.5270, 37.8324, -122.3482),
}


def build_query(bbox):
    south, west, north, east = bbox
    return f"""
[out:json][timeout:90];
(
  way["amenity"="parking"]({south},{west},{north},{east});
  way["parking"]({south},{west},{north},{east});
  relation["amenity"="parking"]({south},{west},{north},{east});
);
out tags geom center;
"""


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
            with urllib.request.urlopen(req, timeout=120) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    raise last_error


def props_from_element(el):
    tags = el.get("tags", {})
    return {
        "source_id": f"osm:{el.get('type')}:{el.get('id')}",
        "name": tags.get("name") or tags.get("operator") or "Parking area",
        "facility_type": tags.get("parking") or tags.get("amenity") or "parking_area",
        "operator": tags.get("operator", ""),
        "access": tags.get("access", ""),
        "fee": tags.get("fee", "unknown"),
        "charge": tags.get("charge", ""),
        "capacity": tags.get("capacity", ""),
        "opening_hours": tags.get("opening_hours", ""),
        "website": tags.get("website", ""),
        "confidence": 0.6,
        "last_verified_source": "OpenStreetMap via Overpass",
        "raw_tags": tags,
    }


def element_to_feature(el):
    geometry = el.get("geometry") or []
    props = props_from_element(el)
    if el.get("type") == "way" and len(geometry) >= 4:
        coords = [[p["lon"], p["lat"]] for p in geometry]
        if coords[0] == coords[-1]:
            return {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coords]},
                "properties": props,
            }
        return {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": props,
        }

    center = el.get("center")
    if center:
        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [center["lon"], center["lat"]]},
            "properties": props,
        }
    return None


def point_buffer_square(feature, size=0.00012):
    if feature["geometry"]["type"] != "Point":
        return feature
    lon, lat = feature["geometry"]["coordinates"]
    coords = [
        [lon - size, lat - size],
        [lon + size, lat - size],
        [lon + size, lat + size],
        [lon - size, lat + size],
        [lon - size, lat - size],
    ]
    props = dict(feature["properties"])
    props["geometry_note"] = "Approximate display polygon generated from point/center. Production should use parcel, building, lot footprint, or authoritative GIS polygon."
    props["confidence"] = min(float(props.get("confidence", 0.5)), 0.35)
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [coords]},
        "properties": props,
    }


def main():
    out_path = Path("data/sf_parking_zones_osm.geojson")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = fetch_overpass(build_query(BBOXES["sf_downtown"]))
    features = []
    seen = set()
    for el in data.get("elements", []):
        feature = element_to_feature(el)
        if not feature:
            continue
        key = feature["properties"]["source_id"]
        if key in seen:
            continue
        seen.add(key)
        features.append(point_buffer_square(feature))

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap amenity=parking/parking ways and relations",
            "area": "sf_downtown",
            "count": len(features),
            "polygon_count": sum(1 for f in features if f["geometry"]["type"] == "Polygon"),
        },
        "features": features,
    }
    out_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(geojson["metadata"], ensure_ascii=False, indent=2))
    print(str(out_path.resolve()))


if __name__ == "__main__":
    main()
