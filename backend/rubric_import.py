"""Extract editable rubric drafts from the supplied guide's paragraph format.

Document text is data only. No macros, student code, or document instructions run.
"""
import io
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
SCORE = re.compile(r"^\+\s*(\d+(?:\.\d+)?)\s*[:：]?\s*(.*)$")
HEADING = re.compile(r"^(?:Rubric\s*:|Marks\s*:|Marks for each\b)", re.I)
QUESTION = re.compile(r"^(?:Q|Question\s+)(\d+)([a-z]?)\b", re.I)
WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
         "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}


def docx_lines(content):
    # Bound expanded XML too; do not extract uploaded archive paths to disk.
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if "[Content_Types].xml" not in archive.namelist():
                raise ValueError("Choose a valid DOCX document.")
            if sum(x.file_size for x in archive.infolist()) > 50 * 1024 * 1024:
                raise ValueError("The expanded Word document is too large.")
            xml = archive.read("word/document.xml")
        if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
            raise ValueError("Unsupported XML declarations in Word document.")
        root = ET.fromstring(xml)
        return [
            "".join(node.text or "" for node in p.findall(".//w:t", NS)).strip()
            for p in root.findall(".//w:p", NS)]
    except (zipfile.BadZipFile, KeyError, ET.ParseError, RuntimeError):
        raise ValueError("Choose a valid, unencrypted DOCX document.") from None


def parse_rubric(lines):
    # Suggestions use visible question numbers or consecutive guide order.
    # Every association is an editable draft; supplementary lettered questions
    # intentionally receive no numeric association.
    lines = [str(x).strip() for x in lines if str(x).strip()]
    if sum(map(len, lines)) > 2_000_000 or len(lines) > 30000:
        raise ValueError("The rubric text is too large.")
    blocks, pending, next_number = [], [], 1
    part, supplementary, previous_boundary = "", False, 0
    for index, line in enumerate(lines):
        if re.match(r"^Part\s+\d+\b", line, re.I):
            part = line[:160]
            pending = []
            previous_boundary = index
        q = QUESTION.match(line)
        if q:
            if q[2]:
                supplementary = True
                pending = []
            elif not supplementary:
                number = int(q[1])
                pending.append(number)
                next_number = max(next_number, number + 1)
        if not HEADING.match(line):
            continue
        end = index + 1
        while end < len(lines) and not HEADING.match(lines[end]) and not re.match(r"^(?:Part\s+\d+|Question\s+\d+[a-z])\b", lines[end], re.I):
            end += 1
        segment = lines[index + 1:end]
        scores = [(j, SCORE.match(t)) for j, t in enumerate(segment) if SCORE.match(t)]
        if not scores:
            continue
        warnings = []
        categories = []
        additive = re.match(r"^\+\s*(\d+(?:\.\d+)?)\s+marks? for each", segment[scores[0][0]], re.I)
        if additive:
            criteria = segment[scores[0][0] + 1:]
            if any(re.match(r"^[•●▪\uf0b7]", item) for item in criteria):
                # A wrapped PDF bullet is still one criterion, never an extra mark.
                merged = []
                for item in criteria:
                    if re.match(r"^[•●▪\uf0b7]", item):
                        merged.append(re.sub(r"^[•●▪\uf0b7]\s*", "", item))
                    elif merged:
                        merged[-1] += " " + item
                criteria = merged
            # The standard's final additive section lists one criterion per paragraph.
            if not criteria or len(criteria) > 20:
                raise ValueError("The additive rubric needs a short list of criteria.")
            value = float(additive[1])
            for count in range(len(criteria), -1, -1):
                categories.append({"score": value * count, "description":
                    f"Meets {count} of {len(criteria)} criteria ({value:g} mark each). Coordinator must verify this total-score interpretation.\n" + "\n".join(criteria)})
            warnings.append("Additive criteria were converted to whole-answer totals. Review every description before saving.")
        else:
            for n, (position, match) in enumerate(scores):
                score = float(match[1])
                if score > 10000 or abs(score * 100 - round(score * 100)) > 1e-8:
                    raise ValueError("Rubric scores must have at most two decimal places and be no greater than 10000.")
                description = match[2]
                # Preserve continuation paragraphs between score entries, including examples.
                if n + 1 < len(scores):
                    description += "\n" + "\n".join(segment[position + 1:scores[n + 1][0]])
                if not description.strip():
                    warnings.append(f"The {score:g}-mark option needs a description.")
                categories.append({"score": score, "description": description.strip()})
        shared = re.search(r"each of the (\d+|" + "|".join(WORDS) + r")", line, re.I)
        if supplementary:
            numbers = []
            warnings.append("Supplementary lettered question: select its exam question manually, or leave unassigned.")
        elif pending:
            numbers = sorted(set(pending))
        elif shared:
            token = shared[1].lower()
            count = int(token) if token.isdigit() else WORDS[token]
            if not 1 <= count <= 200:
                raise ValueError("Too many shared questions in one rubric block.")
            numbers = list(range(next_number, next_number + count))
        else:
            numbers = [next_number]
        if numbers:
            next_number = max(next_number, max(numbers) + 1)
        if not pending and numbers:
            warnings.append("Question association inferred from document order; verify against the CSV question list.")
        if not any(c["score"] == 0 for c in categories):
            warnings.append("No zero-mark option is explicitly present. Add one manually if required.")
        blocks.append({"id": f"block-{len(blocks) + 1}", "title": part or "Rubric", "questionNumbers": numbers,
            "context": "\n".join(lines[max(previous_boundary, index - 5):index])[-2000:],
            "categories": categories, "warnings": warnings})
        pending = []
        previous_boundary = index + 1
    if not blocks:
        raise ValueError("No rubric options found. Use Rubric: or Marks: headings followed by +score and description. Scanned PDFs need selectable text or a DOCX original.")
    if len(blocks) > 200:
        raise ValueError("Too many rubric sections.")
    return {"status": "ok", "blocks": blocks, "warnings": [
        "Review question associations and scores before applying. Imported text does not change saved marks or document page assignments."]}
