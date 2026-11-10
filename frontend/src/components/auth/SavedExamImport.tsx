import { useState } from "react";
import { useApp } from "../../state";
import { Button, Card, Modal, Notice } from "../UI";
export function SavedExamImport() {
  const { legacyExamCount, copySavedExams, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  if (!legacyExamCount) return null;
  return (
    <Card
      title="Your existing saved exams"
      description={`${legacyExamCount} saved exam${legacyExamCount === 1 ? "" : "s"} from the earlier app are available in this browser.`}
    >
      <p>
        Copy them into your signed-in workspace to continue marking with your
        account. Existing exams and the original saved copies are retained.
      </p>
      <Button onClick={() => setConfirm(true)}>Review saved exam import</Button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {confirm && (
        <Modal title="Copy saved exams" onClose={() => setConfirm(false)}>
          <Notice>
            Copy {legacyExamCount} exams, including original answers, rubric
            files, marks and groups, into this local account workspace?
            Registered members using this browser can access them after logging
            in.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const count = await copySavedExams();
                  setConfirm(false);
                  notify(
                    `${count} saved exams copied to your account workspace.`,
                  );
                } catch (reason) {
                  setConfirm(false);
                  setError((reason as Error).message);
                }
              }}
            >
              Copy saved exams
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
