ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Not specified';
ALTER TABLE public.travel_details ADD COLUMN IF NOT EXISTS departure_time text;
ALTER TABLE public.travel_details ADD COLUMN IF NOT EXISTS arrival_time text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;