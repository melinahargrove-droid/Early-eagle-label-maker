const { PGlite } = require('@electric-sql/pglite');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/backend-schema.json'),'utf8'));
const ids={owner:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',anonymous:'00000000-0000-4000-8000-000000000003',unactivated:'00000000-0000-4000-8000-000000000004',disabled:'00000000-0000-4000-8000-000000000005',banned:'00000000-0000-4000-8000-000000000006',deleted:'00000000-0000-4000-8000-000000000007'};
const db=new PGlite();let passed=0;
async function owner(who){await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${ids[who]||''}'; SET ROLE authenticated;`)}
async function admin(){await db.exec('RESET ROLE;')}
async function denied(sql){await assert.rejects(db.query(sql),e=>e.code==='42501');passed++}
(async()=>{
 await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean NOT NULL DEFAULT false,banned_until timestamptz,deleted_at timestamptz); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
 for(const tbl of ['labels','print_queue','little_labels_entitlements']){
  const columns=metadata.columns.filter(c=>c.table_name===tbl).map(c=>`"${c.column_name}" ${c.data_type}${c.column_default?' DEFAULT '+c.column_default:''}${c.is_nullable==='NO'?' NOT NULL':''}`).join(',');
  await db.exec(`CREATE TABLE public.${tbl}(${columns}); ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`);
  for(const c of metadata.constraints.filter(c=>c.table_name===tbl))await db.exec(`ALTER TABLE public.${tbl} ADD CONSTRAINT "${c.conname}" ${c.definition}`);
 }
 for(const f of metadata.functions.filter(f=>['activate_little_labels','little_labels_access_status'].includes(f.proname)))await db.exec(f.definition+`; REVOKE EXECUTE ON FUNCTION public.${f.proname}(${f.proname==='activate_little_labels'?'text':''}) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.${f.proname}(${f.proname==='activate_little_labels'?'text':''}) TO authenticated;`);
 for(const p of metadata.policies)await db.exec(`CREATE POLICY "${p.policyname}" ON public.${p.tablename} FOR ${p.cmd} TO public ${p.qual?'USING ('+p.qual+')':''} ${p.with_check?'WITH CHECK ('+p.with_check+')':''};`);
 await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON labels, print_queue TO authenticated;');
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261002144429_harden_little_labels_access.sql'),'utf8'));
 for(const [who,id] of Object.entries(ids)){
  await db.query('INSERT INTO auth.users(id,is_anonymous,banned_until,deleted_at) VALUES ($1,$2,$3,$4)',[id,who==='anonymous',who==='banned'?'2099-01-01':null,who==='deleted'?'2026-01-01':null]);
  if(who!=='unactivated')await db.query('INSERT INTO little_labels_entitlements(activation_code,status,activated_by) VALUES ($1,$2,$3)',['TEST-'+who,who==='disabled'?'disabled':'activated',id]);
 }
 for(const who of Object.keys(ids)){
  await owner(who); const r=await db.query('SELECT public.little_labels_access_status() AS s');assert.equal(r.rows[0].s.active,['owner','other'].includes(who),who);passed++;
 }
 for(const table of ['labels','print_queue']){
  const cols=table==='labels'?'user_id,english,spanish':'user_id,english,spanish,size';
  const vals=uid=>`'${uid}','Synthetic blocks','Synthetic bloques'${table==='print_queue'?",'small'":''}`;
  await owner('owner');await db.exec(`INSERT INTO ${table}(${cols}) VALUES (${vals(ids.owner)})`);passed++;
  await denied(`INSERT INTO ${table}(${cols}) VALUES (${vals(ids.other)})`);
  await denied(`UPDATE ${table} SET user_id='${ids.other}' WHERE user_id='${ids.owner}'`);
  await db.exec(`UPDATE ${table} SET english='Synthetic updated' WHERE user_id='${ids.owner}'`);passed++;
  await owner('other');assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0);passed++;
  assert.equal((await db.query(`UPDATE ${table} SET english='Wrong owner' RETURNING id`)).rows.length,0);passed++;
  assert.equal((await db.query(`DELETE FROM ${table} RETURNING id`)).rows.length,0);passed++;
  for(const who of ['anonymous','unactivated','disabled','banned','deleted']){
   await admin();await db.exec(`INSERT INTO ${table}(${cols}) VALUES (${vals(ids[who])})`);
   await owner(who);await denied(`INSERT INTO ${table}(${cols}) VALUES (${vals(ids[who])})`);
   assert.equal((await db.query(`UPDATE ${table} SET english='Blocked' RETURNING id`)).rows.length,0);passed++;
   assert.equal((await db.query(`DELETE FROM ${table} RETURNING id`)).rows.length,0);passed++;
   assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,1);passed++; // prior records remain readable
  }
  await owner('owner');assert.equal((await db.query(`DELETE FROM ${table} RETURNING id`)).rows.length,1);passed++;
 }
 await admin();await db.exec("INSERT INTO little_labels_entitlements(activation_code,status) VALUES ('TEST-AVAILABLE','available')");
 await owner('anonymous');assert.equal((await db.query("SELECT activate_little_labels('TEST-AVAILABLE') AS x")).rows[0].x.success,false);passed++;
 await owner('unactivated');assert.equal((await db.query("SELECT activate_little_labels('TEST-AVAILABLE') AS x")).rows[0].x.success,true);passed++;
 assert.equal((await db.query('SELECT little_labels_access_status() AS x')).rows[0].x.active,true);passed++;
 assert.equal((await db.query("SELECT activate_little_labels('TEST-AVAILABLE') AS x")).rows[0].x.success,true);passed++;
 await owner('other');assert.equal((await db.query("SELECT activate_little_labels('TEST-AVAILABLE') AS x")).rows[0].x.success,false);passed++;
 await admin();await db.exec("UPDATE little_labels_entitlements SET status='available' WHERE activation_code='TEST-AVAILABLE'");
 await owner('other');assert.equal((await db.query("SELECT activate_little_labels('TEST-AVAILABLE') AS x")).rows[0].x.success,false);passed++;
 await admin();await db.exec("UPDATE little_labels_entitlements SET status='disabled' WHERE activation_code='TEST-AVAILABLE'");
 await owner('unactivated');assert.equal((await db.query("SELECT activate_little_labels('TEST-AVAILABLE') AS x")).rows[0].x.success,false);passed++;
 await admin();await db.exec("INSERT INTO little_labels_entitlements(activation_code,status) VALUES ('TEST-ORPHAN','activated')");
 await owner('other');assert.equal((await db.query("SELECT activate_little_labels('TEST-ORPHAN') AS x")).rows[0].x.success,false);passed++;

 // Quota limits are shared by category, atomic under one user/category row lock.
 await owner('owner');
 for(let i=0;i<20;i++)assert.equal((await db.query("SELECT consume_little_labels_ai_quota('text') AS q")).rows[0].q.allowed,true);
 assert.equal((await db.query("SELECT consume_little_labels_ai_quota('text') AS q")).rows[0].q.reason,'minute_limit');passed++;
 for(let i=0;i<3;i++)assert.equal((await db.query("SELECT consume_little_labels_ai_quota('picture') AS q")).rows[0].q.allowed,true);
 assert.equal((await db.query("SELECT consume_little_labels_ai_quota('picture') AS q")).rows[0].q.reason,'minute_limit');passed++;
 await owner('other');assert.equal((await db.query("SELECT consume_little_labels_ai_quota('text') AS q")).rows[0].q.allowed,true);passed++;
 await owner('anonymous');assert.equal((await db.query("SELECT consume_little_labels_ai_quota('text') AS q")).rows[0].q.reason,'access');passed++;
 await owner('owner');assert.equal((await db.query("SELECT consume_little_labels_ai_quota('invalid') AS q")).rows[0].q.reason,'invalid_category');passed++;
 await denied('SELECT * FROM little_labels_private.ai_usage');
 for(const [category,limit] of [['text',200],['picture',40]]){
  await admin();await db.query("UPDATE little_labels_private.ai_usage SET day_count=$1,minute_count=0,usage_minute=date_trunc('minute',clock_timestamp()) WHERE user_id=$2 AND category=$3",[limit-1,ids.owner,category]);
  await owner('owner');assert.equal((await db.query("SELECT consume_little_labels_ai_quota($1) AS q",[category])).rows[0].q.allowed,true);passed++;
  const blocked=(await db.query("SELECT consume_little_labels_ai_quota($1) AS q",[category])).rows[0].q;assert.equal(blocked.reason,'daily_limit');assert.ok(blocked.retry_after>0&&blocked.retry_after<=86400);passed++;
  await admin();await db.query("UPDATE little_labels_private.ai_usage SET usage_day=(clock_timestamp() AT TIME ZONE 'UTC')::date-1,usage_minute=date_trunc('minute',clock_timestamp())-interval '2 minutes' WHERE user_id=$1 AND category=$2",[ids.owner,category]);
  await owner('owner');assert.equal((await db.query("SELECT consume_little_labels_ai_quota($1) AS q",[category])).rows[0].q.allowed,true);passed++;
 }
 await admin();const privileges=await db.query("SELECT has_table_privilege(role_name,table_name,privilege) AS allowed FROM (VALUES ('anon'),('authenticated')) AS r(role_name) CROSS JOIN (VALUES ('public.labels'),('public.print_queue')) AS t(table_name) CROSS JOIN (VALUES ('TRUNCATE'),('TRIGGER'),('REFERENCES')) AS p(privilege)");assert.ok(privileges.rows.every(x=>x.allowed===false));passed++;
 // UPSERT uses both insert and update policies and cannot replace another owner's row.
 await owner('owner');const row=(await db.query("INSERT INTO labels(english,spanish) VALUES ('Synthetic upsert','Synthetic') RETURNING id")).rows[0];
 await db.query("INSERT INTO labels(id,english,spanish) VALUES ($1,'Synthetic repeat','Synthetic') ON CONFLICT(id) DO UPDATE SET english=excluded.english",[row.id]);passed++;
 await owner('other');await assert.rejects(db.query("INSERT INTO labels(id,english,spanish) VALUES ($1,'Wrong owner','Synthetic') ON CONFLICT(id) DO UPDATE SET english=excluded.english",[row.id]),e=>e.code==='42501');passed++;
 await admin();await db.exec(fs.readFileSync(path.join(root,'supabase/rollback/access-hardening.sql'),'utf8'));passed++;
 console.log(`PASS ${passed} PostgreSQL/RLS checks against isolated synthetic database, including rollback`);await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1;});
