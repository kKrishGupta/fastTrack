using System.Diagnostics;
using System.Drawing;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace FaceTrack.Monitoring.Desktop;

internal sealed class MainForm : Form
{
    private static class NativeWindow
    {
        internal static readonly IntPtr TopMost = new(-1);
        internal static readonly IntPtr NotTopMost = new(-2);
        internal const int Restore = 9;
        internal const uint NoMove = 0x0002;
        internal const uint NoSize = 0x0001;
        internal const uint Show = 0x0040;

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ShowWindow(IntPtr handle, int command);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetForegroundWindow(IntPtr handle);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    }

    private readonly Label status = new() { AutoSize = true, Font = new Font("Segoe UI", 12, FontStyle.Bold) };
    private readonly Label detail = new() { AutoSize = true, MaximumSize = new Size(500, 0) };
    private readonly TextBox code = new() { Width = 360, MaxLength = 43, PlaceholderText = "Paste the 43-character one-time code" };
    private readonly Button connect = new() { Text = "Connect this computer", AutoSize = true };
    private readonly Button pause = new() { Text = "Pause uploads", AutoSize = true, Enabled = false };
    private readonly Button resume = new() { Text = "Resume uploads", AutoSize = true, Enabled = false };
    private readonly Button stop = new() { Text = "Stop monitoring", AutoSize = true, Enabled = false };
    private readonly Button start = new() { Text = "Start monitoring", AutoSize = true, Enabled = false };
    private readonly Button disconnect = new() { Text = "Disconnect device", AutoSize = true };
    private readonly TextBox activity = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Height = 125, Dock = DockStyle.Fill };
    private readonly Panel enrollment = new() { AutoSize = true, Dock = DockStyle.Top };
    private readonly NotifyIcon tray;
    private readonly CancellationTokenSource lifetime = new();
    private Process? agent;
    private bool exiting;
    private bool screenshotCaptureInProgress;
    private bool screenshotsEnabled;
    private string screenshotDisplayMode = "primary";
    private HashSet<string> screenshotExcludedApps = new(StringComparer.OrdinalIgnoreCase);
    private DateTimeOffset screenshotPolicyReceivedAt = DateTimeOffset.MinValue;
    private readonly System.Windows.Forms.Timer screenshotTimer = new() { Interval = 300_000 };
    private readonly System.Windows.Forms.Timer initialVisibilityRetry = new() { Interval = 8000 };

    internal MainForm(string pipeName)
    {
        Text = "FaceTrack Monitoring";
        Width = 590;
        Height = 510;
        MinimumSize = new Size(550, 470);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9);
        Icon = SystemIcons.Shield;

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), RowCount = 7, ColumnCount = 1 };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        var heading = new Label { Text = "FaceTrack Monitoring", AutoSize = true, Font = new Font("Segoe UI", 18, FontStyle.Bold), Margin = new Padding(0, 0, 0, 8) };
        root.Controls.Add(heading);
        root.Controls.Add(status);
        root.Controls.Add(detail);

        var enrollmentFlow = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.TopDown, WrapContents = false, Dock = DockStyle.Top, Margin = new Padding(0, 18, 0, 10) };
        enrollmentFlow.Controls.Add(new Label { AutoSize = true, MaximumSize = new Size(500, 0), Text = "After reading and accepting the monitoring disclosure in FaceTrack, create a one-time pairing code and paste it here." });
        enrollmentFlow.Controls.Add(code);
        enrollmentFlow.Controls.Add(connect);
        enrollment.Controls.Add(enrollmentFlow);
        root.Controls.Add(enrollment);

        var controls = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Top, Margin = new Padding(0, 14, 0, 10) };
        controls.Controls.Add(pause); controls.Controls.Add(resume); controls.Controls.Add(stop); controls.Controls.Add(start); controls.Controls.Add(disconnect);
        root.Controls.Add(controls);
        root.Controls.Add(activity);
        root.Controls.Add(new Label { AutoSize = true, ForeColor = Color.DimGray, MaximumSize = new Size(500, 0), Text = "Official ActivityWatch collects application and away status locally. FaceTrack uploads only data allowed by your organization policy. Closing this window keeps the visible tray indicator running." });

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open FaceTrack Monitoring", null, (_, _) => ShowWindow());
        menu.Items.Add("Pause uploads", null, (_, _) => SendControl("pause"));
        menu.Items.Add("Resume uploads", null, (_, _) => SendControl("resume"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, async (_, _) => await ExitAsync());
        tray = new NotifyIcon { Icon = SystemIcons.Shield, Text = "FaceTrack Monitoring", Visible = true, ContextMenuStrip = menu };
        tray.DoubleClick += (_, _) => ShowWindow();

        connect.Click += async (_, _) => await ConnectAsync();
        pause.Click += (_, _) => SendControl("pause");
        resume.Click += (_, _) => SendControl("resume");
        stop.Click += async (_, _) => await StopAsync();
        start.Click += async (_, _) => await StartAsync();
        disconnect.Click += async (_, _) => await DisconnectAsync();
        screenshotTimer.Tick += async (_, _) => await CaptureScreenshotAsync();
        initialVisibilityRetry.Tick += (_, _) =>
        {
            initialVisibilityRetry.Stop();
            ShowWindow();
            DesktopLog.Write($"Initial visibility retry handle={Handle} visible={Visible} state={WindowState} taskbar={ShowInTaskbar}.");
        };
        FormClosing += OnFormClosing;
        Shown += (_, _) => BeginInvoke(new Action(async () =>
        {
            // Activating synchronously inside Shown left the first single-file launch without
            // a published top-level window. A second instance's pipe command worked because it
            // ran on the next message-loop turn. Do the same for the initial launch.
            await Task.Delay(1000);
            ShowWindow();
            DesktopLog.Write($"Initial window activation handle={Handle} visible={Visible} state={WindowState} taskbar={ShowInTaskbar}.");
            initialVisibilityRetry.Start();
            RefreshEnrollment();
            if (File.Exists(AgentProcess.StatePath)) await StartAsync();
        }));
        _ = ListenAsync(pipeName, lifetime.Token);
    }

    private void RefreshEnrollment()
    {
        var paired = File.Exists(AgentProcess.StatePath);
        enrollment.Visible = !paired;
        disconnect.Visible = paired;
        start.Enabled = paired && (agent is null || agent.HasExited);
        if (!paired) SetStatus("Enrollment required", "Create a code in Employee > Activity monitoring. Collectors will start only after successful enrollment.", Color.DarkOrange);
    }

    private async Task ConnectAsync()
    {
        var value = code.Text.Trim();
        if (!Regex.IsMatch(value, "^[A-Za-z0-9_-]{43}$"))
        {
            SetStatus("Check the pairing code", "Paste the complete 43-character code from your FaceTrack employee dashboard.", Color.Firebrick);
            return;
        }
        connect.Enabled = false;
        SetStatus("Connecting…", "FaceTrack is validating this one-time code. No activity is collected yet.", Color.DarkGoldenrod);
        var result = await AgentProcess.PairAsync(value);
        code.Clear();
        connect.Enabled = true;
        if (!result.Success) { SetStatus("Enrollment failed", result.Message, Color.Firebrick); return; }
        RefreshEnrollment();
        await StartAsync();
    }

    private async Task StartAsync()
    {
        if (!File.Exists(AgentProcess.StatePath)) { RefreshEnrollment(); return; }
        if (agent is { HasExited: false }) return;
        try
        {
            SetStatus("Starting…", "Starting the approved official ActivityWatch components and FaceTrack synchronization.", Color.DarkGoldenrod);
            agent = AgentProcess.StartManaged();
            agent.OutputDataReceived += AgentOutput;
            agent.ErrorDataReceived += AgentOutput;
            agent.Exited += (_, _) => BeginInvoke(() =>
            {
                screenshotsEnabled = false; screenshotTimer.Stop();
                pause.Enabled = resume.Enabled = stop.Enabled = false;
                start.Enabled = File.Exists(AgentProcess.StatePath);
                SetStatus("Stopped", "Monitoring components are stopped. Open this window and choose Start monitoring to continue.", Color.Firebrick);
            });
            agent.BeginOutputReadLine();
            agent.BeginErrorReadLine();
            pause.Enabled = false;
            resume.Enabled = false;
            stop.Enabled = true;
            start.Enabled = false;
            await Task.Delay(1);
        }
        catch (Exception exception)
        {
            SetStatus("Unable to start", exception.Message, Color.Firebrick);
            start.Enabled = true;
        }
    }

    private void AgentOutput(object sender, DataReceivedEventArgs eventArgs)
    {
        if (string.IsNullOrWhiteSpace(eventArgs.Data) || IsDisposed) return;
        DesktopLog.Write($"Agent: {eventArgs.Data}");
        BeginInvoke(() =>
        {
            if (eventArgs.Data.StartsWith("FACETRACK_SCREENSHOT_POLICY ", StringComparison.Ordinal))
            {
                ApplyScreenshotPolicy(eventArgs.Data[28..]);
                return;
            }
            activity.AppendText($"{DateTime.Now:t}  {eventArgs.Data}{Environment.NewLine}");
            if (activity.Lines.Length > 80) activity.Lines = activity.Lines[^60..];
            if (eventArgs.Data.Contains(" MONITORING", StringComparison.Ordinal))
            {
                pause.Enabled = true;
                resume.Enabled = false;
                SetStatus("Monitoring active", "Application and away activity is synchronizing under the approved policy.", Color.DarkGreen);
            }
            else if (eventArgs.Data.Contains("PAUSED", StringComparison.OrdinalIgnoreCase))
            {
                pause.Enabled = false;
                resume.Enabled = true;
                SetStatus("Uploads paused", "ActivityWatch local records remain on this computer while FaceTrack uploads are paused.", Color.DarkOrange);
            }
            else if (eventArgs.Data.Contains("revoked", StringComparison.OrdinalIgnoreCase))
                SetStatus("Device access revoked", "Reconnect with a new pairing code if monitoring is still authorized.", Color.Firebrick);
        });
    }

    private void ApplyScreenshotPolicy(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            screenshotPolicyReceivedAt = DateTimeOffset.UtcNow;
            screenshotsEnabled = root.GetProperty("enabled").GetBoolean();
            screenshotDisplayMode = root.TryGetProperty("displayMode", out var mode) && mode.GetString() == "all" ? "all" : "primary";
            screenshotExcludedApps = root.TryGetProperty("excludedApps", out var exclusions)
                ? exclusions.EnumerateArray().Select(item => item.GetString()).Where(item => !string.IsNullOrWhiteSpace(item)).Select(item => item!).ToHashSet(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seconds = root.TryGetProperty("intervalSeconds", out var interval) ? Math.Clamp(interval.GetInt32(), 60, 3600) : 300;
            screenshotTimer.Interval = seconds * 1000;
            if (screenshotsEnabled) { screenshotTimer.Start(); activity.AppendText($"{DateTime.Now:t}  Disclosed screenshots enabled every {seconds / 60d:0.#} minutes.{Environment.NewLine}"); }
            else screenshotTimer.Stop();
        }
        catch (Exception exception) { activity.AppendText($"{DateTime.Now:t}  Screenshot policy rejected: {exception.Message}{Environment.NewLine}"); screenshotTimer.Stop(); }
    }

    private async Task CaptureScreenshotAsync()
    {
        if (!screenshotsEnabled || DateTimeOffset.UtcNow - screenshotPolicyReceivedAt > TimeSpan.FromMinutes(2) || screenshotCaptureInProgress || agent is null || agent.HasExited) return;
        screenshotCaptureInProgress = true;
        try
        {
            var capture = ScreenshotCapture.TryCapture(screenshotDisplayMode, screenshotExcludedApps);
            if (capture is null) return;
            if (!await AgentProcess.EnqueueScreenshotAsync(capture.Value.Bytes, capture.Value.Width, capture.Value.Height, DateTimeOffset.UtcNow))
                activity.AppendText($"{DateTime.Now:t}  Screenshot was skipped because the encrypted queue was unavailable.{Environment.NewLine}");
            else
                activity.AppendText($"{DateTime.Now:t}  Compressed screenshot queued ({capture.Value.Bytes.Length / 1024d:0.0} KB, {capture.Value.Width} × {capture.Value.Height}).{Environment.NewLine}");
        }
        catch (Exception exception) { activity.AppendText($"{DateTime.Now:t}  Screenshot skipped: {exception.Message}{Environment.NewLine}"); }
        finally { screenshotCaptureInProgress = false; }
    }

    private void SendControl(string command)
    {
        if (agent is null || agent.HasExited) return;
        try { agent.StandardInput.WriteLine(command); agent.StandardInput.Flush(); }
        catch (InvalidOperationException) { }
    }

    private async Task StopAsync()
    {
        screenshotsEnabled = false; screenshotTimer.Stop();
        var current = agent;
        if (current is null || current.HasExited) return;
        SendControl("quit");
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        try { await current.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { current.Kill(true); }
    }

    private async Task DisconnectAsync()
    {
        if (MessageBox.Show(this, "Disconnect this device and remove its FaceTrack upload credential and pending upload queue? ActivityWatch local records remain on this computer.", "Disconnect device", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        await StopAsync();
        await AgentProcess.UnpairAsync();
        RefreshEnrollment();
    }

    private void SetStatus(string title, string message, Color color)
    {
        status.Text = title; status.ForeColor = color; detail.Text = message; tray.Text = title.Length <= 63 ? $"FaceTrack: {title}"[..Math.Min(63, $"FaceTrack: {title}".Length)] : "FaceTrack Monitoring";
    }

    private void ShowWindow()
    {
        ShowInTaskbar = true;
        Show();
        Visible = true;
        WindowState = FormWindowState.Normal;
        var handle = Handle;
        NativeWindow.ShowWindow(handle, NativeWindow.Restore);
        NativeWindow.SetWindowPos(handle, NativeWindow.TopMost, 0, 0, 0, 0, NativeWindow.NoMove | NativeWindow.NoSize | NativeWindow.Show);
        NativeWindow.SetWindowPos(handle, NativeWindow.NotTopMost, 0, 0, 0, 0, NativeWindow.NoMove | NativeWindow.NoSize | NativeWindow.Show);
        BringToFront();
        Activate();
        NativeWindow.SetForegroundWindow(handle);
    }

    private async Task ListenAsync(string pipeName, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                await using var server = new NamedPipeServerStream(pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await server.WaitForConnectionAsync(token);
                using var reader = new StreamReader(server, Encoding.UTF8);
                var command = await reader.ReadLineAsync(token);
                if (command == "show") BeginInvoke(ShowWindow);
                else if (command == "exit") BeginInvoke(async () => await ExitAsync());
            }
            catch (OperationCanceledException) { break; }
            catch (IOException) { }
        }
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        if (exiting) return;
        if (eventArgs.CloseReason != CloseReason.UserClosing) { exiting = true; return; }
        eventArgs.Cancel = true;
        Hide();
        DesktopLog.Write("Main window hidden to tray by the user.");
        tray.ShowBalloonTip(2000, "FaceTrack Monitoring is still running", "Use the tray icon to open, pause or stop monitoring.", ToolTipIcon.Info);
    }

    private async Task ExitAsync()
    {
        if (exiting) return;
        exiting = true;
        await StopAsync();
        lifetime.Cancel();
        tray.Visible = false;
        Close();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { screenshotTimer.Dispose(); initialVisibilityRetry.Dispose(); lifetime.Dispose(); tray.Dispose(); }
        base.Dispose(disposing);
    }
}
