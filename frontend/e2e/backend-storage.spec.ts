import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
test('2000 students save to backend and survive a reload without browser exam storage', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', {name: 'Explore demo workspace'}).click();
  await expect(page.getByText('Opening saved exams…')).toHaveCount(0);
  await page.goto('/#/exam/final/answers/upload');
  await page.getByLabel('Answer CSV file').setInputFiles(resolve('../..', 'Project/data/samples/sample-exam-2000-students.csv'));
  await page.getByRole('button', {name: 'Validate and preview'}).click();
  await expect(page.getByRole('button', {name: 'Save answers to exam'})).toBeEnabled({timeout:30000});
  const saved = page.waitForResponse(r => r.url().endsWith('/api/exams') && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Save answers to exam'}).click();
  expect((await saved).status()).toBe(200);
  await page.waitForURL("**/#/exam/final");
  await page.goto("/#/exam/final/answers");
  await page.reload();
  await expect(page.getByLabel('Student', {exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByLabel('Student', {exact:true}).locator('option')).toHaveCount(2000);
  expect(await page.evaluate(() => localStorage.getItem('automarktic-exams-v1'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('automarktic-exams-v1'))).toBeNull();
});

test('older browser exams are migrated before the workspace opens', async ({ page }) => {
  const registry = { comp10001: [{ id: 'legacy', title: 'Earlier saved exam', description: 'Keep my marks', marks: { q: { s: { score: 2, comment: 'Checked', confirmedAt: 'now' } } } }] };
  await page.addInitScript((value) => localStorage.setItem('automarktic-exams-v1', JSON.stringify(value)), registry);
  let migrated: unknown;
  await page.route('**/api/exams', async route => {
    if (route.request().method() === 'POST') {
      migrated = route.request().postDataJSON();
      await route.fulfill({ json: { revision: 1 } });
    } else await route.fulfill({ json: { revision: 0, registry: {} } });
  });
  await page.goto('/');
  await page.getByRole('button', {name: 'Explore demo workspace'}).click();
  await page.goto('/#/exams');
  await expect(page.getByText('Earlier saved exam', {exact:true})).toBeVisible();
  expect(migrated).toEqual({ registry, revision: 0 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('automarktic-exams-v1')!))).toEqual(registry);
});

test('uploaded and sample exams display identical marking progress', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const sample = JSON.parse(readFileSync('public/demo/sample-exam.json', 'utf8'));
  sample.answers.preview.students = sample.answers.preview.students.slice(0, 2);
  sample.marks = {};
  const uploaded = { ...sample, id: 'uploaded', title: 'Final 2025', sampleVersion: undefined };
  await page.route('**/api/exams', route => route.fulfill({ json: { revision: 1, registry: { comp10001: [uploaded, sample] } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.goto('/#/exams');
  const rows = page.locator('.exam-table tbody tr');
  await expect(rows).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(rows.nth(i).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await expect(rows.nth(i)).toContainText('Not started');
  }
  expect(await rows.nth(0).locator('td').nth(2).innerText()).toEqual(await rows.nth(1).locator('td').nth(2).innerText());
  await page.screenshot({path:'test-results/consistent-marking-progress.png', fullPage:true});
});

test('reload restores prepared AI results without requesting corrections again', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const sample = JSON.parse(readFileSync('public/demo/sample-exam.json', 'utf8'));
  sample.answers.preview.students = sample.answers.preview.students.slice(0, 1);
  const student = sample.answers.preview.students[0];
  for (const answer of student.answers) {
    if (['3081194', '3081195', '3081196'].includes(answer.questionId)) answer.original = 'def example():\n    return 1';
  }
  const reviews = student.answers.map((answer: {questionId: string; original: string}) => ({
    key: JSON.stringify(['comp10001', `final/${student.id}`, `canvas:${answer.questionId}`, answer.original]),
    comment: '', result: {status:'already_valid', originalCode:answer.original, suggestedCode:null, syntaxError:null, diff:[], message:'Previously reviewed.', modelId:null},
  }));
  await page.route('**/api/exams', route => route.fulfill({json:{revision:1,registry:{comp10001:[sample]}}}));
  await page.route('**/api/ai/reviews', route => route.fulfill({json:{reviews}}));
  let corrections = 0;
  await page.route('**/api/ai/suggest-fix', route => { corrections++; return route.fulfill({status:500,json:{message:'Should reuse saved review'}}); });
  await page.goto('/');
  await page.getByRole('button', {name:'Explore demo workspace'}).click();
  await expect(page.locator('.exam-table')).toBeVisible();
  await page.reload();
  await expect(page.locator('.exam-table')).toBeVisible();
  await expect(page.getByText('3 / 3 responses checked')).toBeVisible();
  expect(corrections).toBe(0);
});

test('response search finds text and student IDs without changing groups', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const sample = JSON.parse(readFileSync('public/demo/sample-exam.json', 'utf8'));
  const source = sample.answers.preview.students[0];
  sample.answers.preview.students = ['Alpha response', 'Beta response', 'ALPHA second'].map((text, index) => {
    const student = structuredClone(source);
    student.id = `search-${index}`;
    student.answers.find((a: {questionId:string}) => a.questionId === '3081158').original = text;
    return student;
  });
  sample.answerGrouping = {};
  await page.route('**/api/exams', route => route.fulfill({json:route.request().method()==='POST' ? {revision:2} : {revision:1,registry:{comp10001:[sample]}}}));
  await page.goto('/');
  await page.getByRole('button', {name:'Explore demo workspace'}).click();
  await page.goto('/#/exam/final/question/3081158');
  const search = page.getByLabel('Search student responses', {exact:true});
  await search.fill('alpha');
  await expect(page.getByText('2 of 3 responses', {exact:true})).toBeVisible();
  await search.fill('search-1');
  await expect(page.getByText('1 of 3 responses', {exact:true})).toBeVisible();
  await search.fill('no match');
  await expect(page.getByText('No responses match your search.')).toBeVisible();
  await search.fill('');
  await expect(page.getByText('3 of 3 responses', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:/Group \d+: 1 students/})).toHaveCount(3);
  await page.getByLabel('Search answer groups', {exact:true}).fill('alpha');
  await expect(page.getByText('2 of 3 groups match', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:/Group \d+: 1 students/})).toHaveCount(2);
});

test('coordinator can explore grade bands and tutors cannot see the overview', async ({ page }) => {
  const scores = [...Array(200).fill(40), ...Array(400).fill(55), ...Array(300).fill(67), ...Array(400).fill(72), ...Array(350).fill(77), ...Array(350).fill(85)];
  const exam = {id:'final-2025',title:'Final 2025',description:'',demoMarkDistribution:true,answers:{name:'demo.csv',uploadedAt:'now',preview:{issues:[],questions:[{id:'q',text:'Question',maxMark:100,instruction:false,column:0}],students:scores.map((_,i)=>({id:`TEST${String(i+1).padStart(6,'0')}`,canvasId:String(i),attempt:'1',answers:[{questionId:'q',original:'Demo answer',sourceScore:'0',blank:false,unicodeReview:false}]}))}},marks:{q:Object.fromEntries(scores.map((score,i)=>[`TEST${String(i+1).padStart(6,'0')}`,{score,confirmedAt:'now',comment:'Demo mark'}]))}};
  await page.route('**/api/exams', route=>route.fulfill({json:{revision:1,registry:{comp10001:[exam]}}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Explore demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Student mark distribution'})).toBeVisible();
  await page.getByRole('button',{name:'Fail: 200 students',exact:true}).click();
  await expect(page.getByRole('table',{name:'Fail students'}).locator('tbody tr')).toHaveCount(50);
  await page.getByRole('button',{name:'Next students',exact:true}).click();
  await expect(page.getByRole('table',{name:'Fail students'})).toContainText('TEST000051');
  await page.getByLabel('Search students in grade band').fill('TEST000199');
  await expect(page.getByRole('table',{name:'Fail students'}).locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'H1: 350 students',exact:true}).click();
  await expect(page.getByRole('table',{name:'H1 students'}).locator('tbody tr')).toHaveCount(50);
  await page.getByRole('button', {name:'View marks for TEST001651', exact:true}).click();
  const breakdown = page.getByRole('dialog', {name:'Marks for TEST001651'});
  await expect(breakdown).toBeVisible();
  const questionMarks = breakdown.getByRole('table', {name:'Question marks for TEST001651'});
  await expect(questionMarks.locator('tbody tr')).toHaveCount(1);
  await expect(questionMarks.locator('tbody tr')).toHaveText('Q1Question85.00100');
  await breakdown.getByRole('button', {name:'Close marks'}).click();
  await expect(breakdown).toHaveCount(0);

  await page.getByRole('heading',{name:'Student mark distribution'}).evaluate(element => element.scrollIntoView({block:'start'}));
  await page.screenshot({path:'test-results/coordinator-grade-distribution.png'});
  await page.getByRole('combobox',{name:'Demo perspective'}).selectOption('Tutor');
  await expect(page.getByRole('heading',{name:'Student mark distribution'})).toHaveCount(0);
});
