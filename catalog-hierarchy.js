// IDs define placement. Display names never join or share syllabuses.
export function visibleCatalog(c){
  const exams=c.exams.filter(e=>e.published===true);
  const subjects=c.subjects.filter(s=>s.published===true&&s.exam_ids?.some(id=>exams.some(e=>e.id===id)));
  const topics=c.topics.filter(t=>t.published===true&&subjects.some(s=>s.id===t.subject_id));
  const tests=c.tests.filter(t=>t.published===true&&topics.some(p=>p.id===t.topic_id&&p.subject_id===t.subject_id));
  return {exams,subjects,topics,tests};
}
export function subjectPath(subject,exams){
  const names=(subject?.exam_ids||[]).map(id=>exams.find(e=>e.id===id)?.name||'Unresolved exam');
  return `${names.join(' / ')||'Unassigned exam'} → ${subject?.name||'Unassigned subject'}`;
}
// Availability follows the same published ancestry as the student catalog.
// No saved flag: publishing/unpublishing a test updates this on catalog reload.
export function examHasPublishedTests(c,examId){
  const visible=visibleCatalog(c);
  if(!visible.exams.some(exam=>exam.id===examId))return false;
  const subjects=new Set(visible.subjects.filter(s=>s.exam_ids.includes(examId)).map(s=>s.id));
  return visible.tests.some(test=>subjects.has(test.subject_id));
}
export function subjectExam(c,subject,requested){
  if(!subject)return null;
  const matches=c.exams.filter(e=>subject.exam_ids.includes(e.id));
  return requested?matches.find(e=>e.id===requested)||null:matches.length===1?matches[0]:null;
}
