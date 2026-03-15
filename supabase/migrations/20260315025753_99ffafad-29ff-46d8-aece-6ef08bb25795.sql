UPDATE role_permissions
SET can_create = true, can_edit = true, can_delete = true, updated_at = now()
WHERE menu_key = 'pipelines'
AND role_id = (SELECT id FROM roles WHERE name = 'Technical Role' LIMIT 1);