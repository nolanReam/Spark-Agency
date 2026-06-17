-- ============================================================
-- COLUMN-BY-COLUMN DIFF: student1 vs testdirect
-- Run ONE block at a time in SQL Editor
-- Project: oxiximaftgrpipqbrwej
-- ============================================================
SELECT set_config('search_path', 'auth', false);

-- ════════════════════════════════════════════════════════════
-- BLOCK 1: Dump both rows as key/value pairs so every column
-- including NULLs is visible.
-- ════════════════════════════════════════════════════════════

SELECT 'student1' AS account, j.key, j.value
FROM auth.users u,
     LATERAL jsonb_each_text(to_jsonb(u)) j(key, value)
WHERE u.email = 'student1@sparkagency.internal'
UNION ALL
SELECT 'testdirect', j.key, j.value
FROM auth.users u,
     LATERAL jsonb_each_text(to_jsonb(u)) j(key, value)
WHERE u.email = 'testdirect@outlook.com'
ORDER BY key, account;


-- ════════════════════════════════════════════════════════════
-- BLOCK 2: Columns that DIFFER between the two users
-- (NULLs are shown as '<<NULL>>')
-- ════════════════════════════════════════════════════════════

WITH student1_row AS (
  SELECT j.key, j.value
  FROM auth.users u,
       LATERAL jsonb_each_text(to_jsonb(u)) j(key, value)
  WHERE u.email = 'student1@sparkagency.internal'
),
testdirect_row AS (
  SELECT j.key, j.value
  FROM auth.users u,
       LATERAL jsonb_each_text(to_jsonb(u)) j(key, value)
  WHERE u.email = 'testdirect@outlook.com'
)
SELECT
  COALESCE(s.key, t.key) AS column_name,
  COALESCE(s.value, '<<NULL>>') AS student1_value,
  COALESCE(t.value, '<<NULL>>') AS testdirect_value,
  CASE
    WHEN s.value IS NULL AND t.value IS NULL THEN 'both NULL'
    WHEN s.value IS NULL AND t.value IS NOT NULL THEN '⚠️ student1 NULL, testdirect HAS VALUE'
    WHEN s.value IS NOT NULL AND t.value IS NULL THEN '⚠️ student1 HAS VALUE, testdirect NULL'
    WHEN s.value <> t.value THEN '⚠️ VALUES DIFFER'
    ELSE 'match'
  END AS verdict
FROM student1_row s
FULL OUTER JOIN testdirect_row t ON s.key = t.key
WHERE s.value IS DISTINCT FROM t.value
ORDER BY column_name;


-- ════════════════════════════════════════════════════════════
-- BLOCK 3: Check if GoTrue has a schema_version or migrations
-- table that might mismatch.
-- ════════════════════════════════════════════════════════════

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'auth' ORDER BY table_name;
