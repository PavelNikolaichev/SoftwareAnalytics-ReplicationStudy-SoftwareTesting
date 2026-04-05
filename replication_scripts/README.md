# About replication scripts

Note that I have almost replicated the folder hierarchy used for replication:
- Copy the testpilot folder into the parent folder of your testpilot repository, swap the duplicates with newer ones.

The bash scripts used for replication should be placed in the subfolder of this parent folder in the previous step. E.g., original replication file structure was like this:
```
scripts/
    run-rq1-latest-5-wsl.sh
    run-gpt4omini-rq1-3-wsl.sh
testpilot/
    ...
```

After running the bash scripts, the results would be located in:
`outputs/runs/<run_name>`

That's also where the packages used for testing are saved




# Analysis scripts

in order to run analysis scripts, you need to run them one by one from their respective folders:
latest_version_5 and original_version_25

Extract files from the gpt4omini_run3.7z into the original_version_25/data/single_run folder

Extract files from the gpt4omini_run3_latest5.zip into the latest_version_5/data/single_run folder


Create a folder "figures" in both folders. 
1) inside of the original_version_25, create "figures" folder
2) inside of the latest_version_5, create "figures" folder


## In each respective folder (original_version_25 and latest_version_5): 

1) Create a virtual environment:

```bash
python3 -m venv .venv
```

2) Activate the environment:

macOS/Linux:
```bash
source .venv/bin/activate
```

Windows:
```bash
.venv\Scripts\activate
```

3) Install dependencies:

```bash
pip install -r requirements.txt
```


#### Then run in the latest_version_5 in this order

```bash
node generate_latex_macros.js "data" "latest_version_5_evaluation_macros.tex" "latest_version_5" --recalcFnCov

node generate_latex_tables.js "data" "tables" "latest_version_5"

python3 generate_fn_cov_plot.py "data" "figures" "latest_version_5_evaluation_macros.tex" "latest_version_5"

```

#### Then run in the original_version_25 in this order

```bash
node generate_latex_macros.js "data" "original_version_25_evaluation_macros.tex" "original_version_25" --recalcFnCov

node generate_latex_tables.js "data" "tables" "original_version_25"

python3 generate_fn_cov_plot.py "data" "figures" "original_version_25_evaluation_macros.tex" "original_version_25"
```


In each respective folder, you will then find the output tables in the "tables" folder and output figures in the "figures" folder.


