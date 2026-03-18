' ATOM Auto-Update — Roda git pull silenciosamente (SEM janela)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d """ & WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.gemini\antigravity\scratch\skychart-extension"" && git pull origin main --quiet 2>nul", 0, True
