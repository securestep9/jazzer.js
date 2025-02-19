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

/**
 * @param { Buffer } data
 * @param { Function } done
 */
module.exports.fuzz = function (data, done) {
	if (data.length < 3) {
		done();
		return;
	}
	setTimeout(() => {
		let one = data.readInt8(0);
		let two = data.readInt8(1);
		let three = data.readInt8(2);
		if (one + two + three === 42) {
			done(new Error(`${one} + ${two} + ${three} = 42`));
		} else {
			done();
		}
	}, 10);
};
