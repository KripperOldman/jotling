import React, { useState, useContext, useEffect, useRef } from 'react';
import { EditorState, Modifier, SelectionState, EditorBlock } from 'draft-js';

import { updateImageBlockData } from '../editorFunctions';

import { LeftNavContext } from '../../../contexts/leftNavContext';

const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;

const BlockImage = ({ pageWidth, imageId, imageUseId, block, allProps }) => {
	// STATE
	const [displayData, setDisplayData] = useState(null);
	const [repositionX, setRepositionX] = useState(null);
	const [repositionOffset, setRepositionOffset] = useState(0);
	const [imageStyle, setImageStyle] = useState({ display: 'none' });
	const [wrapperStyle, setWrapperStyle] = useState({ display: 'none' });
	const [imageUrl, setImageUrl] = useState(null);
	const [isFocused, setIsFocused] = useState(false);
	const [blockKey, setBlockKey] = useState(block.getKey());

	// CONTEXT
	const {
		editorStateRef,
		setEditorStateRef,
		project,
		mediaStructure,
		setMediaStructure,
		editorStyles,
		isImageSelectedRef,
	} = useContext(LeftNavContext);

	// REF
	const imgRef = useRef(null);
	const imgContainerRef = useRef(null);

	// Setting the image URL
	useEffect(() => {
		if (imageId !== null) {
			setImageUrl('file://' + project.tempPath + `/media/media${imageId}.jpeg`);
		}
	}, [imageId, project]);

	// Load the displayData from the block metadata
	useEffect(() => {
		if (imageId && imageUseId) {
			// Get the resize/float data from the block
			const blockData = block.getData();
			let blockImageArray = blockData.get('images', []);
			let imageData = blockImageArray.find(
				(item) => item.imageId === imageId && item.imageUseId === imageUseId
			);

			if (JSON.stringify(imageData) !== JSON.stringify(displayData)) {
				setDisplayData(imageData);
			}

			// Merge the two sources
			// data.resize = imageData.resize;
			// imageData.float = imageData.float ? imageData.float : 'right';
		}
		// Deliberately not monitor the block, only do this on load
	}, [imageId, imageUseId, block, displayData]);

	// Set image styles
	useEffect(() => {
		if (displayData) {
			let newStyle = {
				maxWidth: '100%',
				// padding: '2px',
				display: 'block',
				position: 'relative',
			};

			if (displayData.resize && displayData.resize.width) {
				newStyle.width = displayData.resize.width.toString() + 'px';
			} else if (displayData.resize && displayData.resize.height) {
				newStyle.height = displayData.resize.height.toString() + 'px';
			} else {
				newStyle.maxWidth = Math.ceil(pageWidth * 0.5) + 'px';
				newStyle.maxHeight = '30vh';
			}

			if (isFocused) {
				newStyle.boxShadow = '0 0 0 3px rgba(var(--color-primary-rgb), 0.3)';
			}

			setImageStyle(newStyle);
		}
	}, [displayData, pageWidth, isFocused]);

	// Sets the styles for the image wrapper
	useEffect(() => {
		if (displayData) {
			let newWrapperStyle = {};

			if (block.getLength()) {
				newWrapperStyle.float = displayData.float ? displayData.float : 'right';

				if (newWrapperStyle.float === 'right') {
					newWrapperStyle.marginRight = '0';
				} else {
					newWrapperStyle.marginLeft = '0';
				}
			} else {
				newWrapperStyle.marginBottom = '1rem';
				newWrapperStyle.marginLeft = '0';
			}

			setWrapperStyle(newWrapperStyle);
		}
	}, [displayData, block]);

	// Pull the blockKey
	useEffect(() => {
		if (block.getKey() !== blockKey) {
			setBlockKey(block.getKey());
		}
	}, [block, blockKey]);

	// Synchronize the displayData back to the block metadata
	// useEffect(() => {
	// 	if (displayData && (displayData.resize || displayData.float)) {
	// 		updateImageBlockData(
	// 			imageId,
	// 			imageUseId,
	// 			editorStateRef.current,
	// 			setEditorStateRef.current,
	// 			block.getKey(),
	// 			displayData
	// 		);
	// 	}
	// }, [displayData, imageId, imageUseId, blockKey]);

	// If repositioning the image, update the mediaStructure and move the image
	// Yo binarywarrior76, you're pretty dope. Thanks. 👍
	useEffect(() => {
		if (imageId === null || imageUseId === null) {
			return;
		}

		const reposition = mediaStructure[imageId].uses[imageUseId].reposition;

		if (reposition && reposition.destBlockKey && repositionX) {
			setRepositionX(null);
			setRepositionOffset(0);
			console.log('repositionX:', repositionX);
			console.log('repositionOffset: ', repositionOffset);

			// *** Update float left/right
			const docWidth = document.body.clientWidth;
			const { leftNav, leftIsPinned, rightNav, rightIsPinned } = editorStyles;
			const rootSize = Number(
				window
					.getComputedStyle(document.querySelector(':root'))
					.getPropertyValue('font-size')
					.replace('px', '')
			);

			let left = leftIsPinned ? leftNav * rootSize : 0;
			let right = rightIsPinned ? docWidth - rightNav * rootSize : docWidth;
			let center = (left + right) / 2;

			let floatDirection = repositionX - repositionOffset < center ? 'left' : 'right';
			const newMediaStructure = JSON.parse(JSON.stringify(mediaStructure));
			delete newMediaStructure[imageId].uses[imageUseId].reposition;
			// newMediaStructure[imageId].uses[imageUseId].float = floatDirection;
			setMediaStructure(newMediaStructure);
			setDisplayData((prev) => ({
				...prev,
				float: floatDirection,
			}));

			// *** Move the image ***
			const contentState = editorStateRef.current.getCurrentContent();

			// If not changing blocks, we're finished.
			if (reposition.destBlockKey === blockKey) {
				updateImageBlockData(
					imageId,
					imageUseId,
					editorStateRef.current,
					setEditorStateRef.current,
					blockKey,
					{
						...displayData,
						float: floatDirection,
					}
				);
				return;
			}

			// Select the original image location
			const {
				newContentState: contentStateBeforeInsert,
				newSelectionState,
			} = removeImageFromBlockData(blockKey, block, imageId, imageUseId, contentState);

			// Update the new block meta data with the additional image
			const newBlock = contentStateBeforeInsert.getBlockForKey(reposition.destBlockKey);
			const newBlockData = newBlock.getData();
			let newImagesArray = [...newBlockData.get('images', [])];
			newImagesArray.push({
				...displayData,
				float: floatDirection,
			});
			const newBlockDataToInsert = newBlockData.set('images', newImagesArray);

			// Select the new block
			const insertSelectionState = newSelectionState.merge({
				anchorKey: reposition.destBlockKey, // Starting position
				anchorOffset: 0, // How much to adjust from the starting position
				focusKey: reposition.destBlockKey, // Ending position
				focusOffset: 0, // How much to adjust from the ending position.
			});

			// Update the block data to insert the new image
			const contentStateAfterInsert = Modifier.setBlockData(
				contentStateBeforeInsert,
				insertSelectionState,
				newBlockDataToInsert
			);

			const newEditorState = EditorState.push(
				editorStateRef.current,
				contentStateAfterInsert,
				'change-block-data'
			);

			setEditorStateRef.current(newEditorState);
		}
	}, [repositionX, repositionOffset, block, mediaStructure, displayData]);

	// RESIZE LEFT
	const handleResizeLeftMouseDown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const initialX = e.clientX;
		const startWidth = imgRef.current.getBoundingClientRect().width;

		// When the mouse moves, update the width to reflext the mouse's X coordinate
		const handleResizeLeftMouseMove = (e) => {
			if (e.clientX !== 0) {
				const newWidth = Math.max(MIN_WIDTH, startWidth - (e.clientX - initialX));

				imgRef.current.style.width = newWidth + 'px';
				imgRef.current.style.height = 'auto';
			}
		};

		// When finshed resizing, set the width in REMs so it responds to root size changes
		const handleResizeLeftMouseUp = (e) => {
			window.removeEventListener('mousemove', handleResizeLeftMouseMove);
			window.removeEventListener('mouseup', handleResizeLeftMouseUp);

			const newWidth = Math.max(MIN_WIDTH, startWidth - (e.clientX - initialX));

			updateImageBlockData(
				imageId,
				imageUseId,
				editorStateRef.current,
				setEditorStateRef.current,
				block.getKey(),
				{
					...displayData,
					resize: {
						width: newWidth,
						height: null,
					},
				}
			);

			setDisplayData((prev) => ({
				...prev,
				resize: {
					...prev.resize,
					width: newWidth,
					height: null,
				},
			}));
		};

		window.addEventListener('mousemove', handleResizeLeftMouseMove);
		window.addEventListener('mouseup', handleResizeLeftMouseUp);
	};

	// RESIZE RIGHT
	const handleResizeRightMouseDown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const initialX = e.clientX;
		const startWidth = imgRef.current.getBoundingClientRect().width;

		// When the mouse moves, update the width to reflext the mouse's X coordinate
		const handleResizeRightMouseMove = (e) => {
			if (e.clientX !== 0) {
				const newWidth = Math.max(MIN_WIDTH, startWidth + (e.clientX - initialX));

				imgRef.current.style.width = newWidth + 'px';
				imgRef.current.style.height = 'auto';
			}
		};

		// When finshed resizing, set the width in REMs so it responds to root size changes
		const handleResizeRightMouseUp = (e) => {
			window.removeEventListener('mousemove', handleResizeRightMouseMove);
			window.removeEventListener('mouseup', handleResizeRightMouseUp);

			const newWidth = Math.max(MIN_WIDTH, startWidth + (e.clientX - initialX));

			updateImageBlockData(
				imageId,
				imageUseId,
				editorStateRef.current,
				setEditorStateRef.current,
				block.getKey(),
				{
					...displayData,
					resize: {
						width: newWidth,
						height: null,
					},
				}
			);

			setDisplayData((prev) => ({
				...prev,
				resize: {
					...prev.resize,
					width: newWidth,
					height: null,
				},
			}));
		};

		window.addEventListener('mousemove', handleResizeRightMouseMove);
		window.addEventListener('mouseup', handleResizeRightMouseUp);
	};

	// RESIZE VERTICAL
	const handleResizeVerticalMouseDown = (e) => {
		e.preventDefault();
		// e.stopPropagation();

		const initialY = e.clientY;
		const startHeight = imgRef.current.getBoundingClientRect().height;

		// Calculate max height
		const fullHeight = imgRef.current.naturalHeight;
		const fullWidth = imgRef.current.naturalWidth;
		const aspectRatio = fullWidth / fullHeight;
		const maxHeight = (pageWidth - 8) / aspectRatio; // Remove the 8px image margin

		// When the mouse moves, update the width to reflext the mouse's X coordinate
		const handleResizeVerticalMouseMove = (e) => {
			if (e.clientY !== 0) {
				const newHeight = Math.min(
					Math.max(MIN_HEIGHT, startHeight + (e.clientY - initialY)),
					maxHeight
				);

				imgRef.current.style.height = newHeight + 'px';
				imgRef.current.style.width = 'auto';
			}
		};

		// When finshed resizing, set the width in REMs so it responds to root size changes
		const handleResizeVerticalMouseUp = (e) => {
			window.removeEventListener('mousemove', handleResizeVerticalMouseMove);
			window.removeEventListener('mouseup', handleResizeVerticalMouseUp);

			const newHeight = Math.min(
				Math.max(MIN_HEIGHT, startHeight + (e.clientY - initialY)),
				maxHeight
			);

			updateImageBlockData(
				imageId,
				imageUseId,
				editorStateRef.current,
				setEditorStateRef.current,
				block.getKey(),
				{
					...displayData,
					resize: {
						height: newHeight,
						width: null,
					},
				}
			);

			// setContainerHeight(newHeight);
			setDisplayData((prev) => ({
				...prev,
				resize: {
					...prev.resize,
					height: newHeight,
					width: null,
				},
			}));
		};

		window.addEventListener('mousemove', handleResizeVerticalMouseMove);
		window.addEventListener('mouseup', handleResizeVerticalMouseUp);
	};

	const handleDragStart = (e) => {
		// Set the drop type (not sure if working - logging the dataTransfer still seems empty)
		e.dataTransfer.dropEffect = 'move';
		console.log('start X: ', e.clientX);
		const target = e.target.getBoundingClientRect();
		const leftOffset = e.clientX - target.left;

		// Store the data for the image to move
		e.dataTransfer.setData('image-id', imageId);
		e.dataTransfer.setData('image-use-id', imageUseId);

		// Set the ghost image
		// const base64Icon = btoa(ImageIcon);
		// let img = new Image();
		// img.src = base64Icon;
		// e.dataTransfer.setDragImage(createImageSVGElement(), 12, 12);

		setRepositionX(null);
		setRepositionOffset(leftOffset);
		// setDisable(true);
	};

	// Remove focus if clicking outside the image
	const handleExternalClicks = (e) => {
		if (imgContainerRef.current && !imgContainerRef.current.contains(e.target)) {
			isImageSelectedRef.current = false;
			window.removeEventListener('click', handleExternalClicks);
			window.removeEventListener('keyup', handleImageDelete);
			setIsFocused(false);
		}
	};

	// Delete image
	const handleImageDelete = (e) => {
		console.log('keycode', e.keyCode);
		if (e.keyCode === 8 || e.keyCode === 46) {
			isImageSelectedRef.current = false;
			window.removeEventListener('click', handleExternalClicks);
			window.removeEventListener('keyup', handleImageDelete);

			// Select the original image location
			const contentState = editorStateRef.current.getCurrentContent();
			const blockKey = block.getKey();
			const { newContentState } = removeImageFromBlockData(
				blockKey,
				block,
				imageId,
				imageUseId,
				contentState
			);

			const newEditorState = EditorState.push(
				editorStateRef.current,
				newContentState,
				'change-block-data'
			);

			setEditorStateRef.current(newEditorState);
			// Delete the image
			// Grab the metadata for the block
			// Remove this image from that image array in the metadata
			// Schedule on application close:
			// In the mediaStructure, remove this image use.
			// If this was the only image used, remove the entire image entry
			// AND delete the image file from the project files
		}
	};

	// Focus on the image on click
	const handleFocusClick = (e) => {
		if (!isFocused) {
			setIsFocused(true);
			isImageSelectedRef.current = true;

			window.addEventListener('click', handleExternalClicks);
			window.addEventListener('keyup', handleImageDelete);
		}
	};

	// Clean up the listeners on unmount
	useEffect(() => {
		return () => {
			isImageSelectedRef.current = false;
			window.removeEventListener('click', handleExternalClicks);
			window.removeEventListener('keyup', handleImageDelete);
		};
	}, []);

	return (
		!!imageUrl && (
			<div
				className='decorator-image-wrapper'
				style={wrapperStyle}
				contentEditable={false}
				ref={imgContainerRef}>
				<img
					ref={imgRef}
					className='decorator-image'
					src={imageUrl}
					style={imageStyle}
					onDragStart={handleDragStart}
					onDragEnd={(e) => {
						e.persist();
						for (let element of e.nativeEvent.path) {
							if (element.classList.contains('DraftEditor-root')) {
								e.persist();
								console.log(e);
								setRepositionX(e.clientX);
								break;
							}
						}
					}}
					onClick={handleFocusClick}
				/>
				<div
					className='peek-window-resize document-image left'
					onMouseDown={handleResizeLeftMouseDown}
				/>
				<div
					className='peek-window-resize document-image right'
					onMouseDown={handleResizeRightMouseDown}
				/>
				<div
					className='peek-window-resize document-image bottom'
					onMouseDown={handleResizeVerticalMouseDown}
				/>
				<div
					className='peek-window-resize document-image bottom-left'
					onMouseDown={(e) => {
						handleResizeLeftMouseDown(e);
						handleResizeVerticalMouseDown(e);
					}}
				/>
				<div
					className='peek-window-resize document-image bottom-right'
					onMouseDown={(e) => {
						handleResizeRightMouseDown(e);
						handleResizeVerticalMouseDown(e);
					}}
				/>

				{/* Image Resize Squares */}
				{isFocused && (
					<>
						<div className='image-resize-handle left vcenter' />
						<div className='image-resize-handle left bottom' />
						<div className='image-resize-handle hcenter bottom' />
						<div className='image-resize-handle right bottom' />
						<div className='image-resize-handle right vcenter' />
					</>
				)}
				{/* {!block.getLength() && <EditorBlock {...allProps} />} */}
			</div>
		)
	);
};

export default BlockImage;

// Removes an image from the block metadata. Returns the new contentState and selectionState
const removeImageFromBlockData = (blockKey, block, imageId, imageUseId, contentState) => {
	const newSelectionState = SelectionState.createEmpty();
	const removeSelectionState = newSelectionState.merge({
		anchorKey: blockKey,
		anchorOffset: 0,
		focusKey: blockKey,
		focusOffset: 0,
	});

	// Remove the original image from the block data array
	const origBlockData = block.getData();
	let imagesArray = [...origBlockData.get('images', [])];
	const origImageIndex = imagesArray.findIndex(
		(item) => item.imageId === imageId && item.imageUseId === imageUseId
	);
	imagesArray.splice(origImageIndex, 1);
	const origBlockDataToInsert = origBlockData.set('images', imagesArray);

	// Update the block data to remove the image
	const newContentState = Modifier.setBlockData(
		contentState,
		removeSelectionState,
		origBlockDataToInsert
	);
	return { newContentState, newSelectionState };
};
