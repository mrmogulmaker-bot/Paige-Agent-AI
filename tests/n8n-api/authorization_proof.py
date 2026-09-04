"""Isolated PostgreSQL proof. Requires prerequisites + migration applied; fixture credentials only."""
import json, subprocess, time
PSQL=r'C:\Program Files\PostgreSQL\16\bin\psql.exe'
ARGS=[PSQL,'-h','127.0.0.1','-p','55441','-U','n8n_api_proof_admin','-d','n8n_api_proof','-w','-X','-qAt','-v','ON_ERROR_STOP=1']
A='00000000-0000-0000-0000-000000000001'; M='00000000-0000-0000-0000-000000000002'; T='10000000-0000-0000-0000-000000000001'; B='10000000-0000-0000-0000-000000000002'
checks=0
def sql(query,role=None,actor=None,denied=False):
 prefix=(f'SET ROLE {role};' if role else '')+(f"SET request.jwt.claim.sub='{actor}';" if actor else '')
 r=subprocess.run(ARGS,input=prefix+query,text=True,capture_output=True)
 if denied:
  assert r.returncode!=0,'expected refusal';return
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(v):
 global checks
 assert v;checks+=1
def read():return json.loads(sql('SELECT get_tenant_n8n_api_readiness();','authenticated',A))
def save(key='fixture-key',url='https://example.com'):
 return json.loads(sql(f"SELECT save_tenant_n8n_api_connection('{T}','{url}','{key}',NULL);",'authenticated',A))
def begin():return json.loads(sql(f"SELECT begin_tenant_n8n_api_validation('{T}','{A}',NULL);",'service_role'))
def finish(attempt,fail='NULL',count='0'):
 return json.loads(sql(f"SELECT finish_tenant_n8n_api_validation('{T}','{A}','{attempt['credential_revision']}','{attempt['validation_id']}',{fail},{count});",'service_role'))
for role,actor in [('anon',None),('authenticated',M)]:
 sql(f"SELECT save_tenant_n8n_api_connection('{T}','https://example.com','fixture-key',NULL);",role,actor,True);check(True)
sql('SELECT get_tenant_n8n_api_readiness();','anon',None,True);check(True)
check(json.loads(sql('SELECT get_tenant_n8n_api_readiness();','authenticated',M))['can_write'] is False)
for fn in [f"begin_tenant_n8n_api_validation('{T}','{A}',NULL)",f"finish_tenant_n8n_api_validation('{T}','{A}',gen_random_uuid(),gen_random_uuid(),NULL,0)"]:
 sql('SELECT '+fn+';','authenticated',A,True);check(True)
sql(f"SELECT save_tenant_n8n_api_connection('{B}','https://example.com','fixture-key',NULL);",'authenticated',A,True);check(True)
save();check(read()['health']=='saved_unverified' and read()['workflow_count'] is None)
check(sql(f"SELECT platform_decrypt(api_key_ct)='fixture-key' AND status='connected' FROM tenant_n8n_connections WHERE tenant_id='{T}';")=='t')
for assignments in ["api_health='connected',api_workflow_count=2", "api_key_ct=platform_encrypt('forged'),api_health='connected'",'api_checked_at=clock_timestamp()']:
 sql(f"UPDATE tenant_n8n_connections SET {assignments} WHERE tenant_id='{T}';",'authenticated',A,True);check(True)
sql(f"DELETE FROM tenant_n8n_connections WHERE tenant_id='{B}';")
sql(f"INSERT INTO tenant_n8n_connections(tenant_id,api_key_ct,base_url_ct,api_health,api_workflow_count) VALUES('{B}',platform_encrypt('fixture'),platform_encrypt('https://example.com'),'connected',8);",'authenticated',A)
check(sql(f"SELECT api_health='saved_unverified' AND api_workflow_count IS NULL FROM tenant_n8n_connections WHERE tenant_id='{B}';")=='t')
attempt=begin();sql(f"SELECT begin_tenant_n8n_api_validation('{T}','{A}',NULL);",'service_role',None,True);check(True)
check(finish(attempt)['stale'] is False);r=read();check(r['health']=='connected' and r['workflow_count']==0 and r['checked_at']==r['last_success_at'])
check(finish(attempt)['stale'] is True)
attempt=begin();check(finish(attempt,"'authentication_rejected'",'NULL')['stale'] is False);r=read();check(r['health']=='needs_attention' and r['workflow_count'] is None and r['last_success_at'] is not None)
attempt=begin();save('replacement');check(finish(attempt)['stale'] is True and read()['last_success_at'] is None)
attempt=begin();sql(f"SELECT disconnect_tenant_n8n_api_connection('{T}');",'authenticated',A);check(finish(attempt)['stale'] is True and read()['configured'] is False)
save();attempt=begin();sql(f"UPDATE profiles SET active_tenant_id='{B}' WHERE user_id='{A}';")
sql(f"SELECT finish_tenant_n8n_api_validation('{T}','{A}','{attempt['credential_revision']}','{attempt['validation_id']}',NULL,0);",'service_role',None,True);check(True)
sql(f"SELECT disconnect_tenant_n8n_api_connection('{T}');",'authenticated',A,True);check(True)
sql(f"UPDATE profiles SET active_tenant_id='{T}' WHERE user_id='{A}';")
sql(f"UPDATE tenant_members SET status='inactive' WHERE user_id='{A}' AND tenant_id='{T}';")
sql(f"SELECT finish_tenant_n8n_api_validation('{T}','{A}','{attempt['credential_revision']}','{attempt['validation_id']}',NULL,0);",'service_role',None,True);check(True)
sql(f"UPDATE tenant_members SET status='active' WHERE user_id='{A}' AND tenant_id='{T}';")
save(url='https://example.com/fixture-key');check(read()['base_url'] is None and 'fixture-key' not in json.dumps(read()))
save();attempt=begin();sql(f"UPDATE tenant_n8n_connections SET api_validation_until=clock_timestamp()-interval '1 second' WHERE tenant_id='{T}';")
check(read()['failure_code']=='validation_expired');retry=begin();check(finish(attempt)['stale'] is True);check(finish(retry)['stale'] is False)
# Actual concurrent lock wait: transaction starts before deadline, lock releases after it.
save();attempt=begin();sql(f"UPDATE tenant_n8n_connections SET api_validation_until=clock_timestamp()+interval '1.5 seconds' WHERE tenant_id='{T}';")
blocker=subprocess.Popen(ARGS,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
blocker.stdin.write(f"BEGIN; SELECT tenant_id FROM tenant_n8n_connections WHERE tenant_id='{T}' FOR UPDATE; SELECT pg_sleep(2.5); COMMIT;");blocker.stdin.close()
time.sleep(.35)
check(finish(attempt)['stale'] is True);blocker.wait(timeout=10);check(blocker.returncode==0)
save();attempt=begin();check(finish(attempt)['stale'] is False)
sql(f"SELECT update_tenant_n8n_sync('{T}','error','raw provider failure',NULL);",'service_role')
check(read()['health']=='saved_unverified' and read()['workflow_count'] is None and read()['last_success_at'] is None)
print(f'PASS {checks} PostgreSQL role, evidence, revision, retry, workspace and real lock-expiry assertions')
