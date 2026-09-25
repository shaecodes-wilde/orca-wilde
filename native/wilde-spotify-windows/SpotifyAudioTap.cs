// Wilde Spotify visualizer: Spotify-only audio tap.
//
// Captures ONLY the Spotify desktop app's audio (WASAPI process loopback on the Spotify process
// tree, Windows 10 2004+), runs a small FFT and prints 32 log-spaced band levels (0..1) as NDJSON
// at ~30 fps. Nothing is recorded or stored; samples are analysed in memory and discarded.
//
// stdin : start | stop | exit            (one command per line)
// stdout: {"b":[0.12,...]}               band levels while started
//         {"status":"capturing"|"no-spotify"|"stopped"|"error","message":"..."}
//
// Written for the .NET Framework csc.exe that ships with Windows (C# 5), like
// native/windows-cli-launcher. Build: config/scripts/build-wilde-spotify-audio-tap.mjs.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class SpotifyAudioTap
{
    private const int BandCount = 32;
    private const int FftSize = 1024;
    private const int SampleRate = 44100;
    private const int FrameIntervalMs = 33;

    private static readonly object OutputLock = new object();
    private static readonly object StateLock = new object();
    private static CaptureSession session;
    private static volatile bool exiting;

    [MTAThread]
    private static int Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        Thread supervisor = new Thread(Supervise);
        supervisor.IsBackground = true;
        supervisor.Start();

        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            // Why letters only: a writer may prepend a UTF-8 BOM, which the console code page
            // decodes as junk characters; commands are plain words.
            StringBuilder letters = new StringBuilder();
            foreach (char c in line)
            {
                if (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z') letters.Append(char.ToLowerInvariant(c));
            }
            string command = letters.ToString();
            if (command == "start")
            {
                lock (StateLock) { wantCapture = true; }
            }
            else if (command == "stop")
            {
                lock (StateLock) { wantCapture = false; }
            }
            else if (command == "exit")
            {
                break;
            }
        }
        exiting = true;
        lock (StateLock) { wantCapture = false; }
        StopSession();
        return 0;
    }

    private static bool wantCapture;

    // Starts/stops the capture to match `wantCapture`, re-targeting Spotify if it restarts.
    private static void Supervise()
    {
        string lastStatus = null;
        while (!exiting)
        {
            bool want;
            lock (StateLock) { want = wantCapture; }
            if (!want)
            {
                if (session != null)
                {
                    StopSession();
                }
                if (lastStatus != "stopped")
                {
                    lastStatus = "stopped";
                    WriteStatus("stopped", null);
                }
                Thread.Sleep(100);
                continue;
            }
            if (session != null && session.IsAlive)
            {
                Thread.Sleep(250);
                continue;
            }
            StopSession();
            int pid = SpotifyProcesses.FindRootSpotifyPid();
            if (pid == 0)
            {
                if (lastStatus != "no-spotify")
                {
                    lastStatus = "no-spotify";
                    WriteStatus("no-spotify", null);
                }
                Thread.Sleep(2000);
                continue;
            }
            try
            {
                CaptureSession next = new CaptureSession(pid);
                next.Start();
                session = next;
                lastStatus = "capturing";
                WriteStatus("capturing", null);
            }
            catch (Exception error)
            {
                lastStatus = "error";
                WriteStatus("error", error.Message);
                Thread.Sleep(3000);
            }
        }
    }

    private static void StopSession()
    {
        CaptureSession current = session;
        session = null;
        if (current != null)
        {
            current.Dispose();
        }
    }

    internal static void WriteBands(float[] bands)
    {
        StringBuilder builder = new StringBuilder(8 + BandCount * 5);
        builder.Append("{\"b\":[");
        for (int i = 0; i < bands.Length; i++)
        {
            if (i > 0) builder.Append(',');
            builder.Append(Math.Round(bands[i], 2).ToString(CultureInfo.InvariantCulture));
        }
        builder.Append("]}");
        WriteLine(builder.ToString());
    }

    private static void WriteStatus(string status, string message)
    {
        string text = "{\"status\":\"" + status + "\"";
        if (message != null)
        {
            text += ",\"message\":\"" + message.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ") + "\"";
        }
        WriteLine(text + "}");
    }

    private static void WriteLine(string text)
    {
        lock (OutputLock)
        {
            try
            {
                Console.Out.WriteLine(text);
                Console.Out.Flush();
            }
            catch (IOException)
            {
                exiting = true;
            }
        }
    }

    // ---------------------------------------------------------------------------------------
    // Capture + analysis
    // ---------------------------------------------------------------------------------------

    private sealed class CaptureSession : IDisposable
    {
        private readonly int targetPid;
        private readonly float[] ring = new float[FftSize];
        private int ringWrite;
        private readonly Analyzer analyzer = new Analyzer();
        private Thread thread;
        private volatile bool stopping;
        private volatile bool alive;

        public CaptureSession(int pid)
        {
            targetPid = pid;
        }

        public bool IsAlive { get { return alive; } }

        public void Start()
        {
            // Activation happens on the calling (MTA) thread so failures surface to the supervisor.
            IAudioClient client = ProcessLoopback.Activate(targetPid);
            thread = new Thread(delegate () { Run(client); });
            thread.IsBackground = true;
            alive = true;
            thread.Start();
        }

        private void Run(IAudioClient client)
        {
            EventWaitHandle ready = new EventWaitHandle(false, EventResetMode.AutoReset);
            IAudioCaptureClient capture = null;
            try
            {
                WaveFormat format = WaveFormat.Pcm16Stereo(SampleRate);
                const uint Loopback = 0x00020000, EventCallback = 0x00040000, AutoConvertPcm = 0x80000000, SrcDefaultQuality = 0x08000000;
                Check(client.Initialize(0, Loopback | EventCallback | AutoConvertPcm | SrcDefaultQuality, 200000, 0, ref format, IntPtr.Zero), "Initialize");
                Check(client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle()), "SetEventHandle");
                Guid captureId = typeof(IAudioCaptureClient).GUID;
                object service;
                Check(client.GetService(ref captureId, out service), "GetService");
                capture = (IAudioCaptureClient)service;
                Check(client.Start(), "Start");

                DateTime nextFrame = DateTime.UtcNow;
                while (!stopping)
                {
                    ready.WaitOne(FrameIntervalMs);
                    Drain(capture);
                    if (DateTime.UtcNow >= nextFrame)
                    {
                        nextFrame = DateTime.UtcNow.AddMilliseconds(FrameIntervalMs);
                        WriteBands(analyzer.Analyze(ring, ringWrite));
                    }
                }
                client.Stop();
            }
            catch (Exception error)
            {
                if (!stopping)
                {
                    WriteStatus("error", error.Message);
                }
            }
            finally
            {
                alive = false;
                if (capture != null) Marshal.ReleaseComObject(capture);
                Marshal.ReleaseComObject(client);
                ready.Dispose();
            }
        }

        private void Drain(IAudioCaptureClient capture)
        {
            uint packet;
            Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
            while (packet > 0)
            {
                IntPtr data;
                uint frames, flags;
                ulong devicePosition, qpcPosition;
                Check(capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition), "GetBuffer");
                bool silent = (flags & 0x2) != 0;
                for (int i = 0; i < frames; i++)
                {
                    float mono = 0f;
                    if (!silent)
                    {
                        short left = Marshal.ReadInt16(data, i * 4);
                        short right = Marshal.ReadInt16(data, i * 4 + 2);
                        mono = (left + right) / 65536f;
                    }
                    ring[ringWrite] = mono;
                    ringWrite = (ringWrite + 1) % FftSize;
                }
                capture.ReleaseBuffer(frames);
                Check(capture.GetNextPacketSize(out packet), "GetNextPacketSize");
            }
        }

        public void Dispose()
        {
            stopping = true;
            if (thread != null && thread.IsAlive)
            {
                thread.Join(1000);
            }
        }
    }

    private static void Check(int hresult, string step)
    {
        if (hresult < 0)
        {
            throw new InvalidOperationException(string.Format(CultureInfo.InvariantCulture, "{0} failed (0x{1:X8})", step, hresult));
        }
    }

    /// Hann-windowed FFT -> 32 log-spaced bands -> auto-gained, attack/decay-smoothed levels.
    private sealed class Analyzer
    {
        private readonly float[] window = new float[FftSize];
        private readonly double[] re = new double[FftSize];
        private readonly double[] im = new double[FftSize];
        private readonly int[] bandStart = new int[BandCount];
        private readonly int[] bandEnd = new int[BandCount];
        private readonly float[] levels = new float[BandCount];
        private double peak = 1e-4;

        public Analyzer()
        {
            for (int i = 0; i < FftSize; i++)
            {
                window[i] = (float)(0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (FftSize - 1)));
            }
            double binHz = (double)SampleRate / FftSize;
            const double MinHz = 40, MaxHz = 16000;
            for (int b = 0; b < BandCount; b++)
            {
                double lo = MinHz * Math.Pow(MaxHz / MinHz, (double)b / BandCount);
                double hi = MinHz * Math.Pow(MaxHz / MinHz, (double)(b + 1) / BandCount);
                bandStart[b] = Math.Max(1, (int)Math.Floor(lo / binHz));
                bandEnd[b] = Math.Max(bandStart[b] + 1, (int)Math.Ceiling(hi / binHz));
            }
        }

        public float[] Analyze(float[] ring, int writeIndex)
        {
            for (int i = 0; i < FftSize; i++)
            {
                re[i] = ring[(writeIndex + i) % FftSize] * window[i];
                im[i] = 0;
            }
            Fft(re, im);

            double framePeak = 0;
            double[] raw = new double[BandCount];
            for (int b = 0; b < BandCount; b++)
            {
                double sum = 0;
                int count = 0;
                for (int k = bandStart[b]; k < bandEnd[b] && k < FftSize / 2; k++)
                {
                    sum += Math.Sqrt(re[k] * re[k] + im[k] * im[k]);
                    count++;
                }
                // Tilt up the highs a little so the ring isn't all bass.
                raw[b] = count > 0 ? (sum / count) * (1 + b / 5.0) : 0;
                if (raw[b] > framePeak) framePeak = raw[b];
            }
            // Auto-gain: follows loud passages quickly, relaxes slowly, so quiet songs still move.
            peak = framePeak > peak ? framePeak : Math.Max(1e-4, peak * 0.995);
            for (int b = 0; b < BandCount; b++)
            {
                float target = (float)Math.Min(1.0, Math.Pow(raw[b] / peak, 0.7));
                float current = levels[b];
                levels[b] = target > current ? current + (target - current) * 0.6f : current + (target - current) * 0.18f;
            }
            return (float[])levels.Clone();
        }

        private static void Fft(double[] real, double[] imag)
        {
            int n = real.Length;
            for (int i = 1, j = 0; i < n; i++)
            {
                int bit = n >> 1;
                for (; (j & bit) != 0; bit >>= 1) j ^= bit;
                j ^= bit;
                if (i < j)
                {
                    double tr = real[i]; real[i] = real[j]; real[j] = tr;
                    double ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
                }
            }
            for (int length = 2; length <= n; length <<= 1)
            {
                double angle = -2 * Math.PI / length;
                double wr = Math.Cos(angle), wi = Math.Sin(angle);
                for (int i = 0; i < n; i += length)
                {
                    double cr = 1, ci = 0;
                    for (int k = 0; k < length / 2; k++)
                    {
                        int a = i + k, b = i + k + length / 2;
                        double xr = real[b] * cr - imag[b] * ci;
                        double xi = real[b] * ci + imag[b] * cr;
                        real[b] = real[a] - xr; imag[b] = imag[a] - xi;
                        real[a] += xr; imag[a] += xi;
                        double nr = cr * wr - ci * wi;
                        ci = cr * wi + ci * wr;
                        cr = nr;
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------------------------------
    // Process discovery: the root Spotify.exe (its parent is not Spotify) owns the audio tree.
    // ---------------------------------------------------------------------------------------

    private static class SpotifyProcesses
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct ProcessEntry32
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry32 entry);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry32 entry);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        public static int FindRootSpotifyPid()
        {
            IntPtr snapshot = CreateToolhelp32Snapshot(0x2, 0);
            if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1)) return 0;
            Dictionary<uint, uint> spotifyParents = new Dictionary<uint, uint>();
            try
            {
                ProcessEntry32 entry = new ProcessEntry32();
                entry.dwSize = (uint)Marshal.SizeOf(typeof(ProcessEntry32));
                if (!Process32FirstW(snapshot, ref entry)) return 0;
                do
                {
                    if (string.Equals(entry.szExeFile, "Spotify.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        spotifyParents[entry.th32ProcessID] = entry.th32ParentProcessID;
                    }
                } while (Process32NextW(snapshot, ref entry));
            }
            finally
            {
                CloseHandle(snapshot);
            }
            foreach (KeyValuePair<uint, uint> pair in spotifyParents)
            {
                if (!spotifyParents.ContainsKey(pair.Value)) return (int)pair.Key;
            }
            return 0;
        }
    }

    // ---------------------------------------------------------------------------------------
    // WASAPI process-loopback activation (ActivateAudioInterfaceAsync + completion handler).
    // ---------------------------------------------------------------------------------------

    private static class ProcessLoopback
    {
        private const string VirtualDevicePath = "VAD\\Process_Loopback";

        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        private static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            [In] ref Guid riid,
            [In] IntPtr activationParams,
            [In] IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation activationOperation);

        public static IAudioClient Activate(int pid)
        {
            // AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType = PROCESS_LOOPBACK (1),
            //   ProcessLoopbackParams { TargetProcessId, INCLUDE_TARGET_PROCESS_TREE (0) } }
            IntPtr parameters = Marshal.AllocHGlobal(12);
            IntPtr propVariant = Marshal.AllocHGlobal(IntPtr.Size == 8 ? 24 : 16);
            try
            {
                Marshal.WriteInt32(parameters, 0, 1);
                Marshal.WriteInt32(parameters, 4, pid);
                Marshal.WriteInt32(parameters, 8, 0);
                for (int i = 0; i < (IntPtr.Size == 8 ? 24 : 16); i++) Marshal.WriteByte(propVariant, i, 0);
                Marshal.WriteInt16(propVariant, 0, 65); // VT_BLOB
                Marshal.WriteInt32(propVariant, 8, 12); // blob.cbSize
                Marshal.WriteIntPtr(propVariant, IntPtr.Size == 8 ? 16 : 12, parameters); // blob.pBlobData

                Guid audioClientId = typeof(IAudioClient).GUID;
                CompletionHandler handler = new CompletionHandler();
                IActivateAudioInterfaceAsyncOperation operation;
                ActivateAudioInterfaceAsync(VirtualDevicePath, ref audioClientId, propVariant, handler, out operation);
                if (!handler.Done.WaitOne(5000))
                {
                    throw new TimeoutException("Audio activation timed out");
                }
                int activateResult;
                object activated;
                Check(operation.GetActivateResult(out activateResult, out activated), "GetActivateResult");
                Check(activateResult, "ActivateAudioInterfaceAsync");
                return (IAudioClient)activated;
            }
            finally
            {
                Marshal.FreeHGlobal(propVariant);
                Marshal.FreeHGlobal(parameters);
            }
        }
    }

    // Why IAgileObject: WASAPI calls back on a worker thread; an agile handler avoids
    // marshaling (and the E_ILLEGAL_METHOD_CALL a non-agile one would get).
    [ClassInterface(ClassInterfaceType.None)]
    public sealed class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);

        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
        {
            Done.Set();
            return 0;
        }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    public struct WaveFormat
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;

        public static WaveFormat Pcm16Stereo(int sampleRate)
        {
            WaveFormat format = new WaveFormat();
            format.wFormatTag = 1;
            format.nChannels = 2;
            format.nSamplesPerSec = (uint)sampleRate;
            format.wBitsPerSample = 16;
            format.nBlockAlign = 4;
            format.nAvgBytesPerSec = (uint)sampleRate * 4;
            format.cbSize = 0;
            return format;
        }
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, [In] ref WaveFormat format, IntPtr audioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint bufferSize);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService([In] ref Guid interfaceId, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig] int ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAgileObject
    {
    }
}
