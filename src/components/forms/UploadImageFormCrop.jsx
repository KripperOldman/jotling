import React, { useState, useContext, useEffect } from 'react';
import { ipcRenderer } from 'electron';

import { LeftNavContext } from '../../contexts/leftNavContext';

import PopupModal from '../containers/PopupModal';

import { insertImageBlockData } from '../editor/editorFunctions';

import ReactCrop from 'react-image-crop';

const MAX_WIDTH = 1000;
const MAX_HEIGHT = 1000;
const IMG_FORMAT = 'jpeg'; // Note this is hardcoded other places in the app

const UploadImageFormCrop = ({ uploadImageUrl, setDisplayModal }) => {
	const [image, setImage] = useState(null);
	const [croppedImgBlob, setCroppedImgBlob] = useState(null);
	const [fileUrl, setFileUrl] = useState(null);
	const [crop, setCrop] = useState({
		unit: '%',
		width: 100,
		height: 100,
		x: 0,
		y: 0,
		// aspect: 1 / 1,
	});

	const {
		editorStateRef,
		setEditorStateRef,
		mediaStructure,
		setMediaStructure,
		navData,
		project,
	} = useContext(LeftNavContext);

	useEffect(() => {
		console.log('the image use effect triggered, calling make client crop');
		makeClientCrop(crop);
		// Don't include crop in monitored variables.
	}, [image]);

	const makeClientCrop = async (crop) => {
		if (image && crop.width && crop.height) {
			const newBlob = await getCroppedImg(image, crop);
			setCroppedImgBlob(newBlob);
		}
	};

	// Uses Canvas to crop and compress the image
	const getCroppedImg = (image, crop) => {
		console.log('image: ', image);
		const canvas = document.createElement('canvas');
		const scaleX = image.naturalWidth / image.width;
		const scaleY = image.naturalHeight / image.height;

		// Sets the new canvas to be the same size as the cropped image
		// NEED TO FIX - if the width or height is constrained, the other needs to be adjusted to scale
		const unconstrainedWidth = Math.ceil(crop.width * scaleX);
		const unconstrainedHeight = Math.ceil(crop.height * scaleY);
		const maxWidthRatio = MAX_WIDTH / unconstrainedWidth; // If less than 1, we're constrained
		const maxHeightRatio = MAX_HEIGHT / unconstrainedHeight; // If less than 1, we're constrained
		const maxConstraint = Math.min(maxWidthRatio, maxHeightRatio);

		const fullCropWidth = Math.ceil(unconstrainedWidth * Math.min(maxConstraint, 1));
		const fullCropHeight = Math.ceil(unconstrainedHeight * Math.min(maxConstraint, 1));

		canvas.width = fullCropWidth;
		canvas.height = fullCropHeight;

		const ctx = canvas.getContext('2d');

		// Loads the image in the cavas
		// Arguments: (image, crop x coord., crop y coord., full width, full height,
		//    canvas x coord., canvas y coord., image width, image height)
		ctx.drawImage(
			image,
			crop.x * scaleX,
			crop.y * scaleY,
			unconstrainedWidth,
			unconstrainedHeight,
			0,
			0,
			fullCropWidth,
			fullCropHeight
		);

		// Converts the image to a blob, compresses, saves the URL
		return new Promise((resolve, reject) => {
			canvas.toBlob(
				(blob) => {
					if (!blob) {
						//reject(new Error('Canvas is empty'));
						console.error('Canvas is empty');
						return;
					}
					// blob.name = fileName;
					window.URL.revokeObjectURL(fileUrl);
					setFileUrl(window.URL.createObjectURL(blob));
					// resolve(this.fileUrl);
					resolve(blob);
				},
				`image/${IMG_FORMAT}`,
				// 0.92 (78kb jpeg, 40kb webp)
				// 0.8 // (55kb jpeg, 29kb webp)
				0.8 // trims 30% file size from .92 (default) for jpeg
			);
		});
	};

	const submitImage = (e) => {
		// e.stopPropagation();
		// e.preventDefault();
		const mediaIds = Object.keys(mediaStructure).map((item) => Number(item));
		const newId = mediaIds.length ? Math.max(...mediaIds) + 1 : 1;
		const fileName = `media${newId}.${IMG_FORMAT}`;
		// console.log(croppedImgBlob);

		// NEED TO FIX SENDING THE IMAGE
		// https://stackoverflow.com/questions/43562192/write-file-to-disk-from-blob-in-electron-application
		// var buffer = Buffer.from(croppedImgBlob);

		const reader = new FileReader();
		reader.onload = () => {
			if (reader.readyState == 2) {
				var buffer = Buffer.from(reader.result);

				// Save the file
				ipcRenderer.invoke(
					'save-single-document',
					project.tempPath + '/media',
					project.jotsPath,
					fileName,
					buffer,
					false // prevents stringifying the contents
				);

				// Add the file to the mediaStructure
				// When initializing the use ID, start at 1, not 0!
				let newMediaStructure = JSON.parse(JSON.stringify(mediaStructure));
				newMediaStructure[newId] = {
					fileName,
					name: '',
					uses: {
						1: {
							sourceDoc: navData.currentDoc,
						},
					},
				};

				insertImageBlockData(newId, 1, editorStateRef.current, setEditorStateRef.current);

				setMediaStructure(newMediaStructure);
				console.log('newMediaStructure in uploadImageFormCrop:', newMediaStructure);
				setDisplayModal(false);
			}
		};

		reader.readAsArrayBuffer(croppedImgBlob);
	};

	return (
		<PopupModal setDisplayModal={setDisplayModal}>
			<h2 className='popup-modal-title'>Crop Image</h2>
			<hr className='modal-form-hr' />

			{/* Uploaded image with crop option */}
			<div className={'img-upload-react-crop-wrapper'}>
				<ReactCrop
					className={'img-upload-react-crop'}
					src={uploadImageUrl}
					crop={crop}
					ruleOfThirds
					// circularCrop
					onImageLoaded={(img) => {
						console.log('on image loaded fired!');
						setImage(img);
					}}
					onComplete={makeClientCrop}
					onChange={(crop) => setCrop(crop)}
				/>

				{/* Submit */}
				{image && (
					<button className='submit-button' onClick={submitImage}>
						Submit
					</button>
				)}
			</div>
		</PopupModal>
	);
};

export default UploadImageFormCrop;
