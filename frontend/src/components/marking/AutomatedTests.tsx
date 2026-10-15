import { useEffect, useRef, useState } from "react";
import { runTests, type TestRunResult } from "../../api/testRuns";
import { Button } from "../UI";
import { testSuiteFor } from "../../models/testSuites";

export function AutomatedTests({
  questionKey,
  code,
  variant = "original",
}: {
  questionKey: string;
  code: string;
  variant?: "original" | "recommendation";
}) {
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const label = variant === "original" ? "Original code" : "AI recommendation";
  const suite = testSuiteFor(questionKey);
  const answerChecks =
    suite &&
    ["literal-answer", "text-answer", "counterexample"].includes(suite.mode);
  const resultLabel =
    answerChecks && variant === "original" ? "Original answer" : label;
  useEffect(() => {
    setResult(null);
    setError("");
    setLoading(false);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [questionKey, code, variant]);
  async function run() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setResult(null);
    setError("");
    setLoading(true);
    try {
      const value = await runTests(
        questionKey,
        code,
        variant,
        controller.signal,
      );
      if (!controller.signal.aborted && active.current === controller)
        setResult(value);
    } catch (reason) {
      if (!controller.signal.aborted && active.current === controller)
        setError((reason as Error).message);
    } finally {
      if (!controller.signal.aborted && active.current === controller)
        setLoading(false);
    }
  }
  return (
    <section
      className="runner-results"
      aria-label={`${resultLabel} test results`}
    >
      {suite && <p className="helper">{suite.note}</p>}
      {suite?.automated === false ? (
        <>
          <strong>Human review required</strong>
          <ul>
            {suite.checklist?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : (
        <Button disabled={loading || !code.trim()} onClick={() => void run()}>
          {variant === "original"
            ? answerChecks
              ? "Check original answer"
              : "Run original tests"
            : "Run recommendation tests"}
        </Button>
      )}
      {loading && (
        <p role="status">Running checks for {resultLabel.toLowerCase()}…</p>
      )}
      {!code.trim() && (
        <p className="helper">
          {answerChecks
            ? "There is no answer to check in this response."
            : "There is no code to test in this response."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result?.status === "runner_error" && (
        <p className="error" role="alert">
          {result.message || "The runner could not complete this test run."}
        </p>
      )}
      {result?.status === "completed" && (
        <>
          <p
            role="status"
            className={
              result.passed === result.total ? "success-text" : "error"
            }
          >
            {resultLabel}: {result.passed} / {result.total}{" "}
            {answerChecks ? "checks" : "tests"} passed
          </p>
          <div className="table-scroll">
            <table aria-label={`${resultLabel} test cases`}>
              <thead>
                <tr>
                  <th>Test case / input</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.cases!.map((item) => (
                  <tr key={item.name}>
                    <td>
                      <strong>{item.name.replaceAll("_", " ")}</strong>
                      <code>{item.input}</code>
                    </td>
                    <td>
                      <code>{item.expected}</code>
                    </td>
                    <td>
                      <code>{item.actual}</code>
                    </td>
                    <td
                      className={
                        item.outcome === "passed" ? "success-text" : "error"
                      }
                    >
                      {item.outcome === "passed" ? "Passed" : "Failed"}
                      {item.error && <p>{item.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="helper">
        These tests provide evidence; the final mark remains your decision.
      </p>
    </section>
  );
}
