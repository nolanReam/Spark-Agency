-- Add DELETE policy for cases table
-- Root cause fix for Issue 2 (Archived Remove doing nothing):
-- PostgREST's default-deny was blocking all DELETE requests to cases
-- because no DELETE policy existed.

DROP POLICY IF EXISTS "cases_delete_instructor" ON cases;
CREATE POLICY "cases_delete_instructor" ON cases FOR DELETE
  USING (is_instructor());
