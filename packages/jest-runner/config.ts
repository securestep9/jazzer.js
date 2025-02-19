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

import { cosmiconfigSync } from "cosmiconfig";
import { Options } from "@jazzer.js/core";

export const defaultOptions: Options = {
	dryRun: true,
	includes: ["*"],
	excludes: ["node_modules"],
	fuzzTarget: "",
	fuzzEntryPoint: "",
	customHooks: [],
	fuzzerOptions: [],
	sync: false,
	expectedErrors: [],
	timeout: 5000, // default Jest timeout
};

// Looks up Jazzer.js options via the `jazzer-runner` configuration from
// within different configuration files.
export function loadConfig(optionsKey = "jazzerjs"): Options {
	const result = cosmiconfigSync(optionsKey).search();
	let config;
	if (result === null) {
		config = { ...defaultOptions };
	} else {
		config = Object.keys(defaultOptions).reduce(
			(config: Options, key: string) => {
				if (key in result.config) {
					config = { ...config, [key]: result.config[key] };
				}
				return config;
			},
			defaultOptions
		);
	}

	// Switch to fuzzing mode if environment variable `JAZZER_FUZZ` is set.
	if (process.env.JAZZER_FUZZ) {
		config.dryRun = false;
	}

	return config;
}
