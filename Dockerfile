FROM node:lts-alpine

# Install ffmpeg and ffprobe
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create directory for temp uploads
RUN mkdir -p uploads

# Expose server port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
