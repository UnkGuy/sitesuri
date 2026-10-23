-- SiteSuri personal shortlist. Apply after users and ML locations tables exist.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.saved_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    business_type VARCHAR(30) NOT NULL CHECK (
        business_type IN ('food stall', 'sari-sari store', 'general retail')
    ),
    notes VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_saved_locations_user_location_category
        UNIQUE (user_id, location_id, business_type)
);

CREATE INDEX IF NOT EXISTS idx_saved_locations_user_created
    ON public.saved_locations (user_id, created_at DESC);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saved_locations FROM anon, authenticated;
-- Only the trusted FastAPI database role should query this table. API ownership
-- is enforced by verified Clerk JWT -> public.users.user_id.
