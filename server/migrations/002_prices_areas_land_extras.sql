-- 002: project price history by frame condition, project territories,
--      land plot colour and cadastral code.

-- PROJECT PRICES ------------------------------------------------------
-- Every price change is a new row; old rows are never overwritten, so the
-- history shows how a project's price per m² moved over time.
-- frame: the delivery condition the price applies to
--   black = black frame (შავი კარკასი), white = white frame (თეთრი კარკასი),
--   green = green frame (მწვანე კარკასი)
-- A single price has price_max NULL; a range ("from 1,000 to 1,500") sets both.
CREATE TABLE project_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  frame           text NOT NULL CHECK (frame IN ('black', 'white', 'green')),
  price_min_usd   numeric(12, 2) NOT NULL CHECK (price_min_usd >= 0),
  price_max_usd   numeric(12, 2) CHECK (price_max_usd IS NULL OR price_max_usd >= price_min_usd),
  effective_date  date NOT NULL DEFAULT current_date,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_prices_lookup_idx ON project_prices (project_id, frame, effective_date DESC, created_at DESC);

-- Existing single prices did not record a frame; they are kept as white-frame prices.
INSERT INTO project_prices (project_id, frame, price_min_usd, effective_date, created_at)
SELECT id, 'white', price_per_m2_usd, created_at::date, created_at
FROM projects WHERE price_per_m2_usd IS NOT NULL;

ALTER TABLE projects DROP COLUMN price_per_m2_usd;

-- PROJECT TERRITORY ---------------------------------------------------
ALTER TABLE projects
  ADD COLUMN area_geom geometry(Polygon, 4326) CHECK (area_geom IS NULL OR ST_IsValid(area_geom));
CREATE INDEX projects_area_geom_idx ON projects USING gist (area_geom);

-- LAND EXTRAS ---------------------------------------------------------
ALTER TABLE land_plots
  ADD COLUMN color text NOT NULL DEFAULT 'orange' CHECK (color IN ('red', 'orange', 'green')),
  ADD COLUMN cadastral_code text CHECK (cadastral_code IS NULL OR length(cadastral_code) <= 60);
CREATE INDEX land_plots_cadastral_idx ON land_plots (cadastral_code);
