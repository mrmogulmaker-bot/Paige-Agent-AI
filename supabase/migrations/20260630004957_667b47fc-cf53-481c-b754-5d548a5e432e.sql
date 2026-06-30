DO $$
DECLARE
  v_tenant uuid;
  v_page_id uuid;
  v_form_id uuid;
  v_funnel_id uuid;
  v_blocks jsonb;
  v_schema jsonb;
  v_theme jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'mma' OR name ILIKE 'mogul maker%' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'MMA tenant not found, skipping BTF seed';
    RETURN;
  END IF;

  v_theme := jsonb_build_object('background','#0b1220','text','#f8f5ee','accent','#cfae70','font','Playfair Display');

  v_blocks := jsonb_build_array(
    jsonb_build_object('type','hero','eyebrow','MOGUL MAKER ACADEMY · DONE-FOR-YOU',
      'title','BUILD. STACK. FUND.',
      'subtitle','We build your business into one that can actually borrow — formation, business credit, and funding. Done for you, start to finish.',
      'quote','We borrow to start. Then we build to own.',
      'cta_label','Apply & Get Started','cta_href','#apply'),
    jsonb_build_object('type','phase_cards','cards', jsonb_build_array(
      jsonb_build_object('phase','PHASE 01','title','BUILD — Formation & Fundable Foundation',
        'body','We form and structure your business the right way — entity, EIN, business address, phone, banking readiness, and every credibility marker a lender checks.',
        'outcome','A business structured and positioned to be funded.'),
      jsonb_build_object('phase','PHASE 02','title','STACK — Business Credit, Built In Order',
        'body','We open and manage your tradelines in the right sequence — vendor, retail, and financial — so your business credit reports across the major bureaus and grows the way lenders want to see.',
        'outcome','An established, reporting business credit profile.'),
      jsonb_build_object('phase','PHASE 03','title','FUND — Lender Matching & Funding',
        'body','We put your file in front of the lenders who actually fit it, support the application, and run the play.',
        'outcome','Funding secured — or a lender-ready package in market.'))),
    jsonb_build_object('type','feature_grid','title','Everything inside the package','items', jsonb_build_array(
      jsonb_build_object('title','Foundation & Monitoring','body','Entity formation, EIN, registered agent, business address & phone, banking readiness, plus business + personal credit monitoring.'),
      jsonb_build_object('title','Credit Stacking','body','Vendor, retail, and financial tradelines opened in the correct order so all 3 business bureaus light up.'),
      jsonb_build_object('title','Funding Strategy','body','Bureau-aware lender matching, application support, and a full capital stack plan.'),
      jsonb_build_object('title','Dedicated Coach','body','Direct access to a coach and Paige Agent AI 24/7 throughout the program.'))),
    jsonb_build_object('type','embedded_form','form_slug','btf-application'),
    jsonb_build_object('type','cta','title','Ready to be fundable?','body','Apply now and we''ll review your file within 48 hours.','cta_label','Apply & Get Started','cta_href','#apply')
  );

  v_schema := jsonb_build_object('submit_label','Submit Application','sections', jsonb_build_array(
    jsonb_build_object('title','Personal Information',
      'description','We need this to build your fundable foundation. Your information is secure.',
      'fields', jsonb_build_array(
        jsonb_build_object('key','first_name','label','Legal First Name','type','text','required',true,'maps_to','contacts.first_name'),
        jsonb_build_object('key','last_name','label','Legal Last Name','type','text','required',true,'maps_to','contacts.last_name'),
        jsonb_build_object('key','email','label','Personal Email','type','email','required',true,'maps_to','contacts.email'),
        jsonb_build_object('key','phone','label','Personal Phone','type','tel','required',true,'maps_to','contacts.phone'),
        jsonb_build_object('key','dob','label','Date of Birth','type','date'),
        jsonb_build_object('key','ssn4','label','SSN (Last 4)','type','ssn4','help','For identity verification purposes.'),
        jsonb_build_object('key','home_address','label','Personal Home Address','type','textarea'),
        jsonb_build_object('key','personal_income','label','Personal Annual Income','type','currency','help','W-2 or other documented income.'),
        jsonb_build_object('key','ownership_pct','label','Business Ownership %','type','number'))),
    jsonb_build_object('title','Business Entity',
      'description','Tell us where your business currently stands.',
      'fields', jsonb_build_array(
        jsonb_build_object('key','has_entity','label','Do you already have an existing business entity?','type','radio',
          'options', jsonb_build_array('Yes, I have an LLC, S-Corp, or C-Corp','No, I need one built for me'),'required',true),
        jsonb_build_object('key','formation_state','label','Preferred State of Formation','type','text','help','We will help you determine the best state if you aren''t sure.'),
        jsonb_build_object('key','business_email','label','Business Email','type','email','maps_to','businesses.email'),
        jsonb_build_object('key','business_website','label','Business Website','type','text','maps_to','businesses.website'),
        jsonb_build_object('key','business_address','label','Business Address','type','textarea','help','Physical or virtual business address.'),
        jsonb_build_object('key','business_phone','label','Business Phone','type','tel','help','If different from personal.'),
        jsonb_build_object('key','duns','label','DUNS Number','type','text'))),
    jsonb_build_object('title','Funding Profile',
      'description','Lenders look at your personal credit to establish trust.',
      'fields', jsonb_build_array(
        jsonb_build_object('key','credit_band','label','Personal Credit Score Band','type','select','required',true,
          'options', jsonb_build_array('Excellent (720+)','Good (680-719)','Fair (620-679)','Building (Below 620)')),
        jsonb_build_object('key','biz_credit_monitoring','label','Business Credit Monitoring (e.g. Nav.com)','type','radio',
          'options', jsonb_build_array('Yes, I monitor my business credit','No, I do not have monitoring')),
        jsonb_build_object('key','annual_revenue','label','Annual Business Revenue','type','currency'),
        jsonb_build_object('key','avg_monthly_sales','label','Average Monthly Sales','type','currency'),
        jsonb_build_object('key','employees','label','Number of Employees','type','number'),
        jsonb_build_object('key','funding_goal','label','Funding Goal','type','currency'),
        jsonb_build_object('key','use_of_funds','label','Intended Use of Funds','type','textarea')))
  ));

  INSERT INTO public.growth_forms (tenant_id, slug, name, template_key, schema_json, status, success_action_json)
  VALUES (v_tenant, 'btf-application', 'BUILD-to-FUND Application', 'btf-application', v_schema, 'active',
    jsonb_build_object('type','message','message','Thanks — your application is in. Our team will review and reach out within 48 hours.'))
  ON CONFLICT (tenant_id, slug) DO UPDATE
    SET schema_json = EXCLUDED.schema_json, name = EXCLUDED.name, status = 'active',
        success_action_json = EXCLUDED.success_action_json
  RETURNING id INTO v_form_id;

  INSERT INTO public.growth_pages (tenant_id, slug, title, template_key, blocks_json, theme_json, status, published_at, seo_json)
  VALUES (v_tenant, 'btf-sales', 'BUILD-to-FUND Program · Mogul Maker Academy', 'btf-sales',
    v_blocks, v_theme, 'published', now(),
    jsonb_build_object('description','Done-for-you business formation, business credit, and funding by Mogul Maker Academy.'))
  ON CONFLICT (tenant_id, slug) DO UPDATE
    SET blocks_json = EXCLUDED.blocks_json, theme_json = EXCLUDED.theme_json,
        title = EXCLUDED.title, status = 'published', published_at = now(),
        seo_json = EXCLUDED.seo_json
  RETURNING id INTO v_page_id;

  INSERT INTO public.growth_funnels (tenant_id, slug, name, status, entry_page_id)
  VALUES (v_tenant, 'btf-program', 'BUILD-to-FUND Program', 'active', v_page_id)
  ON CONFLICT (tenant_id, slug) DO UPDATE
    SET entry_page_id = EXCLUDED.entry_page_id, status = 'active'
  RETURNING id INTO v_funnel_id;

  DELETE FROM public.growth_funnel_steps WHERE funnel_id = v_funnel_id;
  INSERT INTO public.growth_funnel_steps (funnel_id, tenant_id, order_index, step_type, page_id)
    VALUES (v_funnel_id, v_tenant, 0, 'page', v_page_id);
  INSERT INTO public.growth_funnel_steps (funnel_id, tenant_id, order_index, step_type, form_id)
    VALUES (v_funnel_id, v_tenant, 1, 'form', v_form_id);
  INSERT INTO public.growth_funnel_steps (funnel_id, tenant_id, order_index, step_type)
    VALUES (v_funnel_id, v_tenant, 2, 'thankyou');
END $$;