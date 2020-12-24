import React, {
	useState,
	useRef,
	useCallback,
	useEffect,
	useContext,
	useLayoutEffect,
} from 'react';
import { ipcRenderer } from 'electron';
import Immutable from 'immutable';

import { LeftNavContext } from '../../contexts/leftNavContext';
import { FindReplaceContext } from '../../contexts/findReplaceContext';
import { SettingsContext } from '../../contexts/settingsContext';

import {
	Editor,
	EditorState,
	SelectionState,
	RichUtils,
	Modifier,
	getDefaultKeyBinding,
	convertToRaw,
	convertFromRaw,
} from 'draft-js';
import {
	setBlockData,
	getSelectedBlocksMetadata,
	getSelectionCustomInlineStyle,
} from 'draftjs-utils';

import EditorNav from '../navs/editor-nav/EditorNav';

import {
	spaceToAutoList,
	enterToUnindentList,
	doubleDashToLongDash,
} from './KeyBindFunctions';
import {
	checkCommandForUpdateWordCount,
	checkWikiSectionSplitBlock,
	removeEndingNewline,
	updateLinkEntities,
	updateWordCount,
} from './editorFunctions';
import {
	defaultCustomStyleMap,
	blockStyleFn,
	updateCustomStyleMap,
	// extendedBlockRenderMap,
} from './editorStyleFunctions';
import { updateAllBlocks } from '../../utils/draftUtils';
import { findFileTab } from '../../utils/utils';

import { cleanupJpeg } from '../appFunctions';
import { LinkDestBlock } from './editorComponents/LinkDecorators';
import { WikiSectionTitle } from './editorComponents/WikiSectionTitle';
import { useDecorator } from './editorCustomHooks';
import {
	handleDraftImageDrop,
	BlockImageContainer,
} from './editorComponents/BlockImageContainer';

import EditorFindReplace from './EditorFindReplace';
import { StatsContext } from '../../contexts/statsContext';
import EditorHeader from '../editorHeader/EditorHeader';

var oneKeyStrokeAgo, twoKeyStrokesAgo;

// I can add custom inline styles. { Keyword: CSS property }

//
//
// COMPONENT
const EditorContainer = ({ saveProject, setSaveProject }) => {
	// CONTEXT
	const {
		navData,
		setNavData,
		project,
		setProject,
		setLinkStructure,
		linkStructureRef,
		editorStateRef,
		editorStyles,
		editorArchivesRef,
		setEditorArchives,
		setEditorStateRef,
		mediaStructure,
		setMediaStructure,
		isImageSelectedRef,
		customStyles,
		docStructureRef,
	} = useContext(LeftNavContext);
	const { showFindReplace } = useContext(FindReplaceContext);
	const {
		editorPaddingWrapperRef,
		editorContainerRef,
		editorSettings,
		lineHeight,
		fontSize,
		fontSettings,
	} = useContext(SettingsContext);
	const { setDocWordCountObj, finalizeDocWordCount, initializeDocWordCount } = useContext(
		StatsContext
	);

	// EDITOR STATE
	const [editorState, setEditorState] = useState(EditorState.createEmpty());
	// Updates the editorStateRef with the updated editorState
	useEffect(() => {
		editorStateRef.current = editorState;
	}, [editorState]);

	// STATE
	const [spellCheck, setSpellCheck] = useState(false);
	const [style, setStyle] = useState({});
	const [currentStyles, setCurrentStyles] = useState(Immutable.Set());
	const [currentBlockType, setCurrentBlockType] = useState('unstyled');
	const [currentAlignment, setCurrentAlignment] = useState('');
	const [customStyleMap, setCustomStyleMap] = useState(null);

	// QUEUES
	const [prev, setPrev] = useState({ doc: '', tempPath: '' });
	const [shouldResetScroll, setShouldResetScroll] = useState(false);

	// REFS
	const editorRef = useRef(null);

	// CUSTOM HOOKS
	const decorator = useDecorator(prev.doc, editorRef);
	// const decorator = useDecorator();

	// Focuses the editor on click
	const handleEditorWrapperClick = useCallback(
		(e) => {
			// If clicking inside the editor area but outside the
			//   actual draft-js editor, refocuses on the editor.
			if (['editor', 'editor-top-padding'].includes(e.target.className)) {
				editorRef.current.focus();
			} else if (e.target.className === 'editor-bottom-padding') {
				const newEditorState = EditorState.moveFocusToEnd(editorState);
				setEditorState(newEditorState);
			}
		},
		[editorRef, editorState]
	);

	// Sets the editorState
	const handleEditorStateChange = (editorState) => {
		// Cleans up selectionState before setting the editorState
		setEditorState(removeEndingNewline(editorState));
	};

	const blockRendererFn = useCallback((contentBlock) => {
		if (contentBlock.getType() === 'wiki-section') {
			return {
				component: WikiSectionTitle,
				editable: true,
			};
		}

		const entityKey = contentBlock.getEntityAt(0);
		if (entityKey) {
			const contentState = editorStateRef.current.getCurrentContent();
			const entity = contentState.getEntity(entityKey);
			if (entity.get('type') === 'LINK-DEST') {
				return {
					component: LinkDestBlock,
					editable: true,
				};
			}
		}

		const imagesArray = contentBlock.getData().get('images', []);
		if (imagesArray.length) {
			return {
				component: BlockImageContainer,
				editable: true,
			};
		}

		// At the end of this, if not rendering in a custom block, then check if images in the block
	}, []);

	// Make setEditorState available in the context
	useEffect(() => {
		setEditorStateRef.current = setEditorState;
	}, [setEditorState]);

	// Focus on load
	useEffect(() => {
		console.log('focus on load');
		editorRef.current.focus();
	}, [editorRef]);

	// Monitor the decorator for changes to update the editorState
	useEffect(() => {
		// Need to SET rather than createWithContent to maintain the undo/redo stack
		console.log('Updating the editor state with a new decorator');
		let newEditorState = EditorState.set(editorStateRef.current, {
			decorator: decorator,
		});

		setEditorState(newEditorState);
	}, [decorator]);

	// Handle shortcut keys. Using their default function right now.
	const customKeyBindingFn = (e) => {
		if (e.keyCode === 8 || e.keyCode === 46) {
			// Don't backspace/delete if image selected. We'll delete the image instead.
			if (isImageSelectedRef.current) {
				return 'handled-in-binding-fn';
			}
		}

		if (e.keyCode === 9 /* TAB */) {
			// NOTE: this just handles indenting list items, not indenting paragraphs.
			const newEditorState = RichUtils.onTab(e, editorState, 8);
			if (newEditorState !== editorState) {
				setEditorState(newEditorState);
			}
			twoKeyStrokesAgo = oneKeyStrokeAgo;
			oneKeyStrokeAgo = e.keyCode;
			return 'handled-in-binding-fn';
		}
		if (e.keyCode === 32 /* SPACE */) {
			// Auto-converts to lists
			let returnValue = spaceToAutoList(editorState, setEditorState);

			// If the two previous keystrokes were hyphens
			if (!returnValue && oneKeyStrokeAgo === 189 && twoKeyStrokesAgo === 189) {
				returnValue = doubleDashToLongDash(editorState, setEditorState);
			}

			if (returnValue) {
				twoKeyStrokesAgo = oneKeyStrokeAgo;
				oneKeyStrokeAgo = e.keyCode;
				return returnValue;
			}
		}
		if (e.keyCode === 13 /* ENTER */) {
			// Un-indents lists
			const returnValue = enterToUnindentList(editorState, setEditorState);

			if (returnValue) {
				twoKeyStrokesAgo = oneKeyStrokeAgo;
				oneKeyStrokeAgo = e.keyCode;
				return returnValue;
			}
		}

		twoKeyStrokesAgo = oneKeyStrokeAgo;
		oneKeyStrokeAgo = e.keyCode;
		return getDefaultKeyBinding(e);
	};

	// Provides the additional editorState and setEditorState props to handleDrop
	const wrappedHandleDrop = (selection, dataTransfer, isInternal) => {
		return handleDraftImageDrop(
			selection,
			dataTransfer,
			isInternal,
			mediaStructure,
			setMediaStructure,
			editorStateRef
		);
	};

	// Process the key presses
	const handleKeyCommand = (command, editorState) => {
		console.log('command: ', command);

		if (command === 'handled-in-binding-fn') {
			// For instance, I have to handle tab in the binding fn b/c it needs (e)
			// Otherwise, the browser tries to do things with the commands.
			return 'handled';
		}

		// Check if we need to update the word count. If so, pass through the update option.
		const updateWordCountOption = checkCommandForUpdateWordCount(command);
		if (updateWordCountOption) {
			// console.log('calling updateWordCount with command: ', updateWordCountOption);
			setTimeout(() =>
				updateWordCount(editorStateRef, editorState, setDocWordCountObj, updateWordCountOption)
			);
			// Note that this isn't "handling" the command, just scheduling a background update.
		}

		// Handle split-block's manually IF the start/end of a custom block type
		if (command === 'split-block') {
			const newEditorState = checkWikiSectionSplitBlock(editorState);
			if (newEditorState) {
				console.log('handled with wikiSectionSplitBlock');
				setEditorState(newEditorState);
				return 'handled';
			}

			// Going to have to deal with the link stuff differently (they're entities)
		}

		// If not custom handled, use the default handling
		const newEditorState = RichUtils.handleKeyCommand(editorState, command);
		if (newEditorState) {
			console.log('handle key command handled it');
			setEditorState(newEditorState);
			// console.log('handled in handleKeyCommand');
			return 'handled';
		}

		return 'not-handled'; // Lets Draft know to try to handle this itself.
	};

	const handleBeforeInput = (char, editorState) => {
		const selection = editorState.getSelection();
		const currentContent = editorState.getCurrentContent();
		const startBlock = currentContent.getBlockForKey(selection.getStartKey());
		const endBlock = currentContent.getBlockForKey(selection.getEndKey());
		const isSingleBlockSelection = startBlock.getKey() === endBlock.getKey();

		// Update the word count after each space
		if (char === ' ') {
			// Timeout to delay until after update.
			// Let's us use the selection before to check the updated editorState.
			setTimeout(() => updateWordCount(editorStateRef, editorState, setDocWordCountObj));
		}

		if (
			isSingleBlockSelection &&
			(selection.getStartOffset() === 0 || selection.getEndOffset() == endBlock.getLength())
		) {
			const entityKey = startBlock.getEntityAt(0);
			const entity = contentState.getEntity(entityKey);
			const startEntityType = entity ? entity.getType() : '';

			if (startEntityType === 'LINK-DEST') {
				// TO-DO ! ! !
				// Then we need to ensure that the new characters that are inserted have the LINK-DEST entity too
			}
		}

		// If we're typing at the end of a line and inside a link, continue that link
		if (selection.isCollapsed()) {
			const contentState = editorState.getCurrentContent();
			const blockKey = selection.getStartKey();
			const block = contentState.getBlockForKey(blockKey);
			const blockLength = block.getLength();
			const start = Math.max(selection.getStartOffset() - 1, 0);

			// Ensure the character before has an entity
			// NOTE: may need to do start - 1 (min 0)
			let startEntityKey = null;
			if (blockLength) {
				startEntityKey = block.getEntityAt(start);
			} else {
				const prevBlock = contentState.getBlockBefore(blockKey);
				if (prevBlock) {
					startEntityKey = prevBlock.getEntityAt(prevBlock.getLength() - 1);
				}
			}
			if (startEntityKey === null) {
				return 'not-handled';
			}

			// Ensuring we're typing at the end of the block
			const selectionEnd = selection.getEndOffset();
			if (blockLength !== selectionEnd) {
				return 'not-handled';
			}

			// Ensure the entity is a link source or dest
			const entity = contentState.getEntity(startEntityKey);
			if (entity && !['LINK-SOURCE', 'LINK-DEST'].includes(entity.getType())) {
				return 'not-handled';
			}

			// Ensure the next block starts with the same entity
			const nextBlock = contentState.getBlockAfter(blockKey);
			if (nextBlock && nextBlock.getEntityAt(0) !== startEntityKey) {
				return 'not-handled';
			}

			const style = editorState.getCurrentInlineStyle();
			const newContent = Modifier.insertText(
				contentState,
				selection,
				char,
				style,
				startEntityKey
			);

			console.log('handleBeforeInput - continuing link');
			const newEditorState = EditorState.push(editorState, newContent, 'insert-characters');
			setEditorState(newEditorState);
			return 'handled';
		}

		return 'not-handled';
	};

	// Toggle spellcheck. If turning it off, have to rerender the editor to remove the lines.
	const toggleSpellCheck = useCallback(
		(e) => {
			e.preventDefault();
			if (spellCheck) {
				setSpellCheck(false);
				editorRef.current.forceUpdate();
			} else {
				setSpellCheck(true);
			}
		},
		[spellCheck]
	);

	// Sets editor styles
	useEffect(() => {
		let newStyles = {};
		!!fontSettings.currentFont &&
			(newStyles['fontFamily'] = fontSettings.currentFont.toString());
		!!lineHeight && (newStyles['lineHeight'] = lineHeight + 'em');
		!!editorSettings.editorMaxWidth &&
			(newStyles['maxWidth'] = editorSettings.editorMaxWidth + 'rem');

		if (!!fontSize) {
			newStyles['fontSize'] = +fontSize;
		}

		setStyle(newStyles);
	}, [editorSettings, lineHeight, fontSize, fontSettings]);

	// Updates the customStyleMap
	useEffect(() => {
		console.log('customStyles changed');
		if (customStyles) {
			console.log('updating the style map');
			setCustomStyleMap(updateCustomStyleMap(customStyles));
			editorRef.current.forceUpdate();
		}
	}, [customStyles]);

	// Forces all blocks to update with the updated customStyleMap
	useEffect(() => {
		const newCurrentContent = updateAllBlocks(editorStateRef.current);

		const newEditorState = EditorState.set(editorStateRef.current, {
			currentContent: newCurrentContent,
		});
		setEditorState(newEditorState);
	}, [customStyleMap]);

	// Saves current document file
	const saveFile = useCallback(
		(docName = navData.currentDoc) => {
			const currentContent = editorStateRef.current.getCurrentContent();
			const rawContent = convertToRaw(currentContent);

			ipcRenderer.invoke(
				'save-single-document',
				project.tempPath, // Must be the root temp path, not a subfolder
				project.jotsPath,
				'docs/' + docName, // Saved in the docs folder
				rawContent
			);
		},
		[project.tempPath]
	);

	const runCleanup = useCallback(async () => {
		let newMediaStructure = JSON.parse(JSON.stringify(mediaStructure));
		let usedDocuments = {};

		console.log('mediaStructure: ', mediaStructure);

		// Loop through each image instance in the media structure and organize by source document
		for (let imageId in mediaStructure) {
			for (let imageUseId in mediaStructure[imageId].uses) {
				console.log('imageUseId to add to usedDocuments: ', imageUseId);
				const source = mediaStructure[imageId].uses[imageUseId].sourceDoc;

				if (!usedDocuments.hasOwnProperty(source)) {
					usedDocuments[source] = {};
				}

				// Builds a checklist of images to see if they exist, cleanup if they don't
				usedDocuments[source][`${imageId}_${imageUseId}`] = {
					imageId,
					imageUseId,
				};
			}
		}

		console.log('usedDocuments[doc5.json]: ', { ...usedDocuments['doc5.json'] });

		// Check editorArchives for everything except hte current document. Use the editorState for that.

		// For each document with images, pull the editorState and remove matches from usedDocuments
		for (let source in usedDocuments) {
			// If the currentDoc, the editorArchives will not be up to date
			console.log('source: ', source);
			console.log('navData.currentDoc === source: ', navData.currentDoc === source);
			let currentEditorState =
				navData.currentDoc === source
					? editorStateRef.current
					: editorArchivesRef.current[source].editorState;

			// Loop through each block
			if (currentEditorState) {
				const contentState = currentEditorState.getCurrentContent();
				const blockMap = contentState.getBlockMap();

				blockMap.forEach((block) => {
					let blockData = block.getData();
					let imageData = blockData.get('images', []);

					// For each image in the block
					for (let image of imageData) {
						// Remove it from our checklist
						delete usedDocuments[source][`${image.imageId}_${image.imageUseId}`];

						// If it was the last image, then stop searching the page
						if (!Object.keys(usedDocuments[source]).length) {
							delete usedDocuments[source];
							return false; // Exits the forEach
						}
					}
				});
			}
		}

		// Anything left in usedDocuments needs to be cleaned up
		for (let sourceObj of Object.values(usedDocuments)) {
			for (let imageObj of Object.values(sourceObj)) {
				newMediaStructure = await cleanupJpeg(imageObj, newMediaStructure, project.tempPath);
			}
		}

		// process each type of cleanup action
		// maybe initialize a copy of the appropriate "structure" if needed
		// and use that (vs undefined) as a flag for setting at the end?

		// Save the mediaStructure to file
		if (newMediaStructure) {
			await ipcRenderer.invoke(
				'save-single-document',
				project.tempPath,
				project.jotsPath,
				'mediaStructure.json',
				newMediaStructure
			);
		}
	}, [mediaStructure, project, editorStateRef, navData]);

	// Saves the current file and calls the main process to save the project
	const saveFileAndProject = useCallback(
		async (saveProject) => {
			const { command, options } = saveProject;
			const docName = navData.currentDoc;
			const currentContent = editorStateRef.current.getCurrentContent();
			const rawContent = convertToRaw(currentContent);
			console.log('editorContainer options: ', options);

			// Cleanup (remove) files before save. Currently not updating the currentContent.
			if (options.shouldCleanup) {
				await runCleanup();
			}

			// Save the current document
			let response = await ipcRenderer.invoke(
				'save-single-document',
				project.tempPath, // Must be the root temp path, not a subfolder
				project.jotsPath,
				'docs/' + docName, // Saved in the docs folder
				rawContent
			);

			if (response) {
				if (command === 'save-as') {
					// Leave the jotsPath argument blank to indicate a Save As
					let { tempPath, jotsPath } = await ipcRenderer.invoke(
						'save-project',
						project.tempPath,
						'',
						options
					);
					// Save the updated path names
					setProject({ tempPath, jotsPath });
				} else {
					// Request a save, don't wait for a response
					ipcRenderer.invoke('save-project', project.tempPath, project.jotsPath, options);
				}
			}
		},
		[project, navData.currentDoc, runCleanup]
	);

	// Monitors for needing to save the current file and then whole project
	useEffect(() => {
		if (Object.keys(saveProject).length) {
			saveFileAndProject(saveProject);
			setSaveProject({});
		}
	}, [saveProject, saveFileAndProject]);

	// Loads current file
	const loadFile = useCallback(() => {
		const loadFileFromSave = async () => {
			if (!navData.currentDoc) {
				console.log("There's no currentDoc to load. loadFile() aborted.");
				return;
			}

			// Flag that we've updated the file
			setPrev({ doc: navData.currentDoc, tempPath: navData.currentTempPath });

			// Load the file from the hard drive
			const loadedFile = await ipcRenderer.invoke(
				'read-single-document',
				project.tempPath,
				'docs/' + navData.currentDoc
			);
			const fileContents = loadedFile.fileContents;

			let newEditorState;
			// If the file isn't empty, load into editorState. Otherwise, create an empty editorState.
			if (fileContents && Object.keys(fileContents).length) {
				const newContentState = convertFromRaw(loadedFile.fileContents);
				newEditorState = EditorState.createWithContent(newContentState, decorator);
			} else {
				newEditorState = EditorState.createEmpty(decorator);
			}

			// Synchronizing links to this page
			const editorStateWithLinks = updateLinkEntities(
				newEditorState,
				linkStructureRef.current,
				navData.currentDoc
			);

			setEditorState(editorStateWithLinks);
			initializeDocWordCount(editorStateWithLinks);

			setShouldResetScroll(true);
			console.log('Setting editorState inside loadFile.');
		};

		loadFileFromSave();
	}, [navData, project.tempPath, updateLinkEntities, decorator]);

	// Loading the new current document
	useEffect(() => {
		if (navData.currentDoc !== prev.doc || navData.currentTempPath !== prev.tempPath) {
			// Update the session word count
			finalizeDocWordCount(editorStateRef.current);

			// If the previous doc changed and we didn't open a new project, save.
			if (prev.doc !== '' && navData.currentTempPath === prev.tempPath) {
				saveFile(prev.doc); // PROBLEM: saving after we've loaded the new project
				// Archive the editorState
				setEditorArchives((previous) => ({
					...previous,
					[prev.doc]: {
						editorState: editorStateRef.current,
						scrollY: window.scrollY,
					},
				}));
			}

			// Check for existing editorState and load from that if available
			if (editorArchivesRef.current.hasOwnProperty(navData.currentDoc)) {
				// Flag that we've updated the file
				setPrev({ doc: navData.currentDoc, tempPath: navData.currentTempPath });

				const newEditorState = editorArchivesRef.current[navData.currentDoc].editorState;
				console.log('navData.currentDoc:', navData.currentDoc);

				// TO-DO: Check for new links to add before setting the editor state
				const editorStateWithLinks = updateLinkEntities(
					newEditorState,
					linkStructureRef.current,
					navData.currentDoc
				);

				console.log('Setting editorState from editorArchives.');

				setEditorState(editorStateWithLinks);
				initializeDocWordCount(editorStateWithLinks);
				setShouldResetScroll(true);
			} else {
				loadFile();
			}
		}
	}, [editorStateRef, editorRef, navData, setNavData, prev, loadFile, linkStructureRef]);

	// Update the tab the open document is in
	useEffect(() => {
		const fileTab = findFileTab(
			docStructureRef.current,
			'doc',
			Number(navData.currentDoc.slice(3, -5))
		);
		setNavData((prev) => {
			if (prev.currentDocTab === fileTab) {
				return prev;
			}

			return {
				...prev,
				currentDocTab: fileTab,
			};
		});
	}, [navData]);

	// As we type, updates alignment/styles/type to pass down to the editorNav. We do it here
	// instead of there to prevent unnecessary renders.
	useEffect(() => {
		const newCurrentStyles = editorState.getCurrentInlineStyle();
		const newCurrentAlignment = getSelectedBlocksMetadata(editorState).get('text-align');

		const selectionState = editorState.getSelection();
		const currentBlockKey = selectionState.getStartKey();
		const block = editorState.getCurrentContent().getBlockForKey(currentBlockKey);
		const newCurrentBlockType = block.getType();

		if (!Immutable.is(newCurrentStyles, currentStyles)) {
			setCurrentStyles(newCurrentStyles);
		}

		if (newCurrentBlockType !== currentBlockType) {
			setCurrentBlockType(newCurrentBlockType);
		}

		if (newCurrentAlignment !== currentAlignment) {
			setCurrentAlignment(newCurrentAlignment);
		}
	}, [editorState, currentStyles, currentAlignment, currentBlockType]);

	// Scroll to the previous position or to the top on document load
	useLayoutEffect(() => {
		if (shouldResetScroll) {
			if (
				editorArchivesRef.current[navData.currentDoc] &&
				editorArchivesRef.current[navData.currentDoc].scrollY
			) {
				window.scrollTo(0, editorArchivesRef.current[navData.currentDoc].scrollY);
				setShouldResetScroll(false);
			} else {
				window.scrollTo(0, 0);
				setShouldResetScroll(false);
			}
		}
	}, [navData, shouldResetScroll]);

	// console.log('data: ', editorState.getCurrentContent().getFirstBlock().getData());

	return (
		<main
			className='editor-area'
			style={{
				paddingLeft: editorStyles.leftIsPinned ? editorStyles.leftNav + 'rem' : 0,
				paddingRight: editorStyles.rightIsPinned ? editorStyles.rightNav + 'rem' : 0,
			}}>
			<div
				className='editor'
				onClick={handleEditorWrapperClick}
				style={style}
				ref={editorContainerRef}>
				{/* // HOVER HERE */}
				<EditorNav
					{...{
						currentStyles,
						currentBlockType,
						currentAlignment,
						spellCheck,
						toggleSpellCheck,
						editorRef,
					}}
				/>

				<EditorHeader />

				<div
					ref={editorPaddingWrapperRef}
					style={{ padding: `0 ${editorSettings.editorPadding}rem` }}>
					<Editor
						editorState={editorState}
						onChange={handleEditorStateChange}
						ref={editorRef}
						keyBindingFn={customKeyBindingFn}
						handleKeyCommand={handleKeyCommand}
						handleBeforeInput={handleBeforeInput}
						handleDrop={wrappedHandleDrop}
						customStyleMap={customStyleMap ? customStyleMap : defaultCustomStyleMap}
						blockStyleFn={blockStyleFn}
						blockRendererFn={blockRendererFn}
						// blockRenderMap={extendedBlockRenderMap}
						// plugins={[inlineToolbarPlugin]}
						spellCheck={spellCheck}
						key={spellCheck} // Forces rerender. Hacky, needs to be replaced. But works well.
					/>
				</div>

				<div className='editor-bottom-padding' />
				{/* <InlineToolbar /> */}
				{showFindReplace && <EditorFindReplace {...{ editorRef }} />}
			</div>
		</main>
	);
};

export default EditorContainer;
