$files = @(
"backend/services/documents/parseTimetable.js",
"backend/controllers/importController.js",
"backend/routes/importRoutes.js",
"backend/controllers/academicController.js",
"backend/models/Academic.js",
"backend/test/documentImport.test.js",
"frontend/src/components/TimetableImport.jsx",
"frontend/src/lib/api.js",
"frontend/src/pages/AcademicPage.jsx"
)

$output = "acadova-csv-source.txt"

foreach ($file in $files) {
    if (Test-Path $file) {
        Add-Content $output "`n`n========== FILE: $file ==========`n"
        Get-Content $file -Raw | Add-Content $output
        Write-Host "Added: $file" -ForegroundColor Green
    }
    else {
        Write-Host "MISSING: $file" -ForegroundColor Red
    }
}