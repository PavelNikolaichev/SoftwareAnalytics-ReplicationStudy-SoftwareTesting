const { parseReports } = require("./parse_reports");
const { getCoveredStmtsForFile, createUniqueStmtId } = require("./testCollectorHelper");

const fs = require("fs");
const path = require("path");



//keys in map follow the same order we want to display them in tables in the paper
const domainMap = {
  glob: "file system",
  "fs-extra": "file system",
  "graceful-fs": "file system",
  jsonfile: "file system",
  bluebird: "promises",
  q: "promises",
  rsvp: "promises",
  memfs: "file system",
  "node-dir": "file system",
  "zip-a-folder": "file system",
  "js-sdsl": "data structures",
  "quill-delta": "document changes",
  "complex.js": "numbers/arithmetic",
  "pull-stream": "streams",
  "countries-and-timezones": "date \\& timezones",
  "simple-statistics": "statistics",
  plural: "text processing",
  dirty: "key-value store",
  "geo-point": "geographical coordinates",
  uneval: "serialization",
  "image-downloader": "image handling",
  "crawler-url-parser": "URL parser",
  "gitlab-js": "API wrapper",
  core: "access control",
  omnitool: "utility library"
};

// from Nessie's re-run 
// first cov is statement coverage, second is branch coverage
const nessieCoverageValues = {
    glob: [39.72, 14.75],
    "fs-extra": [37.98, 24.91],
    "graceful-fs": [49.77, 34.92],
    jsonfile: [91.49, 80.95],
    bluebird: [43.77, 24.64],
    q: [66.80, 54.38],
    rsvp: [52.81, 46.97],
    memfs: [64.58, 36.2],
    "node-dir": [65.40, 54.3],
    "zip-a-folder": [88.00, 100],
    "js-sdsl": [8.47, 4.85],
    "quill-delta": [9.57, 2.52],
    "complex.js": [8.63, 5.44],
    "pull-stream": [38.48, 23.81],
    "countries-and-timezones": [96.04, 80.85],
    "simple-statistics": [57.84,66],
    plural: [59.23, 9.09],
    dirty: [4.72, 0],
    "geo-point": [13.25, 0],
    uneval: NaN,
    "image-downloader": [30.30, 22.2],
    "crawler-url-parser": [73.87, 64.10],
    "gitlab-js": [55.29, 26.39],
    core: [18.88,0],
    omnitool: [56.01, 28.29]
  }


  function formatTime(time, totalTime, showPercentages = false) {
    if (totalTime == 0) return "--";
  
    let showMilliseconds = true;
  
    //show milliseconds only if time is less than 1 second
    if (time >= 1000) {
      showMilliseconds = false;
    }
  
    const date = new Date(Date.UTC(0, 0, 0, 0, 0, 0, time));
    let formattedTime = "";
  
    if (date.getUTCHours() > 0) {
      formattedTime += `${date.getUTCHours()}h `;
    }
  
    if (date.getUTCMinutes() > 0) {
      formattedTime += `${date.getUTCMinutes()}m `;
    }
  
    if (date.getUTCSeconds() > 0) {
      formattedTime += `${date.getUTCSeconds()}s `;
    }
  
    if (showMilliseconds && date.getUTCMilliseconds() > 0) {
      formattedTime += `${date.getUTCMilliseconds()}ms `;
    }
  
    if (showPercentages)
      return `${formattedTime.trim()} (${latexPercentage(
        (time / totalTime) * 100
      )})`;
    else return `${formattedTime.trim()}`;
  }

function compareArrays(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/***
 * Formats given number as a percentage while escaping the % sign
 */
function latexPercentage(p) {
  if (p === undefined)
    return "--";
  if (typeof p === "number") {
    if (isNaN(p)) 
      return "--";
    else
      return `${p.toFixed(1)}\\%`;
  } else {
    return p;
  }
}

/***
 * Formats given perc1 as a percentage while escaping the % sign
 * and highlights it in bold if it is greater than perc2
 */
function formatComparedPerc(perc1, perc2) {
  if (perc1 > perc2) {
    return `\\textbf{${latexPercentage(perc1)}}`;
  } else {
    return latexPercentage(perc1);
  }
}

function formatComparedThreePerc(perc1, perc2, perc3) {
  const percentages = [perc1, perc2, perc3];
  const max = Math.max(...percentages);

  if (perc1 == max){
    return `\\textbf{${latexPercentage(perc1)}}`;
  }else {
    return latexPercentage(perc1);
  }
}

function formatNum(number, denominator, showPercentages = true) {
  if (denominator == 0) return "--";
  if (showPercentages)
    return `${Math.ceil(number)} (${latexPercentage(
      (number / denominator) * 100
    )})`;
  else return `${Math.ceil(number)}`;
}

//https://stackoverflow.com/a/53660837, CC BY-SA 4.0
function median(numbers) {
    const sorted = Array.from(numbers).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
  
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
  
    return sorted[middle];
  }

/***
 * Given a directory that contains 1 or more artefact folders (corresponding to 1 or more runs),
 * calculate the median of all statistics across all runs. This function returns four objects that can directly be used
 * to generate the tables in the paper.
 * 1. coverageStats: a map from package name to an object containing the median coverage statistics across all runs
 * 2. failureStats: a map from package name to an object containing the median failure statistics across all runs
 * 3. medianPerformanceStats: a map from package name to an object containing the median performance statistics across all runs
 * 4. allPackageStats: a map from package name to an array of objects containing the descriptive statistics of the packages, taken from the first run
 */
function calculateReportMedians(baseDir) {
  const allCoverageStats = {};
  const allFailureStats = {};
  const allPerformanceStats = {};
  let allPackageStats = {};
  let firstRun = true;

  for (const run of fs.readdirSync(baseDir)) {
    if (run.startsWith(".")) continue;

    const runDir = path.join(baseDir, run);

    const { coverageStats, failureStats, performanceStats, packageStats } =
      parseReports(runDir, true);

    for (const pkg in coverageStats) {
      if (firstRun) {
        allCoverageStats[pkg] = {};
        allFailureStats[pkg] = {};
        allPerformanceStats[pkg] = {};
      }

      allCoverageStats[pkg][run] = coverageStats[pkg];
      allFailureStats[pkg][run] = failureStats[pkg];
      allPerformanceStats[pkg][run] = performanceStats[pkg];
    }

    if (firstRun) {
      allPackageStats = packageStats;
      firstRun = false;
    }
  }

  const medianCoverageStats = {};
  const medianFailureStats = {};
  const medianPerformanceStats = {};

  for (const pkg of Object.keys(domainMap)) {
    const coverageStats = allCoverageStats[pkg];
    const failureStats = allFailureStats[pkg];
    const performanceStats = allPerformanceStats[pkg];
    var proj = "UNKNOWN";
    var nrUniqueSnippets = -1;

    if (coverageStats !== undefined) {
      // start with properties that don't change between runs
      proj = Object.values(coverageStats)[0].proj;
      nrUniqueSnippets = Object.values(coverageStats)[0].nrUniqueSnippets;
      medianCoverageStats[pkg] = { proj, nrUniqueSnippets };

      // take the median of all the others
      for (const stat of [
        "numTests",
        "numPassing",
        "stmtCoverage",
        "branchCoverage",
        "nonTrivialTests",
        "nonTrivialPassing",
        "nonTrivialCoverage",
        "numUniquelyCoveringTests",
      ]) {
        medianCoverageStats[pkg][stat] = median(
          Object.values(coverageStats).map((stats) => stats[stat])
        );
      }
    } else {
      console.log(`Skipping ${pkg} in coverage table`);
    }

    if (failureStats !== undefined) {
      medianFailureStats[pkg] = { proj };
      for (const stat of [
        "numFailing",
        "numAssertionErrors",
        "numFileSysErrors",
        "numCorrectnessErrors",
        "numTimeoutErrors",
        "numOther",
      ]) {
        medianFailureStats[pkg][stat] = median(
          Object.values(failureStats).map((stats) => stats[stat])
        );
      }
    } else {
      console.log(`Skipping ${pkg} in failure table`);
    }

    if (performanceStats !== undefined) {
      medianPerformanceStats[pkg] = { proj };
      for (const stat of [
        "apiExplorationTime",
        "docCommentExtractionTime",
        "codexQueryTime",
        "snippetExtractionTime",
        "totalTime",
        "numFunctions",
      ]) {
        medianPerformanceStats[pkg][stat] = median(
          Object.values(performanceStats).map((stats) => stats[stat])
        );
      }
    }
  }

  return {
    medianCoverageStats,
    medianFailureStats,
    medianPerformanceStats,
    allPackageStats,
  };
}

/**
 * Given a function location, finds all statements that belong to this function
 * @param filePath
 * @param fnStart
 * @param fnEnd
 * @param statementMap
 * @returns list of statements belonging to the function in the format filePath@startLine:startColumn-endLine:endColumn
 */
function findFunctionStatements(
  relpath,
  fnStart,
  fnEnd,
  statementMap
) {
  const fnStatements = [];

  for (const stmt of Object.values(statementMap)) {
    //ignoring columns for now
    if (stmt.start.line >= fnStart.line && stmt.end.line <= fnEnd.line) {
      fnStatements.push(
        createUniqueStmtId(
          relpath,
          stmt.start.line,
          stmt.start.column,
          stmt.end.line,
          stmt.end.column
        )
      );
    }
  }
  return fnStatements;
}

/**
 * Creates a map from function unique names to function locations for a given file, to be used later for calculating function coverage
 * @param fileInfo
 * @param relpath
 * @returns FunctionLocInfo
 */
function getFnInfoForFile(fileInfo, relpath) {
  const fnInfo = {};

  Object.values(fileInfo.fnMap).forEach((fn) => {
    const fnName = fn.name;
    const fnStart = fn.loc.start;
    const fnEnd = fn.loc.end;
    const fnStatements = findFunctionStatements(
      relpath,
      fnStart,
      fnEnd,
      fileInfo.statementMap
    );
    const key = `${relpath}@${fnName}`;

    fnInfo[key] = {
      file: relpath,
      functionName: fnName,
      statements: fnStatements,
      startLoc: fnStart,
      endLoc: fnEnd,
    };
  });

  return fnInfo;
}

/**
 * Parses the raw coverage data of all generated tests and returns a set of all covered statements and a map from function unique names to function locations
 * @param {string} projDir
 * @returns {allCoveredStmts, FunctionLocInfo}
 */
function parseRawIstanbulReports(packageName, projDir) {
  const fnInfo = {};
  const allCoveredStmts = new Set();

  const covDataDir = path.join(projDir, "coverageData");

  for (const test of fs.readdirSync(covDataDir)) {
    if (test.startsWith(".")) continue;
    const testDir = path.join(covDataDir, test);

    for (const testReport of fs.readdirSync(testDir)) {
      const reportPath = path.join(testDir, testReport);
      const coverageReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));

      for (const file of Object.keys(coverageReport)) {
        
        // these files contain test functions and should be skipped in cov calculations
        if (file.endsWith(".spec.ts") || file.endsWith(".spec.js")) continue;

        // get path relative to project root
        const relpath = file.substring(file.indexOf(packageName) + packageName.length + 1);

        getCoveredStmtsForFile(coverageReport[file], relpath).forEach(
          (stmt) => {
            allCoveredStmts.add(stmt);
          }
        );

        const functionsInfFile = getFnInfoForFile(
          coverageReport[file],
          relpath
        );

        for (const [fnUniqueId, fn] of Object.entries(functionsInfFile)) {
          if (fnInfo[fnUniqueId] !== undefined) {
            const existingEntry = fnInfo[fnUniqueId];
            if (!compareArrays(existingEntry.statements, fn.statements)) {
              console.log(
                `WARNING: found same function ${fnUniqueId} but with diff statements.. skipping`
              );
            }
          } else {
            fnInfo[fnUniqueId] = { ...fn };
          }
        }
      }
    }
  }

  return [allCoveredStmts, fnInfo];
}

/**
 * Calculate covered statements from a function. This function first determines which of the set of all covered statements
 * belong to the function and then calculates the coverage as the ratio of covered statements to total statements in the function
 * @param functionStatements
 * @param coveredStatements
 * @returns [coverage, coveredStatements]
 */
function getFunctionCoverage(
  functionStatements,
  coveredStatements
) {
  const covStmtsFromFn = coveredStatements.filter((stmt) =>
    functionStatements.includes(stmt)
  );
  const numCovered = covStmtsFromFn.length;
  
  return [numCovered / functionStatements.length, covStmtsFromFn];
}

/**
 * this function calculates the coverage stats for each function in the project, based on istanbul function
 * names in the individual test reports
 * @param packageName name of the project
 * @param projDir directory where the project results are
 * @param covData the json data from report.json
 * @returns
 */
function getFnCovStatsForPkg(packageName, projDir) {
  const functionStats = {};

  const [allCoveredStmts, functionsInfo] = parseRawIstanbulReports(
    packageName,
    projDir
  );

  for (const [fnName, fnInfo] of Object.entries(functionsInfo)) {
    const [coverage, fnCoveredStmts] = getFunctionCoverage(
      fnInfo.statements,
      Array.from(allCoveredStmts)
    );

    functionStats[fnName] = {
      coveredStmts: fnCoveredStmts,
      fnLoc: functionsInfo[fnName],
      numTests: -1,
      numPassing: -1,
      coverage: coverage,
      nonTrivialTests: 0,
      nonTrivialPassing: 0,
      nonTrivialCoverage: 0,
      numUniquelyCoveringTests: null,
    };
  }

  return functionStats;
}




function calculateFnCovStats(multipleArtefactDir, force = false){

  for (const runDir of fs.readdirSync(multipleArtefactDir)) {
    if (runDir.startsWith(".")) continue;
    const runDirPath = path.join(multipleArtefactDir, runDir);
    for (const proj of fs.readdirSync(runDirPath)) {
      if (proj.startsWith(".")) continue;
      const projDir = path.join(runDirPath, proj);
      const reportFile = path.join(projDir, "report.json");
      const funcCovReport = path.join(projDir, "detailedFnStats.json");

      if (!force && fs.existsSync(funcCovReport)) {
        console.log(`INFO: Skipping re-calculation of function stats for ${projDir} because ${funcCovReport} already exists`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(reportFile, "utf8"));

      var packageName = data.metaData.packageName;

      //special handling of gitlab-js
      if (packageName !== undefined && packageName.includes("/")) {
        const parts = packageName.split("/");
        packageName = parts[1];
      }

      const fnCovStats = getFnCovStatsForPkg(packageName, projDir);

      fs.writeFileSync(
        funcCovReport,
        JSON.stringify(fnCovStats, null, 2)
      );
    }
  }
}


module.exports = { calculateReportMedians, nessieCoverageValues, domainMap, formatNum, formatComparedPerc, formatComparedThreePerc, latexPercentage, median, calculateFnCovStats, formatTime};