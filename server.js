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
        // Keep file extension and add timestamp to avoid naming collisions
        const ext = path.extname(file.originalname)
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_')
        cb(null, `${Date.now()}_${name}${ext}`)
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
            // Enable range requests and cross-origin isolation if needed
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
                originalName: req.file.originalname,
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
            originalName: req.file.originalname,
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
                originalName: safeFilename.split('_').slice(1).join('_') || safeFilename,
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
            originalName: safeFilename.split('_').slice(1).join('_') || safeFilename,
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

// Endpoint to fetch list of uploaded audio files (handy for reloading previously uploaded files)
app.get('/api/files', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Audiospec backend running on http://0.0.0.0:${PORT}`)
})
