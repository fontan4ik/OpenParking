-- ParkingUSA osm2pgsql flex config.
--
-- Purpose:
--   Import only parking-relevant OSM objects into focused raw tables.
--   This file is ParkingUSA application config, not copied osm2pgsql source.
--
-- Generated tables in schema `osm_raw`:
--   parking_points   - parking POIs, entrances, spaces, and point-like candidates
--   parking_lines    - road-side/street parking ways and open parking geometries
--   parking_polygons - parking areas, lots, garages, and multipolygon relations
--
-- Follow-up ETL should normalize these raw tables into ParkingFacility,
-- CurbSegment, and ParkingZone while preserving source_id, tags, confidence,
-- geometry_quality, and data_as_of.

local srid = 4326
local schema = 'osm_raw'

local parking_points = osm2pgsql.define_node_table('parking_points', {
    { column = 'osm_type', type = 'text' },
    { column = 'osm_id', type = 'int8' },
    { column = 'source_id', type = 'text' },
    { column = 'facility_type', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'operator', type = 'text' },
    { column = 'access', type = 'text' },
    { column = 'fee', type = 'text' },
    { column = 'charge', type = 'text' },
    { column = 'capacity', type = 'text' },
    { column = 'opening_hours', type = 'text' },
    { column = 'website', type = 'text' },
    { column = 'phone', type = 'text' },
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'point', projection = srid, not_null = true },
}, { schema = schema })

local parking_lines = osm2pgsql.define_way_table('parking_lines', {
    { column = 'osm_type', type = 'text' },
    { column = 'osm_id', type = 'int8' },
    { column = 'source_id', type = 'text' },
    { column = 'facility_type', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'operator', type = 'text' },
    { column = 'access', type = 'text' },
    { column = 'fee', type = 'text' },
    { column = 'charge', type = 'text' },
    { column = 'capacity', type = 'text' },
    { column = 'opening_hours', type = 'text' },
    { column = 'website', type = 'text' },
    { column = 'phone', type = 'text' },
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'linestring', projection = srid, not_null = true },
}, { schema = schema })

local parking_polygons = osm2pgsql.define_area_table('parking_polygons', {
    { column = 'osm_type', type = 'text' },
    { column = 'osm_id', type = 'int8' },
    { column = 'source_id', type = 'text' },
    { column = 'facility_type', type = 'text' },
    { column = 'name', type = 'text' },
    { column = 'operator', type = 'text' },
    { column = 'access', type = 'text' },
    { column = 'fee', type = 'text' },
    { column = 'charge', type = 'text' },
    { column = 'capacity', type = 'text' },
    { column = 'opening_hours', type = 'text' },
    { column = 'website', type = 'text' },
    { column = 'phone', type = 'text' },
    { column = 'tags', type = 'jsonb' },
    { column = 'geom', type = 'geometry', projection = srid, not_null = true },
}, { schema = schema })

local function has_prefix_tag(tags, prefix)
    for key, _ in pairs(tags) do
        if string.sub(key, 1, string.len(prefix)) == prefix then
            return true
        end
    end
    return false
end

local function is_parking(tags)
    return tags.amenity == 'parking'
        or tags.amenity == 'parking_entrance'
        or tags.amenity == 'parking_space'
        or tags.parking ~= nil
        or has_prefix_tag(tags, 'parking:')
end

local function facility_type(tags)
    return tags.parking or tags.amenity or 'parking'
end

local function attrs(object, osm_type)
    return {
        osm_type = osm_type,
        osm_id = object.id,
        source_id = 'osm:' .. osm_type .. ':' .. object.id,
        facility_type = facility_type(object.tags),
        name = object.tags.name or object.tags.operator or object.tags.brand,
        operator = object.tags.operator,
        access = object.tags.access,
        fee = object.tags.fee or 'unknown',
        charge = object.tags.charge,
        capacity = object.tags.capacity,
        opening_hours = object.tags.opening_hours,
        website = object.tags.website,
        phone = object.tags.phone,
        tags = object.tags,
    }
end

function osm2pgsql.process_node(object)
    if not is_parking(object.tags) then
        return
    end

    local row = attrs(object, 'node')
    row.geom = object:as_point()
    parking_points:insert(row)
end

function osm2pgsql.process_way(object)
    if not is_parking(object.tags) then
        return
    end

    if object.tags.area == 'yes'
        or object.tags.amenity == 'parking'
        or object.tags.amenity == 'parking_space'
        or object.is_closed then
        local row = attrs(object, 'way')
        row.geom = object:as_polygon()
        parking_polygons:insert(row)
        return
    end

    local row = attrs(object, 'way')
    row.geom = object:as_linestring()
    parking_lines:insert(row)
end

function osm2pgsql.process_relation(object)
    if not is_parking(object.tags) then
        return
    end

    if object.tags.type == 'multipolygon' or object.tags.type == 'boundary' then
        local row = attrs(object, 'relation')
        row.geom = object:as_multipolygon()
        parking_polygons:insert(row)
    end
end
