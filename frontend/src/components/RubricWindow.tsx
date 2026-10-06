import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ExamAttachment, ExamRecord } from "../exams";
import { loadPdf, previewUrl } from "../rubricDocument";
import { Button } from "./UI";

// A non-modal window leaves the answer and marking controls usable underneath.
export function RubricWindow({
  rubric,
  initialPage = 1,
  context,
  onClose,
}: {
  rubric: ExamAttachment;
  initialPage?: number;
  context: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [box, setBox] = useState(() => ({
    x: Math.max(8, innerWidth - 650),
    y: Math.min(90, innerHeight / 8),
    width: Math.min(620, innerWidth - 16),
    height: Math.min(650, innerHeight - 110),
  }));
  const [error, setError] = useState("");
  // A previous page must never remain visible under the next page's label.
  const [rendered, setRendered] = useState<{
    page: number;
    width: number;
  } | null>(null);
  const ready = rendered?.page === page && rendered.width === box.width;
  const paper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paper.current) paper.current.scrollTop = 0;
  }, [page]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<Awaited<
    ReturnType<typeof loadPdf>["promise"]
  > | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    box: typeof box;
    resize: boolean;
  } | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  useEffect(() => {
    const clamp = () => {
      if (innerWidth < 280 || innerHeight < 260) return;
      setBox((b) => ({
        ...b,
        width: Math.min(b.width, innerWidth - 16),
        height: Math.min(b.height, innerHeight - 16),
        x: Math.max(
          8,
          Math.min(b.x, innerWidth - Math.min(b.width, innerWidth - 16) - 8),
        ),
        y: Math.max(
          8,
          Math.min(b.y, innerHeight - Math.min(b.height, innerHeight - 16) - 8),
        ),
      }));
    };
    addEventListener("resize", clamp);
    return () => removeEventListener("resize", clamp);
  }, []);
  useEffect(() => {
    let active = true;
    const task = loadPdf(previewUrl(rubric));
    task.promise
      .then((doc) => {
        if (active) setDocument(doc);
      })
      .catch(() => {
        if (active)
          setError(
            "The rubric preview could not be opened. Ask the coordinator to upload it again.",
          );
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [rubric]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let render:
      | ReturnType<Awaited<ReturnType<typeof document.getPage>>["render"]>
      | undefined;
    setRendered(null);
    setError("");
    const target = canvas.current;
    document
      .getPage(page)
      .then(async (pdfPage) => {
        if (!active) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const width = Math.max(180, box.width - 48);
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        target.width = Math.floor(viewport.width * ratio);
        target.height = Math.floor(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        render = pdfPage.render({
          canvas: target,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (active) setRendered({ page, width: box.width });
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException")
          setError(
            "This page could not be rendered. Try another page or download the original.",
          );
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [document, page, box.width]);
  function begin(event: PointerEvent<HTMLButtonElement>, resize: boolean) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, box, resize };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    setBox(
      start.resize
        ? {
            ...start.box,
            width: Math.max(
              Math.min(280, innerWidth - 16),
              Math.min(innerWidth - start.box.x - 8, start.box.width + dx),
            ),
            height: Math.max(
              Math.min(260, innerHeight - 16),
              Math.min(innerHeight - start.box.y - 8, start.box.height + dy),
            ),
          }
        : {
            ...start.box,
            x: Math.max(
              8,
              Math.min(innerWidth - start.box.width - 8, start.box.x + dx),
            ),
            y: Math.max(
              8,
              Math.min(innerHeight - start.box.height - 8, start.box.y + dy),
            ),
          },
    );
  }
  return (
    <section
      className="rubric-window"
      role="dialog"
      aria-label="Rubric preview"
      aria-modal="false"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="rubric-window-title">
        <button
          className="rubric-drag"
          aria-label="Move rubric window"
          onPointerDown={(e) => begin(e, false)}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            const offsets: Record<string, number[]> = {
              ArrowLeft: [-20, 0],
              ArrowRight: [20, 0],
              ArrowUp: [0, -20],
              ArrowDown: [0, 20],
            };
            const d = offsets[e.key];
            if (d) {
              e.preventDefault();
              setBox((b) => ({
                ...b,
                x: Math.max(8, Math.min(innerWidth - b.width - 8, b.x + d[0])),
                y: Math.max(
                  8,
                  Math.min(innerHeight - b.height - 8, b.y + d[1]),
                ),
              }));
            }
          }}
        >
          <strong>Rubric</strong>
          <small>{rubric.name}</small>
        </button>
        <button
          ref={close}
          className="button"
          onClick={onClose}
          aria-label="Close rubric"
        >
          ×
        </button>
      </header>
      <p className="rubric-context">{context}</p>
      <div className="rubric-toolbar">
        <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous page
        </Button>
        <label>
          Page{" "}
          <select
            aria-label="Rubric page"
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {Array.from({ length: rubric.pageCount ?? 1 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>{" "}
          / {rubric.pageCount}
        </label>
        <Button
          disabled={page >= (rubric.pageCount ?? 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </Button>
      </div>
      <div ref={paper} className="rubric-paper" aria-busy={!ready && !error}>
        {error && <p role="alert">{error}</p>}
        {!ready && !error && <p role="status">Rendering page {page}…</p>}
        {/* Keep the canvas mounted so a failed page can be followed by a retry. */}
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Rubric page ${page}`}
          data-rendered-page={ready ? rendered.page : undefined}
          style={{ visibility: ready && !error ? "visible" : "hidden" }}
        />
      </div>
      <footer className="rubric-window-footer">
        <a href={rubric.dataUrl} download={rubric.name}>
          Download original
        </a>
        <small>Drag title to move · Drag corner to resize</small>
        <button
          className="rubric-resize"
          aria-label="Resize rubric window"
          title="Drag to resize; arrow keys also work"
          onPointerDown={(e) => begin(e, true)}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            const d: Record<string, number[]> = {
              ArrowLeft: [-20, 0],
              ArrowRight: [20, 0],
              ArrowUp: [0, -20],
              ArrowDown: [0, 20],
            };
            if (d[e.key]) {
              e.preventDefault();
              setBox((b) => ({
                ...b,
                width: Math.max(
                  Math.min(280, innerWidth - 16),
                  Math.min(innerWidth - b.x - 8, b.width + d[e.key][0]),
                ),
                height: Math.max(
                  Math.min(260, innerHeight - 16),
                  Math.min(innerHeight - b.y - 8, b.height + d[e.key][1]),
                ),
              }));
            }
          }}
        >
          ◢
        </button>
      </footer>
    </section>
  );
}

export function RubricAccess({
  exam,
  questionKey,
}: {
  exam?: ExamRecord;
  questionKey: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const range = exam?.rubricPages?.[questionKey];
  const available = !!exam?.rubric?.pageCount;
  return (
    <>
      <button
        className="button"
        ref={trigger}
        disabled={!available}
        onClick={() => setOpen(true)}
        title={
          available
            ? "Open the rubric for this question"
            : "Ask the coordinator to upload a PDF or DOCX rubric with a preview"
        }
      >
        View rubric
      </button>
      {open && exam?.rubric && (
        <RubricWindow
          key={`${questionKey}-${exam.rubric.uploadedAt}`}
          rubric={exam.rubric}
          initialPage={range?.start ?? 1}
          context={
            range
              ? `Assigned pages ${range.start}–${range.end}`
              : "No pages assigned to this question. Showing page 1; ask the coordinator to map it."
          }
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}
