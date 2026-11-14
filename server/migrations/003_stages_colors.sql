-- 003: new construction stages and a colour for each project.

-- Stages, in order:
--   design               პროექტირება
--   facade_works         ფასადის სამუშაოები
--   construction_low     მშენებლობა 5 სართულამდე
--   construction_high    მშენებლობა 5+ სართული
--   exterior_finishing   გარე ვიზუალის მოპირკეთება
--   completed            დასრულებული
--   partially_completed  დასრულებულია ნაწილობრივ (ბლოკები)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_construction_stage_check;
UPDATE projects SET construction_stage = CASE construction_stage
  WHEN 'planning'       THEN 'design'
  WHEN 'design'         THEN 'design'
  WHEN 'construction'   THEN 'construction_low'
  WHEN 'structure'      THEN 'construction_high'
  WHEN 'facade'         THEN 'facade_works'
  WHEN 'interior_works' THEN 'exterior_finishing'
  WHEN 'delivered'      THEN 'completed'
  ELSE construction_stage END;
ALTER TABLE projects ADD CONSTRAINT projects_construction_stage_check CHECK (construction_stage IN (
  'design', 'facade_works', 'construction_low', 'construction_high',
  'exterior_finishing', 'completed', 'partially_completed'));

ALTER TABLE projects
  ADD COLUMN color text NOT NULL DEFAULT 'blue' CHECK (color IN ('blue', 'green', 'orange', 'red'));
