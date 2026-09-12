-- Read-only verification for migration 011. Run after applying the migration
-- in a disposable/local database (or during a future controlled deployment).

SELECT
  procedure.proname AS function_name,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  procedure.prosecdef AS is_security_definer,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(procedure.proconfig, ARRAY[]::TEXT[])) AS setting
    WHERE setting IN ('search_path=', 'search_path=""')
  ) AS has_empty_search_path
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'claim_password_reset_request',
    'ensure_student_password_change_requirement',
    'fail_password_reset_attempt',
    'complete_password_reset',
    'complete_student_password_change'
  )
ORDER BY procedure.proname;

SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'claim_password_reset_request',
    'ensure_student_password_change_requirement',
    'fail_password_reset_attempt',
    'complete_password_reset',
    'complete_student_password_change'
  )
ORDER BY routine_name, grantee;

SELECT
  has_function_privilege('anon', 'public.claim_password_reset_request(uuid,uuid)', 'EXECUTE')
    AS anon_can_claim,
  has_function_privilege('authenticated', 'public.claim_password_reset_request(uuid,uuid)', 'EXECUTE')
    AS authenticated_can_claim,
  has_function_privilege('service_role', 'public.claim_password_reset_request(uuid,uuid)', 'EXECUTE')
    AS service_role_can_claim;

SELECT
  has_function_privilege('anon', 'public.complete_student_password_change(uuid)', 'EXECUTE')
    AS anon_can_complete_student_change,
  has_function_privilege('authenticated', 'public.complete_student_password_change(uuid)', 'EXECUTE')
    AS authenticated_can_complete_student_change,
  has_function_privilege('service_role', 'public.complete_student_password_change(uuid)', 'EXECUTE')
    AS service_role_can_complete_student_change;
