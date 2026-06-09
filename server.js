const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')

const app = express()
const PORT = process.env.PORT || 3000

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname)
    },
})

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 200 * 1024 * 1024, // 200 MB file limit
    },
})

// Serve frontend and static uploads
app.use(express.static(path.join(__dirname, 'public')))
app.use(
    '/uploads',
    express.static(uploadDir, {
        setHeaders: (res, path) => {
            res.set('Accept-Ranges', 'bytes')
        },
    }),
)

// API Endpoint to upload file and extract full ffprobe details
app.post('/api/upload', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded' })
    }

    const filePath = req.file.path

    // Use fluent-ffmpeg's ffprobe to retrieve exact codec details and tags
    ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
            console.error('Error running ffprobe:', err)
            return res.status(500).json({
                error: 'Failed to parse audio file details with ffprobe.',
                details: err.message,
                fileUrl: `/uploads/${req.file.filename}`,
                fileName: req.file.filename,
                size: req.file.size,
            })
        }

        // Clean up metadata to return only relevant, easy-to-read parameters
        const formatInfo = metadata.format || {}
        const streams = metadata.streams || []

        // Find the first audio stream
        const audioStream = streams.find((s) => s.codec_type === 'audio') || {}

        // Find if there is a video/image stream (like a video art attachment)
        const videoStream = streams.find((s) => s.codec_type === 'video')

        const responseData = {
            success: true,
            fileUrl: `/uploads/${req.file.filename}`,
            fileName: req.file.filename,
            sizeBytes: req.file.size,
            duration: parseFloat(formatInfo.duration || audioStream.duration || 0),
            format: {
                containerLong: formatInfo.format_long_name,
                containerShort: formatInfo.format_name,
                bitRate: formatInfo.bit_rate ? Math.round(parseInt(formatInfo.bit_rate) / 1000) : null, // in kbps
                tags: formatInfo.tags || {},
            },
            audioStream: {
                codec: audioStream.codec_name,
                codecLong: audioStream.codec_long_name,
                sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : null, // Hz
                channels: audioStream.channels,
                channelLayout: audioStream.channel_layout || `${audioStream.channels} channels`,
                bitsPerSample: audioStream.bits_per_sample || audioStream.bits_per_raw_sample || null,
                bitRate: audioStream.bit_rate ? Math.round(parseInt(audioStream.bit_rate) / 1000) : null, // in kbps
                profile: audioStream.profile || 'unknown',
            },
            hasArt: !!videoStream,
            rawMetadata: {
                format: formatInfo,
                audioStream: audioStream,
            },
        }

        res.json(responseData)
    })
})

// Endpoint to retrieve full details for a previously uploaded file
app.get('/api/metadata', (req, res) => {
    const filename = req.query.file
    if (!filename) {
        return res.status(400).json({ error: 'File query parameter is required' })
    }

    // Safety check to prevent directory traversal
    const safeFilename = path.basename(filename)
    const filePath = path.join(uploadDir, safeFilename)
    const fileUrl = `/uploads/${safeFilename}`

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' })
    }

    const stats = fs.statSync(filePath)

    ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
            console.error('Error running ffprobe on requested file:', err)
            return res.status(500).json({
                error: 'Failed to parse audio file details with ffprobe.',
                details: err.message,
                fileUrl: fileUrl,
                fileName: safeFilename,
                sizeBytes: stats.size,
            })
        }

        const formatInfo = metadata.format || {}
        const streams = metadata.streams || []
        const audioStream = streams.find((s) => s.codec_type === 'audio') || {}
        const videoStream = streams.find((s) => s.codec_type === 'video')

        const responseData = {
            success: true,
            fileUrl: fileUrl,
            fileName: safeFilename,
            sizeBytes: stats.size,
            duration: parseFloat(formatInfo.duration || audioStream.duration || 0),
            format: {
                containerLong: formatInfo.format_long_name,
                containerShort: formatInfo.format_name,
                bitRate: formatInfo.bit_rate ? Math.round(parseInt(formatInfo.bit_rate) / 1000) : null,
                tags: formatInfo.tags || {},
            },
            audioStream: {
                codec: audioStream.codec_name,
                codecLong: audioStream.codec_long_name,
                sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : null,
                channels: audioStream.channels,
                channelLayout: audioStream.channel_layout || `${audioStream.channels} channels`,
                bitsPerSample: audioStream.bits_per_sample || audioStream.bits_per_raw_sample || null,
                bitRate: audioStream.bit_rate ? Math.round(parseInt(audioStream.bit_rate) / 1000) : null,
                profile: audioStream.profile || 'unknown',
            },
            hasArt: !!videoStream,
        }

        res.json(responseData)
    })
})

// Endpoint to extract and stream embedded artwork (cover art) as an image
app.get('/api/art', (req, res) => {
    const filename = req.query.file
    if (!filename) {
        return res.status(400).send('File query parameter is required')
    }

    const safeFilename = path.basename(filename)
    const filePath = path.join(uploadDir, safeFilename)

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found')
    }

    // Command to extract embedded artwork to stdout
    // We disable audio with '-an' and copy the video stream (the image) using '-vcodec copy'
    // Output format is 'image2' piped to stdout '-'
    const ffmpegProcess = require('child_process').spawn('ffmpeg', [
        '-i',
        filePath,
        '-an',
        '-vcodec',
        'copy',
        '-f',
        'image2',
        '-',
    ])

    let buffers = []

    ffmpegProcess.stdout.on('data', (chunk) => {
        buffers.push(chunk)
    })

    ffmpegProcess.on('close', (code) => {
        if (buffers.length > 0) {
            const imgBuffer = Buffer.concat(buffers)

            // Detect MIME type based on file magic bytes
            let mimeType = 'image/jpeg'
            if (imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50 && imgBuffer[2] === 0x4e && imgBuffer[3] === 0x47) {
                mimeType = 'image/png'
            }

            res.setHeader('Content-Type', mimeType)
            res.setHeader('Cache-Control', 'public, max-age=31536000') // cache for 1 year
            res.send(imgBuffer)
        } else {
            res.status(404).send('No embedded artwork found')
        }
    })

    ffmpegProcess.stderr.on('data', () => {
        // Prevent buffer accumulation
    })
})

// Endpoint to save edited tags and artwork back to the audio file
app.post('/api/save-metadata', upload.single('art'), (req, res) => {
    const filename = req.body.file
    if (!filename) {
        if (req.file) fs.unlinkSync(req.file.path)
        console.error('File name is required in request body')
        return res.status(400).json({ error: 'File name is required' })
    }

    const safeFilename = path.basename(filename)
    const inputPath = path.join(uploadDir, safeFilename)

    if (!fs.existsSync(inputPath)) {
        if (req.file) fs.unlinkSync(req.file.path)
        console.error('Audio file not found:', inputPath)
        return res.status(404).json({ error: 'Audio file not found' })
    }

    let tags = {}
    try {
        tags = JSON.parse(req.body.tags || '{}')
    } catch (e) {
        if (req.file) fs.unlinkSync(req.file.path)
        console.error('Invalid tags JSON:', e)
        return res.status(400).json({ error: 'Invalid tags JSON format' })
    }

    const ext = path.extname(safeFilename).toLowerCase()
    const tempFilename = `temp_${Date.now()}_${safeFilename}`
    const outputPath = path.join(uploadDir, tempFilename)

    // Probe original file tags before performing metadata/artwork updates
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
        const originalTags = (metadata && metadata.format && metadata.format.tags) || {}

        // Build FFmpeg command arguments
        let args = ['-y', '-i', inputPath]

        if (req.file) {
            // Add cover art image as second input
            args.push('-i', req.file.path)
            if (ext === '.mp3') {
                args.push(
                    '-map',
                    '0:a',
                    '-map',
                    '1:0',
                    '-c:a',
                    'copy',
                    '-c:v',
                    'copy',
                    '-id3v2_version',
                    '3',
                    '-metadata:s:v',
                    'title=Album cover',
                    '-metadata:s:v',
                    'comment=Cover (front)',
                    '-disposition:v',
                    'attached_pic',
                )
            } else {
                args.push(
                    '-map',
                    '0:a',
                    '-map',
                    '1:0',
                    '-c:a',
                    'copy',
                    '-c:v',
                    'copy',
                    '-disposition:v',
                    'attached_pic',
                )
            }
        } else {
            // Maintain all existing streams (including existing image artwork if there was one)
            args.push('-map', '0', '-c', 'copy')
        }

        // Map global metadata from the first input (the audio file) so other stream details aren't stripped
        args.push('-map_metadata', '0')

        // Overwrite or create all current tags
        Object.entries(tags).forEach(([key, val]) => {
            args.push('-metadata', `${key}=${val}`)
        })

        // Explicitly clear any original tag keys that were removed in the edit list
        const newKeysLower = Object.keys(tags).map((k) => k.toLowerCase())
        Object.keys(originalTags).forEach((key) => {
            if (!newKeysLower.includes(key.toLowerCase())) {
                args.push('-metadata', `${key}=`)
            }
        })

        // Output path
        args.push(outputPath)

        // Spawn FFmpeg subprocess
        const { spawn } = require('child_process')
        const ffmpegProcess = spawn('ffmpeg', args)

        let stderrData = ''
        ffmpegProcess.stderr.on('data', (data) => {
            stderrData += data.toString()
        })

        ffmpegProcess.on('close', (code) => {
            // Clean up uploaded temp artwork file if we had one
            if (req.file && fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path)
                } catch (err) {
                    console.error('Error deleting temp uploaded artwork:', err)
                }
            }

            if (code === 0) {
                try {
                    // To replace original with updated file securely:
                    // Delete original, and rename temp to original
                    fs.unlinkSync(inputPath)
                    fs.renameSync(outputPath, inputPath)
                    return res.json({ success: true, message: 'Metadata and artwork saved successfully' })
                } catch (err) {
                    console.error('Error overwriting file:', err)
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
                    return res
                        .status(500)
                        .json({ error: 'Failed to overwrite original audio file', details: err.message })
                }
            } else {
                console.error('FFmpeg failed with code:', code, stderrData)
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
                return res.status(500).json({ error: 'FFmpeg failed to write tags or artwork', details: stderrData })
            }
        })
    })
})

// Endpoint to fetch list of uploaded audio files (handy for reloading previously uploaded files)
app.get('/api/files', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            console.error('Error reading uploads directory:', err)
            return res.status(500).json({ error: 'Could not read uploads directory' })
        }

        // Map files into details array
        const list = files
            .filter((f) => !f.startsWith('.'))
            .map((f) => {
                const stat = fs.statSync(path.join(uploadDir, f))
                return {
                    fileName: f,
                    fileUrl: `/uploads/${f}`,
                    sizeBytes: stat.size,
                    uploadedAt: stat.mtime,
                }
            })
            .sort((a, b) => b.uploadedAt - a.uploadedAt) // newest first

        res.json(list)
    })
})

// Endpoint to delete an uploaded file
app.delete('/api/files', (req, res) => {
    const filename = req.query.file
    if (!filename) {
        return res.status(400).json({ error: 'File query parameter is required' })
    }

    // Safety check to prevent directory traversal
    const safeFilename = path.basename(filename)
    const filePath = path.join(uploadDir, safeFilename)

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' })
    }

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('Error deleting file:', err)
            return res.status(500).json({ error: 'Failed to delete file' })
        }
        res.json({ success: true, message: 'File deleted successfully' })
    })
})

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Audiospec backend running on http://0.0.0.0:${PORT}`)
})
