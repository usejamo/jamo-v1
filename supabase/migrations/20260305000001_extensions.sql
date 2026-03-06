-- Enable pgvector in extensions schema (not public, avoids namespace pollution)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create private schema for security-definer helper functions
-- (Supabase exposes public schema via PostgREST; private schema is not exposed)
CREATE SCHEMA IF NOT EXISTS private;
