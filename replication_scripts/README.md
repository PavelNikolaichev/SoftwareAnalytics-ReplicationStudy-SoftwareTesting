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