import json
from collections import defaultdict
from pathlib import Path


INPUT = Path("data/sf_parking_datasf.geojson")
OUTPUT = Path("data/sf_parking_curb_segments.geojson")


def main():
    data = json.loads(INPUT.read_text(encoding="utf-8"))
    groups = defaultdict(list)
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates")
        if not coords:
            continue
        blockface = props.get("raw_blockface_id") or props.get("blockface_id")
        if not blockface:
            source_id = props.get("source_id", "")
            blockface = source_id.split(":")[-1][:7]
        groups[blockface].append(feature)

    segment_features = []
    for blockface, features in groups.items():
        if len(features) < 2:
            continue
        points = []
        rates = []
        names = set()
        neighborhoods = set()
        for feature in features:
            props = feature.get("properties", {})
            lon, lat = feature["geometry"]["coordinates"]
            points.append((lon, lat, props.get("source_id", "")))
            rate = props.get("base_hourly_rate")
            if isinstance(rate, (int, float)):
                rates.append(float(rate))
            if props.get("street"):
                names.add(props["street"])
            if props.get("neighborhood"):
                neighborhoods.add(props["neighborhood"])

        # Approximate line by sorting along the dominant axis. Real production should
        # snap meters to a road centerline/curb geometry from OSM or municipal GIS.
        lon_span = max(p[0] for p in points) - min(p[0] for p in points)
        lat_span = max(p[1] for p in points) - min(p[1] for p in points)
        axis = 0 if lon_span >= lat_span else 1
        points.sort(key=lambda p: p[axis])

        min_rate = min(rates) if rates else None
        max_rate = max(rates) if rates else None
        segment_features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[lon, lat] for lon, lat, _ in points],
                },
                "properties": {
                    "source_id": f"datasf:blockface:{blockface}",
                    "blockface_id": blockface,
                    "meter_count": len(features),
                    "street_sample": sorted(names)[0] if names else "",
                    "neighborhood": sorted(neighborhoods)[0] if neighborhoods else "",
                    "base_hourly_rate_min": min_rate,
                    "base_hourly_rate_max": max_rate,
                    "charge": (
                        f"${min_rate:g}/h"
                        if min_rate is not None and min_rate == max_rate
                        else f"${min_rate:g}-${max_rate:g}/h"
                        if min_rate is not None and max_rate is not None
                        else "unknown"
                    ),
                    "confidence": 0.7,
                    "note": "Approximate curb segment from DataSF meter points grouped by blockface_id.",
                },
            }
        )

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "Derived from DataSF Parking Meters + Meter Rate Schedules",
            "input_count": len(data.get("features", [])),
            "segment_count": len(segment_features),
        },
        "features": segment_features,
    }
    OUTPUT.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(geojson["metadata"], ensure_ascii=False, indent=2))
    print(str(OUTPUT.resolve()))


if __name__ == "__main__":
    main()
