import assert from 'node:assert/strict';
export async function verifySmartImport({page,go,db,rpc,admin}){
 const checks=[],save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
 await save('tests',{id:'smart-fixture',subject_id:'subject',topic_id:'topic',title:'Synthetic smart source draft',access:'free',duration_seconds:120,published:false});
 const raw=(id)=>({id,chapter:'ଓଡ଼ିଆ',question_statement:'Which synthetic option is first '+id+'? 🟢 [cite: 1]',options:['Alpha','Beta','Gamma','Delta'],correct:0,explanation:'Alpha is the first option in this controlled fixture.',tags:['Notes PDF','Custom']});
 const file=(id)=>({name:'synthetic-'+id+'.html',mimeType:'text/html',buffer:Buffer.from('<script>const questions='+JSON.stringify([raw(id)])+';throw Error("Never execute uploaded code");</script>')});
 await page.setViewportSize({width:320,height:900});await go('admin/smart-imports');await page.getByRole('heading',{name:'Smart MCQ Import & Audit'}).waitFor();
 await page.getByLabel('Existing empty draft test ID',{exact:true}).fill('smart-fixture');await page.locator('[data-smart="upload"] input[type=file]').setInputFiles([file(1),file(2)]);
 assert.equal(await page.getByLabel('Existing empty draft test ID',{exact:true}).inputValue(),'smart-fixture');
 await page.getByLabel('Exact source count — synthetic-1.html',{exact:true}).fill('1');await page.getByLabel('Exact source count — synthetic-2.html',{exact:true}).fill('1');await page.getByRole('button',{name:'Stage sources and run audit'}).click();await page.getByRole('heading',{name:'Audit report',exact:true}).waitFor();
 assert.equal((await db.query("select count(*)::int n from public.questions where test_id='smart-fixture'")).rows[0].n,0);
 assert.ok(await page.getByRole('button',{name:'Install selected draft questions',exact:true}).isDisabled());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('320px multiple-source staging preserves test ID, archives occurrences and blocks install pending review');
 const batch=(await db.query("select * from public.smart_import_batches where test_id='smart-fixture'")).rows[0];assert.equal(batch.sources.length,2);assert.equal(batch.original_items.length,2);
 await page.getByLabel('Requested count (optional)',{exact:true}).fill('100');await page.getByRole('button',{name:'Apply filter',exact:true}).click();await page.getByText(/"shortfall": 98/).waitFor();checks.push('Requested 100 reports 2 selected and 98 shortfall without creating questions');
 const form=page.locator('[data-smart="review"]');await form.getByLabel('Question',{exact:true}).fill('Corrected fixture wording ଓଡ଼ିଆ [cite: 3]');await form.getByLabel('Review decision',{exact:true}).selectOption('edit');await form.getByLabel('Evidence/reference and reason (at least 20 characters)',{exact:true}).fill('Verified synthetic correction against the preserved source.');await form.getByRole('button',{name:'Save review decision'}).click();await page.getByText(/"corrected": 1/).waitFor();
 assert.equal((await db.query('select original_items from public.smart_import_batches where id=$1',[batch.id])).rows[0].original_items[0].raw.question_statement,raw(1).question_statement);checks.push('Manual correction cleans citations/Unicode safely and preserves private originals');
 for(const key of ['s1q1','s2q1']){
  await page.locator('[data-smart-item]').selectOption(key);await form.getByLabel('Review decision',{exact:true}).selectOption('approve');await form.getByLabel('Evidence/reference and reason (at least 20 characters)',{exact:true}).fill('All answers, explanation, duplicate relationships and relevance verified against controlled fixtures.');await form.getByLabel('Reviewed important/high-yield',{exact:true}).check();await form.getByRole('button',{name:'Save review decision'}).click();await page.waitForFunction(()=>!document.querySelector('[data-smart="review"] fieldset')?.disabled);
 }
 await page.getByRole('button',{name:'Install selected draft questions',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-smart="finalize"] fieldset')?.disabled);
 await page.locator('[data-smart="finalize"] input[type=checkbox]').check();await page.getByRole('button',{name:'Install selected draft questions',exact:true}).click();await page.getByText('smart-fixture · 2 parsed · Installed as draft',{exact:false}).waitFor();
 assert.equal((await db.query("select question_count,published from public.tests where id='smart-fixture'")).rows[0].question_count,2);assert.equal((await db.query("select pass2 from public.imports where test_id='smart-fixture'")).rows[0].pass2,false);checks.push('Evidence-based per-occurrence review installs selection once as draft; existing content/publication pass remains required');
 await page.reload();await page.getByRole('button',{name:'Open staged review',exact:true}).click();await page.getByRole('heading',{name:'Audit report',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Install selected draft questions'}).isDisabled());checks.push('Reload retains finalized review/archive and prevents duplicate installation');
 await page.setViewportSize({width:1280,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('Desktop and 320px staged audit controls fit without overflow');
 return checks;
}
