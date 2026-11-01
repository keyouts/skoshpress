!macro customInstall
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7

  ReadRegStr $R7 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  StrCpy $R0 0

  legacyEntryLoop:
  ClearErrors
  EnumRegKey $R1 SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
  ${If} ${Errors}
    Goto legacyEntryDone
  ${EndIf}

  StrCpy $R2 "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1"
  ${If} $R2 != "${UNINSTALL_REGISTRY_KEY}"
    ReadRegStr $R3 SHELL_CONTEXT "$R2" "DisplayName"
    ${If} $R3 == "Skosh Press"
    ${OrIf} $R3 == "Skosh Press 0.7.6"
      ReadRegStr $R4 SHELL_CONTEXT "$R2" "DisplayVersion"
      ${If} $R4 == "0.7.6"
        ReadRegStr $R5 SHELL_CONTEXT "$R2" "InstallLocation"
        ReadRegStr $R6 SHELL_CONTEXT "$R2" "UninstallString"
        ${If} $R5 != ""
        ${AndIf} $R5 == "$INSTDIR"
          Goto legacyEntryRemove
        ${EndIf}
        ${If} $R6 != ""
        ${AndIf} $R7 != ""
        ${AndIf} $R6 == $R7
          Goto legacyEntryRemove
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Goto legacyEntryNext

  legacyEntryRemove:
  ClearErrors
  DeleteRegKey SHELL_CONTEXT "$R2"
  ${IfNot} ${Errors}
    Goto legacyEntryLoop
  ${EndIf}

  legacyEntryNext:
  IntOp $R0 $R0 + 1
  Goto legacyEntryLoop

  legacyEntryDone:
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend
