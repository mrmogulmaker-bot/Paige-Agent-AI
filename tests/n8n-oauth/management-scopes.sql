\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION public.n8n_management_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PROOF_FAILED: %',label; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{"role":"service_role"}',false);
SET ROLE service_role;
DO $$
DECLARE ctx jsonb:='{"tenant_id":"10000000-0000-0000-0000-000000000001","actor_id":"00000000-0000-0000-0000-000000000001","session_id":"20000000-0000-0000-0000-000000000001"}';
 scopes jsonb:='["workflow:read","workflow:write","workflow:execute","execution:read"]';
 payload jsonb:='{"resource":"https://fixture.example/mcp-server/http","authorization_url":"https://fixture.example/authorize","server":{"issuer":"https://fixture.example"},"client":{"clientId":"fixture-client"}}';
 tokens jsonb:='{"accessToken":"fixture-access","expiresAt":"2099-01-01T00:00:00Z"}';
 a jsonb; l jsonb; b jsonb; bad jsonb; r jsonb;
BEGIN
 PERFORM n8n_oauth_service('begin',ctx||jsonb_build_object('requested_scopes',scopes,'state_hash','management-state','launch_hash','management-launch','launch_proof_hash','management-proof','payload',payload));
 PERFORM n8n_management_assert((SELECT cardinality(requested_scopes)=4 FROM tenant_n8n_oauth_attempts WHERE state_hash='management-state'),'attempt requested four scopes');
 PERFORM n8n_oauth_service('launch','{"launch_hash":"management-launch","launch_proof_hash":"management-proof","binding_hash":"cookie"}');
 a:=n8n_oauth_service('consume','{"state_hash":"management-state","binding_hash":"cookie"}');
 FOR bad IN SELECT value FROM jsonb_array_elements('[null,{},["workflow:read","workflow:write"],["workflow:read","workflow:write","workflow:execute","execution:read","other"],["workflow:read","workflow:write","workflow:execute","execution:read","execution:read"]]'::jsonb) LOOP
  BEGIN
   PERFORM n8n_oauth_service('finish',jsonb_build_object('attempt_id',a->>'attempt_id','outcome','success','tokens',tokens||jsonb_build_object('scopes',bad)));
   RAISE EXCEPTION 'unexpected accepted scopes';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_SCOPE_REFUSED' THEN RAISE; END IF; END;
 END LOOP;
 PERFORM n8n_oauth_service('finish',jsonb_build_object('attempt_id',a->>'attempt_id','outcome','success','tokens',tokens||jsonb_build_object('scopes',scopes)));
 l:=n8n_oauth_service('acquire',ctx); b:=ctx||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 PERFORM n8n_management_assert(l->'oauth_scopes' @> scopes AND jsonb_array_length(l->'oauth_scopes')=4,'actual scopes acquired');
 r:=n8n_oauth_service('check',b);
 PERFORM n8n_management_assert(r->>'ok'='true' AND NOT (r ? 'access_token'),'fence safe return');
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"session_id":null},{"session_id":"20000000-0000-0000-0000-000000000099"},{"actor_id":"00000000-0000-0000-0000-000000000002"},{"tenant_id":"10000000-0000-0000-0000-000000000002"},{"lease":"20000000-0000-0000-0000-000000000099"},{"generation":"20000000-0000-0000-0000-000000000099"}]'::jsonb) LOOP
  BEGIN PERFORM n8n_oauth_service('check',b||bad); RAISE EXCEPTION 'unexpected fence acceptance';
  EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN raise_exception THEN IF SQLERRM<>'N8N_STALE_OPERATION' THEN RAISE; END IF; END;
 END LOOP;
 BEGIN PERFORM n8n_oauth_service('rotate',b||jsonb_build_object('tokens',tokens||'{"scopes":["workflow:read","workflow:write"]}')); RAISE EXCEPTION 'scope downgrade accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_SCOPE_REFUSED' THEN RAISE; END IF; END;
 PERFORM n8n_oauth_service('rotate',b||jsonb_build_object('tokens',tokens||jsonb_build_object('scopes',scopes)));
 PERFORM n8n_oauth_service('release',b);
 BEGIN PERFORM n8n_oauth_service('check',b); RAISE EXCEPTION 'released fence accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_STALE_OPERATION' THEN RAISE; END IF; END;
 l:=n8n_oauth_service('acquire',ctx-'session_id'); b:=(ctx-'session_id')||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 PERFORM n8n_oauth_service('probe',b||'{"state":"connected"}');
 BEGIN PERFORM n8n_oauth_service('check',b||jsonb_build_object('session_id',ctx->>'session_id')); RAISE EXCEPTION 'legacy lease promoted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM n8n_oauth_service('release',b);

END $$;
RESET ROLE;
-- Revoke session and switch-away/back after a successful acquire.
DO $$
DECLARE ctx jsonb:='{"tenant_id":"10000000-0000-0000-0000-000000000001","actor_id":"00000000-0000-0000-0000-000000000001","session_id":"20000000-0000-0000-0000-000000000001"}'; l jsonb; b jsonb;
BEGIN
 -- A pre-existing two-scope grant may refresh unchanged, never silently widen.
 UPDATE tenant_mcp_connections SET oauth_scopes=ARRAY['workflow:read','workflow:write'] WHERE tenant_id=(ctx->>'tenant_id')::uuid AND provider='n8n';
 l:=n8n_oauth_service('acquire',ctx); b:=ctx||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 PERFORM n8n_management_assert(jsonb_array_length(l->'oauth_scopes')=2,'legacy grant preserved');
 UPDATE tenant_mcp_connections SET n8n_approved_workflow_ids=ARRAY['approved-fixture'],n8n_discovery_pin='fixture-pin',
  n8n_last_success_at='2000-01-01',status='error' WHERE tenant_id=(ctx->>'tenant_id')::uuid;
 PERFORM n8n_oauth_service('check',b||'{"record_success":true}');
 PERFORM n8n_management_assert((SELECT status='connected' AND n8n_last_success_at>'2000-01-02' AND
  n8n_approved_workflow_ids=ARRAY['approved-fixture'] AND n8n_discovery_pin='fixture-pin'
  FROM tenant_mcp_connections WHERE tenant_id=(ctx->>'tenant_id')::uuid),'management health preserves approvals');


 BEGIN PERFORM n8n_oauth_service('rotate',b||jsonb_build_object('tokens','{"accessToken":"fixture-access","scopes":["workflow:read","workflow:write","workflow:execute","execution:read"]}'::jsonb)); RAISE EXCEPTION 'legacy grant widened';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_SCOPE_REFUSED' THEN RAISE; END IF; END;
 PERFORM n8n_oauth_service('rotate',b||jsonb_build_object('tokens','{"accessToken":"fixture-access","scopes":["workflow:write","workflow:read"]}'::jsonb));
 PERFORM n8n_oauth_service('release',b);
 l:=n8n_oauth_service('acquire',ctx); b:=ctx||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 UPDATE auth.sessions SET not_after=now()-interval '1 minute';
 BEGIN PERFORM n8n_oauth_service('check',b); RAISE EXCEPTION 'expired session accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL;
 INSERT INTO auth.sessions(id,user_id) VALUES('20000000-0000-0000-0000-000000000099',(ctx->>'actor_id')::uuid);
 BEGIN PERFORM n8n_oauth_service('check',b||'{"session_id":"20000000-0000-0000-0000-000000000099"}'); RAISE EXCEPTION 'other live session accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_STALE_OPERATION' THEN RAISE; END IF; END;
 UPDATE tenant_members SET is_owner=false WHERE tenant_id=(ctx->>'tenant_id')::uuid AND user_id=(ctx->>'actor_id')::uuid;
 BEGIN PERFORM n8n_oauth_service('check',b); RAISE EXCEPTION 'removed owner accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE tenant_members SET is_owner=true WHERE tenant_id=(ctx->>'tenant_id')::uuid AND user_id=(ctx->>'actor_id')::uuid;
 UPDATE tenant_mcp_connections SET n8n_refresh_until=now()-interval '1 minute' WHERE tenant_id=(ctx->>'tenant_id')::uuid;
 BEGIN PERFORM n8n_oauth_service('check',b); RAISE EXCEPTION 'expired lease accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_STALE_OPERATION' THEN RAISE; END IF; END;
 l:=n8n_oauth_service('acquire',ctx); b:=ctx||jsonb_build_object('lease',l->>'lease','generation',l->>'generation');
 UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000002' WHERE user_id=(ctx->>'actor_id')::uuid;
 UPDATE profiles SET active_tenant_id='10000000-0000-0000-0000-000000000001' WHERE user_id=(ctx->>'actor_id')::uuid;
 BEGIN PERFORM n8n_oauth_service('check',b); RAISE EXCEPTION 'switch-back lease accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'N8N_STALE_OPERATION' THEN RAISE; END IF; END;
END $$;
SET ROLE authenticated;
DO $$ BEGIN PERFORM n8n_oauth_service('check','{}'); RAISE EXCEPTION 'browser reached fence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
ROLLBACK;
\echo PASS: exact consent scopes, refresh scope preservation, session and actor lease fencing, expiry, workspace switch and legacy metadata compatibility
