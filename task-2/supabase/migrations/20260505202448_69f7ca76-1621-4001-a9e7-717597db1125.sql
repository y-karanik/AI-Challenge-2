INSERT INTO public.host_members (host_id, user_id, role, invited_by)
SELECT
  '20e70477-76ed-4a4c-8e65-b631befa4577'::uuid AS host_id,
  u.id AS user_id,
  'host'::host_role AS role,
  '11111111-1111-1111-1111-111111111111'::uuid AS invited_by
FROM auth.users u
WHERE u.email NOT LIKE '%@test.local'
ON CONFLICT DO NOTHING;