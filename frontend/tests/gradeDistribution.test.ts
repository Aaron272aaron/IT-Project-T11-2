import { expect, it } from 'vitest';
import { gradeDistribution } from '../src/utils/gradeDistribution';
import type { ExamRecord } from '../src/models/exams';
function exam(scores: (number | null)[]): ExamRecord {
  return {id:'test',title:'Test',description:'', answers:{name:'test',uploadedAt:'now',preview:{issues:[],questions:[{id:'q',text:'Q',maxMark:100,instruction:false,column:0}],students:scores.map((_,i)=>({id:String(i),canvasId:String(i),attempt:'1',answers:[{questionId:'q',original:'answer',sourceScore:'100',blank:false,unicodeReview:false}]}))}},marks:{q:Object.fromEntries(scores.flatMap((score,i)=>score===null?[]:[[String(i),{score,confirmedAt:'now',comment:''}]]))}};
}
it('uses precise grade boundaries and keeps unmarked students pending',()=>{
  expect(gradeDistribution(exam([0,49.99,50,64.99,65,69.99,70,74.99,75,79.99,80,100,null])).map(s=>s.band)).toEqual(['Fail','Fail','Pass','Pass','H3','H3','H2B','H2B','H2A','H2A','H1','H1','Pending']);
});
it('does not treat partial, invalid or source CSV marks as a final grade',()=>{
 const data=exam([80,null,101]);
 data.answers!.preview.questions.push({id:'q2',text:'Q2',maxMark:10,instruction:false,column:1});
 expect(gradeDistribution(data).every(s=>s.band==='Pending')).toBe(true);
});
