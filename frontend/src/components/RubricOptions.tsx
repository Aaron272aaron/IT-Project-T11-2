import { useId } from "react";
import { groupCategories, matchesCategory } from "../rubricScores";
import type { RubricCategory } from "../exams";

// Selecting a score and expanding its description are separate keyboard-accessible actions.
export function RubricOptions({
  options,
  maxMark,
  selected,
  onSelect,
}: {
  options: RubricCategory[];
  maxMark: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const group = useId();
  return (
    <fieldset className="rubric-options">
      <legend>Rubric category</legend>
      {/* Keep scrolling inside the options so the adjacent answer stays in place. */}
      <div
        className="rubric-options-scroll"
        role="region"
        aria-label="Rubric score options"
        tabIndex={0}
      >
        {groupCategories(options).map((c, i) => (
          <div className="rubric-score-option" key={c.id}>
            <label>
              <input
                type="radio"
                name={group}
                value={c.id}
                checked={matchesCategory(c, selected)}
                onChange={() => onSelect(c.id)}
                aria-label={`Option ${i + 1}: ${c.score} / ${maxMark}`}
              />
              <strong>
                {c.score} / {maxMark}
              </strong>
            </label>
            <details open>
              <summary aria-label={`Description for option ${i + 1}`}>
                Description
              </summary>
              <p className="preserve">{c.description}</p>
            </details>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
