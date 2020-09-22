import React, {
	createContext,
	useState,
	useRef,
	useEffect,
	useContext,
	useCallback,
} from 'react';

import { findVisibleBlocks } from '../components/editor/editorFunctions';

import { LeftNavContext } from './leftNavContext';

export const FindReplaceContext = createContext();

const FindReplaceContextProvider = (props) => {
	// STATE
	const [findText, setFindText] = useState('');
	const [replaceText, setReplaceText] = useState('');
	const [showFindReplace, setShowFindReplace] = useState(false);
	const [replaceDefaultOn, setReplaceDefaultOn] = useState(false);
	const [refocusFind, setRefocusFind] = useState(false);
	const [refocusReplace, setRefocusReplace] = useState(false);
	const [findIndex, setFindIndex] = useState(null);
	const [totalMatches, setTotalMatches] = useState(0);
	const [replaceSingleQueue, setReplaceSingleQueue] = useState({});
	const [replaceAll, setReplaceAll] = useState('');
	const [prev, setPrev] = useState({});

	// REF
	const findRegisterRef = useRef({});
	const updateFindRegisterQueueRef = useRef(null);
	const resetReplaceAllQueueRef = useRef(null);
	const queueIncrementRef = useState(null);
	const replaceAllCharacterOffsetRef = useRef({});
	const contextEditorRef = useRef(null);

	// CONTEXT
	const { navData, editorStateRef } = useContext(LeftNavContext);
	const currentDoc = navData.currentDoc;

	// Reset the findRegister when the findText or currentDoc changes
	useEffect(() => {
		setFindIndex(null);
		findRegisterRef.current[findText.toLowerCase()] = {
			array: [],
			register: {},
			blockList: {},
		};

		for (let key of Object.keys(findRegisterRef.current)) {
			if (key !== findText.toLowerCase()) {
				delete findRegisterRef.current[key];
			}
		}
	}, [findText, currentDoc]);

	// Once all replace alls have completed, reset the replace all variable
	const resetReplaceAll = useCallback(() => {
		clearTimeout(resetReplaceAllQueueRef.current);

		resetReplaceAllQueueRef.current = setTimeout(() => {
			setReplaceAll('');
			replaceAllCharacterOffsetRef.current = {};
			setTotalMatches(findRegisterRef.current[findText.toLowerCase()].array.length);
		}, 100);
	});

	const updateFindIndex = useCallback(
		(direction) => {
			if (
				!findRegisterRef.current[findText.toLowerCase()] ||
				!findRegisterRef.current[findText.toLowerCase()].array.length
			) {
				return;
			}

			// For the first search, find the match on screen (or the next off screen)
			if (findIndex === null) {
				let visibleBlocks = findVisibleBlocks(contextEditorRef.current);

				// Check the visible blocks for the first match
				for (const [i, match] of findRegisterRef.current[
					findText.toLowerCase()
				].array.entries()) {
					if (visibleBlocks.includes(match.blockKey)) {
						setFindIndex(i);
						return;
					}
				}

				// If not on screen, iterate through the off-screen blocks to find the first match
				let contentState = editorStateRef.current.getCurrentContent();
				const blocksWithMatches = findRegisterRef.current[findText.toLowerCase()].array.map(
					(item) => item.blockKey
				);

				// Start with the last block on screen
				let blockKey = visibleBlocks[visibleBlocks.length - 1].blockKey;
				while (true) {
					// Move to the next block
					let block = contentState.getBlockAfter(blockKey);
					if (!block) {
						// Or the first block if we were at the last
						block = contentState.getFirstBlock();
					}
					// Update the block key for the next iteration
					blockKey = block.getKey();

					if (blocksWithMatches.includes(blockKey)) {
						let matchIndex = findRegisterRef.current[findText.toLowerCase()].array.findIndex(
							(item) => item.blockKey === blockKey
						);
						setFindIndex(matchIndex);
						return;
					}
				}
			}

			if (direction === 'INCREMENT') {
				if (findIndex === findRegisterRef.current[findText.toLowerCase()].array.length - 1) {
					setFindIndex(0);
				} else {
					setFindIndex(findIndex + 1);
				}
			}

			if (direction === 'DECREMENT') {
				if (findIndex === 0) {
					setFindIndex(findRegisterRef.current[findText.toLowerCase()].array.length - 1);
				} else {
					setFindIndex(findIndex - 1);
				}
			}
		},
		[findIndex, setFindIndex, findText]
	);

	const queueDecoratorUpdate = useCallback((findText) => {
		// Remove any queued updates to findRegisterRef
		clearTimeout(updateFindRegisterQueueRef.current);

		// Update the number of matches on the page
		updateFindRegisterQueueRef.current = setTimeout(() => {
			setTotalMatches(findRegisterRef.current[findText.toLowerCase()].array.length);
		}, 100);
	}, []);

	// When we change our search, update our findIndex
	useEffect(() => {
		if (prev.findText !== findText || prev.currentDoc !== currentDoc) {
			setTimeout(() => {
				updateFindIndex();
			}, 0);
			setPrev({ findText, currentDoc });
		}
	}, [findText, currentDoc, updateFindIndex]);

	// const queueIncrement = useCallback(() => {
	// 	// Remove any queued updates to findRegisterRef
	// 	clearTimeout(queueIncrementRef.current);

	// 	// Update the number of matches on the page
	// 	queueIncrementRef.current = setTimeout(() => {
	// 		updateFindIndex('INCREMENT');
	// 	}, 100);
	// }, [updateFindIndex]);

	return (
		<FindReplaceContext.Provider
			value={{
				findText,
				setFindText,
				showFindReplace,
				setShowFindReplace,
				replaceDefaultOn,
				setReplaceDefaultOn,
				refocusFind,
				setRefocusFind,
				refocusReplace,
				setRefocusReplace,
				findRegisterRef,
				findIndex,
				setFindIndex,
				queueDecoratorUpdate,
				totalMatches,
				resetReplaceAll,
				replaceText,
				setReplaceText,
				replaceSingleQueue,
				setReplaceSingleQueue,
				replaceAll,
				setReplaceAll,
				replaceAllCharacterOffsetRef,
				updateFindIndex,
				contextEditorRef,
				// queueIncrement,
			}}>
			{props.children}
		</FindReplaceContext.Provider>
	);
};

export default FindReplaceContextProvider;