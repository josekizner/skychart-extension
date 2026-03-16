Set WshShell = CreateObject("WScript.Shell")
Set oExec = WshShell.Run("cmd /c cd /d ""C:\Users\josek\.gemini\antigravity\scratch\skychart-extension"" ^&^& :LOOP ^&^& git pull origin main --quiet 2^>nul ^&^& timeout /t 300 /nobreak ^>nul ^&^& goto LOOP", 0, False)
