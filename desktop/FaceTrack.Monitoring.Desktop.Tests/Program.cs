using System.Drawing.Imaging;
using FaceTrack.Monitoring.Desktop;

if (args.Contains("--live", StringComparer.OrdinalIgnoreCase))
{
    var live = ScreenshotCapture.TryCapture("primary", new HashSet<string>(StringComparer.OrdinalIgnoreCase))
        ?? throw new Exception("Live screenshot capture was skipped by the desktop safety checks or could not meet the 30 KB limit.");
    Console.WriteLine($"PASS LIVE_JPEG={live.Bytes.Length} bytes ({live.Bytes.Length / 1024d:0.0} KB) dimensions={live.Width}x{live.Height}");
    return;
}

using var source = new Bitmap(1920, 1080, PixelFormat.Format24bppRgb);
using (var graphics = Graphics.FromImage(source))
{
    graphics.Clear(Color.FromArgb(26, 30, 38));
    using var title = new Font("Segoe UI", 32, FontStyle.Bold);
    using var text = new Font("Consolas", 17);
    using var green = new SolidBrush(Color.FromArgb(172, 235, 102));
    using var white = new SolidBrush(Color.WhiteSmoke);
    graphics.DrawString("FaceTrack screenshot compression verification", title, green, 60, 45);
    for (var row = 0; row < 38; row++)
    {
        var color = Color.FromArgb(255, 25 + row * 4 % 180, 70 + row * 7 % 160, 110 + row * 11 % 140);
        using var brush = new SolidBrush(color);
        graphics.FillRectangle(brush, 60 + row % 3 * 600, 130 + row * 23, 560, 18);
        graphics.DrawString($"application-window-{row:00}.exe  activity data and visible text", text, white, 70 + row % 3 * 600, 126 + row * 23);
    }
}

var result = ScreenshotCapture.EncodeForUpload(source)
    ?? throw new Exception("The screenshot encoder could not meet the 30 KB storage limit.");
if (result.Bytes.Length > ScreenshotCapture.MaxUploadBytes)
    throw new Exception($"Encoded screenshot exceeded 30 KB: {result.Bytes.Length} bytes.");
if (result.Bytes.Length < 4 || result.Bytes[0] != 0xff || result.Bytes[1] != 0xd8
    || result.Bytes[^2] != 0xff || result.Bytes[^1] != 0xd9)
    throw new Exception("Encoded screenshot is not a complete JPEG image.");
if (result.Width > 1280 || result.Height > 720)
    throw new Exception($"Encoded dimensions are too large: {result.Width}x{result.Height}.");

Console.WriteLine($"PASS JPEG={result.Bytes.Length} bytes ({result.Bytes.Length / 1024d:0.0} KB) dimensions={result.Width}x{result.Height} limit={ScreenshotCapture.MaxUploadBytes} bytes");
