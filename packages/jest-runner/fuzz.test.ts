/* eslint-disable @typescript-eslint/ban-ts-comment */
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

// Mock Corpus class so that no local directories are created during test.
const inputsPathsMock = jest.fn();
jest.mock("./corpus", () => {
	return {
		Corpus: class Tmp {
			inputsPaths = inputsPathsMock;
		},
	};
});

// Mock core package to intercept calls to startFuzzing.
const startFuzzingMock = jest.fn();
const skipMock = jest.fn();
jest.mock("@jazzer.js/core", () => {
	return {
		startFuzzingNoInit: startFuzzingMock,
	};
});

// Mock console error logs
const consoleErrorMock = jest.spyOn(console, "error").mockImplementation();

import fs from "fs";
import * as tmp from "tmp";
import { Global } from "@jest/types";
import { Corpus } from "./corpus";
import {
	FuzzerError,
	FuzzerStartError,
	runInFuzzingMode,
	runInRegressionMode,
} from "./fuzz";
import { defaultOptions } from "./config";

// Cleanup created files on exit
tmp.setGracefulCleanup();

describe("fuzz", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("runInFuzzingMode", () => {
		it("execute only one fuzz target function", async () => {
			const testFn = jest.fn();
			const corpus = new Corpus("", []);

			// First call should start the fuzzer
			await withMockTest(() => {
				runInFuzzingMode("first", testFn, corpus, defaultOptions);
			});
			expect(startFuzzingMock).toBeCalledTimes(1);

			// Should fail to start the fuzzer a second time
			await expect(
				withMockTest(() => {
					runInFuzzingMode("second", testFn, corpus, defaultOptions);
				})
			).rejects.toThrow(FuzzerStartError);
			expect(startFuzzingMock).toBeCalledTimes(1);
		});
	});

	describe("runInRegressionMode", () => {
		it("execute one test per seed file", async () => {
			const inputPaths = mockInputPaths("file1", "file2");
			const corpus = new Corpus("", []);
			const testFn = jest.fn();
			await withMockTest(() => {
				runInRegressionMode("fuzz", testFn, corpus, 1000);
			});
			inputPaths.forEach(([name]) => {
				expect(testFn).toHaveBeenCalledWith(Buffer.from(name));
			});
		});

		it("support done callback fuzz test functions", async () => {
			let called = false;
			await withMockTest(() => {
				runInRegressionMode(
					"fuzz",
					(data: Buffer, done: (e?: Error) => void) => {
						called = true;
						done();
					},
					mockDefaultCorpus(),
					1000
				);
			});
			expect(called).toBeTruthy();
		});

		it("support async fuzz test functions", async () => {
			let called = false;
			await withMockTest(() => {
				runInRegressionMode(
					"fuzz",
					async () => {
						called = true;
						return new Promise((resolve) => {
							setTimeout(() => {
								resolve("result");
							}, 100);
						});
					},
					mockDefaultCorpus(),
					1000
				);
			});
			expect(called).toBeTruthy();
		});

		it("fail on timeout", async () => {
			const rejects = await expect(
				withMockTest(() => {
					runInRegressionMode(
						"fuzz",
						() => {
							return new Promise(() => {
								// do nothing to trigger timeout
							});
						},
						mockDefaultCorpus(),
						100
					);
				})
			).rejects;
			await rejects.toThrow(FuzzerError);
			await rejects.toThrowError(new RegExp(".*Timeout.*"));
		});

		it("fail on done callback with async result", async () => {
			const rejects = await expect(
				withMockTest(() => {
					runInRegressionMode(
						"fuzz",
						// Parameters needed to pass in done callback.
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						(ignored: Buffer, ignored2: (e?: Error) => void) => {
							return new Promise(() => {
								// promise is ignored due to done callback
							});
						},
						mockDefaultCorpus(),
						100
					);
				})
			).rejects;
			await rejects.toThrow(FuzzerError);
			await rejects.toThrowError(new RegExp(".*async or done.*"));
		});

		it("print error on multiple calls to done callback", async () => {
			await new Promise((resolve) => {
				expect(
					withMockTest(() => {
						runInRegressionMode(
							"fuzz",
							// eslint-disable-next-line @typescript-eslint/no-unused-vars
							(ignored: Buffer, done: (e?: Error) => void) => {
								done();
								done();
								// Use another promise to stop test from finishing too fast.
								resolve("done called multiple times");
							},
							mockDefaultCorpus(),
							100
						);
					})
				);
			});
			expect(consoleErrorMock).toHaveBeenCalledTimes(1);
		});

		it("skips tests without seed files", async () => {
			mockInputPaths();
			const corpus: Corpus = new Corpus("", []);
			const testFn = jest.fn();
			await withMockTest(() => {
				runInRegressionMode("fuzz", testFn, corpus, 1000);
			});
			expect(testFn).not.toBeCalled();
			expect(skipMock).toHaveBeenCalled();
		});
	});
});

// Executing tests in tests is not allowed, hence we temporarily swap the
// implementation of test and describe to directly invoke their lambdas.
// Also register a mock at test.skipMock to check if it's invoked.
const withMockTest = async (block: () => void): Promise<unknown> => {
	const tmpTest = globalThis.test;
	const tmpDescribe = globalThis.describe;
	// Variable to store the registered fuzz tests for later execution.
	const testFns: Global.TestFn[] = [];
	try {
		// Directly invoke describe as there are currently no async describe tests.
		// @ts-ignore
		globalThis.describe = (name: Global.TestNameLike, fn: Global.TestFn) => {
			// @ts-ignore
			fn();
		};

		// Mock test with version that stores the registered test. Ignore missing
		// properties, as those are not needed in the tests.
		// @ts-ignore
		globalThis.test = (name: Global.TestNameLike, fn: Global.TestFn) => {
			testFns.push(fn);
		};
		// @ts-ignore
		globalThis.test.skip = skipMock;

		// Execute given block so that the test functions are actually registered.
		block();
		// Chain execution of the stored test functions.
		let promise: Promise<unknown> = Promise.resolve();
		testFns.forEach((t) => {
			// @ts-ignore
			promise = promise.then(t);
		});
		return promise;
	} finally {
		globalThis.test = tmpTest;
		globalThis.describe = tmpDescribe;
	}
};

const mockInputPaths = (...inputPaths: string[]) => {
	const mockInputPaths = inputPaths.map((p) => {
		const path = tmp.fileSync().name;
		fs.writeFileSync(path, p);
		return [p, path];
	});
	inputsPathsMock.mockReturnValue(mockInputPaths);
	return mockInputPaths;
};

const mockDefaultCorpus = () => {
	mockInputPaths("seed");
	return new Corpus("", []);
};
