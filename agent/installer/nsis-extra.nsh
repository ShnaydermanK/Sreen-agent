; ─────────────────────────────────────────────────────────────────────────────
; Screen Agent — NSIS post-install hooks
; Called by electron-builder via customNsis* callbacks
; ─────────────────────────────────────────────────────────────────────────────

; After install: write config.json and optionally register Windows Service
Section "PostInstall" SecPostInstall
  SectionIn RO ; required

  ; Write config.json from the values collected in the custom page
  !insertmacro WriteConfigJson

  ; Optional: register as Windows Service (silent, no console window)
  ; The agent can also be started manually or auto-run via tray app
  ; Uncomment the lines below to install as a service automatically:
  ;
  ; ExecWait '"$SYSDIR\sc.exe" create ScreenAgent binPath= "cmd /c \"$INSTDIR\resources\app.asar.unpacked\node_modules\.bin\node\" \"$INSTDIR\resources\app.asar.unpacked\run-agent.js\"" start= auto DisplayName= "Screen Agent Monitoring Service"'
  ; ExecWait '"$SYSDIR\sc.exe" failure ScreenAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000'
  ; ExecWait '"$SYSDIR\sc.exe" start ScreenAgent'

  ; Add Windows Firewall exception for agent (outbound to server)
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Screen Agent" dir=out action=allow program="$INSTDIR\Screen Agent.exe" enable=yes profile=any'

SectionEnd

; Before uninstall: stop service and remove firewall rule
Section "un.PostUninstall" SecUnPostInstall
  ; Stop and remove service if it was installed
  ExecWait '"$SYSDIR\sc.exe" stop ScreenAgent'
  ExecWait '"$SYSDIR\sc.exe" delete ScreenAgent'

  ; Remove firewall rule
  ExecWait '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Screen Agent"'

  ; Remove agent data directory (optional — ask user)
  MessageBox MB_YESNO "Удалить данные агента ($PROFILE\.screen-agent)?" IDNO SkipDataRemoval
    RMDir /r "$PROFILE\.screen-agent"
  SkipDataRemoval:

SectionEnd
