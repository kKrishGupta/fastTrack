Unicode True
RequestExecutionLevel user
SetCompressor /SOLID zlib

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"

!define PRODUCT_NAME "FaceTrack Monitoring"
!define PRODUCT_VERSION "1.2.0"
!define PRODUCT_PUBLISHER "FaceTrack Pro"
!define PRODUCT_EXE "FaceTrackMonitoring.exe"
!define PRODUCT_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\FaceTrackMonitoring"

Name "${PRODUCT_NAME}"
OutFile "output\FaceTrackSetup.exe"
InstallDir "$LOCALAPPDATA\Programs\FaceTrack Monitoring"
InstallDirRegKey HKCU "Software\FaceTrack\Monitoring" "InstallDir"
BrandingText "FaceTrack Pro"
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.2.0.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "FaceTrack Monitoring installer"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright 2026 FaceTrack Pro"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open FaceTrack Monitoring"
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
    MessageBox MB_ICONSTOP|MB_OK "FaceTrack Monitoring requires Windows 10 or newer."
    Abort
  ${EndIf}
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP|MB_OK "This FaceTrack Monitoring build requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd

Section "FaceTrack Monitoring (required)" Core
  SectionIn RO
  IfFileExists "$INSTDIR\${PRODUCT_EXE}" 0 +2
    ExecWait '"$INSTDIR\${PRODUCT_EXE}" --shutdown'
  SetOutPath "$INSTDIR"
  File /r "stage\*.*"
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
  CreateDirectory "$SMPROGRAMS\FaceTrack Monitoring"
  CreateShortcut "$SMPROGRAMS\FaceTrack Monitoring\FaceTrack Monitoring.lnk" "$INSTDIR\${PRODUCT_EXE}"
  CreateShortcut "$SMPROGRAMS\FaceTrack Monitoring\Uninstall FaceTrack Monitoring.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section /o "Start FaceTrack Monitoring when I sign in" Login
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FaceTrackMonitoring" '"$INSTDIR\${PRODUCT_EXE}"'
SectionEnd

Section "un.FaceTrack Monitoring"
  ExecWait '"$INSTDIR\${PRODUCT_EXE}" --uninstall'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FaceTrackMonitoring"
  DeleteRegKey HKCU "Software\FaceTrack\Monitoring"
  DeleteRegKey HKCU "${PRODUCT_KEY}"
  RMDir /r "$SMPROGRAMS\FaceTrack Monitoring"
  RMDir /r "$LOCALAPPDATA\FaceTrack\Monitoring"
  MessageBox MB_ICONQUESTION|MB_YESNO "Also delete the FaceTrack-managed local ActivityWatch history from this Windows profile? Personal ActivityWatch data on its default profile is never removed." /SD IDNO IDNO KeepActivityWatch
  RMDir /r "$LOCALAPPDATA\activitywatch-facetrack"
KeepActivityWatch:
  RMDir /r "$INSTDIR"
SectionEnd
