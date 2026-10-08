import { useState } from "react";
import { Button, Modal } from "../UI";

// Placeholder only: opening this dialog sends no request and never modifies an answer.
export function AiSuggestedFixes() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Generate AI-suggested fixes</Button>
      {open && (
        <Modal title="AI-suggested fixes" onClose={() => setOpen(false)}>
          <p role="status">waiting for API</p>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </Modal>
      )}
    </>
  );
}
