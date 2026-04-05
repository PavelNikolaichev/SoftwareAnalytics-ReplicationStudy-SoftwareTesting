import matplotlib.pyplot as plot
import pandas as pd
import json
import matplotlib.style as style
import sys
import math

def normalize_failure(num, total):
    # round to 2 decimal places
    return int((num / total) * 100)

ordered_pkgs =  [
    # nessie benchmarks
    'glob',
    'fs-extra',
    'graceful-fs',
    'jsonfile',
    'bluebird',
    'q',
    'rsvp',
    'memfs',
    'node-dir',
    'zip-a-folder',
    # additional 10 new projects
    'js-sdsl',
    'quill-delta',
    'complex.js',
    'pull-stream',
    'countries-and-timezones',
    'simple-statistics',
    'plural',
    'dirty',
    'geo-point',
    'uneval',
    # additional 5 gitlab projects
    'image-downloader',
    'crawler-url-parser',
    'gitlab-js',
    'core',
    'omnitool'
    ]

def main():
    output_dir = sys.argv[1]
    model = sys.argv[2]
    # read json file median-failure-stats.json and prepare data for stacked barchart
    failure_data = json.load(open(f"{model}_median-failure-stats.json", "r"))

    df = pd.DataFrame(failure_data)


    # switch rows and columns
    df = df.transpose()

    # uncomment for percentage 
    # for metric in ['numAssertionErrors', 'numFileSysErrors', 'numCorrectnessErrors', 'numTimeoutErrors', 'numOther']:
    #     df[metric] = (df[metric]/ df["numFailing"])*100

    # drop numFailing column
    df = df.drop(columns=["numFailing"])


    # generate horizontal stacked barchart for numAssertionErrors numFileSysErrors numCorrectnessErrors numTimeoutErrors numOther
    #colors=['black','darkgray','gray','dimgray','lightgray']
    style.use('seaborn-deep')
    ax = df.plot.barh(stacked=True)

    ax.invert_yaxis()
    handles, l = ax.get_legend_handles_labels()
    ax.legend(handles=handles,
            labels=['Assertion Errors', 'File System Errors', 'Correctness Errors', 'Timeout Errors', 'Other'], 
            loc="lower center",
            bbox_to_anchor=(0.45, 1), 
            ncol=5, 
            title=None, 
            columnspacing=0.75,
            frameon=False,
            prop={'size': 8})
                
    ax.set_xlabel("Number of failing tests")

    # uncomment for percentage 
    # ax.set_xlabel("Proportion of types of failures")
    # ax.set_xlim(0, 100)
    # ax.xaxis.set_major_formatter('{x}%')

    plot.savefig("{}/{}_failures-stackedchart.pdf".format(output_dir, model), dpi=300, bbox_inches='tight')

if __name__ == "__main__":
    main()