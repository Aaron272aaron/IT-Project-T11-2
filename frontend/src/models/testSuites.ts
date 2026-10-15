import catalog from "../../../auto_marking/test_runner/questions/sample-exam.json";

export function testSuiteFor(questionKey: string) {
  return catalog.questions.find((item) => item.questionKey === questionKey);
}
