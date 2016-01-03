/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * The empty string.
 */
export const empty = '';

/**
 * @returns the provided number with the given number of preceding zeros.
 */
export function pad(n: number, l: number, char: string = '0'): string {
	let str = '' + n;
	let r = [str];

	for (let i = str.length; i < l; i++) {
		r.push(char);
	}

	return r.reverse().join('');
}

const _formatRegexp = /{(\d+)}/g;

/**
 * Helper to produce a string with a variable number of arguments. Insert variable segments
 * into the string using the {n} notation where N is the index of the argument following the string.
 * @param value string to which formatting is applied
 * @param args replacements for {n}-entries
 */
export function format(value: string, ...args: any[]): string {
	if (args.length === 0) {
		return value;
	}
	return value.replace(_formatRegexp, function (match, group) {
		let idx = parseInt(group, 10);
		return isNaN(idx) || idx < 0 || idx >= args.length ?
			match :
			args[idx];
	});
}

/**
 * Converts HTML characters inside the string to use entities instead. Makes the string safe from
 * being used e.g. in HTMLElement.innerHTML.
 */
export function escape(html: string): string {
	return html.replace(/[<|>|&]/g, function (match) {
		switch (match) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			default: return match;
		}
	});
}

/**
 * Escapes regular expression characters in a given string
 */
export function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
}

/**
 * Searches for all occurrences of needle in haystack and replaces them with replacement.
 */
export function replaceAll(haystack: string, needle: string, replacement: string): string {
	return haystack.replace(new RegExp(escapeRegExpCharacters(needle.toString()), 'g'), replacement);
}

/**
 * Removes all occurrences of needle from the beginning and end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim (default is a blank)
 */
export function trim(haystack: string, needle: string = ' '): string {
	let trimmed = ltrim(haystack, needle);
	return rtrim(trimmed, needle);
}

/**
 * Removes all occurrences of needle from the beginning of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function ltrim(haystack?: string, needle?: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	let needleLen = needle.length;
	if (needleLen === 0 || haystack.length === 0) {
		return haystack;
	}

	let offset = 0,
		idx = -1;

	while ((idx = haystack.indexOf(needle, offset)) === offset) {
		offset = offset + needleLen;
	}
	return haystack.substring(offset);
}

/**
 * Removes all occurrences of needle from the end of haystack.
 * @param haystack string to trim
 * @param needle the thing to trim
 */
export function rtrim(haystack?: string, needle?: string): string {
	if (!haystack || !needle) {
		return haystack;
	}

	let needleLen = needle.length,
		haystackLen = haystack.length;

	if (needleLen === 0 || haystackLen === 0) {
		return haystack;
	}

	let offset = haystackLen,
		idx = -1;

	while (true) {
		idx = haystack.lastIndexOf(needle, offset - 1);
		if (idx === -1 || idx + needleLen !== offset) {
			break;
		}
		if (idx === 0) {
			return '';
		}
		offset = idx;
	}

	return haystack.substring(0, offset);
}

export function convertSimple2RegExpPattern(pattern: string): string {
	return pattern.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').replace(/[\*]/g, '.*');
}

export function stripWildcards(pattern: string): string {
	return replaceAll(pattern, '*', '');
}

/**
 * Determines if haystack starts with needle.
 */
export function startsWith(haystack: string, needle: string): boolean {
	if (haystack.length < needle.length) {
		return false;
	}

	for (let i = 0; i < needle.length; i++) {
		if (haystack[i] !== needle[i]) {
			return false;
		}
	}

	return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
	let diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.lastIndexOf(needle) === haystack.length - needle.length;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

export function createRegExp(searchString: string, isRegex: boolean, matchCase: boolean, wholeWord: boolean): RegExp {
	if (searchString === '') {
		throw new Error('Cannot create regex from empty string');
	}
	if (!isRegex) {
		searchString = searchString.replace(/[\-\\\{\}\*\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&');
	}
	if (wholeWord) {
		if (!/\B/.test(searchString.charAt(0))) {
			searchString = '\\b' + searchString;
		}
		if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
			searchString = searchString + '\\b';
		}
	}
	let modifiers = 'g';
	if (!matchCase) {
		modifiers += 'i';
	}

	return new RegExp(searchString, modifiers);
}

export function regExpLeadsToEndlessLoop(regexp: RegExp): boolean {
	// Exit early if it's one of these special cases which are meant to match
	// against an empty string
	if (regexp.source === "^" || regexp.source === "^$" || regexp.source === "$") {
		return false;
	}

	// We check against an empty string. If the regular expression doesn't advance
	// (e.g. ends in an endless loop) it will match an empty string.
	let match = regexp.exec('');
	return (match && <any>regexp.lastIndex === 0);
}

/**
 * The normalize() method returns the Unicode Normalization Form of a given string. The form will be
 * the Normalization Form Canonical Composition.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize}
 */
export let canNormalize = typeof ((<any>'').normalize) === 'function';
export function normalizeNFC(str: string, cache?:{[str: string]: string}): string {
	if (!canNormalize || !str) {
		return str;
	}

	if (cache && cache[str]) {
		return cache[str];
	}

	let res = (<any>str).normalize('NFC');

	if (cache) {
		cache[str] = res;
	}

	return res;
}

export function isCamelCasePattern(pattern: string): boolean {
	return (/^\w[\w.]*$/).test(pattern);
}

export function isFalsyOrWhitespace(s: string): boolean {
	return !s || !s.trim();
}

export function anchorPattern(value: string, start: boolean, end: boolean): string {
	if (start) {
		value = '^' + value;
	}

	if (end) {
		value = value + '$';
	}

	return value;
}

export function assertRegExp(pattern: string, modifiers: string): void {
	if (regExpLeadsToEndlessLoop(new RegExp(pattern, modifiers))) {
		throw new Error('Regular expression /' + pattern + '/g results in infinitive matches');
	}
}

export function colorize(code: number, value: string): string {
	return '\x1b[' + code + 'm' + value + '\x1b[0m';
};

/**
 * Returns first index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function firstNonWhitespaceIndex(str: string): number {
	for (let i = 0, len = str.length; i < len; i++) {
		if (str.charAt(i) !== ' ' && str.charAt(i) !== '\t') {
			return i;
		}
	}
	return -1;
}

/**
 * Returns the leading whitespace of the string.
 * If the string contains only whitespaces, returns entire string
 */
export function getLeadingWhitespace(str: string): string {
	for (let i = 0, len = str.length; i < len; i++) {
		if (str.charAt(i) !== ' ' && str.charAt(i) !== '\t') {
			return str.substring(0, i);
		}
	}
	return str;
}

/**
 * Returns last index of the string that is not whitespace.
 * If string is empty or contains only whitespaces, returns -1
 */
export function lastNonWhitespaceIndex(str: string): number {
	for (let i = str.length - 1; i >= 0; i--) {
		if (str.charAt(i) !== ' ' && str.charAt(i) !== '\t') {
			return i;
		}
	}
	return -1;
}

export function localeCompare(strA: string, strB: string): number {
	return strA.localeCompare(strB);
}

function isAsciiChar(code: number): boolean {
	return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

export function equalsIgnoreCase(a: string, b: string): boolean {

	let len1 = a.length,
		len2 = b.length;

	if (len1 !== len2) {
		return false;
	}

	for (let i = 0; i < len1; i++) {

		let codeA = a.charCodeAt(i),
			codeB = b.charCodeAt(i);

		if (codeA === codeB) {
			continue;

		} else if (isAsciiChar(codeA) && isAsciiChar(codeB)) {
			let diff = Math.abs(codeA - codeB);
			if (diff !== 0 && diff !== 32) {
				return false;
			}
		} else {
			if (String.fromCharCode(codeA).toLocaleLowerCase() !== String.fromCharCode(codeB).toLocaleLowerCase()) {
				return false;
			}
		}
	}

	return true;
}

/**
 * @returns the length of the common prefix of the two strings.
 */
export function commonPrefixLength(a: string, b: string): number {

	let i: number,
		len = Math.min(a.length, b.length);

	for (i = 0; i < len; i++) {
		if (a.charCodeAt(i) !== b.charCodeAt(i)) {
			return i;
		}
	}

	return len;
}

/**
 * @returns the length of the common suffix of the two strings.
 */
export function commonSuffixLength(a: string, b: string): number {

	let i: number,
		len = Math.min(a.length, b.length);

	let aLastIndex = a.length - 1;
	let bLastIndex = b.length - 1;

	for (i = 0; i < len; i++) {
		if (a.charCodeAt(aLastIndex - i) !== b.charCodeAt(bLastIndex - i)) {
			return i;
		}
	}

	return len;
}

// --- unicode
// http://en.wikipedia.org/wiki/Surrogate_pair
// Returns the code point starting at a specified index in a string
// Code points U+0000 to U+D7FF and U+E000 to U+FFFF are represented on a single character
// Code points U+10000 to U+10FFFF are represented on two consecutive characters
//export function getUnicodePoint(str:string, index:number, len:number):number {
//	let chrCode = str.charCodeAt(index);
//	if (0xD800 <= chrCode && chrCode <= 0xDBFF && index + 1 < len) {
//		let nextChrCode = str.charCodeAt(index + 1);
//		if (0xDC00 <= nextChrCode && nextChrCode <= 0xDFFF) {
//			return (chrCode - 0xD800) << 10 + (nextChrCode - 0xDC00) + 0x10000;
//		}
//	}
//	return chrCode;
//}
//export function isLeadSurrogate(chr:string) {
//	let chrCode = chr.charCodeAt(0);
//	return ;
//}
//
//export function isTrailSurrogate(chr:string) {
//	let chrCode = chr.charCodeAt(0);
//	return 0xDC00 <= chrCode && chrCode <= 0xDFFF;
//}

/**
 * Computes the difference score for two strings. More similar strings have a higher score.
 * We use largest common subsequence dynamic programming approach but penalize in the end for length differences.
 * Strings that have a large length difference will get a bad default score 0.
 * Complexity - both time and space O(first.length * second.length)
 * Dynamic programming LCS computation http://en.wikipedia.org/wiki/Longest_common_subsequence_problem
 *
 * @param first a string
 * @param second a string
 */
export function difference(first: string, second: string, maxLenDelta: number = 4): number {
	let lengthDifference = Math.abs(first.length - second.length);
	// We only compute score if length of the currentWord and length of entry.name are similar.
	if (lengthDifference > maxLenDelta) {
		return 0;
	}
	// Initialize LCS (largest common subsequence) matrix.
	let LCS: number[][] = [];
	let zeroArray: number[] = [];
	let i: number, j: number;
	for (i = 0; i < second.length + 1; ++i) {
		zeroArray.push(0);
	}
	for (i = 0; i < first.length + 1; ++i) {
		LCS.push(zeroArray);
	}
	for (i = 1; i < first.length + 1; ++i) {
		for (j = 1; j < second.length + 1; ++j) {
			if (first[i - 1] === second[j - 1]) {
				LCS[i][j] = LCS[i - 1][j - 1] + 1;
			} else {
				LCS[i][j] = Math.max(LCS[i - 1][j], LCS[i][j - 1]);
			}
		}
	}
	return LCS[first.length][second.length] - Math.sqrt(lengthDifference);
}

/**
 * Returns an array in which every entry is the offset of a
 * line. There is always one entry which is zero.
 */
export function computeLineStarts(text: string): number[] {
	let regexp = /\r\n|\r|\n/g,
		ret: number[] = [0],
		match: RegExpExecArray;
	while ((match = regexp.exec(text))) {
		ret.push(regexp.lastIndex);
	}
	return ret;
}

/**
 * Given a string and a max length returns a shorted version. Shorting
 * happens at favorable positions - such as whitespace or punctuation characters.
 */
export function lcut(text: string, n: number): string {

	if (text.length < n) {
		return text;
	}

	let segments = text.split(/\b/),
		count = 0;

	for (let i = segments.length - 1; i >= 0; i--) {
		count += segments[i].length;

		if (count > n) {
			segments.splice(0, i);
			break;
		}
	}

	return segments.join(empty).replace(/^\s/, empty);
}

// Escape codes
// http://en.wikipedia.org/wiki/ANSI_escape_code
const EL = /\x1B\x5B[12]?K/g; // Erase in line
const LF = /\xA/g; // line feed
const COLOR_START = /\x1b\[\d+m/g; // Color
const COLOR_END = /\x1b\[0?m/g; // Color

export function removeAnsiEscapeCodes(str: string): string {
	if (str) {
		str = str.replace(EL, '');
		str = str.replace(LF, '\n');
		str = str.replace(COLOR_START, '');
		str = str.replace(COLOR_END, '');
	}

	return str;
}

// -- UTF-8 BOM

const __utf8_bom = 65279;

export const UTF8_BOM_CHARACTER = String.fromCharCode(__utf8_bom);

export function startsWithUTF8BOM(str: string): boolean {
	return (str && str.length > 0 && str.charCodeAt(0) === __utf8_bom);
}