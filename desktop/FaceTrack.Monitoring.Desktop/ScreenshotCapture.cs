using System.Diagnostics;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

namespace FaceTrack.Monitoring.Desktop;

internal static class ScreenshotCapture
{
    private const int UoiName = 2;

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
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        if (stream.Length > 10 * 1024 * 1024) return null;
        return (stream.ToArray(), bounds.Width, bounds.Height);
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
