param()

$ErrorActionPreference = "SilentlyContinue"

$Patterns = @(
  "D:\*\cli.bat",
  "D:\small_program_tool\*\cli.bat",
  "C:\Program Files (x86)\Tencent\*\cli.bat",
  "C:\Program Files\Tencent\*\cli.bat"
)

foreach ($Pattern in $Patterns) {
  $Matches = Resolve-Path -Path $Pattern -ErrorAction SilentlyContinue
  foreach ($Match in $Matches) {
    if (Test-Path $Match.Path) {
      Write-Output $Match.Path
      exit 0
    }
  }
}

exit 1
