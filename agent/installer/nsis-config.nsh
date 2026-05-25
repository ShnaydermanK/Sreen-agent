; ─────────────────────────────────────────────────────────────────────────────
; Screen Agent — NSIS custom installer configuration
; Included by electron-builder via "nsis.include" in package.json
; ─────────────────────────────────────────────────────────────────────────────

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "Trim.nsh"

; ── Variables ─────────────────────────────────────────────────────────────────
Var Dialog
Var LabelHeading
Var LabelUrl
Var FieldUrl
Var LabelToken
Var FieldToken
Var LabelHint
Var ServerUrl
Var AgentToken

; ── Trim macro (removes leading/trailing spaces) ──────────────────────────────
!macro _Trim ResultVar TrimString
  Push "${TrimString}"
  Call Trim
  Pop "${ResultVar}"
!macroend
!define Trim `!insertmacro _Trim`

Function Trim
  Exch $R1
  Push $R2
  Loop:
    StrCpy $R2 "$R1" 1
    StrCmp "$R2" " " TrimLeft
    StrCmp "$R2" "$\t" TrimLeft
    GoTo Loop2
  TrimLeft:
    StrCpy $R1 "$R1" "" 1
    Goto Loop
  Loop2:
  Push $R1
  ; trim right
  StrLen $R2 $R1
  IntOp $R2 $R2 - 1
  StrCpy $R2 $R1 1 $R2
  StrCmp $R2 " " TrimRight
  StrCmp $R2 "$\t" TrimRight
  GoTo Done
  TrimRight:
    StrCpy $R1 $R1 -1
    Goto Loop2
  Done:
  Exch $R1
  Exch
  Pop $R2
  Exch
  Pop $R1
FunctionEnd

; ── Custom setup page: Server URL + Agent Token ───────────────────────────────
; electron-builder calls .onInit and installer Sections, so we hook the Page macro
Page custom ConfigPageShow ConfigPageLeave

Function ConfigPageShow
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Heading
  ${NSD_CreateLabel} 0 0 100% 18u "Подключение к серверу Screen Agent"
  Pop $LabelHeading

  ; Server URL label + field
  ${NSD_CreateLabel} 0 26u 100% 10u "Адрес сервера (server_url):"
  Pop $LabelUrl
  ${NSD_CreateText} 0 38u 100% 14u "http://192.168.1.100:8000"
  Pop $FieldUrl

  ; Agent Token label + field
  ${NSD_CreateLabel} 0 60u 100% 10u "Токен агента (agent_token):"
  Pop $LabelToken
  ${NSD_CreateText} 0 72u 100% 14u ""
  Pop $FieldToken

  ; Hint text
  ${NSD_CreateLabel} 0 94u 100% 36u \
    "Токен выдаётся в Admin Panel → Сотрудники → Карточка → Агенты → Новый токен.$\n$\nЕсли оставить поля пустыми — заполните config.json в папке установки вручную."
  Pop $LabelHint

  nsDialogs::Show
FunctionEnd

Function ConfigPageLeave
  ${NSD_GetText} $FieldUrl $ServerUrl
  ${NSD_GetText} $FieldToken $AgentToken

  ; Trim whitespace
  ${Trim} $ServerUrl $ServerUrl
  ${Trim} $AgentToken $AgentToken

  ; Default if empty
  ${If} $ServerUrl == ""
    StrCpy $ServerUrl "http://localhost:8000"
  ${EndIf}
FunctionEnd

; ── Macro: write config.json with collected values ────────────────────────────
; Insert after all files are installed: !insertmacro WriteConfigJson
!macro WriteConfigJson
  FileOpen $0 "$INSTDIR\config.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 '  "server_url": "$ServerUrl",$\r$\n'
  FileWrite $0 '  "agent_token": "$AgentToken",$\r$\n'
  FileWrite $0 '  "recording": {$\r$\n'
  FileWrite $0 '    "enabled": true,$\r$\n'
  FileWrite $0 '    "fps": 5,$\r$\n'
  FileWrite $0 '    "segment_duration_min": 1,$\r$\n'
  FileWrite $0 '    "codec": "auto"$\r$\n'
  FileWrite $0 '  }$\r$\n'
  FileWrite $0 "}$\r$\n"
  FileClose $0
!macroend

; ── Post-install: write config + firewall rule ────────────────────────────────
; electron-builder calls installer sections after file extraction.
; We inject here via the customNsisIncludes mechanism.

Section -PostInstall
  ; Write config.json
  !insertmacro WriteConfigJson

  ; Windows Firewall: allow outbound traffic for the agent executable
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Screen Agent"'
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Screen Agent" dir=out action=allow program="$INSTDIR\Screen Agent.exe" enable=yes profile=any'
SectionEnd

; ── Pre-uninstall: cleanup ────────────────────────────────────────────────────
Section un.PostUninstall
  ; Stop and remove Windows Service if it was registered separately
  ExecWait '"$SYSDIR\sc.exe" stop ScreenAgent'
  ExecWait '"$SYSDIR\sc.exe" delete ScreenAgent'

  ; Remove firewall rule
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Screen Agent"'

  ; Offer to remove user data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Удалить данные агента ($PROFILE\.screen-agent)?" IDNO SkipData
    RMDir /r "$PROFILE\.screen-agent"
  SkipData:
SectionEnd
