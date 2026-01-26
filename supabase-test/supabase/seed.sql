-- Seed data for E2E testing
-- This creates a predictable test environment with known players and matches

-- Test players with fixed UUIDs for E2E tests
INSERT INTO players (id, display_name, elo_rating, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'E2E Player One', 1200, NOW()),
  ('22222222-2222-2222-2222-222222222222', 'E2E Player Two', 1200, NOW()),
  ('33333333-3333-3333-3333-333333333333', 'E2E Player Three', 1200, NOW())
ON CONFLICT (id) DO NOTHING;

-- Note: Tests will create their own matches as needed
-- This seed just ensures we have players available
