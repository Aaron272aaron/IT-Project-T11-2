import { useSyncExternalStore } from "react";
import { useApp } from "../../state";
import { Button, Card } from "../UI";

export function AiPreparation() {
  const { aiReviewQueue } = useApp();
  useSyncExternalStore(aiReviewQueue.subscribe, aiReviewQueue.getVersion);
  const progress = aiReviewQueue.progress();
  if (!progress.total) return null;
  const complete = progress.finished === progress.total;
  return (
    <Card title="Preparing student AI corrections" className="ai-preparation">
      <p role="status">
        {progress.paused
          ? "AI preparation paused."
          : progress.waiting
            ? "Waiting for local AI setup."
            : complete
              ? "AI preparation complete."
              : "Preparing corrections for all coding responses…"}
      </p>
      <progress
        aria-label="All student AI corrections progress"
        max={progress.total}
        value={progress.finished}
      />
      <div className="model-progress-details">
        <strong>
          {progress.finished} / {progress.total} responses checked
        </strong>
        <span>{progress.percent}%</span>
      </div>
      {progress.needsReview > 0 && (
        <p className="helper">
          {progress.needsReview} responses need manual review.
        </p>
      )}
      {progress.waiting && (
        <p className="helper">
          {progress.waiting} <a href="#/user-settings">Open local AI setup</a>.
          Preparation resumes when the model is ready.
        </p>
      )}
      <div className="form-actions">
        {progress.paused || progress.waiting ? (
          <Button onClick={() => aiReviewQueue.resume()}>
            Resume AI preparation
          </Button>
        ) : (
          !complete && (
            <Button onClick={() => aiReviewQueue.pause()}>
              Pause AI preparation
            </Button>
          )
        )}
        {complete && progress.needsReview > 0 && (
          <Button onClick={() => aiReviewQueue.resume()}>
            Retry unfinished corrections
          </Button>
        )}
      </div>
    </Card>
  );
}
