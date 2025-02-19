/*
 * Copyright 2022 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
	TestRunnerOptions,
	Test,
	TestRunnerContext,
	TestWatcher,
	CallbackTestRunner,
	OnTestStart,
	OnTestSuccess,
	OnTestFailure,
} from "jest-runner";

import { Config } from "@jest/types";
import { JazzerWorker } from "./worker";
import { registerGlobals, initFuzzing } from "@jazzer.js/core";
import { loadConfig } from "./config";
import { cleanupJestRunnerStack } from "./errorUtils";

class FuzzRunner extends CallbackTestRunner {
	constructor(globalConfig: Config.GlobalConfig, context: TestRunnerContext) {
		super(globalConfig, context);
		registerGlobals();
	}

	async runTests(
		tests: Array<Test>,
		watcher: TestWatcher,
		onStart: OnTestStart,
		onResult: OnTestSuccess,
		onFailure: OnTestFailure,
		options: TestRunnerOptions // eslint-disable-line @typescript-eslint/no-unused-vars
	): Promise<void> {
		const config = loadConfig();
		initFuzzing(config);
		return this.#runTestsInBand(tests, watcher, onStart, onResult, onFailure);
	}

	async #runTestsInBand(
		tests: Array<Test>,
		watcher: TestWatcher,
		onStart: OnTestStart,
		onResult: OnTestSuccess,
		onFailure: OnTestFailure
	) {
		process.env.JEST_WORKER_ID = "1";
		return tests.reduce((promise, test) => {
			return promise.then(async () => {
				if (watcher.isInterrupted()) {
					throw new CancelRun();
				}

				// Execute every test in a dedicated worker instance.
				// Currently, this is only in band but the structure supports parallel
				// execution in the future.
				await onStart(test);
				const worker = new JazzerWorker();
				return worker.run(test, this._globalConfig).then(
					(result) => onResult(test, result),
					(error) => {
						error.stack = cleanupJestRunnerStack(error.stack);
						onFailure(test, error);
					}
				);
			});
		}, Promise.resolve());
	}
}

class CancelRun extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "CancelRun";
	}
}

export default FuzzRunner;
