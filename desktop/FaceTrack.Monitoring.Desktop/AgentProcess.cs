using System.Diagnostics;

namespace FaceTrack.Monitoring.Desktop;

internal static class AgentProcess
{
    internal static string InstallRoot => AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    internal static string StateDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FaceTrack", "Monitoring");
    internal static string StatePath => Path.Combine(StateDirectory, ".state.json");
    private static string NodePath => Path.Combine(InstallRoot, "node", "node.exe");
    private static string BridgePath => Path.Combine(InstallRoot, "bridge", "index.mjs");

    internal static ProcessStartInfo StartInfo(params string[] arguments)
    {
        var info = new ProcessStartInfo(NodePath)
        {
            WorkingDirectory = InstallRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        info.Environment["FACETRACK_STATE_DIR"] = StateDirectory;
        info.Environment["FACETRACK_AW_PORT"] = "5600";
        info.Environment["AW_PROFILE"] = "facetrack";
        return info;
    }

    internal static async Task<(bool Success, string Message)> PairAsync(string code)
    {
        DesktopLog.Write("Graphical device enrollment started.");
        Directory.CreateDirectory(StateDirectory);
        using var process = new Process { StartInfo = StartInfo(BridgePath, "pair", "--installed-state") };
        var errors = new List<string>();
        process.ErrorDataReceived += (_, eventArgs) => { if (!string.IsNullOrWhiteSpace(eventArgs.Data)) errors.Add(eventArgs.Data); };
        process.Start();
        process.BeginErrorReadLine();
        process.BeginOutputReadLine();
        await process.StandardInput.WriteLineAsync(code);
        process.StandardInput.Close();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException)
        {
            process.Kill(true);
            return (false, "Enrollment timed out. Check your internet connection and try a new code.");
        }
        var success = process.ExitCode == 0 && File.Exists(StatePath);
        DesktopLog.Write(success ? "Graphical device enrollment completed." : $"Graphical enrollment failed exit={process.ExitCode}: {errors.LastOrDefault() ?? "no diagnostic"}");
        return success ? (true, "Device connected. Monitoring can now start.")
            : (false, errors.LastOrDefault() ?? "Enrollment failed. Verify the one-time code and try again.");
    }

    internal static Process StartManaged()
    {
        var launch = Path.Combine(InstallRoot, "bridge", "launch.mjs");
        var process = new Process { StartInfo = StartInfo(launch, "--managed"), EnableRaisingEvents = true };
        process.Start();
        DesktopLog.Write($"Managed launcher started pid={process.Id}.");
        return process;
    }

    internal static async Task<bool> EnqueueScreenshotAsync(byte[] image, int width, int height, DateTimeOffset capturedAt)
    {
        using var process = new Process { StartInfo = StartInfo(BridgePath, "enqueue-screenshot", "--installed-state",
            "--captured-at", capturedAt.ToString("O"), "--width", width.ToString(), "--height", height.ToString(), "--format", "jpg") };
        process.Start();
        await process.StandardInput.BaseStream.WriteAsync(image);
        process.StandardInput.Close();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(true); return false; }
        return process.ExitCode == 0;
    }

    internal static async Task UnpairAsync()
    {
        if (!File.Exists(StatePath) || !File.Exists(NodePath)) return;
        using var process = new Process { StartInfo = StartInfo(BridgePath, "unpair", "--installed-state") };
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(true); }
    }
}
