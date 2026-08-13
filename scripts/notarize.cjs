// electron-builder afterSign hook: notarize the mac app with Apple's notarytool
// when credentials are present. Without credentials it is a no-op, so unsigned
// local builds are unaffected.
//
// Notarization requires the app to be code-signed first, so this only runs when
// CSC_LINK (the signing identity) is also set. Configure via env:
//   CSC_LINK=<path-or-URL-to-developer-id.p12>
//   CSC_KEY_PASSWORD=<p12 password>
//   APPLE_ID=<your-apple-id>
//   APPLE_APP_SPECIFIC_PASSWORD=<app-specific password from appleid.apple.com>
//   APPLE_TEAM_ID=<your team id>
const { notarize } = require('@electron/notarize')
const { execFileSync } = require('node:child_process')

exports.default = async function notarizeHook(context) {
  const { electronPlatformName } = context
  if (electronPlatformName !== 'darwin') return

  const { CSC_LINK, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env

  if (!CSC_LINK) {
    console.log('[notarize] skip — app not signed (set CSC_LINK to sign).')
    return
  }
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      '[notarize] skip — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID to notarize.'
    )
    return
  }

  const appBundleId = context.packager.appInfo.id
  const appName = context.packager.appInfo.productFilename
  const appPath = `${context.appOutDir}/${appName}.app`

  console.log(`[notarize] submitting ${appPath} (${appBundleId}) to Apple…`)
  await notarize({
    tool: 'notarytool',
    appBundleId,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
  console.log('[notarize] notarized — stapling the ticket…')
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
  console.log('[notarize] done.')
}
