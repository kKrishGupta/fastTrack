using System.Diagnostics;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

namespace FaceTrack.Monitoring.Desktop;

internal static class ScreenshotCapture
{
    private const int UoiName = 2;
    internal const int MaxUploadBytes = 30 * 1024;

    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint desiredAccess);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] private static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder info, uint length, out uint needed);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    internal static (byte[] Bytes, int Width, int Height)? TryCapture(string displayMode, IReadOnlySet<string> excludedApps)
    {
        if (!IsInteractiveDesktop()) return null;
        var foreground = ForegroundProcessName();
        if (foreground is not null && excludedApps.Contains(foreground)) return null;

        var bounds = displayMode == "all"
            ? Screen.AllScreens.Select(screen => screen.Bounds).Aggregate(Rectangle.Union)
            : Screen.PrimaryScreen?.Bounds ?? SystemInformation.VirtualScreen;
        if (bounds.Width < 1 || bounds.Height < 1) return null;
        using var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(bitmap))
            graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
        var afterCapture = ForegroundProcessName();
        if (!IsInteractiveDesktop() || afterCapture is not null && excludedApps.Contains(afterCapture)) return null;
        return EncodeForUpload(bitmap);
    }

    internal static (byte[] Bytes, int Width, int Height)? EncodeForUpload(Bitmap source)
    {
        var jpeg = ImageCodecInfo.GetImageEncoders().Single(codec => codec.FormatID == ImageFormat.Jpeg.Guid);
        var attempts = new (int MaxWidth, int MaxHeight, long[] Qualities)[]
        {
            (1280, 720, new long[] { 45, 38, 32, 26 }),
            (1024, 576, new long[] { 48, 40, 34, 28, 22 }),
            (960, 540, new long[] { 50, 42, 35, 28, 22 }),
            (800, 450, new long[] { 55, 46, 38, 30, 22 }),
            (640, 360, new long[] { 60, 50, 40, 30, 22, 16 }),
            (480, 270, new long[] { 55, 42, 30, 20, 12 }),
        };

        foreach (var attempt in attempts)
        {
            var scale = Math.Min(1d, Math.Min((double)attempt.MaxWidth / source.Width, (double)attempt.MaxHeight / source.Height));
            var width = Math.Max(1, (int)Math.Round(source.Width * scale));
            var height = Math.Max(1, (int)Math.Round(source.Height * scale));
            using var resized = new Bitmap(width, height, PixelFormat.Format24bppRgb);
            resized.SetResolution(96, 96);
            using (var graphics = Graphics.FromImage(resized))
            {
                graphics.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                graphics.DrawImage(source, new Rectangle(0, 0, width, height));
            }

            foreach (var quality in attempt.Qualities)
            {
                using var stream = new MemoryStream();
                using var parameters = new EncoderParameters(1);
                parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                resized.Save(stream, jpeg, parameters);
                if (stream.Length <= MaxUploadBytes)
                    return (stream.ToArray(), width, height);
            }
        }
        return null;
    }

    private static string? ForegroundProcessName()
    {
        var window = GetForegroundWindow();
        if (window == IntPtr.Zero) return null;
        GetWindowThreadProcessId(window, out var processId);
        if (processId == 0) return null;
        try { return $"{Process.GetProcessById((int)processId).ProcessName}.exe"; }
        catch { return null; }
    }

    private static bool IsInteractiveDesktop()
    {
        const uint DesktopReadObjects = 0x0001;
        var desktop = OpenInputDesktop(0, false, DesktopReadObjects);
        if (desktop == IntPtr.Zero) return false;
        try
        {
            var name = new StringBuilder(256);
            return GetUserObjectInformation(desktop, UoiName, name, (uint)(name.Capacity * sizeof(char)), out _) &&
                string.Equals(name.ToString(), "Default", StringComparison.OrdinalIgnoreCase);
        }
        finally { CloseDesktop(desktop); }
    }
}
