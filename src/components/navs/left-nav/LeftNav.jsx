import React, { useState, useCallback, useContext, useRef } from 'react';

import { LeftNavContext } from '../../../contexts/leftNavContext';

import LeftNavContent from './LeftNavContent';

import PushpinSVG from '../../../assets/svg/PushpinSVG';
import PlusSVG from '../../../assets/svg/PlusSVG';
// import CaratDownSVG from '../../../assets/svg/CaratDownSVG';
import DocumentPagesSVG from '../../../assets/svg/DocumentPagesSVG';
import LightbulbSVG from '../../../assets/svg/LightbulbSVG';
import BookDraftSVG from '../../../assets/svg/BookDraftSVG';
import DocumentSingleSVG from '../../../assets/svg/DocumentSingleSVG';
import FolderOpenSVG from '../../../assets/svg/FolderOpenSVG';

import {
	findMaxFileTypeIds,
	findFilePath,
	setObjPropertyAtPropertyPath,
	insertIntoArrayAtPropertyPath,
} from '../../../utils/utils';

const LeftNav = ({ editorWidth, setEditorWidth }) => {
	const { docStructure, setDocStructure, navData, setNavData } = useContext(LeftNavContext);
	const [pinNav, setPinNav] = useState(true);
	// const [rootFontSize, setRootFontSize] = useState(18);
	// const [resizeWidth, setResizeWidth] = useState(null);
	const [isResizing, setIsResizing] = useState(false);

	const navRef = useRef(null);

	const handleResizeMouseDown = (e) => {
		console.log('mouse resizing');
		setIsResizing(true);
		let rootSize = Number(
			window
				.getComputedStyle(document.querySelector(':root'))
				.getPropertyValue('font-size')
				.replace('px', '')
		);

		let minWidth = 7 * rootSize;
		let maxWidth = 25 * rootSize;
		let widthOffset = rootSize / 4;

		let newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX)) + widthOffset;
		navRef.current.style.width = newWidth + 'px';

		const handleResizeMouseMove = (e) => {
			if (e.clientX !== 0) {
				let newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX)) + widthOffset;
				navRef.current.style.width = newWidth + 'px';
			}
		};

		const handleResizeMouseUp = (e) => {
			setIsResizing(false);
			window.removeEventListener('mousemove', handleResizeMouseMove);
			window.removeEventListener('mouseup', handleResizeMouseUp);

			let newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX)) + widthOffset;

			setEditorWidth({ ...editorWidth, leftNav: newWidth / rootSize });
		};

		window.addEventListener('mousemove', handleResizeMouseMove);
		window.addEventListener('mouseup', handleResizeMouseUp);

		// Set a transparent ghost image for the drag
		// var img = new Image();
		// img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
		// e.dataTransfer.setDragImage(img, 0, 0);
	};

	const addFile = useCallback(
		(fileType) => {
			// Create a docStructure object for our current tab.
			// We'll insert our file and overwrite this section of docStructure.
			let folderStructure = JSON.parse(JSON.stringify(docStructure[navData.currentTab]));
			let maxIds = JSON.parse(JSON.stringify(docStructure.maxIds));
			// Note the spread operator only performs a shallow copy (nested objects are still refs).
			//   The JSON method performs a deep copy.

			// Find the max ID for file types (so we can increment for the new one)
			// let maxIds = findMaxFileTypeIds(folderStructure);

			// Find out where we need to insert the new file
			let filePath = '';
			console.log(navData.lastClicked.type);
			if (navData.lastClicked.type !== '') {
				let tempPath = findFilePath(
					folderStructure,
					'',
					navData.lastClicked.type,
					navData.lastClicked.id
				);
				console.log(tempPath);
				filePath =
					tempPath +
					(navData.lastClicked.type === 'folder'
						? tempPath === ''
							? ''
							: '/' + `folders/${navData.lastClicked.id}`
						: '');
				console.log(filePath);
			}

			// Build the object that will go in 'children' at the path
			let childObject = {
				type: fileType,
				id: maxIds[fileType] + 1,
				name: fileType === 'Doc' ? 'New Document' : `New ${fileType}`,
			};
			if (fileType === 'doc') {
				childObject.fileName = 'doc' + childObject.id + '.json';
			}

			// Build the object that will go in 'folders' at the path.
			if (fileType === 'folder') {
				let folderObject = { folders: {}, children: [] };
				// Insert the folder into the folder structure
				console.log('filepath: ', filePath);
				folderStructure = setObjPropertyAtPropertyPath(
					filePath + (filePath === '' ? '' : '/') + 'folders/' + childObject.id,
					folderObject,
					folderStructure
				);
			}

			// Inserts the new child into our folderStructure at the destination path
			folderStructure = insertIntoArrayAtPropertyPath(
				filePath + (filePath === '' ? '' : '/') + 'children',
				childObject,
				folderStructure
			);

			// Will put the file name into edit mode
			let newEditFileId = fileType + '-' + (maxIds[fileType] + 1);
			setNavData({ ...navData, editFile: newEditFileId });

			// console.log(folderStructure);

			// Increment the max ID for a file type
			maxIds[fileType] = maxIds[fileType] + 1;

			setDocStructure({ ...docStructure, [navData.currentTab]: folderStructure, maxIds });
		},
		[navData.currentTab, navData.lastClicked, docStructure, setDocStructure]
	);

	return (
		<nav
			className={'side-nav left-nav' + (pinNav ? '' : ' hidden')}
			style={isResizing ? {} : { width: editorWidth.leftNav + 'rem' }}
			ref={navRef}>
			<div className='side-nav-container'>
				<div className='left-nav-top-buttons'>
					<div className='add-file-folder-wrapper'>
						<button className='nav-button add-file-button' onClick={() => addFile('doc')}>
							<span className='plus-sign'>
								<PlusSVG />
							</span>
							<DocumentSingleSVG />
						</button>
						<button className='nav-button add-file-button' onClick={() => addFile('folder')}>
							<span className='plus-sign'>
								<PlusSVG />
							</span>
							<FolderOpenSVG />
						</button>
					</div>
					<button
						className={'nav-button' + (pinNav ? ' active' : '')}
						onMouseUp={() => {
							setPinNav(!pinNav);
							setEditorWidth({ ...editorWidth, leftIsPinned: !pinNav });
						}}>
						<PushpinSVG />
					</button>
				</div>

				<div className='left-nav-sections'>
					<div
						className={
							'nav-section-tab first' + (navData.currentTab === 'pages' ? ' active' : '')
						}
						onClick={() =>
							setNavData({
								...navData,
								currentTab: 'pages',
								lastClicked: { type: '', id: '' },
							})
						}>
						<DocumentPagesSVG />
					</div>
					<div
						className={
							'nav-section-tab' + (navData.currentTab === 'research' ? ' active' : '')
						}
						onClick={() =>
							setNavData({
								...navData,
								currentTab: 'research',
								lastClicked: { type: '', id: '' },
							})
						}>
						<LightbulbSVG />
					</div>
					<div
						className={
							'nav-section-tab last' + (navData.currentTab === 'draft' ? ' active' : '')
						}
						onClick={() =>
							setNavData({
								...navData,
								currentTab: 'draft',
								lastClicked: { type: '', id: '' },
							})
						}>
						<BookDraftSVG />
					</div>
				</div>

				<LeftNavContent />

				<div className='left-nav-footer'>
					<p>497 words</p>
					<p>49% today's goal</p>
				</div>
			</div>
			<div
				className='vertical-rule-side-nav-wrapper'
				style={pinNav ? {} : { cursor: 'inherit' }}
				{...(pinNav && { onMouseDown: handleResizeMouseDown })}>
				<div className={'vertical-rule vr-left-nav' + (isResizing ? ' primary-color' : '')} />
			</div>
		</nav>
	);
};

export default LeftNav;