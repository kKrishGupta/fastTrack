#define AppVersion "1.2.1"
[Setup]
AppId={{D992EBF1-BDFD-49F9-BE31-8EAD86543CC6}
AppName=GrabLogger
AppVersion={#AppVersion}
; Preserve the established physical directory so legacy installations upgrade in place.
DefaultDirName={localappdata}\Programs\FaceTrack Monitoring
DefaultGroupName=GrabLogger
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=FaceTrackSetup
Compression=lzma2
SolidCompression=no
CloseApplications=yes
RestartApplications=no
UninstallDisplayName=GrabLogger
WizardStyle=modern

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\GrabLogger"; Filename: "{app}\FaceTrackMonitoring.exe"; WorkingDir: "{app}"
Name: "{group}\Uninstall GrabLogger"; Filename: "{uninstallexe}"

[Tasks]
Name: "login"; Description: "Open the visible GrabLogger window when I sign in"; Flags: unchecked

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "FaceTrackMonitoring"; ValueData: """{app}\FaceTrackMonitoring.exe"""; Tasks: login; Flags: uninsdeletevalue

[Run]
Filename: "{app}\FaceTrackMonitoring.exe"; Description: "Open GrabLogger enrollment and monitoring"; Flags: postinstall nowait skipifsilent

[Code]
function InitializeUninstall(): Boolean;
begin
  Result := MsgBox('Close the visible GrabLogger window first. Revoke this device from your employee dashboard to invalidate its credential. Local activity data is retained for your control; see the installation guide for deletion.', mbConfirmation, MB_OKCANCEL) = IDOK;
end;

[UninstallRun]
Filename: "{app}\FaceTrackMonitoring.exe"; Parameters: "--uninstall"; Flags: waituntilterminated; RunOnceId: "StopAndRevokeFaceTrackDevice"
