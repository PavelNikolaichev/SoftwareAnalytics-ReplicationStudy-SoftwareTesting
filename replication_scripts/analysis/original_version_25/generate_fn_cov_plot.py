import matplotlib.pyplot as plot
import pandas as pd
import seaborn as sns
import os
import sys
import matplotlib.ticker as mtick
import json
import numpy as np
from generate_failure_plot import ordered_pkgs

# run script as: python3 generate_fn_cov_plot.y <artifacts-dir> <fig-output-dir> <latex-macro-file>

def parseFnCovReports(artifacts_dir):
    all_run_stats = {}

    for run in os.listdir(artifacts_dir):
        run_dir = os.path.join(artifacts_dir, run)

        if not os.path.isdir(run_dir):
            continue

        all_run_stats[run] = {}

        for proj in os.listdir(run_dir):
            proj_path = os.path.join(run_dir, proj)

            if not os.path.isdir(proj_path):
                continue

            fn_cov_file = os.path.join(proj_path, "detailedFnStats.json")
            if not os.path.exists(fn_cov_file):
                print(f"WARNING: Skipping {proj_path} (missing detailedFnStats.json)", file=sys.stderr)
                continue
            try:
                with open(fn_cov_file, "r") as file_data:
                    data = json.load(file_data)
            except (OSError, json.JSONDecodeError) as err:
                print(f"WARNING: Skipping {proj_path} (invalid detailedFnStats.json: {err})", file=sys.stderr)
                continue
            all_run_stats[run][proj] = data

    return all_run_stats

def getFunctionCov(artifacts_dir):
    '''
    Parses all detailedFnStats.json files from all projects across all runs present in the artifacts_dir
    Returns a dictionary containing the median function stats per project (i.e., median across runs)
    '''
    all_function_stats = {}
    for run in os.listdir(artifacts_dir):
        run_dir = os.path.join(artifacts_dir, run)

        if not os.path.isdir(run_dir):
            continue

        for proj in os.listdir(run_dir):
            proj_path = os.path.join(run_dir, proj)

            if not os.path.isdir(proj_path):
                continue

            if proj not in all_function_stats:
                all_function_stats[proj] = {}

            fn_cov_file = os.path.join(proj_path, "detailedFnStats.json")
            if not os.path.exists(fn_cov_file):
                print(f"WARNING: Skipping {proj_path} (missing detailedFnStats.json)", file=sys.stderr)
                continue
            try:
                with open(fn_cov_file, "r") as file_data:
                    data = json.load(file_data)
            except (OSError, json.JSONDecodeError) as err:
                print(f"WARNING: Skipping {proj_path} (invalid detailedFnStats.json: {err})", file=sys.stderr)
                continue
            coverage = {key: value['coverage']
                        for key, value in data.items()}

            for fn, covg in coverage.items():
                # coverage being None means that this "function" did not have any statements (i.e., it's an empty function)
                # so we won't include it in the stats
                if covg != None:
                    if fn not in all_function_stats[proj]:
                        all_function_stats[proj][fn] = {}

                    all_function_stats[proj][fn][run] = covg

    median_cov_stats = {}

    for proj in all_function_stats.keys():
        cov_stats = all_function_stats[proj]
        
        median_cov_stats[proj] = {}

        for fn in cov_stats.keys():
            fn_stats = cov_stats[fn]
            runs = fn_stats.keys()
            median_cov_stats[proj][fn] = np.median([fn_stats[run] for run in runs])

    return median_cov_stats


def prepare_data_for_boxplot(fn_cov_data):
    '''
    Prepares data in a long format (as follows) that can be used to draw boxplot      
                    Proj                     Function  Coverage
    0     quill-delta  dist/Delta.js@(anonymous_0)  0.000000
    1     quill-delta  dist/Delta.js@(anonymous_1)  0.000000
    2     quill-delta  dist/Delta.js@(anonymous_2)  0.000000
    3     quill-delta  dist/Delta.js@(anonymous_3)  0.000000
    4     quill-delta  dist/Delta.js@(anonymous_4)  0.000000
    ...           ...                          ...       ...
    3090  graceful-fs          polyfills.js@rename  0.000000
    3091  graceful-fs              polyfills.js@CB  0.000000
    3092  graceful-fs  polyfills.js@(anonymous_26)  0.111111
    3093  graceful-fs  polyfills.js@(anonymous_27)  0.000000
    3094  graceful-fs  polyfills.js@(anonymous_28)  0.111111
    '''

    #https://stackoverflow.com/questions/13575090/construct-pandas-dataframe-from-items-in-nested-dictionary
    records = [
        (proj, function, cov)
        for proj, function in fn_cov_data.items()
        for function, cov in function.items()
    ]
    if len(records) == 0:
        return pd.DataFrame(columns=['Proj', 'Function', 'Coverage'])

    data = pd.DataFrame.from_records(
        [
            (proj, function, cov)
            for proj, function, cov in records
        ],
        columns=['Proj', 'Function', 'Coverage']
    )
    data.reset_index(drop=True, inplace=True)
    data = data.dropna()
    return data


def create_boxplot_by_proj(fn_level_data, outputFile):
    '''
    Creates box plots of function level data. Boxplots are grouped by project   

        Parameters:
                fn_level_data (dict): dictionary of function level coverage data
                outputFile (string): path to save boxplot figure to
    '''

    data = prepare_data_for_boxplot(fn_level_data)

    fig, axes = plot.subplots(figsize=(10, 5))
    if data.empty:
        axes.text(0.5, 0.5, "No function coverage data available", ha="center", va="center")
        axes.set_axis_off()
        plot.tight_layout()
        plot.savefig(outputFile, dpi=300, bbox_inches='tight')
        plot.clf()
        return

    sns.set(style="whitegrid")
    available_projects = data["Proj"].unique().tolist()
    preferred_order = [proj for proj in ordered_pkgs if proj in available_projects]
    extra_projects = sorted([proj for proj in available_projects if proj not in preferred_order])
    plot_order = preferred_order + extra_projects

    sns.boxplot(
        data=data,
        ax=axes,
        x="Proj",
        y="Coverage",
        medianprops={"color": "red"},
        palette=sns.color_palette("Set2"),
        order=plot_order
    )
    plot.xticks(rotation=90, fontsize=14)
    plot.yticks(fontsize=16)
    plot.xlabel("")
    plot.ylabel("Statement Coverage per Function", fontsize=14)

    plot.tight_layout()
    plot.savefig(outputFile, dpi=300, bbox_inches='tight')
    plot.clf()

def write_fncov_macros(median_fn_stats, model, latex_macro_file):
    '''
    Calculate min, max, and median of function coverage per project
    '''
    median_fncov_per_proj = {}
    for proj in median_fn_stats.keys():
        cov_values = [cov for fn, cov in median_fn_stats[proj].items() if cov is not None and not np.isnan(cov)]
        if len(cov_values) == 0:
            continue
        median_fncov_per_proj[proj] = np.median(cov_values)

    if len(median_fncov_per_proj) == 0:
        minCov = "--"
        maxCov = "--"
        medianCov = "--"
    else:
        minCov = "{:.1f}".format(min(list(median_fncov_per_proj.values()))*100)
        maxCov = "{:.1f}".format(max(list(median_fncov_per_proj.values()))*100)
        medianCov = "{:.1f}".format(np.median(list(median_fncov_per_proj.values()))*100)

    with open(latex_macro_file, "a") as f:
        f.write(fr"\newcommand{{\{model}minMedianFnCovPerProj}}{{{minCov}\%\xspace}}")
        f.write('\n')
        f.write(fr"\newcommand{{\{model}maxMedianFnCovPerProj}}{{{maxCov}\%\xspace}}")
        f.write('\n')
        f.write(fr"\newcommand{{\{model}medianMedianFnCovPerProj}}{{{medianCov}\%\xspace}}")
        f.write('\n')

def main():
    artifacts_dir = sys.argv[1]
    output_dir = sys.argv[2]
    latex_macro_file = sys.argv[3]
    model=sys.argv[4]
    median_fn_stats = getFunctionCov(artifacts_dir)
    create_boxplot_by_proj(median_fn_stats, "{}/{}_fn-cov-boxplot.pdf".format(output_dir, model))
    write_fncov_macros(median_fn_stats, model, latex_macro_file)

if __name__ == "__main__":
    main()