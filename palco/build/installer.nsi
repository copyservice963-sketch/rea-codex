; Custom NSIS script: compile installer/uninstaller together without running Windows code at build time.
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

Name "${PRODUCT_NAME}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Palco Multitracks"
InstallDirRegKey HKCU "Software\PalcoMultitracks" "InstallDir"
SetCompressor zlib
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Palco Multitracks.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Palco Multitracks"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Este aplicativo precisa de Windows 64 bits."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "Este aplicativo precisa de Windows 10 ou posterior."
    Abort
  ${EndIf}
  SetShellVarContext current
FunctionEnd

Section "Palco Multitracks"
  SetOutPath "$INSTDIR"
  File /r "${PROJECT_DIR}/release/win-unpacked/*"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  CreateDirectory "$SMPROGRAMS\Palco Multitracks"
  CreateShortcut "$SMPROGRAMS\Palco Multitracks\Palco Multitracks.lnk" "$INSTDIR\Palco Multitracks.exe"
  CreateShortcut "$DESKTOP\Palco Multitracks.lnk" "$INSTDIR\Palco Multitracks.exe"
  WriteRegStr HKCU "Software\PalcoMultitracks" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks" "DisplayName" "Palco Multitracks"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks" "Publisher" "Palco Multitracks"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks" "UninstallString" '$\"$INSTDIR\Desinstalar.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  !include "${PROJECT_DIR}/build/generated-uninstall.nsh"
  Delete "$INSTDIR\Desinstalar.exe"
  Delete "$SMPROGRAMS\Palco Multitracks\Palco Multitracks.lnk"
  RMDir "$SMPROGRAMS\Palco Multitracks"
  Delete "$DESKTOP\Palco Multitracks.lnk"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\PalcoMultitracks"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PalcoMultitracks"
SectionEnd
