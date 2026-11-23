using System.IO.Pipes;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace FaceTrack.Monitoring.Desktop;

internal static class Program
{
    internal static readonly string InstanceId = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
        WindowsIdentity.GetCurrent().User?.Value ?? Environment.UserName)))[..16];
    internal static readonly string PipeName = $"FaceTrackMonitoring-{InstanceId}";

    [STAThread]
    private static void Main(string[] args)
    {
        DesktopLog.Write($"Desktop start version={Application.ProductVersion} args={string.Join(' ', args.Select(argument => argument.StartsWith("--", StringComparison.Ordinal) ? argument : "[value]"))}");
        Application.ThreadException += (_, eventArgs) => DesktopLog.Write($"UI exception: {eventArgs.Exception}");
        TaskScheduler.UnobservedTaskException += (_, eventArgs) => { DesktopLog.Write($"Task exception: {eventArgs.Exception}"); eventArgs.SetObserved(); };
        if (args.Contains("--shutdown", StringComparer.OrdinalIgnoreCase) ||
            args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase) ||
            args.Contains("--purge-state", StringComparer.OrdinalIgnoreCase))
        {
            SendCommandAsync("exit", 2500).GetAwaiter().GetResult();
            if (args.Contains("--purge-state", StringComparer.OrdinalIgnoreCase))
            {
                Thread.Sleep(2000);
                AgentProcess.UnpairAsync().GetAwaiter().GetResult();
            }
            return;
        }

        using var mutex = new Mutex(true, $"Local\\FaceTrackMonitoring-{InstanceId}", out var ownsMutex);
        if (!ownsMutex)
        {
            DesktopLog.Write("Existing desktop instance detected; sending show command.");
            SendCommandAsync("show", 2500).GetAwaiter().GetResult();
            return;
        }

        try
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm(PipeName));
        }
        catch (Exception exception)
        {
            DesktopLog.Write($"Fatal desktop exception: {exception}");
            MessageBox.Show($"GrabLogger could not open. Diagnostic log: {DesktopLog.Path}\n\n{exception.Message}", "GrabLogger", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static async Task SendCommandAsync(string command, int timeoutMs)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out, PipeOptions.Asynchronous);
            await client.ConnectAsync(timeoutMs);
            await using var writer = new StreamWriter(client, Encoding.UTF8) { AutoFlush = true };
            await writer.WriteLineAsync(command);
        }
        catch (TimeoutException) { }
        catch (IOException exception) { DesktopLog.Write($"Desktop control pipe failed: {exception.Message}"); }
    }
}
