import { useEffect, useRef, useState } from "react";
import type { ExamRecord } from "../../models/exams";
import { questionType } from "../../models/questionTypes";
import { groupCategories, matchesCategory } from "../../utils/rubricScores";
import { confirmGroupMark } from "../../utils/answerGrouping";
import {
  groupingRows,
  groupingSignature,
  requestAnswerGroups,
  restoreGroups,
  SPACE_RULES,
  type AnswerGroup,
} from "../../api/answerGroups";
import { useApp, go } from "../../state";
import { Badge, Button, Card, Field, Modal, Notice } from "../UI";
import { RubricOptions } from "../rubric/RubricOptions";
import { questionLockOwner } from "../../utils/submissionLocks";

const PAGE_SIZE = 50;
export function AnswerGroups({
  exam,
  questionId,
}: {
  exam: ExamRecord;
  questionId: string;
}) {
  const { saveExam, notify, data } = useApp();
  const latest = useRef(exam);
  latest.current = exam;
  const type = questionType(exam, questionId);
  const exactOutput = type === "expression-output";
  const initialSpaces = exactOutput
    ? []
    : (exam.answerGrouping?.[questionId]?.unicodeSpaces ?? []);
  const [spaces, setSpaces] = useState(initialSpaces);
  const [draftSpaces, setDraftSpaces] = useState(initialSpaces);
  const [groups, setGroups] = useState<AnswerGroup[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [chartPage, setChartPage] = useState(0);
  const [memberPage, setMemberPage] = useState(0);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState<"rules" | "mark" | null>(null);
  const rulesKey = JSON.stringify(spaces);
  const question = exam.answers?.preview.questions.find(
    (item) => item.id === questionId,
  );
  const categories = groupCategories(exam.categories?.[questionId] ?? []);
  const category = categories.find((item) => matchesCategory(item, categoryId));
  const visibleGroups = groups.filter((item) =>
    item.students.some(
      (member) =>
        member.answer
          .toLocaleLowerCase()
          .includes(groupSearch.toLocaleLowerCase()) ||
        member.student_id
          .toLocaleLowerCase()
          .includes(groupSearch.toLocaleLowerCase()),
    ),
  );
  const group =
    visibleGroups.find((item) => item.group_id === selectedId) ??
    visibleGroups[0];
  const lockedBy = questionLockOwner(exam, questionId);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    const approved: string[] = JSON.parse(rulesKey);
    setLoading(true);
    setError("");
    setGroups([]);
    setSelectedId("");
    setCategoryId("");
    setConfirm(null);
    setChartPage(0);
    async function load() {
      const current = latest.current;
      const signature = await groupingSignature(current, questionId, approved);
      const snapshot = current.answerGrouping?.[questionId];
      let result: AnswerGroup[] | undefined;
      if (snapshot?.signature === signature) {
        try {
          result = restoreGroups(
            snapshot,
            groupingRows(current, questionId),
            type,
          );
        } catch {
          /* Rebuild invalid cached membership. */
        }
      }
      if (!result) {
        result = await requestAnswerGroups(
          current,
          questionId,
          approved,
          controller.signal,
        );
        if (!active) return;
        if (
          (await groupingSignature(latest.current, questionId, approved)) !==
          signature
        )
          throw new Error(
            "Responses changed during grouping. Retry with the current answers.",
          );
        await saveExam({
          ...latest.current,
          answerGrouping: {
            ...latest.current.answerGrouping,
            [questionId]: {
              signature,
              unicodeSpaces: approved,
              generatedAt: new Date().toISOString(),
              groups: result.map((item) => ({
                id: item.group_id,
                studentIds: item.students.map((member) => member.student_id),
              })),
            },
          },
        });
      }
      if (active) {
        setGroups(result);
        setSelectedId(result[0]?.group_id ?? "");
        setMemberPage(0);
      }
    }
    void load()
      .catch((reason) => {
        if (active)
          setError(
            controller.signal.aborted
              ? "Grouping timed out. Retry or mark students individually."
              : (reason as Error).message,
          );
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [exam.answers, questionId, type, rulesKey, retry]);
  const maximum = Math.max(1, ...groups.map((item) => item.count));
  const chartGroups = visibleGroups.slice(
    chartPage * PAGE_SIZE,
    (chartPage + 1) * PAGE_SIZE,
  );
  const groupOrdinal =
    groups.findIndex((item) => item.group_id === group?.group_id) + 1;
  const variants = new Set(group?.students.map((member) => member.answer)).size;
  const members = (group?.students ?? []).filter((member) => {
    const marked = !!exam.marks?.[questionId]?.[member.student_id];
    return (
      (filter === "All" || (filter === "Marked" ? marked : !marked)) &&
      (member.student_id.toLowerCase().includes(search.toLowerCase()) ||
        member.answer.toLowerCase().includes(search.toLowerCase()))
    );
  });
  const markedCount =
    group?.students.filter(
      (member) => !!exam.marks?.[questionId]?.[member.student_id],
    ).length ?? 0;
  function select(item: AnswerGroup) {
    setSelectedId(item.group_id);
    setMemberPage(0);
    setCategoryId("");
    setComment("");
    setFilter("All");
    setSearch("");
    setError("");
  }
  async function applyMark() {
    try {
      if (!group) throw new Error("Select an answer group.");
      await saveExam(
        confirmGroupMark(
          latest.current,
          questionId,
          group,
          spaces,
          categoryId,
          comment,
          data.profile.name,
        ),
      );
      setConfirm(null);
      setError("");
      notify(`Group mark saved for ${group.count} students.`);
    } catch (reason) {
      setConfirm(null);
      setError((reason as Error).message);
    }
  }
  return (
    <div className="answer-grouping">
      <Card
        title="Answer groups"
        description={
          exactOutput
            ? "Exact expression outputs · all characters preserved"
            : "Exact short answers · spaces ignored · original responses preserved"
        }
      >
        <Field label="Search answer groups">
          <input
            type="search"
            value={groupSearch}
            placeholder="Response text or student ID"
            onChange={(event) => {
              setGroupSearch(event.target.value);
              setChartPage(0);
              setSelectedId("");
              setCategoryId("");
              setConfirm(null);
              setMemberPage(0);
            }}
          />
        </Field>
        {groupSearch && (
          <p role="status">
            {visibleGroups.length} of {groups.length} groups match
          </p>
        )}
        <div className="group-summary">
          <Badge>{groups.length} groups</Badge>
          <Badge>
            {groups.reduce((sum, item) => sum + item.count, 0)} students
          </Badge>
          <Button onClick={() => setRetry((value) => value + 1)}>
            Retry grouping
          </Button>
        </div>
        <p className="helper">
          {exactOutput
            ? "Only identical outputs are grouped. Spaces, quotes, case, punctuation and line breaks stay significant. Original responses are preserved."
            : "Only ordinary spaces are ignored by default. Case, punctuation, tabs and line breaks stay significant. Review whitespace variants before applying a group mark."}
        </p>
        {!exactOutput && (
          <details className="group-rules">
            <summary>Pre-processing rules</summary>
            <p>
              Choose Unicode spaces to replace with ordinary spaces. No
              punctuation or other characters are removed.
            </p>
            {SPACE_RULES.map((rule) => (
              <label key={rule.char}>
                <input
                  type="checkbox"
                  checked={draftSpaces.includes(rule.char)}
                  onChange={(event) =>
                    setDraftSpaces(
                      event.target.checked
                        ? [...draftSpaces, rule.char]
                        : draftSpaces.filter((char) => char !== rule.char),
                    )
                  }
                />
                {rule.label}
              </label>
            ))}
            <Button
              disabled={
                loading ||
                JSON.stringify([...spaces].sort()) ===
                  JSON.stringify([...draftSpaces].sort())
              }
              onClick={() => setConfirm("rules")}
            >
              Review grouping rules
            </Button>
          </details>
        )}
        {loading && (
          <p role="status">
            {exactOutput
              ? "Grouping expression outputs…"
              : "Grouping short answers…"}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!loading && !groups.length && !error && (
          <p>No responses to group yet.</p>
        )}
        {!!visibleGroups.length && (
          <figure
            className="group-chart"
            aria-label="Answer groups by number of students"
          >
            <figcaption>Students per answer group</figcaption>
            <div className="group-chart-body">
              <div className="group-chart-axis">
                <span>Students</span>
                <b>{maximum}</b>
                <b>0</b>
              </div>
              <div className="group-chart-bars">
                {chartGroups.map((item) => {
                  const ordinal =
                    groups.findIndex(
                      (entry) => entry.group_id === item.group_id,
                    ) + 1;
                  return (
                    <button
                      key={item.group_id}
                      aria-label={`Group ${ordinal}: ${item.count} students`}
                      aria-pressed={item.group_id === group?.group_id}
                      className={
                        item.group_id === group?.group_id ? "selected" : ""
                      }
                      onClick={() => select(item)}
                    >
                      <b>{item.count}</b>
                      <i
                        style={{
                          height: `${Math.max(3, (item.count / maximum) * 140)}px`,
                        }}
                      />
                      <span>G{ordinal}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="center">Answer group</p>
            {visibleGroups.length > PAGE_SIZE && (
              <div className="group-pagination">
                <Button
                  disabled={!chartPage}
                  onClick={() => setChartPage((page) => page - 1)}
                >
                  Previous groups
                </Button>
                <span>
                  Groups {chartPage * PAGE_SIZE + 1}–
                  {Math.min(visibleGroups.length, (chartPage + 1) * PAGE_SIZE)}{" "}
                  of {visibleGroups.length}
                </span>
                <Button
                  disabled={(chartPage + 1) * PAGE_SIZE >= visibleGroups.length}
                  onClick={() => setChartPage((page) => page + 1)}
                >
                  Next groups
                </Button>
              </div>
            )}
          </figure>
        )}
      </Card>
      {group && question && (
        <div className="marking-grid">
          <Card title={`Group ${groupOrdinal} · ${group.count} students`}>
            <Badge tone="success">
              {markedCount} / {group.count} marked
            </Badge>
            <h3>Representative original answer</h3>
            <pre className="code-block" data-testid="group-answer">
              {group.answer || "(Blank response)"}
            </pre>
            {variants > 1 && (
              <Notice tone="warning">
                {variants} whitespace variants are in this group. Review each
                original answer below; mark students individually if the spacing
                matters.
              </Notice>
            )}
            <div className="group-member-filters">
              <Field label="Search students or responses">
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setMemberPage(0);
                  }}
                />
              </Field>
              <Field label="Marking status">
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setMemberPage(0);
                  }}
                >
                  <option>All</option>
                  <option>Marked</option>
                  <option>Unmarked</option>
                </select>
              </Field>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Confirmed mark</th>
                    <th>Original response</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {members
                    .slice(memberPage * PAGE_SIZE, (memberPage + 1) * PAGE_SIZE)
                    .map((member) => {
                      return (
                        <tr key={member.student_id}>
                          <td>{member.student_id}</td>
                          <td>
                            {exam.marks?.[questionId]?.[member.student_id]
                              ?.score ?? "Unmarked"}
                          </td>
                          <td>
                            <details>
                              <summary>View original</summary>
                              <pre className="preserve">
                                {member.answer || "(Blank response)"}
                              </pre>
                            </details>
                          </td>
                          <td>
                            <Button
                              onClick={() =>
                                go(
                                  `/exam/${exam.id}/question/${questionId}/mark/${encodeURIComponent(member.student_id)}`,
                                )
                              }
                            >
                              {lockedBy ? "View" : "Mark"} {member.student_id}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {!members.length && <p>No students match this filter.</p>}
            {members.length > PAGE_SIZE && (
              <div className="group-pagination">
                <Button
                  disabled={!memberPage}
                  onClick={() => setMemberPage((page) => page - 1)}
                >
                  Previous students
                </Button>
                <span>
                  {memberPage * PAGE_SIZE + 1}–
                  {Math.min(members.length, (memberPage + 1) * PAGE_SIZE)} of{" "}
                  {members.length}
                </span>
                <Button
                  disabled={(memberPage + 1) * PAGE_SIZE >= members.length}
                  onClick={() => setMemberPage((page) => page + 1)}
                >
                  Next students
                </Button>
              </div>
            )}
          </Card>
          <Card title="Group mark decision">
            <Badge tone="success">HUMAN DECISION</Badge>
            <p>
              Apply one rubric category to all {group.count} students in this
              group, including students hidden by the list filter.
            </p>
            {lockedBy && (
              <Notice tone="warning">
                This question is locked by {lockedBy}. Group marks are read
                only.
              </Notice>
            )}
            {!categories.length && (
              <Notice>
                No rubric categories are configured. Add categories before
                assigning a group mark.
              </Notice>
            )}
            <fieldset
              disabled={!!lockedBy}
              style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
            >
              <RubricOptions
                options={categories}
                maxMark={question.maxMark}
                selected={categoryId}
                onSelect={setCategoryId}
              />
              <Field label="Group marker comment (optional)">
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </Field>
              <Button
                variant="primary full"
                disabled={
                  !category ||
                  !!lockedBy ||
                  loading ||
                  !!exam.autoMarkedQuestionIds?.includes(questionId)
                }
                onClick={() => setConfirm("mark")}
              >
                Confirm group category &amp; mark
              </Button>
            </fieldset>
            <p className="helper">
              Nothing is marked until you confirm. Existing individual marks
              require review before replacement.
            </p>
          </Card>
        </div>
      )}
      {confirm === "rules" && (
        <Modal title="Confirm grouping rules" onClose={() => setConfirm(null)}>
          <p>
            Regroup this question using{" "}
            {draftSpaces.length
              ? draftSpaces
                  .map(
                    (char) =>
                      SPACE_RULES.find((rule) => rule.char === char)?.label,
                  )
                  .join(", ")
              : "ordinary spaces only"}
            ?
          </p>
          <Notice tone="warning">
            Group membership may change. Original answers and existing marks are
            preserved; no marks carry automatically to new group members.
          </Notice>
          <div className="form-actions">
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setSpaces([...draftSpaces].sort());
                setConfirm(null);
              }}
            >
              Apply grouping rules
            </Button>
          </div>
        </Modal>
      )}
      {confirm === "mark" && !lockedBy && group && category && (
        <Modal title="Confirm group mark" onClose={() => setConfirm(null)}>
          <p>
            Assign{" "}
            <b>
              {category.score} / {question?.maxMark}
            </b>{" "}
            to <b>all {group.count} students</b> in Group {groupOrdinal}?
          </p>
          <Notice tone="warning">
            {markedCount} existing individual marks will be replaced. Original
            answers and CSV source scores are preserved.
          </Notice>
          <details>
            <summary>Review affected students ({group.count})</summary>
            <p className="preserve">
              {group.students.map((member) => member.student_id).join(", ")}
            </p>
          </details>
          <div className="form-actions">
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="primary" onClick={applyMark}>
              Apply group mark
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
