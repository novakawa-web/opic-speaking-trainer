Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot "..\public\icons"
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function New-OpicIcon {
  param(
    [int]$Size,
    [string]$FileName
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#172c51"))

  $whitePen = New-Object System.Drawing.Pen(
    [System.Drawing.Color]::White,
    [Math]::Max(10, [int]($Size * 0.094))
  )
  $ellipse = New-Object System.Drawing.RectangleF(
    [single]($Size * 0.258),
    [single]($Size * 0.242),
    [single]($Size * 0.438),
    [single]($Size * 0.438)
  )
  $graphics.DrawEllipse($whitePen, $ellipse)

  $goldBrush = New-Object System.Drawing.SolidBrush(
    [System.Drawing.ColorTranslator]::FromHtml("#e9b949")
  )
  [System.Drawing.PointF[]]$tail = @(
    (New-Object System.Drawing.PointF([single]($Size * 0.63), [single]($Size * 0.59))),
    (New-Object System.Drawing.PointF([single]($Size * 0.79), [single]($Size * 0.76))),
    (New-Object System.Drawing.PointF([single]($Size * 0.73), [single]($Size * 0.55)))
  )
  $graphics.FillPolygon($goldBrush, $tail)

  $target = Join-Path $outputDirectory $FileName
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $goldBrush.Dispose()
  $whitePen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-OpicIcon -Size 180 -FileName "apple-touch-icon.png"
New-OpicIcon -Size 192 -FileName "pwa-192x192.png"
New-OpicIcon -Size 512 -FileName "pwa-512x512.png"
New-OpicIcon -Size 512 -FileName "maskable-512x512.png"
