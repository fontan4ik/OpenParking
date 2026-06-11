# ParkingUSA Backend

Shared backend workspace for the website and future mobile app.

Important folders:

- `prisma/` - shared PostGIS/Prisma schema and migrations.
- `scripts/` - parsers, importers, research jobs, normalization jobs, and tile scripts.

Run backend commands from the repository root through `npm run ...` so relative
paths continue to resolve against the shared root `data/` folder.
