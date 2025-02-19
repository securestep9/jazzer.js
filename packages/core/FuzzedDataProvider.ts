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
 * Helper class for reading primitive types from the bytes of the raw fuzzer input.
 * Arrays are read from the beginning of the data buffer, whereas individual elements are read
 * from the end of the data buffer.
 * This implementation is based on the FuzzedDataProvider.h from the libFuzzer library
 * https://github.com/llvm-mirror/compiler-rt/blob/master/include/fuzzer/FuzzedDataProvider.h
 */
export class FuzzedDataProvider {
	private readonly data: Buffer;
	private dataPtr = -1;
	/** The number of remaining bytes that can be consumed from the fuzzer input data. */
	_remainingBytes = 0;

	static readonly min_float = -3.4028235e38;
	static readonly max_float = 3.4028235e38;
	static readonly min_double = -Number.MAX_VALUE;
	static readonly max_double = Number.MAX_VALUE;

	/**
	 * @param data - a buffer containing the fuzzer input
	 */
	constructor(data: Buffer) {
		this.data = data;
		if (data.length > 0) {
			this.dataPtr = 0;
			this._remainingBytes = data.length;
		}
	}

	/**
	 * @returns the number of remaining bytes in the fuzzer input.
	 */
	get remainingBytes(): number {
		return this._remainingBytes;
	}

	/**
	 * -----------------------------------------------------
	 * Functions for reading data from the back of fuzzer input in
	 * little-endian order.
	 * -----------------------------------------------------
	 */

	/**
	 * Consumes a byte from fuzzer input and converts it into boolean.
	 * @returns a `boolean` - if LSB is 0, returns `false`, otherwise `true`
	 */
	consumeBoolean(): boolean {
		return (this.consumeIntegral(1) & 1) == 1;
	}

	/**
	 * Consumes an Integral number from the fuzzer input.
	 * @param maxNumBytes - the maximum number of bytes to consume from the fuzzer input data
	 * @param isSigned - whether the number is signed
	 * @returns an integral
	 */
	consumeIntegral(maxNumBytes: number, isSigned = false): number {
		return this.consumeIntegralLEorBE(maxNumBytes, isSigned, true);
	}

	/**
	 * Consumes several bytes from fuzzer data and converts them to a number that is
	 * in the range of [min, max]. The number of bytes consumed is determined by
	 * the size of the range. If there is no more fuzzer data available, the returned
	 * number will be `min`.
	 * @param min lower bound of the range (inclusive)
	 * @param max upper bound of the range (inclusive)
	 * @returns a number in the provided range
	 */
	consumeIntegralInRange(min: number, max: number): number {
		return this.consumeIntegralInRangeLEorBE(min, max, true);
	}

	/**
	 * Consumes a big integral from the fuzzer input.
	 * @param maxNumBytesToConsume - the maximum number of bytes to consume from the fuzzer input data
	 * @param isSigned - whether the number is signed
	 * @returns a big integral
	 */
	consumeBigIntegral(maxNumBytesToConsume: number, isSigned = false): bigint {
		return this.consumeBigIntegralLEorBE(maxNumBytesToConsume, isSigned, true);
	}

	/**
	 * Consumes several bytes from fuzzer data and converts them to a bigint that is
	 * in the range of [min, max]. The number of bytes consumed is determined by
	 * the size of the range. If there is no more fuzzer data available, the returned
	 * number will be `min`.
	 * @param min lower bound of the range (inclusive)
	 * @param max upper bound of the range (inclusive)
	 * @returns a number in the provided range
	 */
	consumeBigIntegralInRange(min: bigint, max: bigint): bigint {
		return this.consumeBigIntegralInRangeLEorBE(min, max, true);
	}

	/**
	 * Consumes am IEEE 754 floating-point number from the fuzzer input.
	 * The number is read as is, without any conversion.
	 * @returns a `number` that may have a special value (e.g. a NaN or infinity)
	 */
	consumeNumber(): number {
		if (this._remainingBytes == 0) return 0;
		if (this._remainingBytes < 8) {
			// not enough data: copy to a larger buffer
			const copiedData = Buffer.alloc(8);
			this.data.copy(
				copiedData,
				8 - this._remainingBytes,
				this.dataPtr,
				this.dataPtr + this._remainingBytes
			);
			this._remainingBytes = 0;
			return copiedData.readDoubleLE();
		}
		this._remainingBytes -= 8;
		return this.data.readDoubleLE(this.dataPtr + this._remainingBytes);
	}

	/**
	 * Consumes at most 9 bytes from fuzzer input and converts them to an
	 * IEEE-754 number in the range [min, max].
	 * @param min - lower bound of the range (inclusive)
	 * @param max - upper bound of the range (inclusive)
	 * @returns a `number` in the provided range
	 */
	consumeNumberInRange(min: number, max: number) {
		return this.consumeDoubleInRange(min, max);
	}

	/**
	 * Consumes a 32-bit `float` from the fuzzer input.
	 * @returns a `float` that may have a special value (e.g. a NaN or infinity)
	 */
	consumeFloat(): number {
		return this.consumeFloatInRange(
			FuzzedDataProvider.min_float,
			FuzzedDataProvider.max_float
		);
	}

	/**
	 * Consumes a 32-bit `float` from fuzzer input and converts it to an
	 * IEEE-754 number in the range [min, max].
	 * @param min - lower bound of the range (inclusive)
	 * @param max - upper bound of the range (inclusive)
	 * @returns a `float` in the provided range
	 */
	consumeFloatInRange(min: number, max: number): number {
		if (min == max) return min;
		if (min > max) throw new Error("min must be less than or equal to max");
		let range: number;
		let result = min;
		if (min < 0.0 && max > 0.0 && max > min + FuzzedDataProvider.max_float) {
			range = max / 2.0 - min / 2.0;
			if (this.consumeBoolean()) {
				result += range;
			}
		} else {
			range = max - min;
		}
		return result + range * this.consumeProbabilityFloat();
	}

	/**
	 * Consumes a 64-bit `double` from fuzzer input.
	 * This is the approach used by libFuzzer to get double numbers from the fuzzer input.
	 * @returns a IEEE-754 `double`
	 */
	consumeDouble(): number {
		return this.consumeDoubleInRange(
			FuzzedDataProvider.min_double,
			FuzzedDataProvider.max_double
		);
	}

	/**
	 * Consumes at most 9 bytes from fuzzer input and converts them to an
	 * IEEE-754 number in the range [min, max].
	 * @param min - lower bound of the range (inclusive)
	 * @param max - upper bound of the range (inclusive)
	 * @returns a `number` in the provided range
	 */
	consumeDoubleInRange(min: number, max: number): number {
		if (min == max) return min;
		if (min > max) throw new Error("min must be less than or equal to max");
		let range: number;
		let result = min;
		if (min < 0.0 && max > 0.0 && max > min + FuzzedDataProvider.max_double) {
			range = max / 2.0 - min / 2.0;
			if (this.consumeBoolean()) {
				result += range;
			}
		} else {
			range = max - min;
		}
		return result + range * this.consumeProbabilityDouble();
	}

	/**
	 * Consumes 4 bytes from the fuzzer input.
	 * @returns a number in the range [0.0, 1.0]
	 */
	consumeProbabilityFloat(): number {
		return this.consumeIntegral(4) / 0xffffffff;
	}

	/**
	 * Consumes 8 bytes from the fuzzer input and converts them to an IEEE-754`number`
	 * in the range [0.0, 1.0].
	 * @returns a number in the range [0.0, 1.0]
	 */
	consumeProbabilityDouble(): number {
		const n = this.consumeBigIntegral(8, false);
		const d = (BigInt(0xffffffff) << BigInt(32)) | BigInt(0xffffffff);
		return Number(n) / Number(d);
	}

	/**
	 * Picks an element from `array` based on the fuzzer input.
	 * Note:The distribution of picks is not perfectly uniform.
	 * Note: For array sizes > 48 bits, this function will throw an error.
	 * @param array an `array` of type T to pick an element from.
	 * @returns an element from `array` chosen based on the fuzzer input
	 */
	pickValue<Type>(array: Array<Type>): Type {
		if (array.length == 0) throw new Error("provided array is empty");
		return array[this.consumeIntegralInRange(0, array.length - 1)];
	}

	/**
	 * -----------------------------------------------------
	 * Functions for reading data from the front of fuzzer input in
	 * big-endian order.
	 * -----------------------------------------------------
	 */

	/**
	 * Consumes an array of booleans from the fuzzer input.
	 * The array might be shorter than requested `maxLength` if the fuzzer input
	 * is not sufficiently long.
	 * @param maxLength - the maximum length of the array
	 * @returns an array of booleans
	 */
	consumeBooleans(maxLength: number): boolean[] {
		const arrayLength = Math.min(this._remainingBytes, maxLength);
		const result = new Array<boolean>(arrayLength);
		for (let i = 0; i < arrayLength; i++) {
			result[i] = (this.data[this.dataPtr + i] & 1) == 1;
		}
		this._remainingBytes -= arrayLength;
		this.dataPtr += arrayLength;
		return result;
	}

	/**
	 * Consumes an array of integrals from fuzzer data.
	 * The array might be shorter than requested `maxLength` if the fuzzer input
	 * is not sufficiently long.
	 * @param maxLength - number of integers to consume
	 * @param numBytesPerIntegral - number of bytes to consume for each integral
	 * @param isSigned - whether the integrals are signed
	 * @returns an array of integrals
	 */
	consumeIntegrals(
		maxLength: number,
		numBytesPerIntegral: number,
		isSigned = false
	): number[] {
		const arrayLength = this.computeArrayLength(maxLength, numBytesPerIntegral);
		const result = new Array<number>();
		for (let i = 0; i < arrayLength; i++) {
			result[i] = this.consumeIntegralLEorBE(
				numBytesPerIntegral,
				isSigned,
				false
			);
		}
		return result;
	}

	/**
	 * Consumes an array of big integrals from fuzzer data.
	 * The array might be shorter than requested `maxLength` if the fuzzer input
	 * is not sufficiently long.
	 * @param maxLength - maximum number of integrals to consume
	 * @param numBytesPerIntegral - number of bytes to consume for each integral
	 * @param isSigned - whether the integrals are signed
	 * @returns an array of big integrals
	 */
	consumeBigIntegrals(
		maxLength: number,
		numBytesPerIntegral: number,
		isSigned = false
	): bigint[] {
		const arrayLength = this.computeArrayLength(maxLength, numBytesPerIntegral);
		const result: bigint[] = new Array<bigint>(arrayLength);
		for (let i = 0; i < arrayLength; i++) {
			result[i] = this.consumeBigIntegralLEorBE(
				numBytesPerIntegral,
				isSigned,
				false
			);
		}
		return result;
	}

	/**
	 * Consumes an array of numbers from the fuzzer input.
	 * The array might be shorter than requested `maxLength` if the fuzzer input
	 * is not sufficiently long.
	 * @param maxLength the maximum length of the array
	 * @returns an array of numbers
	 */
	consumeNumbers(maxLength: number): number[] {
		const arrayLength = this.computeArrayLength(maxLength, 8);
		const result: number[] = new Array(arrayLength);
		for (let i = 0; i < arrayLength; i++) {
			result[i] = this.consumeNumberBE();
		}
		return result;
	}

	/**
	 * Consumes a byte array from fuzzer input.
	 * The array might be shorter than requested `maxLength` if the fuzzer input
	 * is not sufficiently long.
	 * @param maxLength - the maximum length of the output array
	 * @returns a byte array of length at most `maxLength`
	 */
	consumeBytes(maxLength: number): number[] {
		const arrayLength = Math.min(this._remainingBytes, maxLength);
		const result = new Array<number>(arrayLength);
		for (let i = 0; i < arrayLength; i++) {
			result[i] = this.data[this.dataPtr + i];
		}
		this._remainingBytes -= arrayLength;
		this.dataPtr += arrayLength;
		return result;
	}

	/**
	 * Consumes the remaining fuzzer input as a byte array.
	 * Note: After calling this method, further calls to methods of this interface will
	 * return fixed values only.
	 * @returns a `byte` array
	 */
	consumeRemainingAsBytes(): number[] {
		return this.consumeBytes(this._remainingBytes);
	}

	/**
	 * Consumes a `string` from the fuzzer input.
	 * The array might be shorter than requested `maxLength` if the fuzzer input
	 * is not sufficiently long.
	 * @param maxLength the maximum length of the string
	 * @param encoding the encoding of the string
	 * @returns a `string` of length between 0 and `maxLength` (inclusive)
	 */
	consumeString(
		maxLength: number,
		encoding: BufferEncoding | undefined = "ascii"
	): string {
		if (maxLength < 0) throw new Error("maxLength must be non-negative");
		const arrayLength = Math.min(maxLength, this._remainingBytes);
		const result = this.data.toString(
			encoding,
			this.dataPtr,
			this.dataPtr + arrayLength
		);
		this.dataPtr += arrayLength;
		this._remainingBytes -= arrayLength;
		return result;
	}

	/**
	 * Consumes the remaining bytes of the fuzzer input as a string.
	 * @param encoding - the encoding of the string
	 * @returns a string constructed from the remaining bytes of the fuzzer input using the given encoding
	 */
	consumeRemainingAsString(
		encoding: BufferEncoding | undefined = "ascii"
	): string {
		return this.consumeString(this._remainingBytes, encoding);
	}

	/**
	 * Picks values from an array based on the fuzzer input.
	 * Indices picked by this method do not repeat for the duration of the function call.
	 * Note: The distribution of picks is not perfectly uniform.
	 * @param array the `array` to pick elements from.
	 * @param numValues the number of values to pick.
	 * @returns an array of size `numValues` from `array` chosen based on the
	 *    fuzzer input
	 */
	pickValues<Type>(array: Array<Type>, numValues: number): Array<Type> {
		if (array.length == 0) throw new Error("array must not be empty");
		if (numValues < 0) throw new Error("numValues must not be negative");
		if (numValues > array.length)
			throw new Error("numValues must not be greater than the array length");
		const result = new Array<Type>(numValues);
		const remainingArray = array.slice();
		for (let i = 0; i < numValues; i++) {
			const index = this.consumeIntegralInRange(0, remainingArray.length - 1);
			result[i] = remainingArray[index];
			remainingArray.splice(index, 1);
		}
		return result;
	}

	/**
	 * -----------------------------------------------------
	 * Internal helper functions
	 * -----------------------------------------------------
	 */

	/**
	 * Consumes an IEEE 754 floating-point number from the front of fuzzer input.
	 * @private
	 * @returns a `number`
	 */
	private consumeNumberBE(): number {
		if (this._remainingBytes == 0) return 0;
		// check that we have enough data
		if (this._remainingBytes < 8) {
			const copiedData = Buffer.alloc(8);
			this.data.copy(
				copiedData,
				0,
				this.dataPtr,
				this.dataPtr + this._remainingBytes
			);
			this._remainingBytes = 0;
			return copiedData.readDoubleBE();
		}
		this._remainingBytes -= 8;
		const result = this.data.readDoubleBE(this.dataPtr);
		this.dataPtr += 8;
		return result;
	}

	/**
	 * Consumes an integral from the front of fuzzer input.
	 * @param maxNumBytes - maximum number of bytes to consume. Must be between 0 and 6.
	 *   For larger numbers, use `consumeBigIntLEorBE`.
	 * @param isSigned - whether the integer is signed or not
	 * @param isLittleEndian - whether the integer is little endian or not
	 * @returns an integral
	 */
	private consumeIntegralLEorBE(
		maxNumBytes: number,
		isSigned = false,
		isLittleEndian = true
	): number {
		if (maxNumBytes < 0 || maxNumBytes > 6) {
			throw new Error(
				"maxNumBytes must be between 0 and 6: use the corresponding *BigIntegral function instead"
			);
		}
		const min = isSigned ? -(2 ** (8 * maxNumBytes - 1)) : 0;
		const max = isSigned
			? 2 ** (8 * maxNumBytes - 1) - 1
			: 2 ** (8 * maxNumBytes) - 1;
		return this.consumeIntegralInRangeLEorBE(min, max, isLittleEndian);
	}

	/**
	 * Consumes several bytes from fuzzer data and converts them to a number that is
	 * in the range of [min, max]. The number of bytes consumed is determined by
	 * the size of the range. If there is no input data left, the returned number
	 * will be `min`
	 * @param min lower bound of the range (inclusive)
	 * @param max upper bound of the range (inclusive)
	 * @param isLittleEndian bytes are read in little- or big-endian order. Little-endian
	 *   signifies that the bytes are considered parameters and thus read from the back of
	 *   the fuzzer data. Big-endian signifies that the bytes are considered data and thus
	 *   read from the front of the fuzzer data.
	 * @returns a number in the provided range
	 */
	private consumeIntegralInRangeLEorBE(
		min: number,
		max: number,
		isLittleEndian = true
	): number {
		if (min == max) return min;
		if (min > max) throw new Error("min must be less than or equal to max");
		if (this._remainingBytes == 0) return min;
		if (max > Number.MAX_SAFE_INTEGER)
			throw new Error(
				"max is too large: use the corresponding *BigIntegral function instead"
			);
		const range = max - min;
		const numBytesToRepresentRange = Math.ceil(Math.log2(range + 1) / 8);
		const numBytesToConsume = Math.min(
			this._remainingBytes,
			numBytesToRepresentRange
		);
		if (numBytesToConsume > 6) {
			throw new Error(
				"requested range exceeds 2**48-1: use the corresponding *BigIntegral function instead"
			);
		}
		this._remainingBytes -= numBytesToConsume;
		let result: number;
		if (isLittleEndian) {
			result = this.data.readUIntLE(
				this.dataPtr + this._remainingBytes,
				numBytesToConsume
			);
		} else {
			result = this.data.readUIntBE(this.dataPtr, numBytesToConsume);
			this.dataPtr += numBytesToConsume;
		}
		return min + (result % (range + 1));
	}

	/**
	 * Consumes an integral from the front of fuzzer input.
	 * @param maxNumBytes - maximum number of bytes to consume. Must be between 1 and 6.
	 *   For larger numbers, use `consumeBigIntLEorBE`.
	 * @param isSigned - whether the integer is signed or not
	 * @param isLittleEndian - whether the integer is little endian or not
	 * @returns an integral
	 */
	consumeBigIntegralLEorBE(
		maxNumBytes: number,
		isSigned = false,
		isLittleEndian = true
	): bigint {
		let min, max;
		if (isSigned) {
			min = BigInt(-(2 ** (maxNumBytes * 8 - 1)));
			max = BigInt(2 ** (maxNumBytes * 8 - 1) - 1);
		} else {
			min = BigInt(0);
			max = (BigInt(1) << BigInt(maxNumBytes * 8)) - BigInt(1);
		}
		return this.consumeBigIntegralInRangeLEorBE(min, max, isLittleEndian);
	}

	/**
	 * Consumes several bytes from fuzzer data and converts them to a bigint that is
	 * in the range of [min, max]. The number of bytes consumed is determined by
	 * the size of the range. If there is no input data left, the returned number
	 * will be `min`
	 * @param min lower bound of the range (inclusive)
	 * @param max upper bound of the range (inclusive)
	 * @param isLittleEndian bytes are read in little- or big-endian order. Little-endian
	 *   signifies that the bytes are considered parameters and thus read from the back of
	 *   the fuzzer data. Big-endian signifies that the bytes are considered data and thus
	 *   read from the front of the fuzzer data.
	 * @returns a bigint in the provided range
	 */
	private consumeBigIntegralInRangeLEorBE(
		min: bigint,
		max: bigint,
		isLittleEndian = true
	): bigint {
		if (min == max) return min;
		if (min > max) throw new Error("min must be less than or equal to max");
		const range: bigint = max - min;
		let offset = BigInt(0);
		let result = BigInt(0);
		let nextByte: bigint;
		while (range >> offset > BigInt(0) && this._remainingBytes > 0) {
			this._remainingBytes--;
			if (isLittleEndian) {
				nextByte = BigInt(this.data[this.dataPtr + this._remainingBytes]);
			} else {
				nextByte = BigInt(this.data[this.dataPtr]);
				this.dataPtr++;
			}
			result = (result << BigInt(8)) | nextByte;
			offset += BigInt(8);
		}
		return (result % (range + BigInt(1))) + min;
	}

	/**
	 * Computes how many elements (defined by the number of bytes per element) can be read
	 * from the fuzzer input data.
	 * @param maxLength - maximum number of elements to read
	 * @param numBytesPerElement - number of bytes used by each element
	 * @returns number of elements that can be read
	 */
	private computeArrayLength(
		maxLength: number,
		numBytesPerElement: number
	): number {
		const numAvailableBytes = Math.min(
			this._remainingBytes,
			maxLength * numBytesPerElement
		);
		return Math.ceil(numAvailableBytes / numBytesPerElement);
	}
}
