-- 004: land plot deal status and viewing status.
--   deal_status: NULL (open), 'sold' (გაყიდულია), 'not_interested' (არ გვაინტერესებს)
--   seen_status: NULL (not set), 'seen' (ნანახია), 'not_seen' (არ არის ნანახი)
ALTER TABLE land_plots
  ADD COLUMN deal_status text CHECK (deal_status IN ('sold', 'not_interested')),
  ADD COLUMN seen_status text CHECK (seen_status IN ('seen', 'not_seen'));
