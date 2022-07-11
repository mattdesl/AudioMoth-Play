/****************************************************************************
 * exportAudio.js
 * openacousticdevices.info
 * June 2022
 *****************************************************************************/

/* global structuredClone, Blob */

/* global AMPLITUDE_THRESHOLD_BUFFER_LENGTH */
/* global PLAYBACK_MODE_ALL, PLAYBACK_MODE_SKIP, PLAYBACK_MODE_MUTE */

/* global UINT32_LENGTH, RIFF_ID_LENGTH, NUMBER_OF_BYTES_IN_SAMPLE, UINT16_LENGTH */

/* WAV header component write functions */

function writeString (state, string, length, zeroTerminated) {

    const maximumWriteLength = zeroTerminated ? Math.min(string.length, length - 1) : Math.min(string.length, length);

    const utf8Encoder = new TextEncoder();
    const stringBytes = utf8Encoder.encode(string);

    const view = new DataView(state.buffer);

    for (let i = 0; i < maximumWriteLength; i++) {

        view.setUint8(state.index + i, stringBytes[i]);

    }

    state.index += length;

}

function writeUInt32LE (state, value) {

    const view = new DataView(state.buffer);
    view.setUint32(state.index, value, true);

    state.index += UINT32_LENGTH;

}

function writeUInt16LE (state, value) {

    const view = new DataView(state.buffer);
    view.setUint16(state.index, value, true);

    state.index += UINT16_LENGTH;

}

function writeChunk (state, chunk) {

    writeString(state, chunk.id, RIFF_ID_LENGTH, false);
    writeUInt32LE(state, chunk.size);

}

/* Functions to update header */

function updateDataSize (header, size) {

    header.riff.size = header.size + size - UINT32_LENGTH - RIFF_ID_LENGTH;
    header.data.size = size;

}

function updateSampleRate (header, sampleRate) {

    header.wavFormat.samplesPerSecond = sampleRate;
    header.wavFormat.bytesPerSecond = sampleRate * NUMBER_OF_BYTES_IN_SAMPLE;

}

function writeHeader (buffer, header) {

    const state = {buffer: buffer, index: 0};

    writeChunk(state, header.riff);

    writeString(state, header.format, RIFF_ID_LENGTH, false);

    writeChunk(state, header.fmt);

    writeUInt16LE(state, header.wavFormat.format);
    writeUInt16LE(state, header.wavFormat.numberOfChannels);
    writeUInt32LE(state, header.wavFormat.samplesPerSecond);
    writeUInt32LE(state, header.wavFormat.bytesPerSecond);
    writeUInt16LE(state, header.wavFormat.bytesPerCapture);
    writeUInt16LE(state, header.wavFormat.bitsPerSample);

    writeChunk(state, header.list);

    writeString(state, header.info, RIFF_ID_LENGTH, false);

    writeChunk(state, header.icmt);
    writeString(state, 'Audio clip generated by the AudioMoth Filter Playground', header.icmt.size, true);

    writeChunk(state, header.iart);
    writeString(state, header.iart.artist, header.iart.size, true);

    writeChunk(state, header.data);

    return buffer;

}

function writeFile (header, samples, fileName, callback) {

    const blob = new Blob([header, samples.buffer], {type: 'audio/wav'});
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    link.click();
    link.remove();

    callback();

}

function exportAudio (samples, unthresholdedSamples, start, length, sampleRate, mode, playbackBufferLength, header, fileName, callback) {

    /**
     * Get array of samples like playAudio uses - DONE
     * Copy header of original file to get artist information
     * Update file size
     * Update sample rate
     * Create blob
     */

    const sampleArray = new Int16Array(playbackBufferLength);

    let unthresholdedSampleIndex = 0;

    for (let i = 0; i < length; i++) {

        const index = start + i;

        // Check if sample is in a thresholded period

        let thresholded = false;

        if (mode === PLAYBACK_MODE_MUTE || mode === PLAYBACK_MODE_SKIP) {

            const bufferIndex = Math.floor(index / AMPLITUDE_THRESHOLD_BUFFER_LENGTH);

            thresholded = !unthresholdedSamples[bufferIndex];

        }

        if (mode === PLAYBACK_MODE_SKIP) {

            if (!thresholded) {

                sampleArray[unthresholdedSampleIndex] = samples[index];

                unthresholdedSampleIndex++;

            }

        } else {

            sampleArray[i] = thresholded ? 0 : samples[index];

        }

    }

    // Rewrite header

    const newHeader = structuredClone(header);

    const headerBuffer = new ArrayBuffer(newHeader.size);

    updateDataSize(newHeader, playbackBufferLength * NUMBER_OF_BYTES_IN_SAMPLE);

    updateSampleRate(newHeader, sampleRate);

    writeHeader(headerBuffer, newHeader);

    writeFile(headerBuffer, sampleArray, fileName, callback);

}