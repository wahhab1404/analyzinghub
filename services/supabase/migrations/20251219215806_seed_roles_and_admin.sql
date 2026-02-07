/*
  # Seed Initial Data

  ## Overview
  Seeds the database with initial roles and creates the Super Admin account.

  ## Changes
  1. Insert three default roles: SuperAdmin, Analyzer, Trader
  2. Note: Super Admin user must be created through Supabase Auth dashboard or signup flow
  
  ## Roles
  - SuperAdmin: Full system access and user management
  - Analyzer: Can create and publish analyses
  - Trader: Can follow analyzers and view analyses
*/

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('SuperAdmin', 'Full system access with user management capabilities')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (name, description) VALUES
  ('Analyzer', 'Can create and publish market analyses')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (name, description) VALUES
  ('Trader', 'Can follow analyzers and view analyses')
ON CONFLICT (name) DO NOTHING;