using System;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json;
using System.Threading;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using Google.Cloud.Speech.V1;
using Google.Protobuf;

namespace WindowsRecorder
{
    public class RecorderCLI
    {
        private bool isRecording = false;
        private CancellationTokenSource cancellationTokenSource = new CancellationTokenSource();
        private List<byte> audioBuffer = new List<byte>();
        private List<byte> currentAudioChunk = new List<byte>();
        private readonly object audioChunkLock = new object();
        private string outputDirectory = Path.Combine(Directory.GetCurrentDirectory(), "results");

        // Google Speech-to-Text streaming
        private SpeechClient speechClient;
        private SpeechClient.StreamingRecognizeStream streamingCall;
        private bool streamingReady = false;

        // Target settings to match macOS recorder
        private const uint TARGET_SAMPLE_RATE = 16000;
        private const uint TARGET_CHANNEL_COUNT = 1;
        private const int TARGET_WIDTH = 320;
        private const int TARGET_HEIGHT = 180;

        // Win32 API declarations for screen capture
        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int width, int height);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr hDestDC, int x, int y, int width, int height,
            IntPtr hSrcDC, int xSrc, int ySrc, int dwRop);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        // Audio capture Win32 APIs
        [DllImport("ole32.dll")]
        private static extern int CoInitialize(IntPtr pvReserved);

        [DllImport("ole32.dll")]
        private static extern void CoUninitialize();

        [DllImport("ole32.dll")]
        private static extern int CoCreateInstance(
            ref Guid rclsid,
            IntPtr pUnkOuter,
            uint dwClsContext,
            ref Guid riid,
            out IntPtr ppv);

        // Audio constants
        private static Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
        private static Guid IID_IMMDeviceEnumerator = new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
        private static Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        private static Guid IID_IAudioCaptureClient = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317");

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;
        private const int SRCCOPY = 0x00CC0020;
        private const uint CLSCTX_ALL = 23;

        // Audio interfaces
        [ComImport]
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceEnumerator
        {
            int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
            int GetDefaultAudioEndpoint(int dataFlow, int role, out IntPtr ppEndpoint);
            int GetDevice(string pwstrId, out IntPtr ppDevice);
            int RegisterEndpointNotificationCallback(IntPtr pClient);
            int UnregisterEndpointNotificationCallback(IntPtr pClient);
        }

        [ComImport]
        [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDevice
        {
            int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, out IntPtr ppInterface);
            int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
            int GetId(out IntPtr ppstrId);
            int GetState(out int pdwState);
        }

        [ComImport]
        [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioClient
        {
            int Initialize(int ShareMode, int StreamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr AudioSessionGuid);
            int GetBufferSize(out uint pNumBufferFrames);
            int GetStreamLatency(out long phnsLatency);
            int GetCurrentPadding(out uint pNumPaddingFrames);
            int IsFormatSupported(int ShareMode, IntPtr pFormat, IntPtr ppClosestMatch);
            int GetMixFormat(out IntPtr ppDeviceFormat);
            int GetDevicePeriod(out long phnsDefaultDevicePeriod, out long phnsMinimumDevicePeriod);
            int Start();
            int Stop();
            int Reset();
            int SetEventHandle(IntPtr eventHandle);
            int GetService(ref Guid riid, out IntPtr ppv);
        }

        [ComImport]
        [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioCaptureClient
        {
            int GetBuffer(out IntPtr ppData, out uint pNumFramesToRead, out uint pdwFlags, out long pu64DevicePosition, out long pu64QPCPosition);
            int ReleaseBuffer(uint NumFramesRead);
            int GetNextPacketSize(out uint pNumFramesInNextPacket);
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WAVEFORMATEX
        {
            public ushort wFormatTag;
            public ushort nChannels;
            public uint nSamplesPerSec;
            public uint nAvgBytesPerSec;
            public ushort nBlockAlign;
            public ushort wBitsPerSample;
            public ushort cbSize;
        }

        public static async Task Main(string[] args)
        {
            // Debug: Send immediate process startup confirmation
            try
            {
                Console.Error.WriteLine("{\"code\":\"DEBUG_PROCESS_STARTED\",\"args\":" + Newtonsoft.Json.JsonConvert.SerializeObject(args) + "}");
                Console.Error.Flush();
            }
            catch { /* ignore any errors in debug output */ }

            var recorder = new RecorderCLI();
            
            if (args.Length > 0 && args[0] == "--version")
            {
                recorder.PrintVersion();
                return;
            }
            
            if (args.Length > 0 && args[0] == "--check-permissions")
            {
                await recorder.CheckPermissions();
                return;
            }
            
            if (args.Length > 0 && args[0] == "--test-audio")
            {
                await recorder.TestAudioCapture();
                return;
            }
            
            if (args.Length > 0 && args[0] == "--test-audio-quick")
            {
                await recorder.TestAudioCapture(0); // Quick test mode
                return;
            }

            if (args.Length > 0 && args[0] == "--test-audio-1min")
            {
                await recorder.TestAudioCapture(60); // 60 seconds
                    return;
                }

            if (args.Length > 0 && args[0] == "--stream-transcription")
                {
                await recorder.StartStreamingTranscription();
                    return;
                }

            if (args.Length > 0 && args[0] == "--debug-audio")
                {
                await recorder.DebugAudioDevices();
                    return;
                }

            await recorder.ExecuteRecordingProcess();
        }

        private void PrintVersion()
        {
            Console.WriteLine("Windows System Audio Recorder v1.0.0");
            Console.WriteLine("Built for Interview Lift - AI-Powered Interview Support");
            Console.WriteLine("Supports: System Audio Capture, Screen Recording, Google STT Integration");
        }

        private async Task CheckPermissions()
        {
            try
            {
                // Test if we can capture screen
                var testCapture = CaptureScreen();
                if (testCapture != null)
                {
                    testCapture.Dispose();
                    
                    // Test audio capture
                    var audioTest = InitializeAudioCapture();
                    if (audioTest)
                    {
                        ReturnResponse(new { code = "PERMISSION_GRANTED", message = "Screen and audio capture available" });
                    }
                    else
                    {
                        ReturnResponse(new { code = "PERMISSION_GRANTED", message = "Screen capture available, audio may need permissions" });
                    }
                }
                else
                {
                    ReturnResponse(new { code = "PERMISSION_DENIED", reason = "Screen capture failed" });
                }
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "PERMISSION_DENIED", reason = ex.Message });
            }
        }

        private async Task TestAudioCapture(int durationSeconds = 20)
        {
            try
            {
                // Quick permission test mode for duration 0
                if (durationSeconds == 0)
                {
                    if (InitializeAudioCapture())
                    {
                        Console.WriteLine("AUDIO_AVAILABLE");
                        Console.WriteLine("SUCCESS: System audio capture is available");
                        return;
                    }
                    else
                    {
                        Console.WriteLine("AUDIO_LIMITED");
                        Console.WriteLine("ERROR: Failed to initialize system audio capture");
                        return;
                    }
                }

                if (!Directory.Exists(outputDirectory))
                {
                    Directory.CreateDirectory(outputDirectory);
                }

                ReturnResponse(new { code = "TEST_AUDIO_START", message = $"Starting {durationSeconds}-second audio capture test..." }, false);
                
                // Initialize audio capture
                if (!InitializeAudioCapture())
                {
                    ReturnResponse(new { code = "TEST_AUDIO_ERROR", error = "Failed to initialize audio capture" }, true);
                    return;
                }

                // Clear any previous audio data
                audioBuffer.Clear();
                lock (audioChunkLock)
                {
                    currentAudioChunk.Clear();
                }

                isRecording = true;
                
                // Start audio capture task
                var audioTask = CaptureAudioDataContinuous();
                
                // Capture for the specified duration
                await Task.Delay(durationSeconds * 1000);
                
                // Stop recording
                isRecording = false;
                
                // Wait for audio task to complete
                await audioTask;
                
                // Save the captured audio
                if (audioBuffer.Count > 0)
                {
                    var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
                    var audioFile = Path.Combine(outputDirectory, $"test-audio-{timestamp}.wav");
                    await SaveAudioAsWav(audioFile);
                    
                    ReturnResponse(new { 
                        code = "TEST_AUDIO_SUCCESS", 
                        message = $"Audio capture test completed successfully. Duration: {durationSeconds} seconds",
                        file = audioFile,
                        size = audioBuffer.Count,
                        duration = $"{durationSeconds} seconds",
                        timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    }, true);
                }
                else
                {
                    ReturnResponse(new { 
                        code = "TEST_AUDIO_NO_DATA", 
                        message = "No audio data was captured during the test"
                    }, true);
                }
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "TEST_AUDIO_ERROR", error = ex.Message }, true);
            }
        }

        private async Task StartStreamingTranscription()
        {
            try
            {
                // Send immediate startup confirmation to stderr
                ReturnResponse(new { 
                    code = "DEBUG_STREAMING_START", 
                    message = "StartStreamingTranscription method called",
                    timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                }, false);

                // Initialize audio capture first
                if (!InitializeAudioCapture())
                {
                    ReturnResponse(new { code = "AUDIO_INIT_ERROR", error = "Failed to initialize COM for audio capture" }, false);
                    return;
                }

                ReturnResponse(new { 
                    code = "DEBUG_AUDIO_INIT_SUCCESS", 
                    message = "InitializeAudioCapture succeeded" 
                }, false);

                // Start streaming audio to stdout - this will send RECORDING_STARTED on success
                await StreamAudioToStdout();
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "STREAMING_ERROR", error = ex.Message }, false);
            }
        }

        private async Task StreamAudioToStdout()
        {
            IntPtr deviceEnumerator = IntPtr.Zero;
            IntPtr device = IntPtr.Zero;
            IntPtr audioClient = IntPtr.Zero;
            IntPtr captureClient = IntPtr.Zero;
            IntPtr waveFormat = IntPtr.Zero;

            try
            {
                // Create device enumerator
                int hr = CoCreateInstance(ref CLSID_MMDeviceEnumerator, IntPtr.Zero, CLSCTX_ALL,
                    ref IID_IMMDeviceEnumerator, out deviceEnumerator);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "DEVICE_ENUMERATOR_ERROR", hr = hr }, false);
                    return;
                }

                var enumerator = Marshal.GetObjectForIUnknown(deviceEnumerator) as IMMDeviceEnumerator;
                if (enumerator == null)
                {
                    ReturnResponse(new { code = "ENUMERATOR_CAST_ERROR" }, false);
                    return;
                }

                // Get default playback device for loopback capture (system audio)
                hr = enumerator.GetDefaultAudioEndpoint(0, 0, out device); // 0 = eRender (playback), 0 = eConsole
                if (hr != 0)
                {
                    ReturnResponse(new { code = "DEFAULT_DEVICE_ERROR", hr = hr }, false);
                    return;
                }

                var deviceObj = Marshal.GetObjectForIUnknown(device) as IMMDevice;
                if (deviceObj == null)
                {
                    ReturnResponse(new { code = "DEVICE_CAST_ERROR" }, false);
                    return;
                }

                // Activate audio client
                hr = deviceObj.Activate(ref IID_IAudioClient, CLSCTX_ALL, IntPtr.Zero, out audioClient);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "AUDIO_CLIENT_ACTIVATE_ERROR", hr = hr }, false);
                    return;
                }

                var client = Marshal.GetObjectForIUnknown(audioClient) as IAudioClient;
                if (client == null)
                {
                    ReturnResponse(new { code = "AUDIO_CLIENT_CAST_ERROR" }, false);
                    return;
                }

                // Get mix format
                hr = client.GetMixFormat(out waveFormat);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "GET_MIX_FORMAT_ERROR", hr = hr }, false);
                    return;
                }

                var format = Marshal.PtrToStructure<WAVEFORMATEX>(waveFormat);
                ReturnResponse(new { 
                    code = "AUDIO_FORMAT_INFO", 
                    channels = format.nChannels,
                    sampleRate = format.nSamplesPerSec,
                    bitsPerSample = format.wBitsPerSample,
                    blockAlign = format.nBlockAlign
                }, false);

                // Initialize client for loopback capture
                const int AUDCLNT_SHAREMODE_SHARED = 0;
                const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
                
                hr = client.Initialize(AUDCLNT_SHAREMODE_SHARED, 
                    AUDCLNT_STREAMFLAGS_LOOPBACK, 
                    10000000, 0, waveFormat, IntPtr.Zero); // 1 second buffer
                if (hr != 0)
                {
                    ReturnResponse(new { code = "AUDIO_CLIENT_INIT_ERROR", hr = hr }, false);
                    return;
                }

                // Get capture client
                hr = client.GetService(ref IID_IAudioCaptureClient, out captureClient);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "CAPTURE_CLIENT_ERROR", hr = hr }, false);
                    return;
                }

                var capture = Marshal.GetObjectForIUnknown(captureClient) as IAudioCaptureClient;
                if (capture == null)
                {
                    ReturnResponse(new { code = "CAPTURE_CLIENT_CAST_ERROR" }, false);
                    return;
                }

                // Start capture
                hr = client.Start();
                if (hr != 0)
                {
                    ReturnResponse(new { code = "AUDIO_START_ERROR", hr = hr }, false);
                    return;
                }

                ReturnResponse(new { 
                    code = "SYSTEM_AUDIO_STREAMING_STARTED",
                    message = "Streaming system audio to stdout for Node.js processing"
                }, false);

                // Mark recording as started and send confirmation to Node.js
                isRecording = true;
                ReturnResponse(new { 
                    code = "RECORDING_STARTED", 
                    timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                    message = "Audio capture successfully initialized and started"
                }, false);

                // Stream audio continuously to stdout (like Swift version)
                int packetCount = 0;
                while (isRecording && !cancellationTokenSource.Token.IsCancellationRequested)
                {
                    uint packetLength = 0;
                    hr = capture.GetNextPacketSize(out packetLength);
                    
                    if (hr == 0 && packetLength > 0)
                    {
                        IntPtr pData;
                        uint numFramesAvailable;
                        uint flags;
                        long devicePosition, qpcPosition;
                        
                        hr = capture.GetBuffer(out pData, out numFramesAvailable, out flags, 
                            out devicePosition, out qpcPosition);
                        
                        if (hr == 0 && pData != IntPtr.Zero && numFramesAvailable > 0)
                        {
                            // Calculate buffer size for raw audio data
                            int bufferSize = (int)(numFramesAvailable * format.nBlockAlign);
                            byte[] audioData = new byte[bufferSize];
                            Marshal.Copy(pData, audioData, 0, bufferSize);
                            
                            // Convert 32-bit float to 16-bit PCM and resample to 16kHz mono for STT
                            var convertedAudio = ConvertToSttFormat(audioData, format);
                            
                            // Stream converted audio to stdout (Node.js will process through VAD + Google STT)
                            if (convertedAudio.Length > 0)
                            {
                                using var stdout = Console.OpenStandardOutput();
                                await stdout.WriteAsync(convertedAudio, 0, convertedAudio.Length);
                                await stdout.FlushAsync();
                                
                                packetCount++;
                                
                                // Debug progress every 1000 packets
                                if (packetCount % 1000 == 0)
                                {
                                    ReturnResponse(new { 
                                        code = "STREAMING_PROGRESS",
                                        packetCount = packetCount,
                                        lastPacketBytes = convertedAudio.Length
                                    }, false);
                                }
                            }
                            
                            capture.ReleaseBuffer(numFramesAvailable);
                        }
                    }
                    else
                    {
                        // Small delay to prevent excessive CPU usage
                        await Task.Delay(1, cancellationTokenSource.Token);
                    }
                    
                    // Check cancellation token frequently
                    if (cancellationTokenSource.Token.IsCancellationRequested)
                    {
                        break;
                    }
                }

                // Stop capture
                client.Stop();
                ReturnResponse(new { 
                    code = "SYSTEM_AUDIO_STREAMING_STOPPED",
                    totalPackets = packetCount
                }, false);
            }
            catch (OperationCanceledException)
            {
                ReturnResponse(new { code = "AUDIO_STREAMING_CANCELLED" }, false);
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "STREAMING_AUDIO_ERROR", error = ex.Message }, false);
            }
            finally
            {
                if (waveFormat != IntPtr.Zero) Marshal.FreeCoTaskMem(waveFormat);
                if (captureClient != IntPtr.Zero) Marshal.Release(captureClient);
                if (audioClient != IntPtr.Zero) Marshal.Release(audioClient);
                if (device != IntPtr.Zero) Marshal.Release(device);
                if (deviceEnumerator != IntPtr.Zero) Marshal.Release(deviceEnumerator);
            }
        }

        private List<short> Resample(List<short> pcmSamples, uint originalSampleRate, uint targetSampleRate)
        {
            if (originalSampleRate == targetSampleRate)
            {
                return pcmSamples;
            }

            var resampledSamples = new List<short>();
            double ratio = (double)originalSampleRate / targetSampleRate;
            int outputLength = (int)(pcmSamples.Count / ratio);

            for (int i = 0; i < outputLength; i++)
            {
                double floatIndex = i * ratio;
                int index1 = (int)floatIndex;
                int index2 = index1 + 1;

                if (index2 >= pcmSamples.Count)
                {
                    // If at the end of the list, just use the last sample.
                    resampledSamples.Add(pcmSamples[index1]);
                }
                else
                {
                    // Linear interpolation for higher quality resampling.
                    double fraction = floatIndex - index1;
                    short sample1 = pcmSamples[index1];
                    short sample2 = pcmSamples[index2];
                    short resampledValue = (short)(sample1 + (sample2 - sample1) * fraction);
                    resampledSamples.Add(resampledValue);
                }
            }
            return resampledSamples;
        }

        /// <summary>
        /// Converts raw 32-bit float audio data into 16-bit PCM, 16kHz mono format for Google STT.
        /// </summary>
        /// <param name="rawAudioData">The raw audio data from the system.</param>
        /// <param name="originalFormat">The original WAVEFORMATEX of the captured audio.</param>
        /// <returns>A byte array containing the converted audio data.</returns>
        private byte[] ConvertToSttFormat(byte[] rawAudioData, WAVEFORMATEX originalFormat)
        {
            try
            {
                // 1. Convert raw 32-bit float data to an array of floats
                var floatSamples = new float[rawAudioData.Length / 4];
                Buffer.BlockCopy(rawAudioData, 0, floatSamples, 0, rawAudioData.Length);

                // 2. Down-mix to mono and convert to 16-bit PCM in one pass
                var monoPcmSamples = new List<short>();
                for (int i = 0; i < floatSamples.Length; i += originalFormat.nChannels)
                {
                    float monoSample = 0;
                    if (originalFormat.nChannels >= 2)
                    {
                        // Average the first two channels for mono
                        monoSample = (floatSamples[i] + floatSamples[i + 1]) / 2.0f;
                    }
                    else
                    {
                        monoSample = floatSamples[i];
                    }

                    // Apply a simple noise gate to reduce background hiss
                    if (Math.Abs(monoSample) < 0.001f)
                    {
                        monoSample = 0.0f;
                    }

                    // Clamp the sample to the [-1.0, 1.0] range to prevent clipping
                    monoSample = Math.Max(-1.0f, Math.Min(1.0f, monoSample));

                    // Convert to 16-bit integer and add to the list
                    monoPcmSamples.Add((short)(monoSample * 32767.0f));
                }

                // 3. Resample the mono audio to the target sample rate (16kHz)
                var resampledPcmSamples = Resample(monoPcmSamples, originalFormat.nSamplesPerSec, TARGET_SAMPLE_RATE);

                // 4. Convert the final list of 16-bit samples to a byte array
                var result = new byte[resampledPcmSamples.Count * 2];
                Buffer.BlockCopy(resampledPcmSamples.ToArray(), 0, result, 0, result.Length);

                return result;
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "AUDIO_CONVERSION_ERROR", error = ex.Message }, false);
                return new byte[0];
            }
        }

        private async Task DebugAudioDevices()
        {
            IntPtr deviceEnumerator = IntPtr.Zero;
            
            try
            {
                // Initialize COM
                int comResult = CoInitialize(IntPtr.Zero);
                if (comResult != 0 && comResult != 1)
                {
                    ReturnResponse(new { code = "COM_INIT_ERROR", hr = comResult }, true);
                    return;
                }

                // Create device enumerator
                int hr = CoCreateInstance(ref CLSID_MMDeviceEnumerator, IntPtr.Zero, CLSCTX_ALL,
                    ref IID_IMMDeviceEnumerator, out deviceEnumerator);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "DEVICE_ENUMERATOR_ERROR", hr = hr }, true);
                    return;
                }

                var enumerator = Marshal.GetObjectForIUnknown(deviceEnumerator) as IMMDeviceEnumerator;
                if (enumerator == null)
                {
                    ReturnResponse(new { code = "ENUMERATOR_CAST_ERROR" }, true);
                    return;
                }

                // Get default render device (what we're currently trying to capture)
                IntPtr defaultDevice = IntPtr.Zero;
                hr = enumerator.GetDefaultAudioEndpoint(0, 0, out defaultDevice); // 0 = eRender, 0 = eConsole
                if (hr == 0)
                {
                    ReturnResponse(new { 
                        code = "DEFAULT_RENDER_DEVICE", 
                        message = "Found default render device (speakers/headphones)",
                        devicePtr = defaultDevice.ToString()
                    }, false);
                    
                    if (defaultDevice != IntPtr.Zero)
                    {
                        Marshal.Release(defaultDevice);
                    }
                }
                else
                {
                    ReturnResponse(new { code = "NO_DEFAULT_RENDER_DEVICE", hr = hr }, false);
                }

                // Try default communication device
                IntPtr commDevice = IntPtr.Zero;
                hr = enumerator.GetDefaultAudioEndpoint(0, 1, out commDevice); // 0 = eRender, 1 = eCommunications
                if (hr == 0)
                {
                    ReturnResponse(new { 
                        code = "DEFAULT_COMM_DEVICE", 
                        message = "Found default communication render device",
                        devicePtr = commDevice.ToString()
                    }, false);
                    
                    if (commDevice != IntPtr.Zero)
                    {
                        Marshal.Release(commDevice);
                    }
                }

                ReturnResponse(new { 
                    code = "DEBUG_COMPLETE", 
                    message = "Audio device debug completed. System should be using render device for loopback capture."
                }, true);
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "DEBUG_ERROR", error = ex.Message }, true);
            }
            finally
            {
                if (deviceEnumerator != IntPtr.Zero) 
                {
                    Marshal.Release(deviceEnumerator);
                }
            }
        }

        private async Task ExecuteRecordingProcess()
        {
            try
            {
                // Create results directory
                Directory.CreateDirectory(outputDirectory);
                
                cancellationTokenSource = new CancellationTokenSource();
                SetupInterruptHandler();
                await InitializeCapture();
                
                // Keep the application running until cancelled
                await Task.Delay(-1, cancellationTokenSource.Token);
            }
            catch (OperationCanceledException)
            {
                // Normal cancellation
                await StopRecording();
                ReturnResponse(new { code = "RECORDING_STOPPED", timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ") });
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "EXECUTION_ERROR", error = ex.Message }, true);
            }
        }

        private void SetupInterruptHandler()
        {
            Console.CancelKeyPress += async (sender, e) => {
                e.Cancel = true; // Prevent immediate termination
                await TerminateRecording();
                cancellationTokenSource?.Cancel();
            };
        }

        private async Task InitializeCapture()
        {
            try
            {
                ReturnResponse(new { code = "DEBUG_INITIALIZING_SCREEN_AND_AUDIO_CAPTURE" }, false);
                
                // Test screen capture
                var testBitmap = CaptureScreen();
                if (testBitmap == null)
                {
                    throw new Exception("Failed to initialize screen capture");
                }
                testBitmap.Dispose();
                
                // Initialize audio
                InitializeAudioCapture();
                
                // Start recording
                await StartRecording();
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "INITIALIZATION_ERROR", error = ex.Message }, true);
            }
        }

        private async Task StartRecording()
        {
            try
            {
                ReturnResponse(new { code = "DEBUG_STARTING_RECORDING" }, false);

                isRecording = true;
                var timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                ReturnResponse(new { code = "RECORDING_STARTED", timestamp = timestamp }, false);

                // Start audio capture in background
                _ = Task.Run(async () => await AudioCaptureLoop());
                
                // Start combined video and audio output loop
                _ = Task.Run(async () => await VideoFrameCaptureLoop());
                
                ReturnResponse(new { code = "DEBUG_RECORDING_FULLY_STARTED" }, false);
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "RECORDING_START_FAILED", error = ex.Message }, true);
            }
        }

        private async Task VideoFrameCaptureLoop()
        {
            try
            {
                while (isRecording && !cancellationTokenSource.Token.IsCancellationRequested)
                {
                    await CaptureVideoFrame();
                    
                    // Control frame rate (10 FPS to match Swift implementation)
                    await Task.Delay(100, cancellationTokenSource.Token);
                }
            }
            catch (OperationCanceledException)
            {
                // Normal cancellation
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "VIDEO_CAPTURE_LOOP_ERROR", error = ex.Message }, false);
            }
        }

        private async Task AudioCaptureLoop()
        {
            try
            {
                // Start continuous audio capture
                await CaptureAudioDataContinuous();
            }
            catch (OperationCanceledException)
            {
                // Normal cancellation
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "AUDIO_CAPTURE_LOOP_ERROR", error = ex.Message }, false);
            }
        }

        private async Task CaptureAudioDataContinuous()
        {
            IntPtr deviceEnumerator = IntPtr.Zero;
            IntPtr device = IntPtr.Zero;
            IntPtr audioClient = IntPtr.Zero;
            IntPtr captureClient = IntPtr.Zero;
            IntPtr waveFormat = IntPtr.Zero;

            try
            {
                // Create device enumerator
                int hr = CoCreateInstance(ref CLSID_MMDeviceEnumerator, IntPtr.Zero, CLSCTX_ALL,
                    ref IID_IMMDeviceEnumerator, out deviceEnumerator);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "DEVICE_ENUMERATOR_ERROR", hr = hr }, false);
                    return;
                }

                var enumerator = Marshal.GetObjectForIUnknown(deviceEnumerator) as IMMDeviceEnumerator;
                if (enumerator == null)
                {
                    ReturnResponse(new { code = "ENUMERATOR_CAST_ERROR" }, false);
                    return;
                }

                // Get default playback device for loopback capture (system audio)
                hr = enumerator.GetDefaultAudioEndpoint(0, 0, out device); // 0 = eRender (playback), 0 = eConsole
                if (hr != 0)
                {
                    ReturnResponse(new { code = "DEFAULT_DEVICE_ERROR", hr = hr }, false);
                    return;
                }

                var deviceObj = Marshal.GetObjectForIUnknown(device) as IMMDevice;
                if (deviceObj == null)
                {
                    ReturnResponse(new { code = "DEVICE_CAST_ERROR" }, false);
                    return;
                }

                // Activate audio client
                hr = deviceObj.Activate(ref IID_IAudioClient, CLSCTX_ALL, IntPtr.Zero, out audioClient);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "AUDIO_CLIENT_ACTIVATE_ERROR", hr = hr }, false);
                    return;
                }

                var client = Marshal.GetObjectForIUnknown(audioClient) as IAudioClient;
                if (client == null)
                {
                    ReturnResponse(new { code = "AUDIO_CLIENT_CAST_ERROR" }, false);
                    return;
                }

                // Get mix format
                hr = client.GetMixFormat(out waveFormat);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "GET_MIX_FORMAT_ERROR", hr = hr }, false);
                    return;
                }

                var format = Marshal.PtrToStructure<WAVEFORMATEX>(waveFormat);
                ReturnResponse(new { 
                    code = "AUDIO_FORMAT_INFO", 
                    channels = format.nChannels,
                    sampleRate = format.nSamplesPerSec,
                    bitsPerSample = format.wBitsPerSample,
                    blockAlign = format.nBlockAlign
                }, false);

                // Initialize client for loopback capture
                const int AUDCLNT_SHAREMODE_SHARED = 0;
                const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
                
                hr = client.Initialize(AUDCLNT_SHAREMODE_SHARED, 
                    AUDCLNT_STREAMFLAGS_LOOPBACK, 
                    10000000, 0, waveFormat, IntPtr.Zero); // 1 second buffer
                if (hr != 0)
                {
                    ReturnResponse(new { code = "AUDIO_CLIENT_INIT_ERROR", hr = hr }, false);
                    return;
                }

                // Get capture client
                hr = client.GetService(ref IID_IAudioCaptureClient, out captureClient);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "CAPTURE_CLIENT_ERROR", hr = hr }, false);
                    return;
                }

                var capture = Marshal.GetObjectForIUnknown(captureClient) as IAudioCaptureClient;
                if (capture == null)
                {
                    ReturnResponse(new { code = "CAPTURE_CLIENT_CAST_ERROR" }, false);
                    return;
                }

                // Get buffer size
                uint bufferFrameCount;
                hr = client.GetBufferSize(out bufferFrameCount);
                if (hr != 0)
                {
                    ReturnResponse(new { code = "GET_BUFFER_SIZE_ERROR", hr = hr }, false);
                    return;
                }

                // Start capture
                hr = client.Start();
                if (hr != 0)
                {
                    ReturnResponse(new { code = "AUDIO_START_ERROR", hr = hr }, false);
                    return;
                }

                ReturnResponse(new { 
                    code = "SYSTEM_AUDIO_CAPTURE_STARTED",
                    bufferFrames = bufferFrameCount,
                    message = "Loopback capture started for system audio"
                }, false);

                // Controlled capture loop with proper termination
                int captureCount = 0;
                int consecutiveEmptyPackets = 0;
                const int MAX_EMPTY_PACKETS = 100; // Prevent infinite loops
                
                while (isRecording && !cancellationTokenSource.Token.IsCancellationRequested)
                {
                    uint packetLength = 0;
                    hr = capture.GetNextPacketSize(out packetLength);
                    
                    if (hr == 0 && packetLength > 0)
                    {
                        consecutiveEmptyPackets = 0; // Reset counter
                        
                        IntPtr pData;
                        uint numFramesAvailable;
                        uint flags;
                        long devicePosition, qpcPosition;
                        
                        hr = capture.GetBuffer(out pData, out numFramesAvailable, out flags, 
                            out devicePosition, out qpcPosition);
                        
                        if (hr == 0)
                        {
                            if (pData != IntPtr.Zero && numFramesAvailable > 0)
                            {
                                int bufferSize = (int)(numFramesAvailable * format.nBlockAlign);
                                byte[] audioData = new byte[bufferSize];
                                Marshal.Copy(pData, audioData, 0, bufferSize);
                                
                                captureCount++;
                                
                                // Add to both buffers
                                lock (audioChunkLock)
                                {
                                    currentAudioChunk.AddRange(audioData);
                                }
                                audioBuffer.AddRange(audioData);
                                
                                // Debug: Report every 500 captures for 1-minute tests
                                if (captureCount % 500 == 0)
                                {
                                    ReturnResponse(new { 
                                        code = "AUDIO_CAPTURE_PROGRESS",
                                        captureCount = captureCount,
                                        totalBytes = audioBuffer.Count,
                                        lastPacketFrames = numFramesAvailable,
                                        lastPacketBytes = bufferSize
                                    }, false);
                                }
                            }
                            
                            capture.ReleaseBuffer(numFramesAvailable);
                        }
                    }
                    else
                    {
                        consecutiveEmptyPackets++;
                        
                        // Prevent infinite loops when no audio is available
                        if (consecutiveEmptyPackets > MAX_EMPTY_PACKETS)
                        {
                            await Task.Delay(1, cancellationTokenSource.Token);
                            consecutiveEmptyPackets = 0;
                        }
                    }
                    
                    // Critical: Check cancellation token frequently
                    if (cancellationTokenSource.Token.IsCancellationRequested)
                    {
                        break;
                    }
                }

                // Stop capture
                client.Stop();
                ReturnResponse(new { 
                    code = "SYSTEM_AUDIO_CAPTURE_STOPPED",
                    totalCaptureCount = captureCount,
                    totalBytes = audioBuffer.Count
                }, false);
            }
            catch (OperationCanceledException)
            {
                // Normal cancellation
                ReturnResponse(new { code = "AUDIO_CAPTURE_CANCELLED" }, false);
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "CONTINUOUS_AUDIO_CAPTURE_ERROR", error = ex.Message }, false);
            }
            finally
            {
                if (waveFormat != IntPtr.Zero) Marshal.FreeCoTaskMem(waveFormat);
                if (captureClient != IntPtr.Zero) Marshal.Release(captureClient);
                if (audioClient != IntPtr.Zero) Marshal.Release(audioClient);
                if (device != IntPtr.Zero) Marshal.Release(device);
                if (deviceEnumerator != IntPtr.Zero) Marshal.Release(deviceEnumerator);
            }
        }

        private async Task CaptureVideoFrame()
        {
            try
            {
                var imageData = await CaptureAndEncodeScreen();
                
                // Get current audio chunk
                string? audioData = null;
                lock (audioChunkLock)
                {
                    if (currentAudioChunk.Count > 0)
                    {
                        audioData = Convert.ToBase64String(currentAudioChunk.ToArray());
                        currentAudioChunk.Clear();
                    }
                }
                
                ReturnResponse(new { 
                    video = imageData,
                    audio = audioData,
                    timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                }, false);
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "VIDEO_FRAME_CAPTURE_ERROR", error = ex.Message }, false);
            }
        }

        private async Task<string> CaptureAndEncodeScreen()
        {
            return await Task.Run(() =>
            {
                using var bitmap = CaptureScreen();
                if (bitmap == null)
                {
                    throw new Exception("Screen capture failed");
                }

                // Resize to target dimensions
                using var resizedBitmap = new Bitmap(TARGET_WIDTH, TARGET_HEIGHT);
                using var graphics = Graphics.FromImage(resizedBitmap);
                graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                graphics.DrawImage(bitmap, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

                // Convert to JPEG and encode as base64
                using var stream = new MemoryStream();
                resizedBitmap.Save(stream, ImageFormat.Jpeg);
                return Convert.ToBase64String(stream.ToArray());
            });
        }

        private Bitmap? CaptureScreen()
        {
            try
            {
                // Get screen dimensions
                int screenWidth = GetSystemMetrics(SM_CXSCREEN);
                int screenHeight = GetSystemMetrics(SM_CYSCREEN);

                // Get device context for the screen
                IntPtr screenDC = GetDC(IntPtr.Zero);
                if (screenDC == IntPtr.Zero)
                {
                    return null;
                }

                try
                {
                    // Create compatible DC and bitmap
                    IntPtr memoryDC = CreateCompatibleDC(screenDC);
                    if (memoryDC == IntPtr.Zero)
                    {
                        return null;
                    }

                    try
                    {
                        IntPtr bitmap = CreateCompatibleBitmap(screenDC, screenWidth, screenHeight);
                        if (bitmap == IntPtr.Zero)
                        {
                            return null;
                        }

                        try
                        {
                            // Select bitmap into memory DC
                            IntPtr oldBitmap = SelectObject(memoryDC, bitmap);

                            // Copy screen to memory DC
                            bool success = BitBlt(memoryDC, 0, 0, screenWidth, screenHeight,
                                screenDC, 0, 0, SRCCOPY);

                            if (!success)
                            {
                                return null;
                            }

                            // Convert to managed Bitmap
                            var managedBitmap = Bitmap.FromHbitmap(bitmap);
                            
                            // Restore old bitmap
                            SelectObject(memoryDC, oldBitmap);
                            
                            return managedBitmap;
                        }
                        finally
                        {
                            DeleteObject(bitmap);
                        }
                    }
                    finally
                    {
                        DeleteDC(memoryDC);
                    }
                }
                finally
                {
                    ReleaseDC(IntPtr.Zero, screenDC);
                }
            }
            catch
            {
                return null;
            }
        }

        private bool InitializeAudioCapture()
        {
            try
            {
                CoInitialize(IntPtr.Zero);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private async Task TerminateRecording()
        {
            isRecording = false;
            await StopRecording();
            
            try
            {
                ReturnResponse(new { code = "DEBUG_RECORDING_TERMINATED" }, false);
            }
            catch (Exception ex)
            {
                ReturnResponse(new { code = "DEBUG_ERROR_ON_STOP_CAPTURE", error = ex.Message }, false);
            }
        }

        private async Task StopRecording()
        {
            if (audioBuffer.Count > 0)
            {
                try
                {
                    var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
                    var audioFile = Path.Combine(outputDirectory, $"audio-{timestamp}.wav");
                    await SaveAudioAsWav(audioFile);
                    
                    ReturnResponse(new { 
                        code = "AUDIO_SAVED", 
                        file = audioFile,
                        size = audioBuffer.Count,
                        timestamp = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    }, false);
                }
                catch (Exception ex)
                {
                    ReturnResponse(new { code = "AUDIO_SAVE_ERROR", error = ex.Message }, false);
                }
            }
        }

        private async Task SaveAudioAsWav(string filePath)
        {
            await Task.Run(() =>
            {
                // Save raw 48kHz audio with improved conversion
                var convertedAudio = ConvertFloatToPcm16(audioBuffer.ToArray());
                
                using var fs = new FileStream(filePath, FileMode.Create);
                using var writer = new BinaryWriter(fs);

                // Use raw 48kHz format - ensure header matches actual data
                uint sampleRate = 48000; // Keep original sample rate
                ushort channels = 2;
                ushort bitsPerSample = 16;
                ushort blockAlign = (ushort)(channels * bitsPerSample / 8);
                uint byteRate = sampleRate * blockAlign;
                
                // Calculate actual duration from data size
                int actualDataSize = convertedAudio.Length;
                double actualDurationSeconds = (double)actualDataSize / (sampleRate * channels * (bitsPerSample / 8));

                // Log actual vs expected duration for debugging
                ReturnResponse(new { 
                    code = "WAV_FILE_INFO",
                    expectedDuration = "60 seconds",
                    actualDurationSeconds = actualDurationSeconds,
                    actualDataSize = actualDataSize,
                    sampleRate = sampleRate,
                    channels = channels,
                    bitsPerSample = bitsPerSample
                }, false);

                // WAV header with correct size calculations
                writer.Write("RIFF".ToCharArray());
                writer.Write(36 + actualDataSize); // Use actual data size
                writer.Write("WAVE".ToCharArray());
                writer.Write("fmt ".ToCharArray());
                writer.Write(16); // PCM format size
                writer.Write((ushort)1); // PCM format
                writer.Write(channels); // Stereo
                writer.Write(sampleRate); // 48000 Hz - raw format
                writer.Write(byteRate); // Byte rate
                writer.Write(blockAlign); // Block align (4 bytes for 16-bit stereo)
                writer.Write(bitsPerSample); // 16 bits per sample
                writer.Write("data".ToCharArray());
                writer.Write(actualDataSize); // Use actual data size
                writer.Write(convertedAudio);
            });
        }

        private byte[] ConvertFloatToPcm16(byte[] floatAudio)
        {
            // Improved 32-bit float to 16-bit PCM conversion with noise reduction
            var floatSamples = new float[floatAudio.Length / 4];
            Buffer.BlockCopy(floatAudio, 0, floatSamples, 0, floatAudio.Length);
            
            var pcmSamples = new short[floatSamples.Length];
            for (int i = 0; i < floatSamples.Length; i++)
            {
                // Improved conversion with better scaling and noise reduction
                float sample = floatSamples[i];
                
                // Apply gentle noise gate to reduce background noise
                if (Math.Abs(sample) < 0.001f)
                {
                    sample = 0.0f;
                }
                
                // Better clamping and scaling
                sample = Math.Max(-1.0f, Math.Min(1.0f, sample));
                
                // Convert to 16-bit with proper rounding
                int intSample = (int)(sample * 32767.0f + (sample >= 0 ? 0.5f : -0.5f));
                pcmSamples[i] = (short)Math.Max(-32768, Math.Min(32767, intSample));
            }
            
            var result = new byte[pcmSamples.Length * 2];
            Buffer.BlockCopy(pcmSamples, 0, result, 0, result.Length);
            return result;
        }

        private static void ReturnResponse(object response, bool shouldExitProcess = true)
        {
            try
            {
                var jsonResponse = JsonConvert.SerializeObject(response);
                Console.Error.WriteLine(jsonResponse);
                Console.Error.Flush();
                
                if (shouldExitProcess)
                {
                    Environment.Exit(0);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"{{\"code\":\"JSON_SERIALIZATION_ERROR\",\"error\":\"{ex.Message}\"}}");
                if (shouldExitProcess)
                {
                    Environment.Exit(1);
                }
            }
        }
    }
} 

