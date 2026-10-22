' Starts LoL Draft Bridge in background directly in the Windows System Tray (No CMD window)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = ScriptDir
WshShell.Run "cmd /c node dist/index.js", 0, False
