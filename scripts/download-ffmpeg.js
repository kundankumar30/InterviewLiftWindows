const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

class FFmpegDownloader {
    constructor() {
        this.platform = os.platform();
        this.arch = os.arch();
        this.binDir = path.join(process.cwd(), 'bin');
        
        // FFmpeg download URLs for different platforms
        this.ffmpegUrls = {
            'win32': {
                'x64': 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
                'arm64': 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' // Same for now
            },
            'darwin': {
                'x64': 'https://evermeet.cx/ffmpeg/ffmpeg-6.1.zip',
                'arm64': 'https://evermeet.cx/ffmpeg/ffmpeg-6.1.zip'
            },
            'linux': {
                'x64': 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
                'arm64': 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz'
            }
        };
    }

    async downloadFile(url, destination) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https:') ? https : http;
            const file = fs.createWriteStream(destination);
            
            
            const request = protocol.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirects
                    return this.downloadFile(response.headers.location, destination)
                        .then(resolve)
                        .catch(reject);
                }
                
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }
                
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;
                
                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (totalSize) {
                        const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                        process.stdout.write(`\rDownloading... ${percent}%`);
                    }
                });
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            });
            
            request.on('error', (error) => {
                fs.unlink(destination, () => {}); // Delete partial file
                reject(error);
            });
        });
    }

    async extractArchive(archivePath, extractDir) {
        const ext = path.extname(archivePath).toLowerCase();
        
        if (ext === '.zip') {
            return this.extractZip(archivePath, extractDir);
        } else if (ext === '.xz' || archivePath.includes('.tar.xz')) {
            return this.extractTarXz(archivePath, extractDir);
        } else {
            throw new Error(`Unsupported archive format: ${ext}`);
        }
    }

    async extractZip(zipPath, extractDir) {
        return new Promise((resolve, reject) => {
            // Use built-in extraction or PowerShell on Windows
            if (process.platform === 'win32') {
                const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`;
                const ps = spawn('powershell', ['-Command', psCommand], { stdio: 'inherit' });
                
                ps.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Extraction failed with code ${code}`));
                    }
                });
            } else {
                // macOS/Linux - use unzip command
                const unzip = spawn('unzip', ['-q', '-o', zipPath, '-d', extractDir], { stdio: 'inherit' });
                
                unzip.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Extraction failed with code ${code}`));
                    }
                });
            }
        });
    }

    async extractTarXz(tarPath, extractDir) {
        return new Promise((resolve, reject) => {
            const tar = spawn('tar', ['-xf', tarPath, '-C', extractDir], { stdio: 'inherit' });
            
            tar.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Extraction failed with code ${code}`));
                }
            });
        });
    }

    findFFmpegExecutable(extractDir) {
        const possiblePaths = [];
        
        // Common locations where FFmpeg might be extracted
        const searchDirs = [
            extractDir,
            path.join(extractDir, 'bin'),
            path.join(extractDir, 'ffmpeg'),
            path.join(extractDir, 'ffmpeg-*', 'bin'),
            path.join(extractDir, 'ffmpeg-*')
        ];
        
        const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        
        for (const dir of searchDirs) {
            try {
                // Handle wildcard directories
                if (dir.includes('*')) {
                    const parentDir = path.dirname(dir);
                    const pattern = path.basename(dir);
                    
                    if (fs.existsSync(parentDir)) {
                        const items = fs.readdirSync(parentDir);
                        for (const item of items) {
                            if (item.startsWith(pattern.replace('*', ''))) {
                                const fullPath = path.join(parentDir, item, pattern.includes('bin') ? '' : 'bin', executableName);
                                if (fs.existsSync(fullPath)) {
                                    possiblePaths.push(fullPath);
                                }
                            }
                        }
                    }
                } else {
                    const fullPath = path.join(dir, executableName);
                    if (fs.existsSync(fullPath)) {
                        possiblePaths.push(fullPath);
                    }
                }
            } catch (error) {
                // Directory doesn't exist, continue
            }
        }
        
        return possiblePaths.length > 0 ? possiblePaths[0] : null;
    }

    async downloadAndExtractFFmpeg() {
        try {
            // Create bin directory if it doesn't exist
            if (!fs.existsSync(this.binDir)) {
                fs.mkdirSync(this.binDir, { recursive: true });
            }

            const executableName = this.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
            const finalPath = path.join(this.binDir, executableName);
            
            // Check if FFmpeg already exists
            if (fs.existsSync(finalPath)) {
                return true;
            }

            // Get download URL for current platform
            const platformUrls = this.ffmpegUrls[this.platform];
            if (!platformUrls) {
                throw new Error(`Unsupported platform: ${this.platform}`);
            }

            const downloadUrl = platformUrls[this.arch] || platformUrls['x64'];
            if (!downloadUrl) {
                throw new Error(`No FFmpeg download available for ${this.platform}-${this.arch}`);
            }

            // Determine archive filename
            const archiveExt = downloadUrl.includes('.zip') ? '.zip' : 
                              downloadUrl.includes('.tar.xz') ? '.tar.xz' : '.zip';
            const archivePath = path.join(this.binDir, `ffmpeg-download${archiveExt}`);
            const extractDir = path.join(this.binDir, 'ffmpeg-extracted');

            try {
                // Download archive
                await this.downloadFile(downloadUrl, archivePath);

                // Create extraction directory
                if (fs.existsSync(extractDir)) {
                    fs.rmSync(extractDir, { recursive: true, force: true });
                }
                fs.mkdirSync(extractDir, { recursive: true });

                // Extract archive
                await this.extractArchive(archivePath, extractDir);

                // Find FFmpeg executable
                const ffmpegPath = this.findFFmpegExecutable(extractDir);
                if (!ffmpegPath) {
                    throw new Error('FFmpeg executable not found in extracted files');
                }

                // Copy to final location
                fs.copyFileSync(ffmpegPath, finalPath);

                // Make executable on Unix systems
                if (this.platform !== 'win32') {
                    fs.chmodSync(finalPath, '755');
                }

                return true;

            } finally {
                // Clean up temporary files
                try {
                    if (fs.existsSync(archivePath)) {
                        fs.unlinkSync(archivePath);
                    }
                    if (fs.existsSync(extractDir)) {
                        fs.rmSync(extractDir, { recursive: true, force: true });
                    }
                } catch (cleanupError) {
                    console.warn('Warning: Could not clean up temporary files:', cleanupError.message);
                }
            }

        } catch (error) {
            console.error('❌ Failed to download FFmpeg:', error.message);
            return false;
        }
    }

    async verifyFFmpeg() {
        const executableName = this.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const ffmpegPath = path.join(this.binDir, executableName);
        
        if (!fs.existsSync(ffmpegPath)) {
            return false;
        }

        return new Promise((resolve) => {
            const ffmpeg = spawn(ffmpegPath, ['-version'], { stdio: 'pipe' });
            
            let output = '';
            ffmpeg.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0 && output.includes('ffmpeg version')) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });

            ffmpeg.on('error', (error) => {
                resolve(false);
            });
        });
    }
}

// Main execution
async function main() {
    
    const downloader = new FFmpegDownloader();
    const success = await downloader.downloadAndExtractFFmpeg();
    
    if (success) {
        const verified = await downloader.verifyFFmpeg();
        if (verified) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    } else {
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });
}

module.exports = FFmpegDownloader; 