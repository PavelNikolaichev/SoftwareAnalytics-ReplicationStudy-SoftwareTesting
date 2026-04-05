# About Logs
So, the average logs of the <i>correctly</i> running testpilot could be seen in here: ![average_run.png](./average_run.png)
There is not much to add to it.

Now, more important ones:
There were some repos that did not have had any direct instructions regarding the building or testing them, and standard behavior of the testpilot was not working properly on them, showing the following errors: ![failed_repo.png](./failed_repo.png)
Thus, we have decided to skip it, as fixing it would involve either overengineering the replication scripts, or building all the apps by a person, and since we are constrained by time, we can't afford doing both.

There are also some timeouts errors from mocha: ![timeout_errors.png](./timeout_errors.png)
These are complicated, as there is a tradeoff between increasing the time limit of mocha validator and <i>possibly</i> get a passing result, or spending much more time waiting for an incorrectly written test to not pass the testing.





# Analysis scripts

During execution of analysis scripts we encountered errors due to the fact that scipts were expecting fully complete data folders, all packages, etc. 

While our replication of running TESTPILOT did not yield complete datasets. 

Error in the 1_Error_Package.png is related to the following:
generate_latex_macros.js has a hardcoded, unguarded lookup for js-sdsl:

coverageStats["js-sdsl"].stmtCoverage
That assumes js-sdsl exists in your current dataset. In latest_version_5/data, it does not, so coverageStats["js-sdsl"] is undefined, and Node throws the TypeError.


Error in the 2_Error_empty_package_folder.png is related to a similar issue. 

generate_latex_macros.js was accessing package folder, but there were no contents, which is why script broke
