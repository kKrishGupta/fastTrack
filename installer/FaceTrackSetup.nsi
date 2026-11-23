Unicode True
RequestExecutionLevel user
SetCompressor zlib
SetOverwrite on

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!define PRODUCT_NAME "GrabLogger"
!define PRODUCT_VERSION "1.2.1"
!define PRODUCT_PUBLISHER "FaceTrack Pro"
!define PRODUCT_EXE "FaceTrackMonitoring.exe"
!define PRODUCT_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\FaceTrackMonitoring"
!define INSTALL_MB_SEPARATE 650
!define TEMP_MB_SEPARATE 250
!define INSTALL_MB_SHARED 900

Name "${PRODUCT_NAME}"
OutFile "output\FaceTrackSetup.exe"
; Keep the established physical path so FaceTrack Monitoring upgrades in place.
; Product-facing names are GrabLogger; state, executable and registry identities remain stable.
InstallDir "$LOCALAPPDATA\Programs\FaceTrack Monitoring"
InstallDirRegKey HKCU "Software\FaceTrack\Monitoring" "InstallDir"
BrandingText "FaceTrack Pro"
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.2.1.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "GrabLogger installer"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright 2026 FaceTrack Pro"

Var StageDir
Var PreviousDir
Var InstallLog
Var InstallRoot
Var TempRoot
Var FreeInstallMb
Var FreeTempMb
Var CommitComplete

!define MUI_ABORTWARNING
!define MUI_CUSTOMFUNCTION_ABORT InstallerAbort
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open GrabLogger"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP|MB_OK "GrabLogger requires Windows 10 or newer."
    Abort
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "This GrabLogger build requires 64-bit Windows."
    Abort
  ${EndIf}
  StrCpy $CommitComplete "0"
  FileOpen $InstallLog "$TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" w
  FileWrite $InstallLog "GrabLogger ${PRODUCT_VERSION} setup started.$\r$\n"
FunctionEnd

Function CheckDiskSpace
  ${GetRoot} "$INSTDIR" $InstallRoot
  ${GetRoot} "$TEMP" $TempRoot
  ${DriveSpace} "$InstallRoot" "/D=F /S=M" $FreeInstallMb
  ${DriveSpace} "$TempRoot" "/D=F /S=M" $FreeTempMb
  FileWrite $InstallLog "InstallDir=$INSTDIR InstallRoot=$InstallRoot FreeInstallMB=$FreeInstallMb TempRoot=$TempRoot FreeTempMB=$FreeTempMb$\r$\n"

  ${If} $InstallRoot == $TempRoot
    ${If} $FreeInstallMb < ${INSTALL_MB_SHARED}
      FileWrite $InstallLog "ERROR 112: shared install/temp volume requires ${INSTALL_MB_SHARED} MB free.$\r$\n"
      SetErrorLevel 112
      MessageBox MB_ICONSTOP|MB_OK "GrabLogger needs at least ${INSTALL_MB_SHARED} MB free on $InstallRoot because Windows temporary files and the staged installation share this drive. Free disk space and run setup again.$\r$\n$\r$\nNo existing installation or ActivityWatch data was changed.$\r$\nDiagnostic log: $TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" /SD IDOK
      Abort
    ${EndIf}
  ${Else}
    ${If} $FreeInstallMb < ${INSTALL_MB_SEPARATE}
      FileWrite $InstallLog "ERROR 112: install volume requires ${INSTALL_MB_SEPARATE} MB free.$\r$\n"
      SetErrorLevel 112
      MessageBox MB_ICONSTOP|MB_OK "GrabLogger needs at least ${INSTALL_MB_SEPARATE} MB free on $InstallRoot for its atomic staged installation. Free disk space or choose another location and run setup again.$\r$\n$\r$\nNo existing installation or ActivityWatch data was changed.$\r$\nDiagnostic log: $TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" /SD IDOK
      Abort
    ${EndIf}
    ${If} $FreeTempMb < ${TEMP_MB_SEPARATE}
      FileWrite $InstallLog "ERROR 112: Windows temporary volume requires ${TEMP_MB_SEPARATE} MB free.$\r$\n"
      SetErrorLevel 112
      MessageBox MB_ICONSTOP|MB_OK "GrabLogger needs at least ${TEMP_MB_SEPARATE} MB free on the Windows temporary drive $TempRoot. Free disk space and run setup again.$\r$\n$\r$\nNo existing installation or ActivityWatch data was changed.$\r$\nDiagnostic log: $TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" /SD IDOK
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CleanupUncommittedStage
  StrCmp $StageDir "" Done
  RMDir /r "$StageDir"
Done:
FunctionEnd

Function .onInstFailed
  StrCmp $CommitComplete "1" CloseLog
  Call CleanupUncommittedStage
  IfFileExists "$INSTDIR\*.*" CloseLog 0
  IfFileExists "$PreviousDir\*.*" 0 CloseLog
  RMDir "$INSTDIR"
  Rename "$PreviousDir" "$INSTDIR"
  FileWrite $InstallLog "Restored the previous installation after setup failure.$\r$\n"
CloseLog:
  FileWrite $InstallLog "Setup failed. Win32-style process error level may identify the cause.$\r$\n"
  FileClose $InstallLog
FunctionEnd

Function InstallerAbort
  StrCmp $CommitComplete "1" CloseLog
  Call CleanupUncommittedStage
CloseLog:
  FileWrite $InstallLog "Setup cancelled by the user.$\r$\n"
  FileClose $InstallLog
FunctionEnd

Section "GrabLogger (required)" Core
  SectionIn RO
  StrCpy $StageDir "$INSTDIR.__new-${PRODUCT_VERSION}"
  StrCpy $PreviousDir "$INSTDIR.__previous"
  Call CheckDiskSpace

  IfFileExists "$INSTDIR\${PRODUCT_EXE}" 0 ExistingStopped
    DetailPrint "Stopping the existing GrabLogger desktop process..."
    ExecWait '"$INSTDIR\${PRODUCT_EXE}" --shutdown' $0
    FileWrite $InstallLog "Existing desktop shutdown exit=$0.$\r$\n"
ExistingStopped:

  ; Recover a previous interrupted commit before preparing a new staging directory.
  IfFileExists "$INSTDIR\*.*" CurrentExists
  IfFileExists "$PreviousDir\*.*" 0 CurrentExists
    RMDir "$INSTDIR"
    Rename "$PreviousDir" "$INSTDIR"
    FileWrite $InstallLog "Recovered the previous installation left by an interrupted setup.$\r$\n"
CurrentExists:
  RMDir /r "$StageDir"
  IfFileExists "$INSTDIR\*.*" 0 PreviousCleared
    RMDir /r "$PreviousDir"
PreviousCleared:

  DetailPrint "Extracting the verified payload to $StageDir"
  FileWrite $InstallLog "Extracting payload to $StageDir.$\r$\n"
  SetOutPath "$StageDir"
  File /r "stage\*.*"

  DetailPrint "Verifying every staged payload file..."
  ExecWait '"$StageDir\node\node.exe" "$StageDir\verify-payload.mjs" "$StageDir"' $0
  FileWrite $InstallLog "Payload verification exit=$0.$\r$\n"
  ${If} $0 != 0
    SetErrorLevel 13
    MessageBox MB_ICONSTOP|MB_OK "The extracted FaceTrack payload failed its checksum verification (error 13). Your existing installation and ActivityWatch data remain unchanged.$\r$\n$\r$\nDiagnostic log: $TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" /SD IDOK
    Abort
  ${EndIf}

  ; Change current directory out of StageDir and INSTDIR so directory renames succeed
  SetOutPath "$TEMP"

  ; Commit only after extraction and checksum verification have completed.
  IfFileExists "$INSTDIR\*.*" 0 CommitFreshInstall
    Rename "$INSTDIR" "$PreviousDir"
    IfErrors 0 CommitNewInstall
      SetErrorLevel 32
      MessageBox MB_ICONSTOP|MB_OK "FaceTrack Setup could not replace the existing installation because a file is still in use (error 32). Close GrabLogger and run setup again.$\r$\n$\r$\nDiagnostic log: $TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" /SD IDOK
      Abort
CommitFreshInstall:
  RMDir "$INSTDIR"
CommitNewInstall:
  Rename "$StageDir" "$INSTDIR"
  IfErrors 0 CommitSucceeded
    Rename "$PreviousDir" "$INSTDIR"
    SetErrorLevel 5
    MessageBox MB_ICONSTOP|MB_OK "FaceTrack Setup could not commit the verified installation (error 5). The previous installation was restored.$\r$\n$\r$\nDiagnostic log: $TEMP\FaceTrackSetup-${PRODUCT_VERSION}.log" /SD IDOK
    Abort
CommitSucceeded:
  StrCpy $CommitComplete "1"
  SetOutPath "$INSTDIR"
  FileWrite $InstallLog "Atomic payload commit completed.$\r$\n"

  WriteRegStr HKCU "Software\FaceTrack\Monitoring" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${PRODUCT_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${PRODUCT_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${PRODUCT_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${PRODUCT_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${PRODUCT_KEY}" "DisplayIcon" "$INSTDIR\${PRODUCT_EXE}"
  WriteRegStr HKCU "${PRODUCT_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${PRODUCT_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${PRODUCT_KEY}" "NoRepair" 1
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ; Remove legacy shortcuts only after the new payload has committed successfully.
  RMDir /r "$SMPROGRAMS\FaceTrack Monitoring"
  RMDir /r "$SMPROGRAMS\GrabLogger"
  CreateDirectory "$SMPROGRAMS\GrabLogger"
  CreateShortcut "$SMPROGRAMS\GrabLogger\GrabLogger.lnk" "$INSTDIR\${PRODUCT_EXE}"
  CreateShortcut "$SMPROGRAMS\GrabLogger\Uninstall GrabLogger.lnk" "$INSTDIR\Uninstall.exe"
  RMDir /r "$PreviousDir"
  FileWrite $InstallLog "Setup completed successfully.$\r$\n"
  FileClose $InstallLog
SectionEnd

Section /o "Start GrabLogger when I sign in" Login
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FaceTrackMonitoring" '"$INSTDIR\${PRODUCT_EXE}"'
SectionEnd

Section "un.GrabLogger"
  ExecWait '"$INSTDIR\${PRODUCT_EXE}" --uninstall'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FaceTrackMonitoring"
  DeleteRegKey HKCU "Software\FaceTrack\Monitoring"
  DeleteRegKey HKCU "${PRODUCT_KEY}"
  RMDir /r "$SMPROGRAMS\GrabLogger"
  RMDir /r "$SMPROGRAMS\FaceTrack Monitoring"
  MessageBox MB_ICONQUESTION|MB_YESNO "Also delete FaceTrack connection state and its encrypted offline queue from this Windows profile?" /SD IDNO IDNO KeepFaceTrackState
  ExecWait '"$INSTDIR\${PRODUCT_EXE}" --purge-state'
  RMDir /r "$LOCALAPPDATA\FaceTrack\Monitoring"
KeepFaceTrackState:
  MessageBox MB_ICONQUESTION|MB_YESNO "Also delete the FaceTrack-managed local ActivityWatch history from this Windows profile? Personal ActivityWatch data on its default profile is never removed." /SD IDNO IDNO KeepActivityWatch
  RMDir /r "$LOCALAPPDATA\activitywatch-facetrack"
KeepActivityWatch:
  RMDir /r "$INSTDIR"
SectionEnd
