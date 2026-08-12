# Deploy ConMan (API + Web + Postgres) to Render via API.
# Usage:
#   $env:RENDER_API_KEY = "rnd_..."
#   .\scripts\deploy-render.ps1

param(
    [string]$RepoUrl = "https://github.com/sugitime/conman",
    [string]$OwnerId = "tea-d8m251i8qa3s73b06upg",
    [string]$Branch = "main",
    [string]$Region = "oregon",
    [string]$ApiName = "conman-api",
    [string]$WebName = "conman-web",
    [string]$DbName = "conman-db"
)

$ErrorActionPreference = "Stop"

if (-not $env:RENDER_API_KEY) {
    $envPath = Join-Path $PSScriptRoot "..\.env"
    if (Test-Path $envPath) {
        $match = Select-String -Path $envPath -Pattern '^\s*RENDER_API_KEY\s*=\s*"?([^"\r\n]+)"?' | Select-Object -First 1
        if ($match) { $env:RENDER_API_KEY = $match.Matches.Groups[1].Value.Trim() }
    }
}
if (-not $env:RENDER_API_KEY) {
    Write-Error "Set RENDER_API_KEY first."
    exit 1
}

$headers = @{
    Authorization  = "Bearer $($env:RENDER_API_KEY)"
    "Content-Type" = "application/json"
    Accept         = "application/json"
}

function Invoke-RenderApi {
    param([string]$Method, [string]$Uri, $Body = $null)
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 20 -Compress
        return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body $json
    }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
}

function Get-ServiceByName([string]$name) {
    $items = Invoke-RenderApi -Method GET -Uri "https://api.render.com/v1/services?limit=50"
    foreach ($item in $items) {
        $s = if ($item.service) { $item.service } else { $item }
        if ($s.name -eq $name) { return $s }
    }
    return $null
}

function Get-DbByName([string]$name) {
    $items = Invoke-RenderApi -Method GET -Uri "https://api.render.com/v1/postgres?limit=50"
    foreach ($item in $items) {
        $d = if ($item.postgres) { $item.postgres } else { $item }
        if ($d.name -eq $name) { return $d }
    }
    return $null
}

Write-Host "==> Database: $DbName"
$db = Get-DbByName $DbName
if (-not $db) {
    $db = Invoke-RenderApi -Method POST -Uri "https://api.render.com/v1/postgres" -Body @{
        name         = $DbName
        ownerId      = $OwnerId
        plan         = "free"
        region       = $Region
        version      = "16"
        databaseName = "conman"
        databaseUser = "conman"
    }
    Write-Host "Created DB $($db.id)"
} else {
    Write-Host "Reusing DB $($db.id)"
}

$databaseUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    try {
        $info = Invoke-RenderApi -Method GET -Uri "https://api.render.com/v1/postgres/$($db.id)/connection-info"
        # External URL for free web services (not on private network always)
        if ($info.externalConnectionString) { $databaseUrl = $info.externalConnectionString; break }
        if ($info.connectionString) { $databaseUrl = $info.connectionString; break }
    } catch { }
}
if (-not $databaseUrl) { throw "Timed out waiting for DATABASE_URL" }
Write-Host "Database ready."

$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$adminPass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ })

# Predictable hostnames on free tier often get suffixes; we update after create
$apiUrlGuess = "https://$ApiName.onrender.com"
$webUrlGuess = "https://$WebName.onrender.com"

Write-Host "==> API service: $ApiName"
$api = Get-ServiceByName $ApiName
if (-not $api) {
    $created = Invoke-RenderApi -Method POST -Uri "https://api.render.com/v1/services" -Body @{
        type    = "web_service"
        name    = $ApiName
        ownerId = $OwnerId
        repo    = $RepoUrl
        branch  = $Branch
        autoDeploy = "yes"
        serviceDetails = @{
            env             = "docker"
            plan            = "free"
            region          = $Region
            healthCheckPath = "/api/health"
            envSpecificDetails = @{
                dockerContext  = "./backend"
                dockerfilePath = "./backend/Dockerfile"
            }
        }
        envVars = @(
            @{ key = "NODE_ENV"; value = "production" },
            @{ key = "DATABASE_URL"; value = $databaseUrl },
            @{ key = "JWT_SECRET"; value = $jwtSecret },
            @{ key = "JWT_EXPIRES_IN"; value = "7d" },
            @{ key = "CORS_ORIGIN"; value = $webUrlGuess },
            @{ key = "APP_URL"; value = $webUrlGuess },
            @{ key = "UPLOAD_DIR"; value = "/app/uploads" },
            @{ key = "SEED_ADMIN_EMAIL"; value = "admin@conman.local" },
            @{ key = "SEED_ADMIN_PASSWORD"; value = $adminPass },
            @{ key = "SEED_ADMIN_NAME"; value = "Con Manager" }
        )
    }
    $api = if ($created.service) { $created.service } else { $created }
    Write-Host "Created API $($api.id)"
} else {
    Write-Host "API exists $($api.id) — updating env + deploy"
    # Best-effort env update for DATABASE_URL
    try {
        Invoke-RenderApi -Method PUT -Uri "https://api.render.com/v1/services/$($api.id)/env-vars/DATABASE_URL" -Body @{ value = $databaseUrl } | Out-Null
    } catch { }
    Invoke-RenderApi -Method POST -Uri "https://api.render.com/v1/services/$($api.id)/deploys" -Body @{ clearCache = "clear" } | Out-Null
}

# Refresh service for URL
Start-Sleep -Seconds 3
$api = Get-ServiceByName $ApiName
$apiUrl = $api.serviceDetails.url
if (-not $apiUrl) { $apiUrl = $apiUrlGuess }
$apiUrl = $apiUrl.TrimEnd("/")
Write-Host "API URL: $apiUrl"

Write-Host "==> Web service: $WebName"
$web = Get-ServiceByName $WebName
if (-not $web) {
    $createdWeb = Invoke-RenderApi -Method POST -Uri "https://api.render.com/v1/services" -Body @{
        type    = "web_service"
        name    = $WebName
        ownerId = $OwnerId
        repo    = $RepoUrl
        branch  = $Branch
        autoDeploy = "yes"
        serviceDetails = @{
            env    = "docker"
            plan   = "free"
            region = $Region
            envSpecificDetails = @{
                dockerContext  = "./frontend"
                dockerfilePath = "./frontend/Dockerfile"
            }
        }
        envVars = @(
            @{ key = "NODE_ENV"; value = "production" },
            # Available as Docker ARG VITE_API_URL at image build time on Render
            @{ key = "VITE_API_URL"; value = $apiUrl }
        )
    }
    $web = if ($createdWeb.service) { $createdWeb.service } else { $createdWeb }
    Write-Host "Created web $($web.id)"
} else {
    Write-Host "Web exists $($web.id) — set VITE_API_URL and redeploy"
    try {
        Invoke-RenderApi -Method PUT -Uri "https://api.render.com/v1/services/$($web.id)/env-vars/VITE_API_URL" -Body @{ value = $apiUrl } | Out-Null
    } catch { }
    Invoke-RenderApi -Method POST -Uri "https://api.render.com/v1/services/$($web.id)/deploys" -Body @{ clearCache = "clear" } | Out-Null
}

Start-Sleep -Seconds 3
$web = Get-ServiceByName $WebName
$webUrl = $web.serviceDetails.url
if (-not $webUrl) { $webUrl = $webUrlGuess }
$webUrl = $webUrl.TrimEnd("/")

# Point API CORS + APP_URL at real web URL
try {
    Invoke-RenderApi -Method PUT -Uri "https://api.render.com/v1/services/$($api.id)/env-vars/CORS_ORIGIN" -Body @{ value = $webUrl } | Out-Null
    Invoke-RenderApi -Method PUT -Uri "https://api.render.com/v1/services/$($api.id)/env-vars/APP_URL" -Body @{ value = $webUrl } | Out-Null
} catch {
    Write-Host "Note: update CORS_ORIGIN/APP_URL manually if needed."
}

Write-Host ""
Write-Host "=== Deploy triggered ==="
Write-Host "API dashboard: $($api.dashboardUrl)"
Write-Host "Web dashboard: $($web.dashboardUrl)"
Write-Host "API URL: $apiUrl"
Write-Host "Web URL: $webUrl"
Write-Host ""
if ($adminPass) {
    Write-Host "Seed admin (if newly generated this run):"
    Write-Host "  email: admin@conman.local"
    Write-Host "  password: $adminPass"
    Write-Host "(If service already existed, seed password may be the previous value or changeme123 from seed defaults.)"
}
Write-Host ""
Write-Host "Free-tier first boot can take several minutes (Docker build + cold start)."
