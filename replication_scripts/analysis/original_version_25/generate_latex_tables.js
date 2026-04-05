#! /usr/bin/env node
const { calculateReportMedians, nessieCoverageValues, domainMap, formatNum, formatComparedPerc, latexPercentage, median, formatTime } = require("./utils")

const fs = require("fs");

const separatorProjects = ["zip-a-folder", "uneval"];

let formatter = Intl.NumberFormat("en", { notation: "compact" });

function safeRatioPercent(numerator, denominator) {
  if (
    typeof numerator !== "number" ||
    typeof denominator !== "number" ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return undefined;
  }
  return (numerator / denominator) * 100;
}

function safeMedian(numbers) {
  const valid = numbers.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (valid.length === 0) {
    return undefined;
  }
  return median(valid);
}

function getOrderedMinedPackages(coverageStats) {
  const mined = Object.keys(coverageStats ?? {});
  const inDomainOrder = Object.keys(domainMap).filter((pkg) => mined.includes(pkg));
  const extraPkgs = mined.filter((pkg) => !Object.prototype.hasOwnProperty.call(domainMap, pkg)).sort();
  return [...inDomainOrder, ...extraPkgs];
}

function listValidPackageDirs(parentDir, warningPrefix) {
  const validDirs = [];
  for (const entry of fs.readdirSync(parentDir)) {
    if (entry.startsWith(".")) continue;
    const entryPath = require("path").join(parentDir, entry);

    let stat;
    try {
      stat = fs.statSync(entryPath);
    } catch (_) {
      console.warn(`${warningPrefix}: skipping unreadable entry '${entryPath}'`);
      continue;
    }
    if (!stat.isDirectory()) continue;

    const reportPath = require("path").join(entryPath, "report.json");
    if (!fs.existsSync(reportPath)) {
      console.warn(`${warningPrefix}: skipping '${entryPath}' (missing report.json)`);
      continue;
    }

    let reportStat;
    try {
      reportStat = fs.statSync(reportPath);
    } catch (_) {
      console.warn(`${warningPrefix}: skipping '${entryPath}' (unreadable report.json)`);
      continue;
    }
    if (!reportStat.isFile()) {
      console.warn(`${warningPrefix}: skipping '${entryPath}' (report.json is not a file)`);
      continue;
    }

    validDirs.push(entryPath);
  }
  return validDirs;
}

function createSanitizedArtefactDir(baseDir, model) {
  const path = require("path");
  const sanitizedRoot = path.join(__dirname, ".sanitized_data", model, "tables_input");
  fs.rmSync(sanitizedRoot, { recursive: true, force: true });
  fs.mkdirSync(sanitizedRoot, { recursive: true });

  const topLevelDirs = [];
  for (const entry of fs.readdirSync(baseDir)) {
    if (entry.startsWith(".")) continue;
    const entryPath = path.join(baseDir, entry);
    let stat;
    try {
      stat = fs.statSync(entryPath);
    } catch (_) {
      console.warn(`Sanitizer: skipping unreadable top-level entry '${entryPath}'`);
      continue;
    }
    if (!stat.isDirectory()) continue;
    topLevelDirs.push({ name: entry, path: entryPath });
  }

  const directPackageDirs = [];
  const runDirs = [];
  for (const dir of topLevelDirs) {
    if (fs.existsSync(path.join(dir.path, "report.json"))) {
      directPackageDirs.push(dir.path);
    } else {
      runDirs.push(dir);
    }
  }

  if (directPackageDirs.length > 0) {
    const singleRunDir = path.join(sanitizedRoot, "single_run");
    fs.mkdirSync(singleRunDir, { recursive: true });
    for (const pkgDir of listValidPackageDirs(baseDir, "Sanitizer")) {
      const pkgName = path.basename(pkgDir);
      fs.symlinkSync(pkgDir, path.join(singleRunDir, pkgName), "dir");
    }
  }

  for (const run of runDirs) {
    const outRunDir = path.join(sanitizedRoot, run.name);
    fs.mkdirSync(outRunDir, { recursive: true });
    const validPackageDirs = listValidPackageDirs(run.path, `Sanitizer (${run.name})`);
    for (const pkgDir of validPackageDirs) {
      const pkgName = path.basename(pkgDir);
      fs.symlinkSync(pkgDir, path.join(outRunDir, pkgName), "dir");
    }
  }

  const runEntries = fs.readdirSync(sanitizedRoot).filter((entry) => !entry.startsWith("."));
  if (runEntries.length === 0) {
    throw new Error(`No valid run/package directories were found under '${baseDir}'`);
  }

  return sanitizedRoot;
}

function formatRepoUrl(pkg, repo, sha) {
  return `\\href{${repo}/commit/${sha}}{\\color{blue} ${pkg}}`;
}


function generatePerformanceTable(performanceStats, outputFile) {
  let latexTable = String.raw`%WARNING: this is an auto-generated table. Do not directly edit. Please edit scripts/generate_latex_tables.js as needed
  \begin{table*}[t!]
  \centering
  \caption{Time taken to generate tests for the complete API of each project.}
  \label{tab:performance}
  \resizebox{0.6\textwidth}{!}{
  \begin{tabular}{lrrrrr}
  \toprule
  \multirow{2}{*}{\textbf{\thead{Project}}}&\
  \multirow{2}{*}{\textbf{\thead{API \\Exploration}}}&
  \multirow{2}{*}{\textbf{\thead{Documentation \\Mining}}}&
  \multirow{2}{*}{\textbf{\thead{Model \\Querying}}}&
  \multirow{2}{*}{\textbf{\thead{Total \\Time}}} &
  \multirow{2}{*}{\textbf{\thead{Avg. Time\\/Method}}}\\
  &&&&&\\
  \midrule
`;

  for (const pkg of Object.keys(domainMap)) {
    if (performanceStats[pkg] === undefined) {
      console.log(`Skipping ${pkg} from performanceStats table`);
      continue;
    }

    const {
      proj,
      apiExplorationTime,
      docCommentExtractionTime,
      snippetExtractionTime,
      codexQueryTime,
      totalTime,
      numFunctions,
    } = performanceStats[pkg];
    latexTable += `${proj} & ${formatTime(
      apiExplorationTime,
      totalTime,
      true
    )} & ${formatTime(
      docCommentExtractionTime + snippetExtractionTime,
      totalTime,
      true
    )} & ${formatTime(codexQueryTime, totalTime, true)} & ${formatTime(
      totalTime
    )} & ${formatTime(totalTime / numFunctions)} \\\\ \n`;

    if (separatorProjects.includes(proj)) latexTable += `\\midrule \n`;
  }

  latexTable += `\\midrule`;

  const medianAPIExplorationTime = median(
    Object.values(performanceStats).map(
      (pkg) => (pkg.apiExplorationTime / pkg.totalTime) * 100
    )
  );
  const medianDocExtractionTime = median(
    Object.values(performanceStats).map(
      (pkg) =>
        ((pkg.docCommentExtractionTime + pkg.snippetExtractionTime) /
          pkg.totalTime) *
        100
    )
  );
  //const medianSnippetExtractionTime = median(Object.values(performanceStats).map(pkg => (/pkg.totalTime)*100));
  const medianCodexQueryTime = median(
    Object.values(performanceStats).map(
      (pkg) => (pkg.codexQueryTime / pkg.totalTime) * 100
    )
  );
  const medianTotalTime = median(
    Object.values(performanceStats).map((pkg) => pkg.totalTime)
  );
  const medianAvgTimePerMethod = median(
    Object.values(performanceStats).map(
      (pkg) => pkg.totalTime / pkg.numFunctions
    )
  );

  latexTable += `\\textbf{Median} & ${latexPercentage(
    medianAPIExplorationTime
  )} & ${latexPercentage(medianDocExtractionTime)} & ${latexPercentage(
    medianCodexQueryTime
  )} & ${formatTime(medianTotalTime)} & ${formatTime(
    medianAvgTimePerMethod
  )}\\\\ \n`;

  latexTable += String.raw`  \bottomrule
  \end{tabular}
}
\vspace{-0.4cm}
\end{table*}
`;

  fs.writeFile(outputFile, latexTable, (err) => {
    if (err) {
      console.error(err);
    }
  });
}

function generatePackageStatsTable(packageStats, outputFile) {
  let latexTable = String.raw`%WARNING: this is an auto-generated table. Do not directly edit. Please edit scripts/generate_latex_tables.js as needed
\begin{table*}[t!]
\centering
\caption{Overview of npm packages used for evaluation, ordered by descending popularity in terms of downloads/wk. The top 10 packages correspond to the Nessie benchmark, the next 10 are additional GitHub-hosted packages we include, while the last 5 are GitLab-hosted packages.}
\label{tab:packages}
\resizebox{0.8\textwidth}{!}{
  \begin{tabular}{@{}llrrrrrrr@{}}
  \toprule                                                                                                                            
  \multirow{2}{*}{\textbf{Package}}  & 
  \multirow{2}{*}{\textbf{Domain}} & 
  \multirow{2}{*}{\textbf{LOC}} & 
  \multirow{2}{*}{\thead{\textbf{Existing}\\ \textbf{Tests}}} &
  \multirow{2}{*}{\thead{\textbf{Weekly}\\ \textbf{Downloads}}} & 
  \multicolumn{3}{c}{\textbf{API functions}} & 
  \multirow{2}{*}{\thead{\textbf{Total}\\ \textbf{Examples}}}\\ 
  \cmidrule{6-8}
  &&&&& \textbf{\#} & \textbf{\# (\%) w/ examples} & \textbf{\# (\%) w/ comment}\\                                                                                                                                                                                                                                                 
  \midrule
 `;

  for (const pkg of Object.keys(domainMap)) {
    if (packageStats[pkg] === undefined) {
      console.log(`Skipping ${pkg} from stats table`);
      continue;
    }
    const {
      proj,
      repo,
      sha,
      loc,
      numExistingTests,
      weeklyDownloads,
      stmtCoverageFromLoading,
      branchCoverageFromLoading,
      nrUniqueSnippets,
      numFunctionsWithExamples,
      numFunctionsWithDocComments,
      numFunctions,
    } = packageStats[pkg];
    latexTable += `${formatRepoUrl(proj, repo, sha)} & 
    ${domainMap[pkg]} & 
    ${formatter.format(loc)} & 
    ${numExistingTests} &
    ${formatter.format(weeklyDownloads)} & 
    ${numFunctions} & 
    ${formatNum(numFunctionsWithExamples, numFunctions, true)} & 
    ${formatNum(numFunctionsWithDocComments, numFunctions, true)} & 
    ${nrUniqueSnippets}\\\\ \n`;
    if (separatorProjects.includes(proj)) latexTable += `\\midrule \n`;
  }

  latexTable += String.raw`\bottomrule
  \end{tabular}
}
\vspace{-0.4cm}
\end{table*}`;

  fs.writeFile(outputFile, latexTable, (err) => {
    if (err) {
      console.error(err);
    }
  });
}

function generateGeneralCoverageTable(coverageStats, packageStats, outputFile, model) {
  const safePackageStats = packageStats ?? {};
  const minedPackages = getOrderedMinedPackages(coverageStats);

  let latexTable = String.raw`
  %WARNING: this is an auto-generated table. Do not directly edit. Please edit scripts/generate_latex_tables.js as needed
  \begin{table*}[t!]
  \centering
  \caption{Statement and branch coverage for \testpilot's passing tests, generated using ${"\\" + model}. We also show passing tests that uniquely cover a statement. The last two columns show Nessie's statement and branch coverage for each package. Note that Nessie generates 1000 tests per package and the reported coverage is for all generated tests.}
  \label{tab:general-coverage}
  \resizebox{0.95\textwidth}{!}{
    \begin{tabular}{lrrrrrrrrr}
    \toprule
    \multirow{2}{*}{\textbf{Project}} & 
    \multicolumn{2}{c}{\textbf{Loading Coverage}} &
    \multicolumn{5}{c}{\textbf{\testpilot}} & 
    \multicolumn{2}{c}{\textbf{Nessie 1000 Tests}}\\
    \cmidrule(lr){2-3}\cmidrule(lr){4-8}\cmidrule(lr){9-10}
    & 
    \textbf{Stmt Cov} & \textbf{Branch Cov} &
    \textbf{Total Tests} & \textbf{Passing Tests (\%)} & \textbf{Stmt Cov} & \textbf{Branch Cov} & \textbf{Uniquely Contr. (\%)} &
    \textbf{ Stmt Cov }& \textbf{Branch Cov} \\ 
      \midrule
`;

  for (const pkg of minedPackages) {
    const pkgCoverageStats = coverageStats[pkg];
    if (pkgCoverageStats === undefined) {
      continue;
    }
    const { proj, numTests, numPassing, stmtCoverage, branchCoverage, numUniquelyCoveringTests } =
      pkgCoverageStats;
    
    const nessieStmtCov = nessieCoverageValues[pkg]?.[0];
    const nessieBranchCov = nessieCoverageValues[pkg]?.[1];
    const stmtCoverageFromLoading = safePackageStats[pkg]?.stmtCoverageFromLoading;
    const branchCoverageFromLoading = safePackageStats[pkg]?.branchCoverageFromLoading;

    latexTable += `
    ${proj} 
    & ${latexPercentage(stmtCoverageFromLoading)}
    & ${latexPercentage(branchCoverageFromLoading)}
    & ${Math.ceil(numTests)} 
    & ${formatNum(numPassing, numTests,true)} 
    & ${formatComparedPerc(stmtCoverage, nessieStmtCov)} 
    & ${formatComparedPerc(branchCoverage, nessieBranchCov)} 
    & ${formatNum(numUniquelyCoveringTests,numPassing,true)}
    & ${formatComparedPerc(nessieStmtCov, stmtCoverage)}
    & ${formatComparedPerc(nessieBranchCov, branchCoverage)} \\\\ \n`;
    if (separatorProjects.includes(proj)) latexTable += `\\midrule \n`;
  }

  latexTable += `\\midrule \n`;

  const medianStmtCoverageFromLoading = safeMedian(
    Object.values(safePackageStats).map((pkg) => pkg.stmtCoverageFromLoading)
  );

  const medianBranchCoverageFromLoading = safeMedian(
    Object.values(safePackageStats).map((pkg) => pkg.branchCoverageFromLoading)
  );
  
  const medianPercentPassingTests = safeMedian(
    Object.values(coverageStats).map(
      (pkg) => safeRatioPercent(pkg.numPassing, pkg.numTests)
    )
  );

  const medianStmtCoverage = safeMedian(
    Object.values(coverageStats).map((pkg) => pkg.stmtCoverage)
  );

  const medianBranchCoverage = safeMedian(
    Object.values(coverageStats).map((pkg) => pkg.branchCoverage)
  );

  const medianUniquelyContr = safeMedian(
    Object.values(coverageStats).map(
      (pkg) => safeRatioPercent(pkg.numUniquelyCoveringTests, pkg.numPassing)
    )
  );

  const medianNessieStmtCov = safeMedian(
    Object.values(nessieCoverageValues).map((pkg) => pkg[0]).filter((cov) => !isNaN(cov))
  );

  const medianNessieBranchCov = safeMedian(
    Object.values(nessieCoverageValues).map((pkg) => pkg[1]).filter((cov) => !isNaN(cov))
  );

  latexTable += `\\textbf{Median} 
  & ${latexPercentage(medianStmtCoverageFromLoading)}
  & ${latexPercentage(medianBranchCoverageFromLoading)}
  &
  & ${latexPercentage(medianPercentPassingTests)} 
  & ${formatComparedPerc(medianStmtCoverage, medianNessieStmtCov)} 
  & ${formatComparedPerc(medianBranchCoverage, medianNessieBranchCov)} 
  & ${latexPercentage(medianUniquelyContr)}  
  & ${formatComparedPerc(medianNessieStmtCov, medianStmtCoverage)}
  & ${formatComparedPerc(medianNessieBranchCov, medianBranchCoverage)} \\\\ \n`;

  latexTable += String.raw`\bottomrule
\end{tabular}
}
\vspace{-0.5cm}
\end{table*}`;

  fs.writeFile(outputFile, latexTable, (err) => {
    if (err) {
      console.error(err);
    }
  });
}

function generateNonTrivialCoverageTable(coverageStats, outputFile, model) {
  const minedPackages = getOrderedMinedPackages(coverageStats);
  let latexTable = String.raw`
  %WARNING: this is an auto-generated table. Do not directly edit. Please edit scripts/generate_latex_tables.js as needed
  \begin{table}[t!]
  \centering
  \caption{Number (\%) of \textbf{\textit{non-trivial}} \testpilot tests generated using ${"\\" + model} and the resulting statement coverage from the passing non-trivial tests.}
  \label{tab:nontrivial-coverage}
  \resizebox{0.9\columnwidth}{!}{
  \begin{tabular}{lrrr}
  \toprule
  \multirow{2}{*}{\textbf{Project}} & \multirow{2}{*}{\textbf{\thead{Non-trivial \\Tests (\%)}}} & 
  \multicolumn{2}{c}{\textbf{Passing Non-trivial Tests}} \\
  \cmidrule{3-4}
  & & \textbf{Tests (\%)} & \textbf{Stmt Cov} \\ 
      \midrule
`;

  for (const pkg of minedPackages) {
    const pkgCoverageStats = coverageStats[pkg];
    if (pkgCoverageStats === undefined) {
      continue;
    }

    const {
      proj,
      numTests,
      nonTrivialTests,
      nonTrivialPassing,
      nonTrivialCoverage,
    } = pkgCoverageStats;

    latexTable += `${proj} & ${formatNum(
      nonTrivialTests,
      numTests,
      true
    )} & ${formatNum(
      nonTrivialPassing,
      nonTrivialTests,
      true
    )} & ${latexPercentage(nonTrivialCoverage)} \\\\ \n`;
    if (separatorProjects.includes(proj)) latexTable += `\\midrule \n`;
  }

  latexTable += `\\midrule \n`;

  const medianPercenNonTrivialTests = safeMedian(
    Object.values(coverageStats).map(
      (pkg) => safeRatioPercent(pkg.nonTrivialTests, pkg.numTests)
    )
  );
  const medianPercentNonTrivialPassing = safeMedian(
    Object.values(coverageStats).map(
      (pkg) => safeRatioPercent(pkg.nonTrivialPassing, pkg.nonTrivialTests)
    )
  );
  const medianNonTrivialCoverage = safeMedian(
    Object.values(coverageStats).map((pkg) => pkg.nonTrivialCoverage)
  );

  latexTable += `\\textbf{Median} & ${latexPercentage(
    medianPercenNonTrivialTests
  )} & ${latexPercentage(medianPercentNonTrivialPassing)} & ${latexPercentage(
    medianNonTrivialCoverage
  )} \\\\ \n`;

  latexTable += String.raw`\bottomrule
\end{tabular}
}
\vspace{-0.6cm}
\end{table}`;

  fs.writeFile(outputFile, latexTable, (err) => {
    if (err) {
      console.error(err);
    }
  });
}

function generateTestFailureTable(failureStats, outputFile, model) {
  let latexTable = String.raw`%WARNING: this is an auto-generated table. Do not directly edit. Please edit scripts/generate_latex_tables.js as needed
  \begin{table*}[t!]
    \centering
    \caption{Types of errors in the failed tests generated by \testpilot using ${"\\" + model}.}
    \label{tab:failure-reasons}
    \resizebox{0.6\textwidth}{!}{
    \begin{tabular}{lrrrrrr}
    \toprule
    \multirow{2}{*}{\textbf{\thead{Project}}}&\
    \multirow{2}{*}{\textbf{\thead{Failed\\Tests}}}&
    \multirow{2}{*}{\textbf{\thead{Assertion\\Errors}}}&
    \multirow{2}{*}{\textbf{\thead{FileSys\\Errors}}}&
    \multirow{2}{*}{\textbf{\thead{Correctness\\Errors}}} &
    \multirow{2}{*}{\textbf{\thead{Timeout\\Errors}}}&
    \multirow{2}{*}{\textbf{\thead{Other}}}\\
    &&&&&&\\
    \midrule
`;
  for (const pkg of Object.keys(domainMap)) {
    if (failureStats[pkg] === undefined) {
      console.log(`Skipping ${pkg} in failure table`);
      continue;
    }

    const {
      proj,
      numFailing,
      numAssertionErrors,
      numFileSysErrors,
      numCorrectnessErrors,
      numTimeoutErrors,
      numOther,
    } = failureStats[pkg];

    latexTable += `${proj} & ${Math.ceil(numFailing)} & ${formatNum(
      numAssertionErrors,
      numFailing,
      true
    )} & ${formatNum(numFileSysErrors, numFailing, true)} & ${formatNum(
      numCorrectnessErrors,
      numFailing,
      true
    )} & ${formatNum(numTimeoutErrors, numFailing, true)} & ${formatNum(
      numOther,
      numFailing,
      true
    )}\\\\ \n`;

    if (separatorProjects.includes(proj)) latexTable += `\\midrule \n`;
  }

  latexTable += `\\midrule \n`;

  const medianPercentAssertionErrors = median(
    Object.values(failureStats).map(
      (pkg) => (pkg.numAssertionErrors / pkg.numFailing) * 100
    )
  );
  const medianPercenteFileSysErrors = median(
    Object.values(failureStats).map(
      (pkg) => (pkg.numFileSysErrors / pkg.numFailing) * 100
    )
  );
  const medianPercentCorrectnessErrors = median(
    Object.values(failureStats).map(
      (pkg) => (pkg.numCorrectnessErrors / pkg.numFailing) * 100
    )
  );
  const medianPercentTimeoutErrors = median(
    Object.values(failureStats).map(
      (pkg) => (pkg.numTimeoutErrors / pkg.numFailing) * 100
    )
  );
  const medianPercentOtherErrors = median(
    Object.values(failureStats).map(
      (pkg) => (pkg.numOther / pkg.numFailing) * 100
    )
  );

  latexTable += `\\textbf{Median} & & ${latexPercentage(
    medianPercentAssertionErrors
  )} & ${latexPercentage(medianPercenteFileSysErrors)} & ${latexPercentage(
    medianPercentCorrectnessErrors
  )} & ${latexPercentage(medianPercentTimeoutErrors)} & ${latexPercentage(
    medianPercentOtherErrors
  )} \\\\ \n`;

  latexTable += String.raw`\bottomrule
\end{tabular}
}
\end{table*}`;

  fs.writeFile(outputFile, latexTable, (err) => {
    if (err) {
      console.error(err);
    }
  });
}

function getOutlierProjects(valueMap){
  // get outliers based on interquartile range
  const orderedValues = Object.values(valueMap).sort(function (a, b) {
    return b - a;
  }
  );
  const q1 = orderedValues[Math.floor(orderedValues.length / 4)];
  const q3 = orderedValues[Math.floor((orderedValues.length * 3) / 4)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outliers = Object.keys(valueMap).filter(
    (key) => valueMap[key] < lowerBound || valueMap[key] > upperBound
  );
  return outliers;
}


if (process.argv.length !== 5) {
  console.error(
    "Usage: node generate_latex_tables.js <multiple_artefact_dir> <output_tables_dir> <model>"
  );
  process.exit(1);
}

const multipleArtefactDir = process.argv[2];
const tablesDir = process.argv[3];
const model = process.argv[4];
const path = require("path");

if (!fs.existsSync(multipleArtefactDir)) {
  console.error(`ERROR: Input directory '${multipleArtefactDir}' does not exist.`);
  process.exit(1);
}

fs.mkdirSync(tablesDir, { recursive: true });
const resolvedArtefactDir = path.isAbsolute(multipleArtefactDir)
  ? multipleArtefactDir
  : path.join(__dirname, multipleArtefactDir);
const sanitizedArtefactDir = createSanitizedArtefactDir(resolvedArtefactDir, model);

const {
  medianCoverageStats,
  allPackageStats,
} = calculateReportMedians(sanitizedArtefactDir);

generateGeneralCoverageTable(
  medianCoverageStats,
  allPackageStats,
  `${tablesDir}/tab-${model}-general-coverage.tex`,
  model
);
generateNonTrivialCoverageTable(
  medianCoverageStats,
  `${tablesDir}/tab-${model}-nontrivial-coverage.tex`,
  model
);

// generatePackageStatsTable(allPackageStats, `${tablesDir}/tab-${model}-packages.tex`);
// generateTestFailureTable(
//   medianFailureStats,
//   `${tablesDir}/tab-${model}-failed-reasons.tex`,
//   model
// );
// generatePerformanceTable(
//   medianPerformanceStats,
//   `${tablesDir}/tab-${model}-performance.tex`
// );
