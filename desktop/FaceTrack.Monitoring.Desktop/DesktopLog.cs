using System.Text;

namespace FaceTrack.Monitoring.Desktop;

internal static class DesktopLog
{
    private static readonly object Gate = new();
    internal static string Path => System.IO.Path.Combine(AgentProcess.StateDirectory, "desktop.log");

    internal static void Write(string message)
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(AgentProcess.StateDirectory);
                if (File.Exists(Path) && new FileInfo(Path).Length > 1024 * 1024)
                    File.Move(Path, $"{Path}.previous", true);
                File.AppendAllText(Path, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}", Encoding.UTF8);
            }
        }
        catch { /* Diagnostics must never prevent monitoring controls from opening. */ }
    }
}
