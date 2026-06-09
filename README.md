# Audiospec

Audio Spectrogram Analysis Tool, Metadata and Artwork Manager.

## Description

Audiospec is a web-based tool designed to analyze and manage audio file metadata and embedded artwork. Users can upload audio files to extract detailed technical metadata, extract embedded cover art, and edit audio tags or artwork directly through a web interface.

## Core Features

- **Audio Spectrogram Analysis**: Waveform and Spectrogram Analysis using [Wavesurfer.js](https://wavesurfer.xyz)
- **Audio Metadata Extraction**: Extraction of metadata using `ffprobe`.
- **Artwork Management**:
    - **Extraction**: Extract embedded cover art from audio files.
    - **Injection**: Upload and embed new artwork into audio files.
- **Metadata Editing**: Modify audio tags (e.g., artist, album, title) and save them back to the file.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Media Processing**: FFmpeg (`fluent-ffmpeg`)
- **File Handling**: Multer
- **Frontend**: HTML, JavaScript, [Tailwind](https://tailwindcss.com), [Lucide Icons](https://lucide.dev/), [Inter Font](https://rsms.me/inter/)

## Installation

### Prerequisites

- Docker Compose

### Setup

1. Clone the repository:
    ```bash
    git clone https://github.com/xiblizz/audiospec
    cd audiospec
    ```
2. Start the server:
    ```bash
    docker compose up -d --build
    ```

The server will be running at `http://localhost:3000`.

## API Endpoints

- `POST /api/upload`: Upload an audio file and get its metadata.
- `GET /api/metadata?file=<filename>`: Get metadata for a specific file.
- `GET /api/art?file=<filename>`: Extract cover art from a file.
- `POST /api/save-metadata`: Save updated tags and artwork to a file.
- `GET /api/files`: List all uploaded files.
- `DELETE /api/files?file=<filename>`: Delete a file.
