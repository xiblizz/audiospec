import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.js'
import Spectrogram from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/spectrogram.js'

// Application State
let wavesurfer = null
let currentFileUrl = null
let currentFileSampleRate = 44100
let isMuted = false
let isLooping = false
let previousVolume = 0.8
let currentTags = {} // Stores current metadata tags key-values
let originalFileName = null // Stores currently loaded track filename for saved edits
let newCoverArtFile = null // Holds new cover art file object if replaced locally

// DOM Elements
const dropzone = document.getElementById('dropzone')
const fileInput = document.getElementById('file-input')
const uploadProgressContainer = document.getElementById('upload-progress-container')
const progressRingCircle = document.getElementById('progress-ring-circle')
const progressPercent = document.getElementById('progress-percent')
const progressStatus = document.getElementById('progress-status')
const audioFilesList = document.getElementById('audio-files-list')
const audioFilesCount = document.getElementById('audio-files-count')

// Metadata DOM Elements
const activeFileHeader = document.getElementById('active-file-header')
const headerFilename = document.getElementById('header-filename')
const noAudioOverlay = document.getElementById('no-audio-loader-overlay')

const metaCodec = document.getElementById('meta-codec')
const metaSamplerate = document.getElementById('meta-samplerate')
const metaBitdepth = document.getElementById('meta-bitdepth')
const metaChannels = document.getElementById('meta-channels')
const metaBitrate = document.getElementById('meta-bitrate')
const metaFormatShort = document.getElementById('meta-format-short')
const metaFormatLong = document.getElementById('meta-format-long')
const metaFilesize = document.getElementById('meta-filesize')
const metaDuration = document.getElementById('meta-duration')
// const metaNyquist = document.getElementById('meta-nyquist')

const tagsListContainer = document.getElementById('tags-list-container')
const btnAddTag = document.getElementById('btn-add-tag')
const btnSaveTags = document.getElementById('btn-save-tags')
const coverArtContainer = document.getElementById('cover-art-container')
const coverArtInput = document.getElementById('cover-art-input')
const btnReplaceArt = document.getElementById('btn-replace-art')
const btnDownloadArt = document.getElementById('btn-download-art')
const metaCoverArt = document.getElementById('meta-cover-art')
const metaCoverPlaceholder = document.getElementById('meta-cover-placeholder')

// Frequency Scale DOM Elements
const khzMax = document.getElementById('khz-max')
const khzMid8 = document.getElementById('khz-mid8')
const khzMid7 = document.getElementById('khz-mid7')
const khzMid6 = document.getElementById('khz-mid6')
const khzMid5 = document.getElementById('khz-mid5')
const khzMid4 = document.getElementById('khz-mid4')
const khzMid3 = document.getElementById('khz-mid3')
const khzMid2 = document.getElementById('khz-mid2')
const khzMid1 = document.getElementById('khz-mid1')
const khzMid0 = document.getElementById('khz-mid0')
const khzMin = document.getElementById('khz-min')

// Controls DOM Elements
const btnPlay = document.getElementById('btn-play')
const getPlayIcon = () => document.getElementById('play-icon')
const btnStop = document.getElementById('btn-stop')
const btnLoop = document.getElementById('btn-loop')
const btnMute = document.getElementById('btn-mute')
const getMuteIcon = () => document.getElementById('mute-icon')
const volumeSlider = document.getElementById('volume-slider')
const timeCurrent = document.getElementById('time-current')
const timeTotal = document.getElementById('time-total')

// Help Modal DOM Elements
const helpModal = document.getElementById('help-modal')
const btnThemeHelp = document.getElementById('btn-theme-help')
const btnCloseHelp = document.getElementById('btn-close-help')
const btnCloseHelpConfirm = document.getElementById('btn-close-help-confirm')

const btnGithub = document.getElementById('btn-github')

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons()
    fetchAudioFiles()
    setupEventListeners()
})

// Helper for formatting time (MM:SS.CC or MM:SS)
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return '00:00.00'
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const centiseconds = Math.floor((seconds % 1) * 100)

    const minStr = minutes.toString().padStart(2, '0')
    const secStr = secs.toString().padStart(2, '0')
    const centStr = centiseconds.toString().padStart(2, '0')

    return `${minStr}:${secStr}.${centStr}`
}

// Format file size
function formatBytes(bytes) {
    if (!bytes) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Setup drag and drop / click listeners
function setupEventListeners() {
    // Help Modal
    btnThemeHelp.addEventListener('click', () => helpModal.classList.remove('hidden'))
    btnCloseHelp.addEventListener('click', () => helpModal.classList.add('hidden'))
    btnCloseHelpConfirm.addEventListener('click', () => helpModal.classList.add('hidden'))

    // Close help modal on clicking overlay
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.classList.add('hidden')
    })

    btnGithub.addEventListener('click', () => {
        window.open('https://github.com/xiblizz/audiospec', '_blank')
    })

    // Drag and drop event listeners
    ;['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(
            eventName,
            (e) => {
                e.preventDefault()
                dropzone.classList.add('drag-over')
            },
            false,
        )
    })
    ;['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(
            eventName,
            (e) => {
                e.preventDefault()
                dropzone.classList.remove('drag-over')
            },
            false,
        )
    })

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer
        const files = dt.files
        if (files.length > 0) {
            wavesurfer?.stop()
            handleAudioUpload(files[0])
        }
    })

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            wavesurfer?.stop()
            handleAudioUpload(e.target.files[0])
        }
    })

    // Play/Pause Button
    btnPlay.addEventListener('click', togglePlay)

    // Stop Button
    btnStop.addEventListener('click', () => {
        if (wavesurfer) {
            wavesurfer.stop()
            // Re-render play icon as 'play'
            const playIcon = getPlayIcon()
            if (playIcon) playIcon.setAttribute('data-lucide', 'play')
            lucide.createIcons()
        }
    })

    // Loop Button
    btnLoop.addEventListener('click', toggleLoop)

    // Volume / Mute controls
    volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100
        if (wavesurfer) {
            wavesurfer.setVolume(val)
            if (val > 0) {
                isMuted = false
                updateMuteUI()
            } else {
                isMuted = true
                updateMuteUI()
            }
        }
    })

    btnMute.addEventListener('click', toggleMute)

    // Spectrogram Display Controls (Scale selector)
    const scaleSelect = document.getElementById('spectrogram-scale-select')

    const refreshSpectrogram = () => {
        if (currentFileUrl) {
            const currentTime = wavesurfer ? wavesurfer.getCurrentTime() : 0
            const isPlaying = wavesurfer ? wavesurfer.isPlaying() : false

            if (isPlaying) {
                wavesurfer.pause()
            }

            // Re-render WaveSurfer and plugins with new selections
            initWaveSurfer(currentFileUrl, currentFileSampleRate)

            // Auto-restore playback location
            wavesurfer.once('ready', () => {
                wavesurfer.setTime(currentTime)
                if (isPlaying) {
                    wavesurfer.play()
                }
            })
        }
    }

    if (scaleSelect) scaleSelect.addEventListener('change', refreshSpectrogram)

    // Global keyboard short-cuts
    document.addEventListener('keydown', (e) => {
        // Avoid key triggers if user is in inputs/text areas
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault()
                togglePlay()
                break
            case 'KeyM':
                e.preventDefault()
                toggleMute()
                break
            case 'KeyL':
                e.preventDefault()
                toggleLoop()
                break
            case 'ArrowRight':
                if (wavesurfer) {
                    e.preventDefault()
                    wavesurfer.skip(5)
                }
                break
            case 'ArrowLeft':
                if (wavesurfer) {
                    e.preventDefault()
                    wavesurfer.skip(-5)
                }
                break
            case 'Escape':
                if (wavesurfer) {
                    wavesurfer.stop()
                    const playIcon = getPlayIcon()
                    if (playIcon) playIcon.setAttribute('data-lucide', 'play')
                    lucide.createIcons()
                }
                break
        }
    })

    // Cover Art actions (Replace / Download)
    if (btnReplaceArt && coverArtInput) {
        btnReplaceArt.addEventListener('click', (e) => {
            e.stopPropagation()
            coverArtInput.click()
        })
    }

    if (coverArtInput) {
        coverArtInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                newCoverArtFile = e.target.files[0]
                const reader = new FileReader()
                reader.onload = (event) => {
                    metaCoverArt.src = event.target.result
                    metaCoverArt.classList.remove('hidden')
                    metaCoverPlaceholder.classList.add('hidden')
                }
                reader.readAsDataURL(newCoverArtFile)
            }
        })
    }

    if (btnDownloadArt) {
        btnDownloadArt.addEventListener('click', (e) => {
            e.stopPropagation()
            if (newCoverArtFile) {
                // If the user has replaced artwork locally but not saved yet, download the local image file
                const url = URL.createObjectURL(newCoverArtFile)
                const a = document.createElement('a')
                a.href = url
                a.download = `cover_${newCoverArtFile.name}`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
            } else if (originalFileName && !metaCoverArt.classList.contains('hidden') && metaCoverArt.src) {
                // Download original embedded album artwork from server
                const a = document.createElement('a')
                a.href = `/api/art?file=${encodeURIComponent(originalFileName)}`
                a.download = `cover_${originalFileName.substring(0, originalFileName.lastIndexOf('.')) || 'art'}.jpg`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
            } else {
                alert('No artwork is loaded on this track to download.')
            }
        })
    }

    // Add Tag field listener
    if (btnAddTag) {
        btnAddTag.addEventListener('click', addTagRow)
    }

    // Save Tags back to file
    if (btnSaveTags) {
        btnSaveTags.addEventListener('click', saveMetadata)
    }
}

// Fetch and render previous audio uploads on the server
async function fetchAudioFiles() {
    try {
        const res = await fetch('/api/files')
        const list = await res.json()

        audioFilesCount.textContent = list.length

        if (list.length === 0) {
            audioFilesList.innerHTML = `<p class="text-xs text-slate-600 text-center py-6 italic">No audio files analyzed yet.</p>`
            return
        }

        audioFilesList.innerHTML = ''
        list.forEach((file) => {
            const trackEl = document.createElement('div')
            trackEl.className =
                'flex items-center justify-between p-2.5 rounded-lg bg-slate-950/45 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 transition cursor-pointer group text-left'

            trackEl.innerHTML = `
                <div class="flex-1 min-w-0 pr-2">
                    <h5 class="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition" title="${file.fileName}">
                        ${file.fileName}
                    </h5>
                    <p class="text-[10px] text-slate-500 mt-0.5">
                        <span>${formatBytes(file.sizeBytes)}</span>
                    </p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <a href="${file.fileUrl}" download="${file.fileName}" class="btn-download-track p-1.5 rounded bg-slate-900 border border-slate-800/40 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all shadow-inner" title="Download Track">
                        <i data-lucide="download" class="w-4 h-4"></i>
                    </a>
                    <button class="btn-delete-track p-1.5 rounded bg-slate-900 border border-slate-800/40 text-slate-400 hover:text-red-400 hover:border-red-500/20 transition-all shadow-inner" title="Delete Track">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            `

            trackEl.addEventListener('click', () => {
                loadAudioFromServer(file.fileUrl, file.fileName)
            })

            const btnDownload = trackEl.querySelector('.btn-download-track')
            if (btnDownload) {
                btnDownload.addEventListener('click', (e) => {
                    e.stopPropagation()
                })
            }

            const btnDelete = trackEl.querySelector('.btn-delete-track')
            if (btnDelete) {
                btnDelete.addEventListener('click', async (e) => {
                    e.stopPropagation()
                    if (confirm(`Are you sure you want to delete "${file.fileName}"?`)) {
                        try {
                            const response = await fetch(`/api/files?file=${encodeURIComponent(file.fileName)}`, {
                                method: 'DELETE',
                            })
                            if (response.ok) {
                                fetchAudioFiles()
                            } else {
                                const errData = await response.json()
                                alert(`Error deleting file: ${errData.error || 'Unknown error'}`)
                            }
                        } catch (err) {
                            console.error('Error in DELETE request:', err)
                            alert('Failed to delete file from server.')
                        }
                    }
                })
            }

            audioFilesList.appendChild(trackEl)
        })

        lucide.createIcons()
    } catch (e) {
        console.error('Error fetching audio files list:', e)
    }
}

// Handle local browser audio selection/upload via ajax
function handleAudioUpload(file) {
    const formData = new FormData()
    formData.append('audio', file)

    // Unhide upload overlay progress
    uploadProgressContainer.classList.remove('translate-y-full')
    setProgressValue(0)
    progressStatus.textContent = 'Uploading Audio File...'

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload', true)

    // Keep track of transfer progress
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100)
            // Limit progress value up to 95% during upload. The remaining 5% represents ffprobe server processing.
            const adjustedPercent = Math.min(Math.round(percentComplete * 0.9), 92)
            setProgressValue(adjustedPercent)
            progressStatus.textContent =
                percentComplete === 100 ? 'Analyzing with ffprobe...' : `Uploading: ${percentComplete}%`
        }
    })

    xhr.onload = function () {
        if (xhr.status === 200) {
            setProgressValue(100)
            progressStatus.textContent = 'Done!'

            setTimeout(() => {
                uploadProgressContainer.classList.add('translate-y-full')
                const response = JSON.parse(xhr.responseText)
                displayTrackMetadata(response)
                initWaveSurfer(response.fileUrl, response.audioStream.sampleRate || 44100)
                fetchAudioFiles()
            }, 500)
        } else {
            console.error('Failed upload response:', xhr.responseText)
            setProgressValue(100)
            progressStatus.textContent = 'Processing Failed'
            progressStatus.classList.add('text-red-400')

            setTimeout(() => {
                uploadProgressContainer.classList.add('translate-y-full')
                progressStatus.classList.remove('text-red-400')
                alert("Upload failed. Make sure it's a valid audio extension supported by ffmpeg.")
            }, 2500)
        }
    }

    xhr.onerror = function () {
        console.error('Network Error during upload')
        progressStatus.textContent = 'Network Error!'
        setTimeout(() => uploadProgressContainer.classList.add('translate-y-full'), 2000)
    }

    xhr.send(formData)
}

// Load audio details when clicking from recent items (Runs ffprobe metadata on click or loads local parameters)
async function loadAudioFromServer(fileUrl, fileName) {
    try {
        if (wavesurfer?.isPlaying()) {
            wavesurfer.stop()
        }
        const responseObj = await fetch(`/api/metadata?file=${encodeURIComponent(fileName)}`)
        if (responseObj.ok) {
            const data = await responseObj.json()
            displayTrackMetadata(data)
            initWaveSurfer(data.fileUrl, data.audioStream.sampleRate || 44100)
        }
    } catch (err) {
        console.error('Could not fetch file:', err)
        try {
            if (wavesurfer) {
                wavesurfer.destroy()
            }
        } catch (e) {
            console.error('Errors destroying wavesurfer instance:', e)
        }
    }
}

// Function to update the circular upload graph
function setProgressValue(percentage) {
    const radius = 28
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percentage / 100) * circumference
    progressRingCircle.style.strokeDashoffset = offset
    progressPercent.textContent = `${percentage}%`
}

// Update the dynamic visual items for file tags/codecs
function displayTrackMetadata(data) {
    // Top active filename tag
    activeFileHeader.classList.remove('hidden')
    headerFilename.textContent = data.originalName || data.fileName
    noAudioOverlay.classList.add('opacity-0', 'pointer-events-none')

    // Codec Panel
    metaCodec.textContent = (data.audioStream.codec || '--').toUpperCase()

    // Nice Sample Rate display in kHz
    const hz = data.audioStream.sampleRate
    metaSamplerate.textContent = hz ? `${parseFloat((hz / 1000).toFixed(2))} kHz` : '--'

    // Bit depth (e.g. s16, s32p or standard PCM/lossless)
    let depthStr = '32-bit (float)' // default Web Audio
    if (data.audioStream.bitsPerSample) {
        depthStr = `${data.audioStream.bitsPerSample}-bit`
    } else if (data.audioStream.sampleFmt) {
        depthStr = data.audioStream.sampleFmt // e.g. s16p, fltp
    } else if (data.audioStream.codec === 'mp3') {
        depthStr = 'Compressed'
    }
    metaBitdepth.textContent = depthStr

    // Channels & Channel layout
    const ch = data.audioStream.channels
    let chStr = '--'
    if (ch === 1) chStr = 'Mono (1.0)'
    else if (ch === 2) chStr = 'Stereo (2.0)'
    else if (ch > 2) chStr = `${ch} Ch (${data.audioStream.channelLayout || 'Surround'})`
    metaChannels.textContent = chStr

    // Overall and audio stream bitrates
    const br = data.audioStream.bitRate || data.format.bitRate
    metaBitrate.textContent = br ? `${br} kbps` : 'Variable'

    // File details panel
    metaFormatShort.textContent = (data.format.containerShort || '--').toUpperCase()
    metaFormatLong.textContent = data.format.containerLong || '--'
    metaFormatLong.title = data.format.containerLong || ''
    metaFilesize.textContent = formatBytes(data.sizeBytes)
    metaDuration.textContent = formatTime(data.duration)

    // Set State variables
    originalFileName = data.fileName
    currentTags = { ...(data.format.tags || {}) }
    newCoverArtFile = null // Reset custom uploaded art flag

    renderTagsList()

    // Update cover artwork with cache-busting timestamp
    if (data.hasArt && data.fileName) {
        metaCoverArt.src = `/api/art?file=${encodeURIComponent(data.fileName)}&t=${Date.now()}`
        metaCoverArt.classList.remove('hidden')
        metaCoverPlaceholder.classList.add('hidden')
    } else {
        metaCoverArt.src = ''
        metaCoverArt.classList.add('hidden')
        metaCoverPlaceholder.classList.remove('hidden')
    }

    // Set up onerror to handle any ffmpeg conversion/extraction issues gracefully
    metaCoverArt.onerror = () => {
        metaCoverArt.src = ''
        metaCoverArt.classList.add('hidden')
        metaCoverPlaceholder.classList.remove('hidden')
    }
}

// Set up WaveSurfer core + Spectrogram + Timeline
function initWaveSurfer(audioUrl, fileSampleRate) {
    currentFileUrl = audioUrl
    currentFileSampleRate = fileSampleRate || 44100

    // Reset loop
    isLooping = false
    updateLoopUI()

    // Destroy existing wavesurfer instance if it exists to clean up memory/Web Audio buffers
    if (wavesurfer) {
        try {
            wavesurfer.destroy()
        } catch (e) {
            console.error('Errors destroying wavesurfer instance:', e)
        }
    }

    // Clean visualization DOM elements
    document.getElementById('waveform-container').innerHTML = ''
    document.getElementById('spectrogram-container').innerHTML = ''

    // Wavesurfer.js Color Configuration: Sleek dark contrast charcoal and neon indicators
    wavesurfer = WaveSurfer.create({
        container: '#waveform-container',
        waveColor: '#272d3d', // Dark cool slate background waves
        progressColor: 'rgba(6, 182, 212, 0.75)', // Neon Cyan active progress
        cursorColor: '#22c55e', // Neon Green playhead line like Audition
        cursorWidth: 1.5,
        height: 120,
        barWidth: 1.5,
        barGap: 1.5,
        normalize: true,
        backend: 'WebAudio',
        sampleRate: fileSampleRate || 44100,
        minPxPerSec: 1,
        fillParent: true,
        autoScroll: true,
        autoCenter: true,
        plugins: [
            // Dynamic synchronized waterfall Spectrogram plugin
            Spectrogram.create({
                container: '#spectrogram-container',
                labels: true, // We supply our own high fidelity kHz scale on the side
                height: 420,
                fftSamples: 1024, // High-fidelity FFT resolution
                splitChannels: false,
                scale: document.getElementById('spectrogram-scale-select')?.value || 'mel',
                gainDB: 5, // Max ceiling at -5 dBFS
                rangeDB: 70, // Dynamic range of 70 dB (silence threshold is -75 dBFS)
                colorMap: (() => {
                    // Generate a high fidelity beautiful neon/spectral colormap with 256 colors
                    const map = []
                    // Color keyframes at specific intervals on the 0-1 scale
                    const keyframes = [
                        { offset: 0.0, color: [0, 0, 0] }, // Black
                        { offset: 0.08, color: [13, 1, 36] }, // Very dark purple
                        { offset: 0.18, color: [24, 2, 82] }, // Deep indigo
                        { offset: 0.32, color: [74, 3, 117] }, // Medium violet
                        { offset: 0.48, color: [156, 0, 98] }, // Magenta / pink
                        { offset: 0.65, color: [222, 58, 24] }, // Red-orange
                        { offset: 0.82, color: [240, 163, 10] }, // Amber / orange
                        { offset: 0.95, color: [254, 240, 138] }, // Pale yellow
                        { offset: 1.0, color: [255, 255, 255] }, // White split
                    ]

                    for (let i = 0; i < 256; i++) {
                        const ratio = i / 255
                        // Find the two keyframes that bracket current ratio
                        let startIndex = 0
                        for (let k = 0; k < keyframes.length - 1; k++) {
                            if (ratio >= keyframes[k].offset && ratio <= keyframes[k + 1].offset) {
                                startIndex = k
                                break
                            }
                        }
                        const k1 = keyframes[startIndex]
                        const k2 = keyframes[startIndex + 1]
                        const segmentRatio = (ratio - k1.offset) / (k2.offset - k1.offset)

                        const r = Math.round(k1.color[0] + (k2.color[0] - k1.color[0]) * segmentRatio) / 255
                        const g = Math.round(k1.color[1] + (k2.color[1] - k1.color[1]) * segmentRatio) / 255
                        const b = Math.round(k1.color[2] + (k2.color[2] - k1.color[2]) * segmentRatio) / 255

                        map.push([r, g, b, 1.0]) // format required [r, g, b, alpha] scaled 0 to 1
                    }
                    return map
                })(),
            }),
        ],
    })
    window.wavesurfer = wavesurfer

    // Handle WaveSurfer loading state
    wavesurfer.on('loading', (percent) => {
        // We can display a gentle loader on top of waveform if needed
        timeCurrent.textContent = 'DECODING AUDIO BUFFER...'
        timeTotal.textContent = `${percent}%`
    })

    // Wavesurfer events mapping
    wavesurfer.on('ready', () => {
        const duration = wavesurfer.getDuration()
        timeCurrent.textContent = formatTime(0)
        timeTotal.textContent = formatTime(duration)

        // Match player controls volume state to current UI
        const currentVol = parseFloat(volumeSlider.value) / 100
        wavesurfer.setVolume(currentVol)

        // Reset play icons
        const playIcon = getPlayIcon()
        if (playIcon) playIcon.setAttribute('data-lucide', 'play')
        lucide.createIcons()
    })

    wavesurfer.on('audioprocess', (time) => {
        timeCurrent.textContent = formatTime(time)
    })

    wavesurfer.on('interaction', (newTime) => {
        timeCurrent.textContent = formatTime(newTime)
    })

    wavesurfer.on('play', () => {
        const playIcon = getPlayIcon()
        if (playIcon) playIcon.setAttribute('data-lucide', 'pause')
        lucide.createIcons()
    })

    wavesurfer.on('pause', () => {
        const playIcon = getPlayIcon()
        if (playIcon) playIcon.setAttribute('data-lucide', 'play')
        lucide.createIcons()
    })

    wavesurfer.on('finish', () => {
        if (isLooping) {
            wavesurfer.play()
        } else {
            const playIcon = getPlayIcon()
            if (playIcon) playIcon.setAttribute('data-lucide', 'play')
            lucide.createIcons()
        }
    })

    // Load file URL
    wavesurfer.load(audioUrl)
}

// Toggles core playback (Play/Pause)
function togglePlay() {
    if (!wavesurfer) return

    if (wavesurfer.isPlaying()) {
        wavesurfer.pause()
    } else {
        wavesurfer.play()
    }
}

// Mutes and restores audio buffer decibels
function toggleMute() {
    if (!wavesurfer) return

    if (isMuted) {
        // Unmute
        isMuted = false
        wavesurfer.setVolume(previousVolume)
        volumeSlider.value = Math.round(previousVolume * 100)
    } else {
        // Mute
        isMuted = true
        previousVolume = parseFloat(volumeSlider.value) / 100
        wavesurfer.setVolume(0)
        volumeSlider.value = 0
    }
    updateMuteUI()
}

function updateMuteUI() {
    const muteIcon = getMuteIcon()
    if (muteIcon) {
        if (isMuted) {
            muteIcon.setAttribute('data-lucide', 'volume-x')
            muteIcon.classList.add('text-red-400')
        } else {
            muteIcon.setAttribute('data-lucide', 'volume-2')
            muteIcon.classList.remove('text-red-400')
        }
    }
    lucide.createIcons()
}

// Loops core buffer
function toggleLoop() {
    isLooping = !isLooping
    updateLoopUI()
}

function updateLoopUI() {
    if (isLooping) {
        btnLoop.classList.add('text-indigo-400', 'bg-indigo-950/40', 'border', 'border-indigo-500/20')
        btnLoop.classList.remove('text-slate-500')
    } else {
        btnLoop.classList.remove('text-indigo-400', 'bg-indigo-950/40', 'border', 'border-indigo-500/20')
        btnLoop.classList.add('text-slate-500')
    }
}

// Render tags list in editable key-value inputs
function renderTagsList() {
    if (!tagsListContainer) return

    tagsListContainer.innerHTML = ''

    // List standard tags in lowercase to make them suggested/predefined
    const standardKeys = ['title', 'artist', 'album', 'genre']
    const keys = Object.keys(currentTags)

    // Ensure common tags have an input
    standardKeys.forEach((k) => {
        const hasKey = keys.some((existingKey) => existingKey.toLowerCase() === k.toLowerCase())
        if (!hasKey) {
            currentTags[k] = ''
        }
    })

    const allKeys = Object.keys(currentTags)

    if (allKeys.length === 0) {
        tagsListContainer.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-2 italic font-medium">No tags loaded</p>`
        return
    }

    allKeys.forEach((key) => {
        const val = currentTags[key] || ''
        const row = document.createElement('div')
        row.className = 'flex items-center gap-1.5'

        row.innerHTML = `
            <input
                type="text"
                class="tag-key bg-slate-950/80 text-violet-400 font-bold border border-slate-800/80 rounded px-2 py-0.5 w-[75px] shrink-0 text-[10.5px] focus:ring-1 focus:ring-violet-500 border-none outline-none select-all"
                value="${key}"
                placeholder="Key" />
            <input
                type="text"
                class="tag-value flex-1 bg-slate-950/80 text-slate-200 border border-slate-800/80 rounded px-2 py-0.5 text-[10.5px] focus:ring-1 focus:ring-cyan-500 border-none outline-none"
                value="${val}"
                placeholder="Value" />
            <button
                class="btn-delete-tag-row p-1 text-slate-500 hover:text-red-400 transition"
                title="Remove Tag">
                <i data-lucide="trash" class="w-3.5 h-3.5"></i>
            </button>
        `

        const keyInput = row.querySelector('.tag-key')
        const valInput = row.querySelector('.tag-value')
        const btnDeleteRow = row.querySelector('.btn-delete-tag-row')

        let prevKey = key

        keyInput.addEventListener('input', (e) => {
            const nextKey = e.target.value.trim()
            if (nextKey && nextKey !== prevKey) {
                const currentVal = currentTags[prevKey] || ''
                delete currentTags[prevKey]
                currentTags[nextKey] = currentVal
                prevKey = nextKey
            }
        })

        valInput.addEventListener('input', (e) => {
            if (prevKey) {
                currentTags[prevKey] = e.target.value
            }
        })

        btnDeleteRow.addEventListener('click', () => {
            if (prevKey) {
                delete currentTags[prevKey]
            }
            row.remove()
            if (Object.keys(currentTags).length === 0) {
                tagsListContainer.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-2 italic font-medium">No tags loaded</p>`
            }
        })

        tagsListContainer.appendChild(row)
    })

    lucide.createIcons()
}

// Function to add a brand new custom tag row manually
function addTagRow() {
    if (!tagsListContainer) return

    // Clear empty placeholder text if present
    const emptyPlaceholder = tagsListContainer.querySelector('p.italic')
    if (emptyPlaceholder) {
        tagsListContainer.innerHTML = ''
    }

    let idx = 1
    let nextKey = `tag${idx}`
    while (currentTags[nextKey] !== undefined) {
        idx++
        nextKey = `tag${idx}`
    }

    currentTags[nextKey] = ''

    const row = document.createElement('div')
    row.className = 'flex items-center gap-1.5'

    row.innerHTML = `
        <input
            type="text"
            class="tag-key bg-slate-950/80 text-violet-400 font-bold border border-slate-800/80 rounded px-2 py-0.5 w-[75px] shrink-0 text-[10.5px] focus:ring-1 focus:ring-violet-500 border-none outline-none select-all"
            value="${nextKey}"
            placeholder="Key" />
        <input
            type="text"
            class="tag-value flex-1 bg-slate-950/80 text-slate-200 border border-slate-800/80 rounded px-2 py-0.5 text-[10.5px] focus:ring-1 focus:ring-cyan-500 border-none outline-none"
            value=""
            placeholder="Value" />
        <button
            class="btn-delete-tag-row p-1 text-slate-500 hover:text-red-400 transition"
            title="Remove Tag">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
        </button>
    `

    const keyInput = row.querySelector('.tag-key')
    const valInput = row.querySelector('.tag-value')
    const btnDeleteRow = row.querySelector('.btn-delete-tag-row')

    let prevKey = nextKey

    keyInput.addEventListener('input', (e) => {
        const targetKey = e.target.value.trim()
        if (targetKey && targetKey !== prevKey) {
            const currentVal = currentTags[prevKey] || ''
            delete currentTags[prevKey]
            currentTags[targetKey] = currentVal
            prevKey = targetKey
        }
    })

    valInput.addEventListener('input', (e) => {
        if (prevKey) {
            currentTags[prevKey] = e.target.value
        }
    })

    btnDeleteRow.addEventListener('click', () => {
        if (prevKey) {
            delete currentTags[prevKey]
        }
        row.remove()
        if (Object.keys(currentTags).length === 0) {
            tagsListContainer.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-2 italic font-medium">No tags loaded</p>`
        }
    })

    tagsListContainer.appendChild(row)
    lucide.createIcons()

    keyInput.focus()
    keyInput.select()
}

// Function to save edited tags & replaceable artwork to server
async function saveMetadata() {
    if (!originalFileName) {
        alert('Please load an audio file first before saving changes.')
        return
    }

    const saveText = btnSaveTags.innerHTML
    btnSaveTags.disabled = true
    btnSaveTags.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Saving...`
    lucide.createIcons()

    try {
        const formData = new FormData()
        formData.append('file', originalFileName)

        // Clean tags: filter out keys that are completely empty
        const cleanedTags = {}
        Object.entries(currentTags).forEach(([k, v]) => {
            const trimmedKey = k.trim()
            if (trimmedKey) {
                cleanedTags[trimmedKey] = v
            }
        })
        formData.append('tags', JSON.stringify(cleanedTags))

        if (newCoverArtFile) {
            formData.append('art', newCoverArtFile)
        }

        const res = await fetch('/api/save-metadata', {
            method: 'POST',
            body: formData,
        })

        const data = await res.json()
        if (res.ok && data.success) {
            // Visual success feedback
            btnSaveTags.classList.remove('bg-cyan-400', 'hover:bg-cyan-300')
            btnSaveTags.classList.add('bg-emerald-500', 'text-white')
            btnSaveTags.innerHTML = `<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Saved!`
            lucide.createIcons()

            // Reload original track metadata
            await loadAudioFromServer(currentFileUrl, originalFileName)

            // Reload the track list to reflect if file sizes changed
            fetchAudioFiles()

            setTimeout(() => {
                btnSaveTags.classList.remove('bg-emerald-500', 'text-white')
                btnSaveTags.classList.add('bg-cyan-400', 'hover:bg-cyan-300', 'text-slate-950')
                btnSaveTags.innerHTML = saveText
                lucide.createIcons()
                btnSaveTags.disabled = false
            }, 2000)
        } else {
            alert(`Error saving metadata: ${data.error || 'Unknown error'}`)
            btnSaveTags.innerHTML = saveText
            lucide.createIcons()
            btnSaveTags.disabled = false
        }
    } catch (err) {
        console.error('Error in saving request:', err)
        alert('Failed to connect to backend server.')
        btnSaveTags.innerHTML = saveText
        lucide.createIcons()
        btnSaveTags.disabled = false
    }
}
