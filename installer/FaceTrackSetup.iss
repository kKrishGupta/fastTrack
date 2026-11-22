#define AppVersion "1.2.1"
[Setup]
AppId={{D992EBF1-BDFD-49F9-BE31-8EAD86543CC6}
AppName=FaceTrack Monitoring
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\FaceTrack Monitoring
DefaultGroupName=FaceTrack Monitoring
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=FaceTrackSetup
Compression=lzma2
SolidCompression=no
CloseApplications=yes
RestartApplications=no
UninstallDisplayName=FaceTrack Monitoring
WizardStyle=modern

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\FaceTrack Monitoring"; Filename: "{app}\FaceTrackMonitoring.exe"; WorkingDir: "{app}"
Name: "{group}\Uninstall FaceTrack Monitoring"; Filename: "{uninstallexe}"

[Tasks]
Name: "login"; Description: "Open the visible FaceTrack monitoring window when I sign in"; Flags: unchecked

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "FaceTrackMonitoring"; ValueData: """{app}\FaceTrackMonitoring.exe"""; Tasks: login; Flags: uninsdeletevalue

[Run]
Filename: "{app}\FaceTrackMonitoring.exe"; Description: "Open FaceTrack enrollment and monitoring"; Flags: postinstall nowait skipifsilent

[Code]
function InitializeUninstall(): Boolean;
begin
  Result := MsgBox('Close the visible FaceTrack monitoring window first. Revoke this device from your employee dashboard to invalidate its credential. Local activity data is retained for your control; see the installation guide for deletion.', mbConfirmation, MB_OKCANCEL) = IDOK;
end;

[UninstallRun]
Filename: "{app}\FaceTrackMonitoring.exe"; Parameters: "--uninstall"; Flags: waituntilterminated; RunOnceId: "StopAndRevokeFaceTrackDevice"
