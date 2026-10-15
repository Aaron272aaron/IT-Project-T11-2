import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, Field, Modal, Notice } from "../UI";
import { aiReviewKey } from "../../services/aiReviewQueue";
import { useApp } from "../../state";
import { characterDiffLines } from "../../utils/characterDiff";
import { AutomatedTests } from "./AutomatedTests";

// Recommendations are reviewed and tested separately from the submitted answer.
export function AiSuggestedFixes({
  code,
  questionKey,
  responseKey,
}: {
  code: string;
  questionKey?: string;
  responseKey: string;
}) {
  const { aiReviewQueue, data } = useApp();
  useSyncExternalStore(aiReviewQueue.subscribe, aiReviewQueue.getVersion);
  const task = {
    workspaceId: data.active,
    responseKey,
    questionKey: questionKey ?? "",
    code,
  };
  const cacheKey = aiReviewKey(task);
  const review = aiReviewQueue.get(cacheKey);
  const loading =
    Boolean(code.trim()) &&
    (!review || ["queued", "running"].includes(review.status)) &&
    !review?.error;
  const loadingMessage =
    review?.status === "running"
      ? "Preparing AI correction…"
      : aiReviewQueue.progress().paused
        ? "AI preparation is paused."
        : aiReviewQueue.progress().waiting
          ? "Waiting for local AI setup…"
          : "Queued for AI correction…";
  const result = review?.result ?? null;
  const error = review?.error ?? "";
  const rejected = review?.rejected ?? false;
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState(review?.comment ?? "");
  useEffect(() => {
    setOpen(false);
    setComment(aiReviewQueue.get(cacheKey)?.comment ?? "");
    aiReviewQueue.prioritize(task);
  }, [cacheKey, aiReviewQueue]);
  function close() {
    setOpen(false);
  }
  function generate() {
    aiReviewQueue.regenerate(task, comment);
  }
  function progress() {
    return (
      <div className="ai-review-progress">
        <p role="status">{loadingMessage}</p>
        <progress aria-label="AI correction progress" />
      </div>
    );
  }
  function failure() {
    return (
      <div role="alert">
        <Notice tone="error">{error}</Notice>
        <p className="helper">
          Set up or check the model in{" "}
          <a href="#/user-settings" onClick={close}>
            Local AI setup
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <>
      <section
        className="ai-review-summary"
        aria-label="Automatic AI correction"
        aria-busy={loading}
      >
        <h3>AI correction</h3>
        {loading && progress()}
        {!code.trim() && (
          <p className="helper">There is no code to review in this response.</p>
        )}
        {error && failure()}
        {result && !rejected && (
          <>
            <p role="status">{result.message}</p>
            {result.status === "repaired" && (
              <pre
                className="code-block corrected"
                data-testid="ai-preview"
                aria-label="Prepared AI correction"
              >
                {result.suggestedCode}
              </pre>
            )}
          </>
        )}
        {rejected && (
          <p className="helper">
            Recommendation rejected. Continue reviewing the response.
          </p>
        )}
        {error ? (
          <Button onClick={() => void generate()}>Retry AI correction</Button>
        ) : (
          <Button
            disabled={!code.trim() || loading || !result}
            onClick={() => setOpen(true)}
          >
            Review AI correction
          </Button>
        )}
      </section>
      {open && (
        <Modal title="AI-suggested fixes" onClose={close}>
          <div className="ai-fix-review">
            {loading && progress()}
            {error && failure()}
            {result && (
              <>
                <p role="status">{result.message}</p>
                {result.syntaxError && (
                  <p className="helper">
                    Syntax issue
                    {result.syntaxError.line
                      ? ` on line ${result.syntaxError.line}`
                      : ""}
                    : {result.syntaxError.message}
                  </p>
                )}
                {result.status === "repaired" && (
                  <>
                    <div className="ai-code-comparison">
                      <section aria-label="Original student code comparison">
                        <h3>Original student code</h3>
                        <pre className="code-block" data-testid="ai-original">
                          {code}
                        </pre>
                      </section>
                      <section aria-label="AI fix recommendation">
                        <h3>AI recommendation</h3>
                        <pre
                          className="code-block corrected"
                          data-testid="ai-suggestion"
                        >
                          {result.suggestedCode}
                        </pre>
                      </section>
                    </div>
                    <details open>
                      <summary>Highlighted changes</summary>
                      <pre
                        className="code-block ai-code-diff"
                        aria-label="Code changes"
                      >
                        {characterDiffLines(result.diff).map((line, i) => (
                          <span
                            key={i}
                            className={line.heading ? "ai-diff-heading" : ""}
                          >
                            <span className="ai-diff-prefix">
                              {line.prefix}
                            </span>
                            {line.parts.map((part, j) => (
                              <span
                                key={j}
                                className={
                                  part.changed
                                    ? line.prefix === "+"
                                      ? "ai-diff-added"
                                      : "ai-diff-removed"
                                    : ""
                                }
                              >
                                {part.value}
                              </span>
                            ))}
                            {"\n"}
                          </span>
                        ))}
                      </pre>
                    </details>
                    {questionKey && (
                      <AutomatedTests
                        key={result.suggestedCode}
                        questionKey={questionKey}
                        code={result.suggestedCode!}
                        variant="recommendation"
                      />
                    )}
                  </>
                )}
              </>
            )}
            <div className="ai-regenerate">
              <Field label="Comment for AI (optional)">
                <textarea
                  aria-label="Comment for AI (optional)"
                  rows={2}
                  maxLength={1000}
                  value={comment}
                  disabled={loading}
                  placeholder="e.g. Fix the indentation on line 4; keep the return statement."
                  onChange={(event) => setComment(event.target.value)}
                />
              </Field>
              <Button disabled={loading} onClick={() => void generate()}>
                {loading ? "Generating…" : error ? "Retry" : "Generate again"}
              </Button>
            </div>
            <div className="form-actions">
              {result?.status === "repaired" && (
                <Button
                  onClick={() => {
                    close();
                    aiReviewQueue.reject(cacheKey);
                  }}
                >
                  Reject recommendation
                </Button>
              )}
              <Button onClick={close}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
