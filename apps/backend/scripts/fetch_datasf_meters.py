import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


METERS_URL = "https://data.sfgov.org/resource/8vzz-qzz9.json"
RATES_URL = "https://data.sfgov.org/resource/fwjv-32uk.json"


def fetch_json(base_url, params):
    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ParkingUSA research PoC (contact: local-prototype)"},
    )
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def load_rates():
    rows = fetch_json(RATES_URL, {"$limit": 70000})
    rates_by_post = {}
    for row in rows:
        post_id = row.get("post_id")
        if not post_id:
            continue
        try:
            rate = float(row.get("rate", 0))
        except ValueError:
            continue
        if rate <= 0:
            continue
        existing = rates_by_post.get(post_id)
        if existing is None or rate < existing:
            rates_by_post[post_id] = rate
    return rates_by_post


def main():
    out_path = Path("data/sf_parking_datasf.geojson")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    rates = load_rates()
    meters = fetch_json(
        METERS_URL,
        {
            "$limit": 50000,
            "$select": "post_id,on_offstreet_type,jurisdiction,pm_district_id,blockface_id,active_meter_flag,meter_type,cap_color,street_name,street_num,longitude,latitude,data_as_of,analysis_neighborhood",
            "$where": "latitude IS NOT NULL AND longitude IS NOT NULL AND active_meter_flag in('M','T','P')",
        },
    )

    features = []
    for row in meters:
        post_id = row.get("post_id", "")
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
        except (KeyError, ValueError):
            continue

        street = " ".join(part for part in [row.get("street_num"), row.get("street_name")] if part)
        rate = rates.get(post_id)
        price_text = f"${rate:g}/h base" if rate else "unknown"
        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "source_id": f"datasf:meter:{post_id}",
                "name": f"SF meter {post_id}",
                "facility_type": "street_meter" if row.get("on_offstreet_type") == "ON" else "offstreet_meter",
                "fee": "yes",
                "charge": price_text,
                "base_hourly_rate": rate,
                "operator": row.get("jurisdiction", "SFMTA"),
                "access": "public",
                "capacity": "",
                "opening_hours": "",
                "street": street,
                "blockface_id": row.get("blockface_id", ""),
                "neighborhood": row.get("analysis_neighborhood", ""),
                "meter_type": row.get("meter_type", ""),
                "cap_color": row.get("cap_color", ""),
                "active_meter_flag": row.get("active_meter_flag", ""),
                "confidence": 0.85 if rate else 0.75,
                "last_verified_source": "DataSF Parking Meters + Meter Rate Schedules",
                "data_as_of": row.get("data_as_of", ""),
            },
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "city": "sf",
            "source": "DataSF Parking Meters + Meter Rate Schedules",
            "generated_at_unix": int(time.time()),
            "count": len(features),
            "priced_count": sum(1 for f in features if f["properties"].get("base_hourly_rate")),
        },
        "features": features,
    }
    out_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(geojson["metadata"], ensure_ascii=False, indent=2))
    print(str(out_path.resolve()))


if __name__ == "__main__":
    main()
