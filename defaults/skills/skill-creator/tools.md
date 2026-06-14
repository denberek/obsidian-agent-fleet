# Skill Creator Tools

## Scripts

All scripts are run as Python modules from the skill-creator directory using `python -m scripts.<name>`.

### scripts.run_eval

Runs trigger evaluation for a skill description. Tests whether a skill's description causes Claude to trigger (read the skill) for a set of queries.

**Usage:**
```bash
python -m scripts.run_eval \
  --eval-set <path-to-eval-set.json> \
  --skill-path <path-to-skill> \
  --model <model-id> \
  [--timeout <seconds>]
```

**Eval set format:**
```json
[
  {"query": "user prompt text", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

**Output:** JSON results showing which queries triggered the skill and whether they matched expectations.

---

### scripts.run_loop

Runs the eval + improve loop until all pass or max iterations reached. Combines `run_eval.py` and `improve_description.py` in a loop, tracking history and returning the best description found. Supports train/test split to prevent overfitting.

**Usage:**
```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

**Behavior:**
- Splits eval set into 60% train and 40% held-out test
- Evaluates current description (running each query 3 times for reliability)
- Calls Claude to propose improvements based on failures
- Re-evaluates each new description on both train and test
- Iterates up to max-iterations times
- Opens HTML report in browser showing results per iteration
- Returns JSON with `best_description` (selected by test score to avoid overfitting)

---

### scripts.improve_description

Improves a skill description based on eval results. Takes eval results from `run_eval.py` and generates an improved description by calling `claude -p` as a subprocess.

**Usage:**
```bash
python -m scripts.improve_description \
  --skill-path <path-to-skill> \
  --eval-results <path-to-results.json> \
  --model <model-id>
```

**Output:** Prints the improved description to stdout.

---

### scripts.aggregate_benchmark

Aggregates individual run results into benchmark summary statistics. Reads grading.json files from run directories.

**Usage:**
```bash
python -m scripts.aggregate_benchmark <benchmark_dir> --skill-name <name>
```

**Output:** Produces `benchmark.json` and `benchmark.md` with:
- `run_summary` with mean, stddev, min, max for each metric
- `delta` between `with_skill` and `without_skill` configurations

**Supports two directory layouts:**
```
# Workspace layout (from skill-creator iterations)
<benchmark_dir>/
└── eval-N/
    ├── with_skill/
    │   └── run-1/grading.json
    └── without_skill/
        └── run-1/grading.json

# Legacy layout
<benchmark_dir>/
└── runs/
    └── eval-N/
        └── ...
```

---

### scripts.generate_report

Generates an HTML report from `run_loop.py` output. Shows each description attempt with check/x for each test case, distinguishing between train and test queries.

**Usage:**
```bash
python -m scripts.generate_report <loop-output.json> [--output <report.html>]
```

---

### scripts.package_skill

Creates a distributable `.skill` file from a skill folder.

**Usage:**
```bash
python -m scripts.package_skill <path/to/skill-folder> [output-directory]
```

**Example:**
```bash
python -m scripts.package_skill skills/my-skill
python -m scripts.package_skill skills/my-skill ./dist
```

**Behavior:**
- Validates the skill (checks SKILL.md exists, has valid frontmatter)
- Excludes `__pycache__`, `node_modules`, `.pyc` files, `.DS_Store`
- Excludes `evals/` directory at the skill root
- Creates a `.skill` zip archive

---

### scripts.quick_validate

Quick validation script for skills. Checks basic structure requirements.

**Usage:**
```bash
python -m scripts.quick_validate <path/to/skill-folder>
```

**Checks:**
- SKILL.md exists
- Has valid YAML frontmatter
- Required fields (name, description) are present

---

## Eval Viewer

### eval-viewer/generate_review.py

Generates an interactive HTML viewer for reviewing eval results. Supports both server mode and static file output.

**Usage:**
```bash
# Server mode (opens in browser)
nohup python <skill-creator-path>/eval-viewer/generate_review.py \
  <workspace>/iteration-N \
  --skill-name "my-skill" \
  --benchmark <workspace>/iteration-N/benchmark.json \
  > /dev/null 2>&1 &

# With previous iteration comparison
python eval-viewer/generate_review.py \
  <workspace>/iteration-N \
  --skill-name "my-skill" \
  --benchmark <workspace>/iteration-N/benchmark.json \
  --previous-workspace <workspace>/iteration-<N-1>

# Static mode (for headless environments)
python eval-viewer/generate_review.py \
  <workspace>/iteration-N \
  --skill-name "my-skill" \
  --static <output_path.html>
```

**Features:**
- "Outputs" tab: Shows prompts, outputs, previous outputs, formal grades, feedback textbox
- "Benchmark" tab: Shows pass rates, timing, token usage per configuration
- Navigation via prev/next buttons or arrow keys
- "Submit All Reviews" saves all feedback to `feedback.json`

---

## Assets

### assets/eval_review.html

HTML template for the description optimization eval review interface. Contains placeholders:
- `__EVAL_DATA_PLACEHOLDER__` - Replace with JSON array of eval items
- `__SKILL_NAME_PLACEHOLDER__` - Replace with skill name
- `__SKILL_DESCRIPTION_PLACEHOLDER__` - Replace with current description

Users can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set" which downloads to `~/Downloads/eval_set.json`.
