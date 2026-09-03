# Graph Report - apps  (2026-09-03)

## Corpus Check
- Large corpus: 217 files · ~4,264,876 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1270 nodes · 2483 edges · 71 communities (63 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.85)
- Token cost: 1,200 input · 650 output

## Community Hubs (Navigation)
- Observations & DB Loader API
- Miami Curb Geometry Audit
- OSM Street Parking Normalization
- Valhalla Routing Service
- Miami Beach ArcGIS Scraper
- Miami Beach Canonical Connector
- Capacity Heuristics & Assistant
- OSM Raw Parking DB Normalizer
- Frontend Map Shell & Filter UI
- MapLibre Map View & Clustering
- Multi-City Fallback Data Loader
- Zrok Tunneling & Sharing
- ArcGIS Connector Foundation
- Socrata Data Source Inspector
- Premium Parking Enrichment Engine
- Geocoding & Address Autocomplete
- Miami Parking Zones Audit
- Canonical Feature & Pricing Quality
- Parking Enrichment Backlog Engine
- ArcGIS Feature Server Inspector
- Parking Data Freshness & Sync
- Overpass API Query & OsmToGeojson
- San Francisco Socrata Ingestion
- Seattle Parking Data Ingestion
- Parking Rules & Tariff Parser
- Spatial Geometry & Distance Utilities
- Prisma PostGIS Schema & Migrations
- API Stats & Metrics Endpoints
- Facility Details & Popups UI
- Curb Segment Layer Renderer
- User Feedback & Reporting Flow
- Import Sf To Db Module
- Run Ckan Connector Module
- Import Osm With Osmtogeojson Module
- Route Module
- Inspect Ckan Source Module
- Car3d Module
- Run Socrata Connector Module
- Fetch Osm Parking Module
- Parkingassistant Module
- Data Loader Module
- Readme Module
- Download Geofabrik Pbf Module
- Fetch Census Boundary Geojson Module
- Import Pbf With Osm2pgsql Module
- Types Module
- Build Tiles Module
- Fetch Research Url Module
- Data Loader Module
- Osm2pgsql Parking Module
- Datalayervisual Module
- Map Segment Classification Module
- Util Module
- Fetch Osm Parking Zones Module
- Generate Research City Manifests Module
- Validate Research Manifests Module
- Magicbentogrid Module
- Generate Phase6 Gap Workflows Module
- Adminmodecontext Module
- Fetch Datasf Meters Module
- Flagicon Module
- Magichypertext Module
- Magicnumberticker Module
- Run Phase6 Research Worker Module
- Magicborderbeam Module
- Magicmarquee Module
- Next.config Module
- Next Env.d Module

## God Nodes (most connected - your core abstractions)
1. `loadCurbSegments()` - 21 edges
2. `ParkingMap()` - 19 edges
3. `loadFacilities()` - 19 edges
4. `canonicalFeature()` - 17 edges
5. `mapLotFacility()` - 16 edges
6. `mapZone()` - 16 edges
7. `stringValue()` - 16 edges
8. `loadZones()` - 16 edges
9. `safePublicUrl()` - 15 edges
10. `main()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `main()` --indirect_call--> `isParkingAreaGeometryReferenceFeature()`  [INFERRED]
  backend/scripts/audit_miami_parking_geometry.ts → frontend/lib/data-loader.ts
- `main()` --calls--> `loadZones()`  [EXTRACTED]
  backend/scripts/audit_miami_parking_geometry.ts → frontend/lib/data-loader.ts
- `PostGIS Prisma Backend` --shares_data_with--> `Next.js Map Frontend`  [INFERRED]
  backend/README.md → frontend/README.md
- `main()` --calls--> `loadCurbSegments()`  [EXTRACTED]
  backend/scripts/audit_miami_parking_geometry.ts → frontend/lib/data-loader.ts
- `main()` --calls--> `areasFromCollection()`  [EXTRACTED]
  backend/scripts/audit_miami_parking_geometry.ts → frontend/lib/parking-geometry-quality.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **ParkingUSA Monorepo Architecture** — apps_readme_frontend_workspace, apps_readme_backend_workspace, apps_readme_mobile_workspace [EXTRACTED 1.00]

## Communities (71 total, 5 thin omitted)

### Community 0 - "Observations & DB Loader API"
Cohesion: 0.05
Nodes (70): clientKey(), GET(), isRecord(), observationSourceFilter(), optionalUrl(), parseJsonBody(), POST(), rateLimitUserReport() (+62 more)

### Community 1 - "Miami Curb Geometry Audit"
Cohesion: 0.07
Nodes (63): argValue(), Bbox, cachePath, defaultBbox, __dirname, fetchOverpassTile(), fetchOverpassTileWithRetry(), generatedKind() (+55 more)

### Community 2 - "OSM Street Parking Normalization"
Cohesion: 0.08
Nodes (40): asRecord(), __dirname, ensureSource(), extractRecords(), extractTags(), importToDb, json(), JsonRecord (+32 more)

### Community 3 - "Valhalla Routing Service"
Cohesion: 0.08
Nodes (51): errorStatus(), isAbortError(), parseJsonBody(), POST(), routeErrorResponse(), RouteErrorStatus, valhallaBaseUrl(), coordinatesFromValhallaShape() (+43 more)

### Community 4 - "Miami Beach ArcGIS Scraper"
Cohesion: 0.09
Nodes (43): centroid(), collection(), DATA_AS_OF, __dirname, enrichmentStatusForPrice(), facilityType(), fetchGeoJson(), fetchGeoJsonPage() (+35 more)

### Community 5 - "Miami Beach Canonical Connector"
Cohesion: 0.12
Nodes (38): connectorNotes(), ConnectorSourceConfig, CanonicalImportResult, CanonicalZoneLayerInput, centroid(), enrichmentStatusForPrice(), facilityType(), firstRingCoordinates() (+30 more)

### Community 6 - "Capacity Heuristics & Assistant"
Cohesion: 0.08
Nodes (36): CapacityHeuristicRecord, { deriveCapacityHeuristics }, __dirname, ensureSource(), importToDb, json(), { loadEnvConfig }, main() (+28 more)

### Community 7 - "OSM Raw Parking DB Normalizer"
Cohesion: 0.10
Nodes (33): bbox, bboxArg, boundaryGeojsonArg, city, confidenceFor(), countRows(), __dirname, dryRun (+25 more)

### Community 8 - "Frontend Map Shell & Filter UI"
Cohesion: 0.07
Nodes (27): ConfidenceFilter, DisplayMode, FacilityFeature, GeocodeResult, LayerCounts, LayerLoadState, LinkDisplay, MapPickMode (+19 more)

### Community 9 - "MapLibre Map View & Clustering"
Cohesion: 0.11
Nodes (34): ParkingMap, applyMapVisualSettings(), applyRasterTheme(), curbProxyFromFeature(), DisplayMode, EMPTY_COLLECTION, FeatureCollection, filterCollection() (+26 more)

### Community 10 - "Multi-City Fallback Data Loader"
Cohesion: 0.09
Nodes (35): bboxForRing(), cache, CITY_FALLBACKS, CityDataStatus, CityFallbackConfig, CurbSegmentLoadOptions, curbSegmentWithLineGeometry(), DATA_DIR_CANDIDATES (+27 more)

### Community 11 - "Zrok Tunneling & Sharing"
Cohesion: 0.08
Nodes (25): getZrokCommand(), getZrokDisplayCommand(), WINDOWS_ZROK_CANDIDATES, __dirname, { loadEnvConfig }, require, result, root (+17 more)

### Community 12 - "ArcGIS Connector Foundation"
Cohesion: 0.19
Nodes (25): arcgisCountUrl(), arcgisEvidenceUrl(), arcgisLayerUrl(), arcgisMetadataUrl(), arcgisQueryUrl(), arcgisRecordId(), buildArcgisSourceConfig(), ckanRecordId() (+17 more)

### Community 13 - "Socrata Data Source Inspector"
Cohesion: 0.13
Nodes (25): apiUrlArg, asString(), columnsFromMetadata(), datasetIdFromMetadataUrl(), __dirname, fetchJson(), importToDb, inspectSource() (+17 more)

### Community 14 - "Premium Parking Enrichment Engine"
Cohesion: 0.11
Nodes (25): argValue(), buildPremiumReport(), classifyPremiumLink(), dedupeVenues(), __dirname, fetchPremiumMarket(), { loadEnvConfig }, main() (+17 more)

### Community 15 - "Geocoding & Address Autocomplete"
Cohesion: 0.12
Nodes (22): GET(), ALIAS_MAP, CacheEntry, CHAR_MAP, combineAbortSignals(), derivePlaceType(), expandGeocodeQueries(), fetchForwardGeocode() (+14 more)

### Community 16 - "Miami Parking Zones Audit"
Cohesion: 0.16
Nodes (23): allCoordinates(), bboxOfCoordinates(), bboxOverlaps(), centroidOfCoordinates(), classify(), closeEnough(), finitePair(), flattenPolygons() (+15 more)

### Community 17 - "Canonical Feature & Pricing Quality"
Cohesion: 0.13
Nodes (24): canonicalFeature(), cappedConfidence(), curbPriceLabelFromMeterRates(), firstNumberValue(), isMiamiBeachArcgisRoadsideZoneFeature(), isMiamiGeneratedCurbRecord(), numberValue(), parkingSpaceGroupingZone() (+16 more)

### Community 18 - "Parking Enrichment Backlog Engine"
Cohesion: 0.17
Nodes (23): safePercentage(), addToGroup(), bucketLabel(), computeDerivedEnrichmentBacklog(), confidenceBand(), conflictReviewStatus(), emptyGroupMaps(), EnrichmentBacklogExample (+15 more)

### Community 19 - "ArcGIS Feature Server Inspector"
Cohesion: 0.14
Nodes (21): apiUrlArg, asString(), __dirname, fetchJson(), importToDb, inspectSource(), layerUrlFromQueryUrl(), { loadEnvConfig } (+13 more)

### Community 20 - "Parking Data Freshness & Sync"
Cohesion: 0.10
Nodes (17): CITIES, CityChip, FeatureCard, FEATURES, METRIC_CARDS, MetricCard, OperatorCard, OPERATORS (+9 more)

### Community 21 - "Overpass API Query & OsmToGeojson"
Cohesion: 0.20
Nodes (17): argValue(), candidateFeature(), coordinates(), DEFAULT_BBOX, fetchTile(), hasFlag(), isDedicatedParkingTags(), isParkingFeature() (+9 more)

### Community 22 - "San Francisco Socrata Ingestion"
Cohesion: 0.15
Nodes (17): ArcgisGeoJsonFeature, MIAMI_BEACH_ARCGIS_SOURCE_NAME, MIAMI_BEACH_ARCGIS_SOURCE_PAGE, MIAMI_BEACH_ARCGIS_SOURCE_URL, MiamiBeachArcgisLayerInput, argValue(), canonicalLayerUrl(), __dirname (+9 more)

### Community 23 - "Seattle Parking Data Ingestion"
Cohesion: 0.22
Nodes (16): GET(), HomePage(), routeMessage(), matchesFilters(), driverConfidence(), hasParkingConflict(), matchesPriceFilter(), matchesTrustFilter() (+8 more)

### Community 24 - "Parking Rules & Tariff Parser"
Cohesion: 0.17
Nodes (16): assertServer(), browserExecutable(), captureGroup(), captureSequence(), fs, loadPlaywright(), main(), OUT (+8 more)

### Community 25 - "Spatial Geometry & Distance Utilities"
Cohesion: 0.16
Nodes (13): DATA_REFRESH_STEPS, decideDockerStartup(), dockerDaemonReady(), DockerEnvironment, DockerUnavailableError, ensureDockerDaemon(), executeStep(), main() (+5 more)

### Community 26 - "Prisma PostGIS Schema & Migrations"
Cohesion: 0.23
Nodes (17): cityDataMetadata(), cityDbScope(), cityFallback(), emptyCollection(), isIncidentalOsmParkingFeature(), loadCityBoundary(), loadCoverageSubset(), loadFacilities() (+9 more)

### Community 27 - "API Stats & Metrics Endpoints"
Cohesion: 0.14
Nodes (13): compareByCityThenSource(), getSourceCityGroups(), getSourcesForCity(), getSourcesSortedByCity(), PARKING_SOURCE_CATALOG, PARKING_SOURCE_CITY_GROUPS, ParkingSourceCatalogEntry, ParkingSourceCityGroup (+5 more)

### Community 28 - "Facility Details & Popups UI"
Cohesion: 0.20
Nodes (16): fs, isAlive(), isHealthy(), isPortOpen(), LOG_DIR, net, path, PORT (+8 more)

### Community 29 - "Curb Segment Layer Renderer"
Cohesion: 0.21
Nodes (12): metadata, detectInitialLocale(), LanguageContext, LanguageContextValue, LanguageProvider(), DEFAULT_LOCALE, isLocale(), LOCALE_LABELS (+4 more)

### Community 30 - "User Feedback & Reporting Flow"
Cohesion: 0.12
Nodes (15): compilerOptions, paths, exclude, extends, include, next-env.d.ts, .next/types/**/*.ts, node_modules (+7 more)

### Community 31 - "Import Sf To Db Module"
Cohesion: 0.28
Nodes (14): __dirname, ensureSources(), main(), mapCurbSegment(), mapFacility(), mapZone(), numberOrNull(), parseDate() (+6 more)

### Community 32 - "Run Ckan Connector Module"
Cohesion: 0.23
Nodes (13): buildCkanSourceConfig(), buildConnectorReport(), ckanDatastoreSearchUrl(), ckanPackageSearchUrl(), persistConnectorReport(), argValue(), __dirname, fallbackCkanApiUrl() (+5 more)

### Community 33 - "Import Osm With Osmtogeojson Module"
Cohesion: 0.21
Nodes (13): __dirname, ensureSource(), geometryQuality(), importToDb, main(), mapZone(), normalizeProperties(), numberOrNull() (+5 more)

### Community 34 - "Route Module"
Cohesion: 0.24
Nodes (10): loaders, GET(), GET(), buildParkingIndex(), computeStats(), DEFAULT_CITY_ID, loadAllLayers(), loadParkingIndex() (+2 more)

### Community 35 - "Inspect Ckan Source Module"
Cohesion: 0.21
Nodes (11): __dirname, fallbackSearchUrl(), fetchJson(), main(), outputDir, portal, query, root (+3 more)

### Community 36 - "Car3d Module"
Cohesion: 0.18
Nodes (7): Car3D(), CarModelProps, InputState, SceneErrorBoundary, useReducedMotion(), Car3D, HeroComposition()

### Community 37 - "Run Socrata Connector Module"
Cohesion: 0.26
Nodes (11): buildSocrataSourceConfig(), numberOrNull(), socrataCountUrl(), socrataPageUrl(), argValue(), __dirname, fetchJson(), { loadEnvConfig } (+3 more)

### Community 38 - "Fetch Osm Parking Module"
Cohesion: 0.35
Nodes (11): bbox_label(), build_query(), element_to_feature(), fetch_bbox_with_subdivision(), fetch_overpass(), geometry_from_element(), is_dedicated_parking(), main() (+3 more)

### Community 39 - "Parkingassistant Module"
Cohesion: 0.23
Nodes (10): LandingPage(), useLanguage(), AssistantRecommendation, AssistantResponse, AssistantStatus, concatenateAudio(), isAbortError(), ParkingAssistant() (+2 more)

### Community 40 - "Data Loader Module"
Cohesion: 0.30
Nodes (12): deriveParkingSpacePointLines(), dominantGridOrientations(), localOrientation(), nearbyPoints(), directionFromAngle(), median(), metersPerLngDegree(), nearestOrientation() (+4 more)

### Community 41 - "Readme Module"
Cohesion: 0.22
Nodes (10): Backend Pipeline Scripts, PostGIS Prisma Backend, Leaflet Parking PoC Map, Frontend Runtime Helpers, Next.js Map Frontend, Future Mobile App Workspace, ParkingUSA Apps Architecture, Backend Workspace (+2 more)

### Community 42 - "Download Geofabrik Pbf Module"
Cohesion: 0.31
Nodes (9): argValue(), __dirname, download(), exists(), formatBytes(), GEOFABRIK_REGIONS, main(), requestHead() (+1 more)

### Community 43 - "Fetch Census Boundary Geojson Module"
Cohesion: 0.31
Nodes (9): argValue(), BOUNDARIES, boundaryConfig(), __dirname, fetchGeojson(), main(), queryUrl(), root (+1 more)

### Community 44 - "Import Pbf With Osm2pgsql Module"
Cohesion: 0.22
Nodes (8): databaseArgsFromUrl(), __dirname, dryRun, flexPathArg, inputPath, main(), root, schema

### Community 45 - "Types Module"
Cohesion: 0.20
Nodes (9): AccessType, CITIES, CityConfig, CityStats, CurbSegment, FacilityType, GeometryType, ParkingFacility (+1 more)

### Community 46 - "Build Tiles Module"
Cohesion: 0.22
Nodes (6): args, __dirname, dryRun, inputPath, outputPath, root

### Community 47 - "Fetch Research Url Module"
Cohesion: 0.25
Nodes (7): __dirname, main(), manifestPath, outputDir, root, urlArg, urlsFromManifest()

### Community 48 - "Data Loader Module"
Cohesion: 0.39
Nodes (9): collectionWithoutCurbDisplayPolygons(), collectionWithoutParkingSpaces(), isParkingAreaGeometryReferenceFeature(), isParkingAreaPolygonFeature(), isParkingSpaceFeature(), isParkingSpacePolygonFeature(), isPolygonFeature(), isRegulatoryZoneFeature() (+1 more)

### Community 49 - "Osm2pgsql Parking Module"
Cohesion: 0.54
Nodes (7): attrs(), facility_type(), has_prefix_tag(), is_parking(), osm2pgsql.process_node(), osm2pgsql.process_relation(), osm2pgsql.process_way()

### Community 50 - "Datalayervisual Module"
Cohesion: 0.25
Nodes (6): CLUSTERS, ClusterSpec, CURBS, CurbSpec, POINTS, PointSpec

### Community 51 - "Map Segment Classification Module"
Cohesion: 0.36
Nodes (7): FeatureCollection, isReferenceParkingSegment(), numberValue(), REFERENCE_AVAILABILITY_SEMANTICS, REFERENCE_ORDINARY_STATUSES, splitParkingSegments(), stringValue()

### Community 52 - "Util Module"
Cohesion: 0.36
Nodes (4): ServiceOptions, ServiceState, scheduleService(), selectedClusterTypes()

### Community 53 - "Fetch Osm Parking Zones Module"
Cohesion: 0.52
Nodes (6): build_query(), element_to_feature(), fetch_overpass(), main(), point_buffer_square(), props_from_element()

### Community 54 - "Generate Research City Manifests Module"
Cohesion: 0.43
Nodes (6): __dirname, evidenceForSource(), main(), root, slugCity(), sourceToManifestSource()

### Community 55 - "Validate Research Manifests Module"
Cohesion: 0.43
Nodes (6): __dirname, issue(), loadParserSpecNames(), main(), root, validateSource()

### Community 56 - "Magicbentogrid Module"
Cohesion: 0.29
Nodes (6): MagicBentoGrid(), MagicBentoGridProps, MagicBentoTile(), MagicBentoTileProps, Tone, TONE_TO_GRADIENT

### Community 57 - "Generate Phase6 Gap Workflows Module"
Cohesion: 0.40
Nodes (5): allLayers, __dirname, main(), parserSpec(), root

### Community 58 - "Adminmodecontext Module"
Cohesion: 0.40
Nodes (3): AdminModeContext, AdminModeProvider(), useAdminMode()

### Community 59 - "Fetch Datasf Meters Module"
Cohesion: 1.00
Nodes (3): fetch_json(), load_rates(), main()

### Community 60 - "Flagicon Module"
Cohesion: 0.67
Nodes (3): FlagIcon(), FlagIconProps, Locale

### Community 61 - "Magichypertext Module"
Cohesion: 0.67
Nodes (3): MagicHyperText(), MagicHyperTextProps, scramble()

### Community 62 - "Magicnumberticker Module"
Cohesion: 0.67
Nodes (3): formatNumber(), MagicNumberTicker(), MagicNumberTickerProps

## Knowledge Gaps
- **367 isolated node(s):** `Bbox`, `__dirname`, `root`, `reportPath`, `cachePath` (+362 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 423 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `safeUrl()` connect `Canonical Feature & Pricing Quality` to `Observations & DB Loader API`, `Frontend Map Shell & Filter UI`, `MapLibre Map View & Clustering`, `Multi-City Fallback Data Loader`, `Parking Enrichment Backlog Engine`, `Seattle Parking Data Ingestion`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `useLanguage()` connect `Parkingassistant Module` to `Frontend Map Shell & Filter UI`, `MapLibre Map View & Clustering`, `Parking Data Freshness & Sync`, `Seattle Parking Data Ingestion`, `Curb Segment Layer Renderer`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `loadCurbSegments()` (e.g. with `[layer]/route.ts` and `isLineFeature()`) actually correct?**
  _`loadCurbSegments()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Bbox`, `__dirname`, `root` to the rest of the system?**
  _367 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Observations & DB Loader API` be split into smaller, more focused modules?**
  _Cohesion score 0.05228070175438596 - nodes in this community are weakly interconnected._
- **Should `Miami Curb Geometry Audit` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Should `OSM Street Parking Normalization` be split into smaller, more focused modules?**
  _Cohesion score 0.07595628415300547 - nodes in this community are weakly interconnected._