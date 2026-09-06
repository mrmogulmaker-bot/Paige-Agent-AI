-- Tiny local-only compatibility shim for the assertions used by the Vault proof.
-- Local and PR CI use this count-enforcing adapter in a disposable PostgreSQL cluster.
-- Applied Supabase and real pgTAP evidence remain separate Proof Owed.
CREATE TABLE local_pgtap_state(planned integer NOT NULL,executed integer NOT NULL);
CREATE FUNCTION plan(integer) RETURNS text LANGUAGE plpgsql AS $$
BEGIN DELETE FROM local_pgtap_state; INSERT INTO local_pgtap_state VALUES($1,0); RETURN '1..'||$1; END $$;
CREATE FUNCTION _local_pgtap_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN UPDATE local_pgtap_state SET executed=executed+1; IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: no test plan'; END IF; END $$;
CREATE FUNCTION ok(boolean,text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM _local_pgtap_tick(); IF $1 IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',$2; END IF; RETURN 'ok - '||$2; END $$;
CREATE FUNCTION is(anyelement,anyelement,text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM _local_pgtap_tick(); IF $1 IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'FAIL: %, got %, expected %',$3,$1,$2; END IF; RETURN 'ok - '||$3; END $$;
CREATE FUNCTION throws_ok(text,text,text,text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 PERFORM _local_pgtap_tick();
 BEGIN EXECUTE $1; EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>$2 OR SQLERRM<>$3 THEN RAISE EXCEPTION 'FAIL: %, got [%] %, expected [%] %',$4,SQLSTATE,SQLERRM,$2,$3; END IF;
  RETURN 'ok - '||$4;
 END;
 RAISE EXCEPTION 'FAIL: % did not throw',$4;
END $$;
CREATE FUNCTION lives_ok(text,text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM _local_pgtap_tick(); EXECUTE $1; RETURN 'ok - '||$2; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'FAIL: %, [%] %',$2,SQLSTATE,SQLERRM; END $$;
CREATE FUNCTION finish() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE p integer; e integer;
BEGIN SELECT planned,executed INTO p,e FROM local_pgtap_state; IF p IS DISTINCT FROM e THEN RAISE EXCEPTION 'FAIL: planned %, executed %',p,e; END IF; RETURN NEXT 'local assertion batch complete: '||e||' assertions'; END $$;
