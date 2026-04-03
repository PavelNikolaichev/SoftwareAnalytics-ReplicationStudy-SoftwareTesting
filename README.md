## 1. Project Title and Overview

- **Paper Title**: *An Empirical Evaluation of Using Large Language Models for Automated Unit Test Generation*
- **Authors**: Max Schäfer, Sarah Nadi, Aryaz Eghbali, Frank Tip
- **Course**: CS-UH 3260 Software Analytics, NYUAD
- **Brief description (paper)**: The paper evaluates TestPilot, an LLM-based unit test generator for JavaScript, on 25 npm packages, measuring coverage, failures, similarity, and the impact of prompt refiners across multiple LLMs.
- **Brief description (this replication)**: We (a) sanity-checked the shared output format on one package, (b) re-ran TestPilot using `gpt-4o-mini` and processed outputs with the existing artifact scripts, and (c) selected 5 packages, identified their latest versions, re-ran RQ1-related data collection on latest versions, and compared against the artifact-pinned versions.

## 2. Repository Structure (replication folder)

This README documents the replication work artifacts under `SoftwareAnalytics-ReplicationStudy-SoftwareTesting/`.

```
SoftwareAnalytics-ReplicationStudy-SoftwareTesting/
  README.md                         # This file (replication instructions + overview)
  notes/
    1. Output analysis.md           # Scope item 1 writeup (pass/fail test + diagnosis)
    3. Latest versions (RQ1).md     # Scope item 3 writeup scaffold + commands
  replication_scripts/
    run-gpt4omini-rq1-3-wsl.sh      # Run pinned packages
    run-rq1-latest-5-wsl.sh         # Run 5 packages at latest npm versions
    README.md                       # More info regarding the scripts
  datasets/                          
    README.md                       # Links to original datasets
  logs/
    average_run.png                 # Average runner logs under usual behavior
    failed_repo.png                 # Example of build errors that is the cause behind not having some of the repos replicated
    timeout_errors.png              # One of the most frequent reasons the tests are failed - timeouts in testing
    README.md                       # Clarification behind errors, possible solutions and why they were (not) fixed
  outputs/
    gpt4omini_run3.7z               # Outputs after running all the original repos via the runner
    gpt4omini_run3_latest5.zip      # Outputs after running 5 repos using latest npm versions
```

**Important**: the primary outputs are generated in the repo root under `outputs/` (not duplicated here), per project conventions.

## 3. Setup Instructions

### Prerequisites

- **WSL (Linux)** recommended for running the reproduction runner scripts end-to-end.
- **Node.js** and **npm**, versions vary by deps, we have used Node 20 LTS.
- **Git**

### Environment variables (LLM access)

For live generation, TestPilot expects:

- `TESTPILOT_LLM_API_ENDPOINT`
- `TESTPILOT_LLM_AUTH_HEADERS` (must be valid JSON)
- `TESTPILOT_LLM_API_KIND=chat` (for chat-completions)
- `TESTPILOT_LLM_MODEL=gpt-4o-mini`

The support for .env was added, so you might use dotenv and .env.example. Place it in the root of the `testpilot` repository

### Build TestPilot (once)

From repo root (WSL):

```bash
cd testpilot
npm run build # Runs npm i, so no need for npm install
```

## 4. Replication Steps (Scope items 1–3)

### Understanding output format

See `SoftwareAnalytics-ReplicationStudy-SoftwareTesting/notes/1. Output analysis.md`.

### Generation with `gpt-4o-mini`

1) Run generation in WSL or linux shell:

```bash
./SoftwareAnalytics-ReplicationStudy-SoftwareTesting/replication_scripts/run-gpt4omini-rq1-3-wsl.sh <run_name>
```

Outputs go to `outputs/runs/<run_name>/<package>/...`

2) Process outputs using the existing artifact scripts in `artifact/`.

### Latest versions for 5 packages

We selected the five packages with the fewest tests in `outputs/runs/gpt4omini_run3`:

- `image-downloader`
- `crawler-url-parser`
- `countries-and-timezones`
- `plural`
- `jsonfile`

Latest versions were obtained via `npm view <pkg> version` (Check out notes for more details).

Run in WSL:

```bash
./SoftwareAnalytics-ReplicationStudy-SoftwareTesting/replication_scripts/run-rq1-latest-5-wsl.sh <run_name>
```

Notes and comparison scaffolding live in `SoftwareAnalytics-ReplicationStudy-SoftwareTesting/notes/3. Latest versions (RQ1).md`.

## 5. Modified/Added Scripts and Code Changes:

This replication required a small set of practical modifications to run TestPilot with modern `ChatCompletions` OpenAI API and to improve perofrmance a bit:

- **Chat-completions support**: `testpilot/src/codex.ts` can post to chat-completions endpoints and read `choices[].message.content`.
- **dotenv loading**: `.env` is loaded for benchmark runs.
- **Prompt contract + parsing**: Improved `trimCompletion()` to handle 4o-mini specific quote blocks cases.
- **Validator robustness**: we have adjusted validator timeouts to 60 seconds due to the WSL IO bounds - needed if your IO or CPU is slow to fit under the standard limit of 5 seconds; safer stderr handling - errors are now verbose, which simplifies debugging; parse Mocha JSON from stdout when a report file is not written.
- **Generated test imports**: removed `require('mocha')` from generated tests templates - there are several problems related to that. It is not a good solution to the problem - in fact, it conflicts with `require('mocha')` in the code, as mocha CLI already runs those tests, sometimes `4o-mini` introduces this option themselves, provoking the CLI errors once again. Why it was not fixed? - fixing this behavior requires rewriting the test runner, which is out of the replication scope.

## 6. GenAI Usage

We used AI assistance (Cursor Composer model) to:

- provide navigation in the hierarchy of the folders and find relevant code snippets (e.g., entrypoint of the program, where is the LLM API layer is, etc.)
- draft and refine replication scripts (in particular, `run-rq1-latest-5-wsl.sh` and `run-gpt4omini-rq1-3-wsl.sh`), some proofreading regarding the notes you see in here (to ensure all changes and aspects are captured, and explanations of the errors are plausible).

