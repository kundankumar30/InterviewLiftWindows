import AVFoundation
import ScreenCaptureKit
import CoreImage

class RecorderCLI: NSObject, SCStreamDelegate, SCStreamOutput {
    static var screenCaptureStream: SCStream?
    var contentEligibleForSharing: SCShareableContent?
    let semaphoreRecordingStopped = DispatchSemaphore(value: 0)
    var streamFunctionTimeout: TimeInterval = 7.0
    var streamFunctionCalled = false
    var audioStreamStarted = false
    var audioFormatLogged = false
    let ciContext = CIContext()

    let targetSampleRate: Double = 16000.0
    let targetChannelCount: UInt32 = 1

    override init() {
        super.init()
        processCommandLineArguments()
    }

    func processCommandLineArguments() {
        let arguments = CommandLine.arguments
        if arguments.contains("--check-permissions") {
            PermissionsRequester.requestScreenCaptureAccess { granted in
                ResponseHandler.returnResponse(["code": granted ? "PERMISSION_GRANTED" : "PERMISSION_DENIED"])
            }
            return
        }
    }

    func executeRecordingProcess() {
        updateAvailableContent()
        setupInterruptSignalHandler()
        setupStreamFunctionTimeout()
        semaphoreRecordingStopped.wait()
    }

    func setupInterruptSignalHandler() {
        let interruptSignalHandler: @convention(c) (Int32) -> Void = { signal in
            if signal == SIGINT {
                RecorderCLI.terminateRecording()
                let timestamp = Date()
                let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
                ResponseHandler.returnResponse(["code": "RECORDING_STOPPED", "timestamp": formattedTimestamp])
            }
        }
        signal(SIGINT, interruptSignalHandler)
    }

    func setupStreamFunctionTimeout() {
        DispatchQueue.global().asyncAfter(deadline: .now() + streamFunctionTimeout) { [weak self] in
            guard let self = self else { return }
            if !self.streamFunctionCalled {
                RecorderCLI.terminateRecording()
                ResponseHandler.returnResponse(["code": "STREAM_FUNCTION_NOT_CALLED_TIMEOUT"], shouldExitProcess: true)
            } else if !self.audioStreamStarted {
                RecorderCLI.terminateRecording()
                ResponseHandler.returnResponse(["code": "NO_AUDIO_FRAMES_RECEIVED_TIMEOUT"], shouldExitProcess: true)
            }
        }
    }

    func updateAvailableContent() {
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            if let error = error {
                ResponseHandler.returnResponse(["code": "CONTENT_FETCH_ERROR", "error": error.localizedDescription])
                self.semaphoreRecordingStopped.signal()
                return
            }
            guard let content = content else {
                ResponseHandler.returnResponse(["code": "NO_CONTENT_FOUND"])
                self.semaphoreRecordingStopped.signal()
                return
            }
            self.contentEligibleForSharing = content
            self.setupRecordingEnvironment()
        }
    }

    func setupRecordingEnvironment() {
        guard let firstDisplay = contentEligibleForSharing?.displays.first else {
            ResponseHandler.returnResponse(["code": "NO_DISPLAY_FOUND"])
            self.semaphoreRecordingStopped.signal()
            return
        }
        let screenContentFilter = SCContentFilter(display: firstDisplay, excludingApplications: [], exceptingWindows: [])
        Task { await self.initiateRecording(with: screenContentFilter) }
    }

    func initiateRecording(with filter: SCContentFilter) async {
        let streamConfiguration = SCStreamConfiguration()
        configureStream(streamConfiguration)
        ResponseHandler.returnResponse(["code": "DEBUG_INITIATE_RECORDING_CALLED"], shouldExitProcess: false)

        do {
            RecorderCLI.screenCaptureStream = SCStream(filter: filter, configuration: streamConfiguration, delegate: self)
            ResponseHandler.returnResponse(["code": "DEBUG_SCSTREAM_OBJECT_CREATED"], shouldExitProcess: false)

            let sampleHandlerQueue = DispatchQueue.global(qos: .userInitiated)

            try RecorderCLI.screenCaptureStream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleHandlerQueue)
            ResponseHandler.returnResponse(["code": "DEBUG_ADD_STREAM_OUTPUT_AUDIO_CALLED"], shouldExitProcess: false)
            
            try RecorderCLI.screenCaptureStream?.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleHandlerQueue)
            ResponseHandler.returnResponse(["code": "DEBUG_ADD_STREAM_OUTPUT_VIDEO_CALLED"], shouldExitProcess: false)

            try await RecorderCLI.screenCaptureStream?.startCapture()
            ResponseHandler.returnResponse(["code": "DEBUG_START_CAPTURE_SUCCESS"], shouldExitProcess: false)

        } catch {
            ResponseHandler.returnResponse(["code": "CAPTURE_FAILED_IN_INITIATE", "error": error.localizedDescription])
            self.semaphoreRecordingStopped.signal()
        }
    }

    func configureStream(_ configuration: SCStreamConfiguration) {
        configuration.width = 320
        configuration.height = 180
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(10))
        configuration.showsCursor = true
        configuration.capturesAudio = true
        configuration.sampleRate = Int(self.targetSampleRate)
        configuration.channelCount = Int(self.targetChannelCount)
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        self.streamFunctionCalled = true

        switch outputType {
        case .screen:
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
            let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
            
            let jpegOptions = [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.4]
            
            if let jpegData = self.ciContext.jpegRepresentation(of: ciImage, colorSpace: ciImage.colorSpace ?? CGColorSpaceCreateDeviceRGB(), options: jpegOptions) {
                let base64String = jpegData.base64EncodedString()
                ResponseHandler.returnResponse(["type": "VIDEO_FRAME", "imageData": base64String], shouldExitProcess: false)
            }
            return

        case .audio:
            if !self.audioStreamStarted {
                self.audioStreamStarted = true
                let timestamp = Date()
                let formattedTimestamp = ISO8601DateFormatter().string(from: timestamp)
                ResponseHandler.returnResponse(["code": "RECORDING_STARTED", "timestamp": formattedTimestamp], shouldExitProcess: false)
            }

            guard sampleBuffer.isValid, let audioBuffer = sampleBuffer.asPCMBuffer else { return }
            let format = audioBuffer.format
            
            if !self.audioFormatLogged {
                 ResponseHandler.returnResponse([
                    "code": "DEBUG_AUDIO_FORMAT_RECEIVED",
                    "sampleRate": format.sampleRate,
                    "channelCount": format.channelCount,
                    "commonFormat": String(describing: format.commonFormat),
                    "isInterleaved": format.isInterleaved
                 ], shouldExitProcess: false)
                self.audioFormatLogged = true
            }

            if format.commonFormat == .pcmFormatFloat32 {
                let frameLength = Int(audioBuffer.frameLength)
                guard frameLength > 0 else { return }

                if format.sampleRate == self.targetSampleRate && format.channelCount == self.targetChannelCount {
                    guard let channelData = audioBuffer.floatChannelData?[0] else {
                        ResponseHandler.returnResponse(["code": "ERROR_GETTING_MONO_FLOAT_DATA"], shouldExitProcess: false)
                        return
                    }
                    let data = Data(bytes: channelData, count: frameLength * MemoryLayout<Float>.size)
                    FileHandle.standardOutput.write(data)

                } else if format.sampleRate == 48000.0 && format.channelCount == 2 {
                    guard let ch0DataPtr = audioBuffer.floatChannelData?[0],
                          let ch1DataPtr = audioBuffer.floatChannelData?[1] else {
                        ResponseHandler.returnResponse(["code": "ERROR_GETTING_STEREO_FLOAT_DATA"], shouldExitProcess: false)
                        return
                    }
                    var interleavedSamples = [Float](repeating: 0.0, count: frameLength * 2)
                    for i in 0..<frameLength {
                        interleavedSamples[2 * i] = ch0DataPtr[i]
                        interleavedSamples[2 * i + 1] = ch1DataPtr[i]
                    }
                    let data = Data(bytes: interleavedSamples, count: interleavedSamples.count * MemoryLayout<Float>.size)
                    FileHandle.standardOutput.write(data)
                } else {
                    ResponseHandler.returnResponse([
                        "code": "WARN_UNHANDLED_FLOAT_AUDIO_FORMAT",
                        "actualSampleRate": format.sampleRate,
                        "actualChannelCount": format.channelCount
                    ], shouldExitProcess: false)
                }
            } else {
                ResponseHandler.returnResponse(["code": "WARN_NON_FLOAT32_AUDIO_FORMAT", "actualFormat": String(describing: format.commonFormat)], shouldExitProcess: false)
            }

        @unknown default:
            return
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let nsError = error as NSError
        if !(nsError.domain == "com.apple.ScreenCaptureKit.SCStream" && nsError.code == -3902) {
            ResponseHandler.returnResponse([
                "code": "STREAM_ERROR_OR_STOPPED_EXTERNALLY",
                "error_message": error.localizedDescription,
                "error_domain": nsError.domain,
                "error_code": nsError.code,
                "error_details": String(describing: error)
            ], shouldExitProcess: false)
        }
        RecorderCLI.terminateRecordingInternal()
        self.semaphoreRecordingStopped.signal()
    }
    
    static func terminateRecording() {
        terminateRecordingInternal()
    }

    private static func terminateRecordingInternal() {
        screenCaptureStream?.stopCapture { error in
            if let error = error {
                ResponseHandler.returnResponse(["code": "DEBUG_ERROR_ON_STOP_CAPTURE", "error": error.localizedDescription], shouldExitProcess: false)
            }
        }
    }
}

extension Date {
    func toFormattedFileName() -> String {
        let fileNameFormatter = DateFormatter()
        fileNameFormatter.dateFormat = "y-MM-dd HH.mm.ss"
        return fileNameFormatter.string(from: self)
    }
}

class PermissionsRequester {
    static func requestScreenCaptureAccess(completion: @escaping (Bool) -> Void) {
        if !CGPreflightScreenCaptureAccess() {
            let result = CGRequestScreenCaptureAccess()
            completion(result)
        } else {
            completion(true)
        }
    }
}

class ResponseHandler {
    static func returnResponse(_ response: [String: Any], shouldExitProcess: Bool = true) {
        if let jsonData = try? JSONSerialization.data(withJSONObject: response),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            if let data = (jsonString + "\n").data(using: .utf8) {
                FileHandle.standardError.write(data)
            }
        } else {
            if let errorJsonData = "{\"code\": \"JSON_SERIALIZATION_FAILED\"}\n".data(using: .utf8) {
                FileHandle.standardError.write(errorJsonData)
            }
        }

        if shouldExitProcess {
            exit(0)
        }
    }
}

// https://developer.apple.com/documentation/screencapturekit/capturing_screen_content_in_macos
// For Sonoma updated to https://developer.apple.com/forums/thread/727709
extension CMSampleBuffer {
    var asPCMBuffer: AVAudioPCMBuffer? {
        try? self.withAudioBufferList { audioBufferList, _ -> AVAudioPCMBuffer? in
            guard let absd = self.formatDescription?.audioStreamBasicDescription else { return nil }
            guard let format = AVAudioFormat(standardFormatWithSampleRate: absd.mSampleRate, channels: absd.mChannelsPerFrame) else { return nil }
            return AVAudioPCMBuffer(pcmFormat: format, bufferListNoCopy: audioBufferList.unsafePointer)
        }
    }
}

// Based on https://gist.github.com/aibo-cora/c57d1a4125e145e586ecb61ebecff47c
extension AVAudioPCMBuffer {
    var asSampleBuffer: CMSampleBuffer? {
        let asbd = self.format.streamDescription
        var sampleBuffer: CMSampleBuffer? = nil
        var format: CMFormatDescription? = nil

        guard CMAudioFormatDescriptionCreate(
            allocator: kCFAllocatorDefault,
            asbd: asbd,
            layoutSize: 0,
            layout: nil,
            magicCookieSize: 0,
            magicCookie: nil,
            extensions: nil,
            formatDescriptionOut: &format
        ) == noErr else { return nil }

        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: Int32(asbd.pointee.mSampleRate)),
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )

        guard CMSampleBufferCreate(
            allocator: kCFAllocatorDefault,
            dataBuffer: nil,
            dataReady: false,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: format,
            sampleCount: CMItemCount(self.frameLength),
            sampleTimingEntryCount: 1,
            sampleTimingArray: &timing,
            sampleSizeEntryCount: 0,
            sampleSizeArray: nil,
            sampleBufferOut: &sampleBuffer
        ) == noErr else { return nil }

        guard CMSampleBufferSetDataBufferFromAudioBufferList(
            sampleBuffer!,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: 0,
            bufferList: self.mutableAudioBufferList
        ) == noErr else { return nil }

        return sampleBuffer
    }
}

let app = RecorderCLI()
app.executeRecordingProcess()

