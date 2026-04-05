#! /usr/bin/env node
const { calculateReportMedians, nessieCoverageValues, domainMap, formatTime, latexPercentage, median, calculateFnCovStats } = require("./utils")

const fs = require("fs");
const path = require("path");

const gitlabProj = Object.keys(domainMap).slice(-5);

const macroMap = {};

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


function writeMacros(output_file, model) {
    if (fs.existsSync(output_file)) {
      fs.truncateSync(output_file);
    }
  
    for (const key of Object.keys(macroMap)) {
      let value = "";
  
      if (key.startsWith("num")) {
        value = macroMap[key];
      } else if (
        key.includes("Time") &&
        !(key.includes("Error") || key.includes("Percent"))
      ) {
        value = formatTime(macroMap[key]);
      } else {
        value = latexPercentage(macroMap[key]);
      }
  
      fs.appendFileSync(
        output_file,
        `\\newcommand{\\${model}${key}}{${value}\\xspace}\n`
      );
    }
  }
  
  /**
   * Saves the min, max, and median values of the given array into the macros map
   * @param stats array of numbers to calculate the min, max, and median for
   * @param key name of key to use in latex (will be pre-pended with "min", "max", or "median")
   */
  function createMinMaxMedianMacros(stats, key) {
    //some percentage stats have NaN values, so we need to filter them out
    //first for min/max calculation and median calculations
    const orderedStats = stats.filter((stat) => typeof stat === "number" && Number.isFinite(stat)).sort(function (a, b) {
      return b - a;
    });

    if (orderedStats.length === 0) {
      macroMap[`min${key}`] = undefined;
      macroMap[`max${key}`] = undefined;
      macroMap[`median${key}`] = undefined;
      macroMap[`secondTop${key}`] = undefined;
      macroMap[`secondMin${key}`] = undefined;
      return;
    }

    if (orderedStats.length === 1) {
      macroMap[`min${key}`] = orderedStats[0];
      macroMap[`max${key}`] = orderedStats[0];
      macroMap[`median${key}`] = orderedStats[0];
      macroMap[`secondTop${key}`] = orderedStats[0];
      macroMap[`secondMin${key}`] = orderedStats[0];
      return;
    }
  
    macroMap[`min${key}`] = orderedStats[orderedStats.length - 1];
    macroMap[`max${key}`] = orderedStats[0];
  
    macroMap[`median${key}`] = median(orderedStats);
    macroMap[`secondTop${key}`] = orderedStats[1];
    macroMap[`secondMin${key}`] = orderedStats[orderedStats.length - 2];
  }
  
  /**
   * Maps the given metricName in the provided stats to its corresponding percentage w.r.t the indicated denominator metric
   */
  function getPercentageArray(stats, metricName, denominator) {
    return Object.values(stats).map(
      (pkg) => safeRatioPercent(pkg[metricName], pkg[denominator])
    );
  }
  
  function compareNessieCoverage(coverageStats){
    const covTypes = ["stmtCoverage", "branchCoverage"];
  
    //write num projects where nessie branch cov is 0
    const numNessieZeroBranchCov = Object.values(nessieCoverageValues).filter((cov) => cov[1] == 0).length;
    const nessieZeroBranchCovProjs = Object.keys(nessieCoverageValues).filter((pkg) => nessieCoverageValues[pkg][1] == 0).join(', ');
    macroMap[`numNessieZeroBranchCov`] = numNessieZeroBranchCov;
    macroMap[`NessieZeroBranchCovProjs`] = nessieZeroBranchCovProjs;
  
    for( const [index, covType] of covTypes.entries()){
      createMinMaxMedianMacros(Object.values(nessieCoverageValues).map((entry) => entry[index]), 'Nessie' + covType);
  
      const projTestPilotHigherThanNessie = {}
      const projTestPilotLowerThanNessie = {}
      const projTestPilotSameAsNessie = {}
    
      // fill nessieDiffCoverageMap with difference in coverage between TestPilot and Nessie
      // a positive diff means TestPilot achieves higher coverage than Nessie; negative is the opposite
      for (const pkg of Object.keys(coverageStats)) {
        const nessieValue = nessieCoverageValues[pkg]?.[index];
        if (typeof nessieValue !== "number" || !Number.isFinite(nessieValue)) {
          continue;
        }
        const diff = coverageStats[pkg][covType] - nessieValue;
        if (diff > 0) {
          projTestPilotHigherThanNessie[pkg] = diff;
        } else if (diff < 0) {
          projTestPilotLowerThanNessie[pkg] = Math.abs(diff);
        } else if (diff == 0) {
          projTestPilotSameAsNessie[pkg] = diff;
        } else {
          console.log(`WARNING: ${pkg} has a ${covType} diff of ${diff} with Nessie`)
        }
      }
    
      // get info about projects where TestPilot achieves higher coverage than Nessie
      macroMap[`numProjTestPilotHigherThanNessie${covType}`] = Object.keys(projTestPilotHigherThanNessie).length;
      macroMap[`projsTestPilotHigherThanNessie${covType}`] = Object.keys(projTestPilotHigherThanNessie).join(', ');
      createMinMaxMedianMacros(Object.values(projTestPilotHigherThanNessie), `tpVsNessieHigher${covType}Diff`);
  
      // get info about projects where TestPilot achieves lower coverage than Nessie
      macroMap[`numProjTestPilotLowerThanNessie${covType}`] = Object.keys(projTestPilotLowerThanNessie).length;
      macroMap[`projsTestPilotLowerThanNessie${covType}`] = Object.keys(projTestPilotLowerThanNessie).join(', ');
      createMinMaxMedianMacros(Object.values(projTestPilotLowerThanNessie), `tpVsNessieLower${covType}Diff`);
  
      // get info about projects where TestPilot achieves the same coverage as Nessie
      macroMap[`numProjTestPilotSameAsNessie${covType}`] = Object.keys(projTestPilotSameAsNessie).length;
      macroMap[`projsTestPilotSameAsNessie${covType}`] = Object.keys(projTestPilotSameAsNessie).join(', ');
    }
  }

  /**
 * Populates the macros map with the values used in the paper
 */
function generateLatexMacros(
    allPackageStats,
    coverageStats,
    failureStats,
    performanceStats,
    outputFile,
    model
  ) {
    // package stats
    const numPackages = Object.keys(allPackageStats).length;
    macroMap["numPackages"] = numPackages;
  
    const packagesWithDocComments = Object.values(allPackageStats).filter(
      (pkg) => pkg.numFunctionsWithDocComments > 0
    );
    macroMap["numPackagesWithDocComments"] = packagesWithDocComments.length;
  
    const percentWithDocComments = getPercentageArray(
      packagesWithDocComments,
      "numFunctionsWithDocComments",
      "numFunctions"
    );
    createMinMaxMedianMacros(percentWithDocComments, "PercentWithDocComments");
  
    // get total api functions
    const totalApiFunctions = Object.values(allPackageStats).reduce(
      (sum, pkg) => sum + pkg.numFunctions,
      0
    );
  
    macroMap["numTotalApiFunctions"] = totalApiFunctions.toLocaleString();
  
    // Coverage stats numbers used in RQ1
    for (const metric of ["stmtCoverage", "branchCoverage", "nonTrivialCoverage"]) {
      const stats = Object.values(coverageStats).map((pkg) => pkg[metric]);
  
      createMinMaxMedianMacros(stats, metric);
  
      const gitlabCoverageStats = 
        Object.values(coverageStats).filter((pkg) => gitlabProj.includes(pkg["proj"])).map((pkg) => pkg[metric]);
      
      createMinMaxMedianMacros(gitlabCoverageStats, 'GitLab' + metric);
    
    }
  
    compareNessieCoverage(coverageStats);
    
    macroMap["jssdslcoverage"] = coverageStats["js-sdsl"]?.stmtCoverage;
  
    const percentPassing = getPercentageArray(
      coverageStats,
      "numPassing",
      "numTests"
    );
    createMinMaxMedianMacros(percentPassing, "PercentPassing");
  
    const percentUniquelyCoverying = getPercentageArray(
      coverageStats,
      "numUniquelyCoveringTests",
      "numPassing"
    );
  
    createMinMaxMedianMacros(
      percentUniquelyCoverying,
      "PercentUniquelyCoveringTests"
    );
    macroMap["remainingNonUniqueTests"] =
      100 - macroMap["medianPercentUniquelyCoveringTests"];
  
    // Non-trivial coverage stats numbers used in RQ2
    const percentNonTrivialTests = getPercentageArray(
      coverageStats,
      "nonTrivialTests",
      "numTests"
    );
    const percentNonTrivialPassing = getPercentageArray(
      coverageStats,
      "nonTrivialPassing",
      "nonTrivialTests"
    );
    createMinMaxMedianMacros(percentNonTrivialTests, "PercentNonTrivialTests");
    createMinMaxMedianMacros(
      percentNonTrivialPassing,
      "PercentNonTrivialTestsPassing"
    );
  
    const diffAllVsNonTrivial = {};
    const pkgsWithHighNonTrivialDiff = []
    for (const pkg of Object.keys(coverageStats)) {
      const diff = coverageStats[pkg].stmtCoverage - coverageStats[pkg].nonTrivialCoverage;
      diffAllVsNonTrivial[pkg] = diff;
      if (diff > 50) {
        pkgsWithHighNonTrivialDiff.push(pkg)
      }
    }
  
    createMinMaxMedianMacros(Object.values(diffAllVsNonTrivial), "DiffAllVsNonTrivial");
    macroMap[`numPkgsWithHighNonTrivialDiff`] = pkgsWithHighNonTrivialDiff.length;
    macroMap[`pkgsWithHighNonTrivialDiff`] = pkgsWithHighNonTrivialDiff.join(', ');
  
    for (const outlierPkg of pkgsWithHighNonTrivialDiff) {
      console.log("outlierPkg: ", outlierPkg)
      const commandName = outlierPkg.replace(/-/g, "");
      macroMap[`${commandName}PercentNonTrivialTests`] =
      (coverageStats[outlierPkg].nonTrivialTests /
        coverageStats[outlierPkg].numTests) *
      100;
  
      macroMap[`${commandName}StmtCoverage`] = coverageStats[outlierPkg].stmtCoverage;
      macroMap[`${commandName}nonTrivialCoverage`] =
        coverageStats[outlierPkg].nonTrivialCoverage;
      macroMap[`${commandName}diffAllVsNonTrivial`] = diffAllVsNonTrivial[outlierPkg];
    }
  
    const pkgsWithZeroNonTrivialCoverage = Object.keys(coverageStats).filter((pkg) => coverageStats[pkg].nonTrivialCoverage == 0);
    macroMap[`numPkgsWithZeroNonTrivialCoverage`] = pkgsWithZeroNonTrivialCoverage.length;
    macroMap[`pkgsWithZeroNonTrivialCoverage`] = pkgsWithZeroNonTrivialCoverage.join(', ');
  
    
    // Performance stats numbers used in RQ3
    const codexQueryTimePercentage = getPercentageArray(
      performanceStats,
      "codexQueryTime",
      "totalTime"
    );
    const totalTime = Object.values(performanceStats).map((pkg) => pkg.totalTime);
    const avgTimePerMethod = Object.values(performanceStats).map(
      (pkg) => pkg.totalTime / pkg.numFunctions
    );
  
    createMinMaxMedianMacros(
      codexQueryTimePercentage,
      "CodexQueryTimePercentage"
    );
    createMinMaxMedianMacros(totalTime, "TotalTime", (time = true));
    createMinMaxMedianMacros(avgTimePerMethod, "AvgTimePerMethod");
  
    // Failure stats numbers used in RQ4
    for (const metric of [
      "numTimeoutErrors",
      "numAssertionErrors",
      "numCorrectnessErrors",
    ]) {
      const stats = getPercentageArray(failureStats, metric, "numFailing");
      createMinMaxMedianMacros(stats, metric.replace("num", "Percent"));
    }
  
    //Diff with loading coverage
  
    for (const metric of ["stmtCoverage","branchCoverage"]){
      const diffWithLoading = (
        Object.values(coverageStats).map(
          (pkg) => {
            const loadStats = allPackageStats[pkg.proj] ??
              Object.values(allPackageStats).find((entry) => entry.proj === pkg.proj);
            const loadingMetric = loadStats?.[`${metric}FromLoading`];
            if (typeof loadingMetric !== "number" || !Number.isFinite(loadingMetric)) {
              return undefined;
            }
            return pkg[metric] - loadingMetric;
          }
        )
      );
      createMinMaxMedianMacros(diffWithLoading, `diff${metric}WithLoading`);
    }
  
    writeMacros(outputFile, model);
  }

  if (process.argv.length < 5 || process.argv.length > 6) {
    console.error(
      "Usage: node generate_latex_table.js <multiple_artefact_dir> <output_macros_file> <model> [--recalcFnCov]"
    );
    process.exit(1);
  }
  
  if (process.argv.length === 6 && process.argv[5] !== '--recalcFnCov') {
    console.error(
      "Usage: node generate_latex_table.js <multiple_artefact_dir> <output_macros_file> <model> [--recalcFnCov]"
    );
    process.exit(1);
  }
  
  const multipleArtefactDir = process.argv[2];

  const macroFile = process.argv[3];
  const model = process.argv[4];
  const recalculateFnCovStats = process.argv[5];
  
  // calculate function coverage stats
  // this needs to be calculated only once for any given model data
  // therefore, we only recalculate if the --recalcFnCov flag is passed
  calculateFnCovStats(path.join(__dirname, multipleArtefactDir), recalculateFnCovStats === '--recalcFnCov' ? true : false);
  
  const {
    medianCoverageStats,
    medianFailureStats,
    allPackageStats,
    medianPerformanceStats,
  } = calculateReportMedians(multipleArtefactDir);
  
  
  // save median failure stats to file for use in statistical tests
  fs.writeFileSync(
    `${model}_median-coverage-stats.json`,
    JSON.stringify(medianCoverageStats)
  );
  
  // save median failure stats to file for use in stacked bar chart
  fs.writeFileSync(
    `${model}_median-failure-stats.json`,
    JSON.stringify(medianFailureStats)
  );
  
  generateLatexMacros(
    allPackageStats,
    medianCoverageStats,
    medianFailureStats,
    medianPerformanceStats,
    `${macroFile}`,
    model
  );