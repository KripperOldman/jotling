import React, { useContext, useState, useEffect } from 'react';
import { EditorBlock } from 'draft-js';

import { LeftNavContext } from '../../../contexts/leftNavContext';
import { SettingsContext } from '../../../contexts/settingsContext';

import { ImageIcon } from '../../../assets/svg/ImageIcon.js';
import BlockImage from './BlockImage';

const IMAGE_CHAR = ' ';

// * * * BLOCK * * *
// block: ContentBlock {_map: Map, __ownerID: undefined}
// blockProps: undefined
// blockStyleFn: block => {…}
// contentState: ContentState {_map: Map, __ownerID: undefined}
// customStyleFn: undefined
// customStyleMap: {BOLD: {…}, CODE: {…}, ITALIC: {…}, STRIKETHROUGH: {…}, UNDERLINE: {…}, …}
// decorator: CompositeDraftDecorator {_decorators: Array(2)}
// direction: "LTR"
// forceSelection: true
// offsetKey: "ah7m4-0-0"
// preventScroll: undefined
// selection: SelectionState {_map: Map, __ownerID: undefined}
// tree: List

const BlockImageContainer = (props) => {
	const { block } = props;

	// CONTEXT
	const { editorMaxWidth, editorPadding } = useContext(SettingsContext).editorSettings;
	// NOTE: monitoring LeftNavContext in this component messes up the selection if the user
	// selects the entire block (triple clicks) that the image is in.

	// STATE
	const [imageArray, setImageArray] = useState([]);
	const [pageWidth, setPageWidth] = useState(null);

	console.log('blockImageContainer rerendered');

	// On load (or decorator change - overwriting parts of links does this), grab the Image IDs
	useEffect(() => {
		const newImageArray = block.getData().get('images', []);
		setImageArray(newImageArray);
		// if (imagesArray.length) {
		// 	setImageId(imagesArray[0].imageId);
		// 	setImageUseId(imagesArray[0].imageUseId);
		// }
	}, [block]);

	// Calculate the page width
	useEffect(() => {
		const rootSize = Number(
			window
				.getComputedStyle(document.querySelector(':root'))
				.getPropertyValue('font-size')
				.replace('px', '')
		);
		const pageWidth = (editorMaxWidth - editorPadding * 2) * rootSize;

		setPageWidth(pageWidth);
	}, [editorMaxWidth, editorPadding]);

	return (
		<div style={block.getLength() ? {} : { display: 'flex', alignItems: 'flex-start' }}>
			{imageArray.map((item) => (
				<BlockImage
					key={`${item.imageId}_${item.imageUseId}`}
					pageWidth={pageWidth}
					imageId={item.imageId}
					imageUseId={item.imageUseId}
					block={block}
					allProps={props}
				/>
			))}
			<EditorBlock {...props} />
			{/* {!!block.getLength() && <EditorBlock {...props} />} */}
		</div>
	);

	// For help in getting local images to render in electron:
	//   https://github.com/electron/electron/issues/23757#issuecomment-640146333
};

// Gets the Image IDs for the entity
const getImageIds = (entityKey, contentState, blockKey, start) => {
	if (entityKey) {
		return contentState.getEntity(entityKey).data;
	}

	const block = contentState.getBlockForKey(blockKey);
	const retrievedEntityKey = block.getEntityAt(start);
	// const { imageId, imageUseId } = contentState.getEntity(retrievedEntityKey).data;
	return contentState.getEntity(retrievedEntityKey).data;
};

// Has draft store the repositioned media location data
const handleDraftImageDrop = (
	selection,
	dataTransfer,
	isInternal,
	mediaStructure,
	setMediaStructure,
	editorStateRef
) => {
	const destBlockKey = selection.getStartKey();
	const currentContent = editorStateRef.current.getCurrentContent();
	const blockType = currentContent.getBlockForKey(destBlockKey).getType();

	const imageId = dataTransfer.data.getData('image-id');
	const imageUseId = dataTransfer.data.getData('image-use-id');

	if (imageId !== undefined) {
		// if (imageId !== undefined && blockType !== 'wiki-section') {
		const newMediaStructure = JSON.parse(JSON.stringify(mediaStructure));
		newMediaStructure[imageId].uses[imageUseId].reposition = {
			destBlockKey,
		};

		setMediaStructure(newMediaStructure);
		return 'handled';
	}
};

// const createImageSVGElement = () => {
// 	let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
// 	svg.setAttribute('viewBox', '0 0 24 24');
// 	svg.setAttribute('enable-background', 'new 0 0 24 24');
// 	svg.setAttribute('width', '24');
// 	svg.setAttribute('height', '24');

// 	let path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
// 	path1.setAttribute(
// 		'd',
// 		'm6.25 19.5c-1.601 0-3.025-1.025-3.542-2.551l-.035-.115c-.122-.404-.173-.744-.173-1.084v-6.818l-2.426 8.098c-.312 1.191.399 2.426 1.592 2.755l15.463 4.141c.193.05.386.074.576.074.996 0 1.906-.661 2.161-1.635l.901-2.865z'
// 	);
// 	let path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
// 	path2.setAttribute('d', 'm9 9c1.103 0 2-.897 2-2s-.897-2-2-2-2 .897-2 2 .897 2 2 2z');
// 	let path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
// 	path3.setAttribute(
// 		'd',
// 		'm21.5 2h-15c-1.378 0-2.5 1.122-2.5 2.5v11c0 1.378 1.122 2.5 2.5 2.5h15c1.378 0 2.5-1.122 2.5-2.5v-11c0-1.378-1.122-2.5-2.5-2.5zm-15 2h15c.276 0 .5.224.5.5v7.099l-3.159-3.686c-.335-.393-.82-.603-1.341-.615-.518.003-1.004.233-1.336.631l-3.714 4.458-1.21-1.207c-.684-.684-1.797-.684-2.48 0l-2.76 2.759v-9.439c0-.276.224-.5.5-.5z'
// 	);

// 	svg.appendChild(path1);
// 	svg.appendChild(path2);
// 	svg.appendChild(path3);

// 	return svg;
// };

export { BlockImageContainer, handleDraftImageDrop, IMAGE_CHAR };
