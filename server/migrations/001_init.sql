-- Tbilisi Property Map: initial schema
-- Requires PostgreSQL 13+ (gen_random_uuid) and PostGIS 3+.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- USERS ---------------------------------------------------------------
-- role 'admin'  : full access, manages users
-- role 'viewer' : signed-in colleague; read-only, but can see owner/agent contacts
-- Anonymous visitors (the public link) are not stored here and never see contacts.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email         text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PROJECTS ------------------------------------------------------------
CREATE TABLE projects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  developer          text NOT NULL CHECK (length(developer) BETWEEN 1 AND 200),
  architect          text,
  construction_stage text NOT NULL CHECK (construction_stage IN (
                       'planning', 'design', 'construction', 'structure',
                       'facade', 'interior_works', 'completed', 'delivered')),
  price_per_m2_usd   numeric(12, 2) CHECK (price_per_m2_usd >= 0),
  handover_date      date,
  latitude           double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude          double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geom               geometry(Point, 4326)
                       GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  description        text,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_geom_idx ON projects USING gist (geom);
CREATE INDEX projects_stage_idx ON projects (construction_stage);
CREATE INDEX projects_developer_idx ON projects (lower(developer));
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- LAND PLOTS ----------------------------------------------------------
-- geom is stored in WGS84 (EPSG:4326). Area is computed on the ellipsoid with
-- ST_Area(geom::geography) unless an admin enters a manual correction.
CREATE TABLE land_plots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  geom             geometry(Polygon, 4326) NOT NULL CHECK (ST_IsValid(geom)),
  area_m2          numeric(14, 2) NOT NULL CHECK (area_m2 > 0),
  area_is_manual   boolean NOT NULL DEFAULT false,
  total_price_usd  numeric(16, 2) CHECK (total_price_usd >= 0),
  price_per_m2_usd numeric(12, 2) CHECK (price_per_m2_usd >= 0),
  k2_coefficient   numeric(6, 2) CHECK (k2_coefficient >= 0),
  owner_name       text,
  owner_phone      text,
  agent_name       text,
  agent_phone      text,
  notes            text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX land_plots_geom_idx ON land_plots USING gist (geom);
CREATE INDEX land_plots_created_idx ON land_plots (created_at DESC);
CREATE TRIGGER land_plots_updated_at BEFORE UPDATE ON land_plots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PHOTOS --------------------------------------------------------------
-- Each photo belongs to exactly one project OR one land plot.
-- storage_key points into the configured object storage (local disk or S3).
-- The public file URL is derived: GET /api/photos/:id/file
CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  land_plot_id  uuid REFERENCES land_plots(id) ON DELETE CASCADE,
  storage_key   text NOT NULL UNIQUE,
  content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((project_id IS NULL) <> (land_plot_id IS NULL))
);
CREATE INDEX photos_project_idx ON photos (project_id);
CREATE INDEX photos_land_plot_idx ON photos (land_plot_id);
