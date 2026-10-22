' Starts LoL Draft Bridge in background directly in the Windows System Tray (No CMD window)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = ScriptDir

' Build if dist does not exist
If Not FSO.FileExists(ScriptDir & "\dist\index.js") Then
    WshShell.Run "cmd /c npm run build", 0, True
End If

' Ensure lol-draft-bridge.exe exists for Task Manager visibility
If Not FSO.FileExists(ScriptDir & "\lol-draft-bridge.exe") Then
    WshShell.Run "cmd /c node scripts\ensure-exe.cjs", 0, True
End If

If FSO.FileExists(ScriptDir & "\lol-draft-bridge.exe") Then
    WshShell.Run "lol-draft-bridge.exe dist/index.js", 0, False
Else
    WshShell.Run "cmd /c node dist/index.js", 0, False
End If
