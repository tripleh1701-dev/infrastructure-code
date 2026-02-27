
-- ============================================
-- ADMIN PLATFORM COMPLETE SETUP
-- ============================================

-- Fixed UUIDs for consistent referencing (using valid hex characters only)
DO $$
DECLARE
  v_account_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_enterprise_id UUID := '00000000-0000-0000-0000-000000000001'; -- Existing Global enterprise
  v_product_id UUID := '00000000-0000-0000-0000-000000000001'; -- Existing Global product
  v_service_id UUID := '00000000-0000-0000-0000-000000000001'; -- Existing Global service
  v_workstream_id UUID := 'b0000000-0000-0000-0000-000000000001';
  v_role_id UUID := 'c0000000-0000-0000-0000-000000000001';
  v_group_id UUID := 'd0000000-0000-0000-0000-000000000001';
  v_user_id UUID := 'e0000000-0000-0000-0000-000000000001';
  v_license_id UUID := 'f0000000-0000-0000-0000-000000000001';
  v_address_id UUID := 'a1000000-0000-0000-0000-000000000001';
BEGIN

  -- 1. Create ABC Account (if not exists)
  INSERT INTO public.accounts (id, name, master_account_name, cloud_type, status)
  VALUES (v_account_id, 'ABC', 'ABC Master', 'private', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Account Address
  INSERT INTO public.account_addresses (id, account_id, line1, city, state, postal_code, country)
  VALUES (v_address_id, v_account_id, 'Admin Platform HQ', 'Admin City', 'Admin State', '00000', 'Global')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Create License for ABC with Global Enterprise/Product/Service
  INSERT INTO public.account_licenses (
    id, account_id, enterprise_id, product_id, service_id,
    start_date, end_date, number_of_users, renewal_notify, notice_days,
    contact_full_name, contact_email
  )
  VALUES (
    v_license_id, v_account_id, v_enterprise_id, v_product_id, v_service_id,
    CURRENT_DATE, (CURRENT_DATE + INTERVAL '10 years')::DATE, 1000, true, 30,
    'Admin Platform', 'admin@platform.com'
  )
  ON CONFLICT (id) DO NOTHING;

  -- 4. Create Global Workstream for ABC
  INSERT INTO public.workstreams (id, name, account_id, enterprise_id)
  VALUES (v_workstream_id, 'Global', v_account_id, v_enterprise_id)
  ON CONFLICT (id) DO NOTHING;

  -- 5. Create Admin Platform Role with full permissions
  INSERT INTO public.roles (
    id, name, description, permissions,
    account_id, enterprise_id, product_id, service_id, workstream_id
  )
  VALUES (
    v_role_id, 'Admin Platform', 'Full administrative access to the platform', 15,
    v_account_id, v_enterprise_id, v_product_id, v_service_id, v_workstream_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- 6. Link Role to Workstream (role_workstreams)
  INSERT INTO public.role_workstreams (role_id, workstream_id)
  VALUES (v_role_id, v_workstream_id)
  ON CONFLICT DO NOTHING;

  -- 7. Create full role_permissions for Admin Platform role (all menus with all permissions)
  INSERT INTO public.role_permissions (role_id, menu_key, menu_label, is_visible, can_view, can_create, can_edit, can_delete)
  VALUES 
    (v_role_id, 'dashboard', 'Dashboard', true, true, true, true, true),
    (v_role_id, 'overview', 'Overview', true, true, true, true, true),
    (v_role_id, 'pipelines', 'Pipelines', true, true, true, true, true),
    (v_role_id, 'builds', 'Builds', true, true, true, true, true),
    (v_role_id, 'security', 'Security', true, true, true, true, true),
    (v_role_id, 'access-control', 'Access Control', true, true, true, true, true),
    (v_role_id, 'account-settings', 'Account Settings', true, true, true, true, true),
    (v_role_id, 'account-settings-enterprise', 'Enterprise', true, true, true, true, true),
    (v_role_id, 'account-settings-accounts', 'Accounts', true, true, true, true, true),
    (v_role_id, 'account-settings-global', 'Global Settings', true, true, true, true, true)
  ON CONFLICT DO NOTHING;

  -- 8. Create Admin Platform Group
  INSERT INTO public.groups (
    id, name, description,
    account_id, enterprise_id, product_id, service_id, workstream_id
  )
  VALUES (
    v_group_id, 'Admin Platform Group', 'Administrative group with full platform access',
    v_account_id, v_enterprise_id, v_product_id, v_service_id, v_workstream_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- 9. Link Group to Role (group_roles)
  INSERT INTO public.group_roles (group_id, role_id)
  VALUES (v_group_id, v_role_id)
  ON CONFLICT DO NOTHING;

  -- 10. Create Admin Platform Technical User
  INSERT INTO public.account_technical_users (
    id, account_id, enterprise_id,
    first_name, last_name, email,
    assigned_group, assigned_role,
    start_date, status, is_technical_user
  )
  VALUES (
    v_user_id, v_account_id, v_enterprise_id,
    'Admin', 'Platform', 'admin@adminplatform.com',
    'Admin Platform Group', 'Admin Platform',
    CURRENT_DATE, 'active', true
  )
  ON CONFLICT (id) DO NOTHING;

  -- 11. Link User to Group (user_groups)
  INSERT INTO public.user_groups (user_id, group_id)
  VALUES (v_user_id, v_group_id)
  ON CONFLICT DO NOTHING;

  -- 12. Link User to Workstream (user_workstreams)
  INSERT INTO public.user_workstreams (user_id, workstream_id)
  VALUES (v_user_id, v_workstream_id)
  ON CONFLICT DO NOTHING;

END $$;
