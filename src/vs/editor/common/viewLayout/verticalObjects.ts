/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {WhitespaceComputer} from 'vs/editor/common/viewLayout/whitespaceComputer';
import EditorCommon = require('vs/editor/common/editorCommon');

/**
 * Layouting of objects that take vertical space (by having a height) and push down other objects.
 *
 * These objects are basically either text (lines) or spaces between those lines (whitespaces).
 * This provides commodity operations for working with lines that contain whitespace that pushes lines lower (vertically).
 * This is written with no knowledge of an editor in mind.
 */
export class VerticalObjects {

	/**
	 * Keep track of the total number of lines.
	 * This is useful for doing binary searches or for doing hit-testing.
	 */
	private linesCount:number;

	/**
	 * Contains whitespace information in pixels
	 */
	private whitespaces:WhitespaceComputer;

	constructor() {
		this.whitespaces = new WhitespaceComputer();
	}

	/**
	 * Set the number of lines.
	 *
	 * @param newLineCount New number of lines.
	 */
	public replaceLines(newLineCount:number): void {
		this.linesCount = newLineCount;
	}

	/**
	 * Insert a new whitespace of a certain height after a line number.
	 * The whitespace has a "sticky" characteristic.
	 * Irrespective of edits above or below `afterLineNumber`, the whitespace will follow the initial line.
	 *
	 * @param afterLineNumber The conceptual position of this whitespace. The whitespace will follow this line as best as possible even when deleting/inserting lines above/below.
	 * @param heightInPx The height of the whitespace, in pixels.
	 * @return An id that can be used later to mutate or delete the whitespace
	 */
	public insertWhitespace(afterLineNumber:number, ordinal:number, heightInPx:number): number {
		return this.whitespaces.insertWhitespace(afterLineNumber, ordinal, heightInPx);
	}

	/**
	 * Change the height of an existing whitespace
	 *
	 * @param id The whitespace to change
	 * @param newHeightInPx The new height of the whitespace, in pixels
	 * @return Returns true if the whitespace is found and if the new height is different than the old height
	 */
	public changeWhitespace(id:number, newHeightInPx:number): boolean {
		return this.whitespaces.changeWhitespace(id, newHeightInPx);
	}

	/**
	 * Change the line number after which an existing whitespace flows.
	 *
	 * @param id The whitespace to change
	 * @param newAfterLineNumber The new line number the whitespace will follow
	 * @return Returns true if the whitespace is found and if the new line number is different than the old line number
	 */
	public changeAfterLineNumberForWhitespace(id:number, newAfterLineNumber:number): boolean {
		return this.whitespaces.changeAfterLineNumberForWhitespace(id, newAfterLineNumber);
	}

	/**
	 * Remove an existing whitespace.
	 *
	 * @param id The whitespace to remove
	 * @return Returns true if the whitespace is found and it is removed.
	 */
	public removeWhitespace(id:number): boolean {
		return this.whitespaces.removeWhitespace(id);
	}

	/**
	 * Notify the layouter that lines have been deleted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the deletion started, inclusive
	 * @param toLineNumber The line number at which the deletion ended, inclusive
	 */
	public onModelLinesDeleted(fromLineNumber:number, toLineNumber:number): void {
		this.linesCount -= (toLineNumber - fromLineNumber + 1);
		this.whitespaces.onModelLinesDeleted(fromLineNumber, toLineNumber);
	}

	/**
	 * Notify the layouter that lines have been inserted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the insertion started, inclusive
	 * @param toLineNumber The line number at which the insertion ended, inclusive.
	 */
	public onModelLinesInserted(fromLineNumber:number, toLineNumber:number): void {
		this.linesCount += (toLineNumber - fromLineNumber + 1);
		this.whitespaces.onModelLinesInserted(fromLineNumber, toLineNumber);
	}

	/**
	 * Get the sum of heights for all objects.
	 *
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return The sum of heights for all objects.
	 */
	public getTotalHeight(deviceLineHeight:number): number {
		var linesHeight = deviceLineHeight * this.linesCount;
		var whitespacesHeight = this.whitespaces.getTotalHeight();
		return linesHeight + whitespacesHeight;
	}

	/**
	 * Get the vertical offset (the sum of heights for all objects above) a certain line number.
	 *
	 * @param lineNumber The line number
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return The sum of heights for all objects above `lineNumber`.
	 */
	public getVerticalOffsetForLineNumber(lineNumber:number, deviceLineHeight:number): number {

		var previousLinesHeight:number;
		if (lineNumber > 1) {
			previousLinesHeight = deviceLineHeight * (lineNumber - 1);
		} else {
			previousLinesHeight = 0;
		}

		var previousWhitespacesHeight = this.whitespaces.getAccumulatedHeightBeforeLineNumber(lineNumber);

		return previousLinesHeight + previousWhitespacesHeight;
	}

	/**
	 * Returns the accumulated height of whitespaces before the given line number.
	 *
	 * @param lineNumber The line number
	 */
	public getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber:number): number {
		return this.whitespaces.getAccumulatedHeightBeforeLineNumber(lineNumber);
	}

	/**
	 * Returns if there is any whitespace in the document.
	 */
	public hasWhitespace(): boolean {
		return this.whitespaces.getCount() > 0;
	}

	public isAfterLines(verticalOffset:number, deviceLineHeight:number): boolean {
		var totalHeight = this.getTotalHeight(deviceLineHeight);
		return verticalOffset > totalHeight;
	}

	/**
	 * Find the first line number that is at or after vertical offset `verticalOffset`.
	 * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
	 * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
	 *
	 * @param verticalOffset The vertical offset to search at.
	 * @param deviceLineHeight The height, in piexels, for one rendered line.
	 * @return The line number at or after vertical offset `verticalOffset`.
	 */
	public getLineNumberAtOrAfterVerticalOffset(verticalOffset:number, deviceLineHeight:number): number {

		if (verticalOffset < 0) {
			return 1;
		}

		var minLineNumber = 1,
			maxLineNumber = this.linesCount,
			midLineNumber:number,
			midLineNumberVerticalOffset:number,
			midLineNumberHeight:number;

		while (minLineNumber < maxLineNumber) {
			midLineNumber = Math.floor((minLineNumber + maxLineNumber) / 2);

			midLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(midLineNumber, deviceLineHeight);
			midLineNumberHeight = deviceLineHeight;

			if (verticalOffset >= midLineNumberVerticalOffset + midLineNumberHeight) {
				// vertical offset is after mid line number
				minLineNumber = midLineNumber + 1;
			} else if (verticalOffset >= midLineNumberVerticalOffset) {
				// Hit
				return midLineNumber;
			} else {
				// vertical offset is before mid line number, but mid line number could still be what we're searching for
				maxLineNumber = midLineNumber;
			}
		}

		if (minLineNumber > this.linesCount) {
			return this.linesCount;
		}

		return minLineNumber;
	}

	/**
	 * Get the line that appears visually in the center between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport
	 * @param verticalOffset2 The end of the viewport.
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return The line number that is closest to the center between `verticalOffset1` and `verticalOffset2`.
	 */
	public getCenteredLineInViewport(verticalOffset1:number, verticalOffset2:number, deviceLineHeight:number): number {
		var viewportData = this.getLinesViewportData(verticalOffset1, verticalOffset2, deviceLineHeight);

		var verticalCenter = (verticalOffset2 - verticalOffset1) / 2;
		var currentLineActualTop: number,
			currentLineActualBottom: number;

		for (var lineNumber = viewportData.startLineNumber; lineNumber <= viewportData.endLineNumber; lineNumber++) {

			currentLineActualTop = viewportData.visibleRangesDeltaTop + viewportData.relativeVerticalOffset[lineNumber - viewportData.startLineNumber];
			currentLineActualBottom = currentLineActualTop + deviceLineHeight;

			if ( (currentLineActualTop <= verticalCenter && verticalCenter < currentLineActualBottom) || currentLineActualTop > verticalCenter) {
				return lineNumber;
			}
		}

		return viewportData.endLineNumber;
	}

	/**
	 * Get all the lines and their relative vertical offsets that are positioned between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport.
	 * @param verticalOffset2 The end of the viewport.
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
	 */
	public getLinesViewportData(verticalOffset1:number, verticalOffset2:number, deviceLineHeight:number): EditorCommon.IViewLinesViewportData {
		// Find first line number
		// We don't live in a perfect world, so the line number might start before or after verticalOffset1
		var startLineNumber = this.getLineNumberAtOrAfterVerticalOffset(verticalOffset1, deviceLineHeight);

		var endLineNumber = this.linesCount,
			startLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(startLineNumber, deviceLineHeight);

		// Also keep track of what whitespace we've got
		var whitespaceIndex = this.whitespaces.getFirstWhitespaceIndexAfterLineNumber(startLineNumber),
			whitespaceCount = this.whitespaces.getCount(),
			currentWhitespaceHeight: number,
			currentWhitespaceAfterLineNumber: number;

		if (whitespaceIndex === -1) {
			whitespaceIndex = whitespaceCount;
			currentWhitespaceAfterLineNumber = endLineNumber + 1;
		} else {
			currentWhitespaceAfterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);
			currentWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(whitespaceIndex);
		}

		var currentVerticalOffset = startLineNumberVerticalOffset;
		var currentLineRelativeOffset = currentVerticalOffset;

		// IE (all versions) cannot handle units above about 1,533,908 px, so every 500k pixels bring numbers down
		var STEP_SIZE = 500000;
		var bigNumbersDelta = 0;
		if (startLineNumberVerticalOffset >= STEP_SIZE) {
			// Compute a delta that guarantees that lines are positioned at `lineHeight` increments
			bigNumbersDelta = Math.floor(startLineNumberVerticalOffset / STEP_SIZE) * STEP_SIZE;
			bigNumbersDelta = Math.floor(bigNumbersDelta / deviceLineHeight) * deviceLineHeight;

			currentLineRelativeOffset -= bigNumbersDelta;
		}

		var linesOffsets:number[] = [];

		// Figure out how far the lines go
		for (var lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {

			// Count current line height in the vertical offsets
			currentVerticalOffset += deviceLineHeight;
			linesOffsets.push(currentLineRelativeOffset);

			// Next line starts immediately after this one
			currentLineRelativeOffset += deviceLineHeight;
			while (currentWhitespaceAfterLineNumber === lineNumber) {
				// Push down next line with the height of the current whitespace
				currentLineRelativeOffset += currentWhitespaceHeight;

				// Count current whitespace in the vertical offsets
				currentVerticalOffset += currentWhitespaceHeight;
				whitespaceIndex++;

				if (whitespaceIndex >= whitespaceCount) {
					currentWhitespaceAfterLineNumber = endLineNumber + 1;
				} else {
					currentWhitespaceAfterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);
					currentWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(whitespaceIndex);
				}
			}

			if (currentVerticalOffset > verticalOffset2) {
				// We have covered the entire viewport area, time to stop
				endLineNumber = lineNumber;
				break;
			}
		}

		return {
			viewportTop: verticalOffset1 - bigNumbersDelta,
			viewportHeight: verticalOffset2 - verticalOffset1,
			bigNumbersDelta: bigNumbersDelta,
			startLineNumber: startLineNumber,
			endLineNumber: endLineNumber,
			visibleRangesDeltaTop: -(verticalOffset1 - bigNumbersDelta),
			relativeVerticalOffset: linesOffsets,
			visibleRange: null, // This will be filled in by someone else :) (hint: viewLines)
			getInlineDecorationsForLineInViewport: null, // This will be filled in by linesLayout
			getDecorationsInViewport: null // This will be filled in by linesLayout
		};
	}

	public getVerticalOffsetForWhitespaceIndex(whitespaceIndex:number, deviceLineHeight:number): number {

		var previousLinesHeight:number;
		var afterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);

		var previousLinesHeight:number;
		if (afterLineNumber >= 1) {
			previousLinesHeight = deviceLineHeight * afterLineNumber;
		} else {
			previousLinesHeight = 0;
		}

		var previousWhitespacesHeight:number;
		if (whitespaceIndex > 0) {
			previousWhitespacesHeight = this.whitespaces.getAccumulatedHeight(whitespaceIndex - 1);
		} else {
			previousWhitespacesHeight = 0;
		}
		return previousLinesHeight + previousWhitespacesHeight;
	}

	public getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset:number, deviceLineHeight:number): number {

		var midWhitespaceIndex:number,
			minWhitespaceIndex = 0,
			maxWhitespaceIndex = this.whitespaces.getCount() - 1,
			midWhitespaceVerticalOffset:number,
			midWhitespaceHeight:number;

		if (maxWhitespaceIndex < 0) {
			return -1;
		}

		// Special case: nothing to be found
		var maxWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(maxWhitespaceIndex, deviceLineHeight);
		var maxWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(maxWhitespaceIndex);
		if (verticalOffset >= maxWhitespaceVerticalOffset + maxWhitespaceHeight) {
			return -1;
		}

		while (minWhitespaceIndex < maxWhitespaceIndex) {
			midWhitespaceIndex = Math.floor((minWhitespaceIndex + maxWhitespaceIndex) / 2);

			midWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(midWhitespaceIndex, deviceLineHeight);
			midWhitespaceHeight = this.whitespaces.getHeightForWhitespaceIndex(midWhitespaceIndex);

			if (verticalOffset >= midWhitespaceVerticalOffset + midWhitespaceHeight) {
				// vertical offset is after whitespace
				minWhitespaceIndex = midWhitespaceIndex + 1;
			} else if (verticalOffset >= midWhitespaceVerticalOffset) {
				// Hit
				return midWhitespaceIndex;
			} else {
				// vertical offset is before whitespace, but midWhitespaceIndex might still be what we're searching for
				maxWhitespaceIndex = midWhitespaceIndex;
			}
		}
		return minWhitespaceIndex;
	}

	/**
	 * Get exactly the whitespace that is layouted at `verticalOffset`.
	 *
	 * @param verticalOffset The vertical offset.
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
	 */
	public getWhitespaceAtVerticalOffset(verticalOffset:number, deviceLineHeight:number): EditorCommon.IViewWhitespaceViewportData {

		var candidateIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset, deviceLineHeight);

		if (candidateIndex < 0) {
			return null;
		}

		if (candidateIndex >= this.whitespaces.getCount()) {
			return null;
		}

		var candidateTop = this.getVerticalOffsetForWhitespaceIndex(candidateIndex, deviceLineHeight);

		if (candidateTop > verticalOffset) {
			return null;
		}

		var candidateHeight = this.whitespaces.getHeightForWhitespaceIndex(candidateIndex);
		var candidateId = this.whitespaces.getIdForWhitespaceIndex(candidateIndex);
		var candidateAfterLineNumber = this.whitespaces.getAfterLineNumberForWhitespaceIndex(candidateIndex);

		return {
			id: candidateId,
			afterLineNumber: candidateAfterLineNumber,
			verticalOffset: candidateTop,
			height: candidateHeight
		};
	}

	/**
	 * Get a list of whitespaces that are positioned between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport.
	 * @param verticalOffset2 The end of the viewport.
	 * @param deviceLineHeight The height, in pixels, for one rendered line.
	 * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
	 */
	public getWhitespaceViewportData(verticalOffset1:number, verticalOffset2:number, deviceLineHeight:number): EditorCommon.IViewWhitespaceViewportData[] {

		var startIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset1, deviceLineHeight);
		var endIndex = this.whitespaces.getCount() - 1;

		if (startIndex < 0) {
			return [];
		}

		var result: EditorCommon.IViewWhitespaceViewportData[] = [],
			i:number,
			top:number,
			height:number;

		for (i = startIndex; i <= endIndex; i++) {
			top = this.getVerticalOffsetForWhitespaceIndex(i, deviceLineHeight);
			height = this.whitespaces.getHeightForWhitespaceIndex(i);
			if (top >= verticalOffset2) {
				break;
			}

			result.push({
				id: this.whitespaces.getIdForWhitespaceIndex(i),
				afterLineNumber: this.whitespaces.getAfterLineNumberForWhitespaceIndex(i),
				verticalOffset: top,
				height: height
			});
		}

		return result;
	}

	public getWhitespaces(deviceLineHeight:number): EditorCommon.IEditorWhitespace[] {
		return this.whitespaces.getWhitespaces(deviceLineHeight);
	}
}