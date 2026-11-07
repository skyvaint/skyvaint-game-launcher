using System.Diagnostics;
using System.Security;
using System.Security.Principal;
using System.Text;
using Microsoft.Win32;

namespace Skyvaint;

// Starting with Windows. Entries under the Run key wait behind everything else Explorer starts (and Windows delays
// them on purpose), so the launcher uses a logon task instead: Task Scheduler starts it the moment you sign in, ahead
// of the normal start-up apps, on battery too. A logon task for your own account needs no admin rights. If it can't
// be made for some reason, the Run key is the fallback.
public sealed partial class MainForm
{
    /// <summary>A --data test run gets its own task name, so it never replaces the real one.</summary>
    static string StartTaskName => DataSafety.IsTest ? RunName + ".Test" : RunName;

    /// <summary>Remembers the program the task points at, so a moved copy can bring it up to date.</summary>
    static string StartTaskMark => Path.Combine(DataSafety.Local, "autostart-task.txt");

    static string RunValue => "\"" + Environment.ProcessPath + "\" --background";

    static bool RunKeyOn()
    {
        try { using var key = Registry.CurrentUser.OpenSubKey(RunKey); return key?.GetValue(RunName) != null; }
        catch { return false; }
    }

    static void SetRunKey(bool on)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
            if (on) key?.SetValue(RunName, RunValue);
            else key?.DeleteValue(RunName, throwOnMissingValue: false);
        }
        catch (Exception ex) { StartupGuard.Log("Run key", ex); }
    }

    private static bool IsAutostart() => File.Exists(StartTaskMark) || (!DataSafety.IsTest && RunKeyOn());

    private static void SetAutostart(bool on)
    {
        if (on)
        {
            if (MakeStartTask())
            {
                try { Directory.CreateDirectory(DataSafety.Local); File.WriteAllText(StartTaskMark, Environment.ProcessPath); } catch { }
                if (!DataSafety.IsTest) SetRunKey(false);
                return;
            }
            StartupGuard.Log("Couldn't make the logon task; using the Run key instead.");
            if (!DataSafety.IsTest) SetRunKey(true);
            return;
        }
        Schtasks($"/delete /tn \"{StartTaskName}\" /f");
        try { File.Delete(StartTaskMark); } catch { }
        if (!DataSafety.IsTest) SetRunKey(false);
    }

    /// <summary>Called at start: moves an old Run entry over to the task, and re-aims the task if this copy moved.</summary>
    void RefreshAutostart() => _ = Task.Run(() =>
    {
        try
        {
            bool old = !DataSafety.IsTest && RunKeyOn();
            string? aimed = File.Exists(StartTaskMark) ? File.ReadAllText(StartTaskMark).Trim() : null;
            if (old || (aimed != null && !aimed.Equals(Environment.ProcessPath, StringComparison.OrdinalIgnoreCase))) SetAutostart(true);
        }
        catch (Exception ex) { StartupGuard.Log("Autostart refresh", ex); }
    });

    static bool MakeStartTask()
    {
        string file = Path.Combine(Path.GetTempPath(), "skyvaint-start-task.xml");
        try
        {
            string user = SecurityElement.Escape(WindowsIdentity.GetCurrent().Name);
            string exe = SecurityElement.Escape(Environment.ProcessPath ?? "");
            string dir = SecurityElement.Escape(AppContext.BaseDirectory.TrimEnd('\\'));
            // schtasks only accepts this as UTF-16.
            File.WriteAllText(file, $"""
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Starts the Skyvaint game launcher as soon as you sign in.</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>{exe}</Command><Arguments>--background</Arguments><WorkingDirectory>{dir}</WorkingDirectory></Exec></Actions>
</Task>
""", Encoding.Unicode);
            return Schtasks($"/create /tn \"{StartTaskName}\" /xml \"{file}\" /f");
        }
        catch (Exception ex) { StartupGuard.Log("Logon task", ex); return false; }
        finally { try { File.Delete(file); } catch { } }
    }

    static bool Schtasks(string args)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo("schtasks.exe", args) { CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true });
            if (p == null) return false;
            if (!p.WaitForExit(8000)) { try { p.Kill(); } catch { } return false; }
            return p.ExitCode == 0;
        }
        catch { return false; }
    }
}
